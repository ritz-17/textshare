# Elastic IP -> Network Load Balancer (fixed public IP) -> internal Application
# Load Balancer (routes /api and /socket.io to the backend, the rest to the frontend).

resource "aws_eip" "public" {
  domain = "vpc"
  tags   = { Name = "${var.project}-public-ip" }
}

# ---------- Internal ALB ----------

resource "aws_lb" "alb" {
  name               = "${var.project}-alb"
  internal           = true
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = aws_subnet.public[*].id
  idle_timeout       = 120
}

resource "aws_lb_target_group" "backend" {
  name                 = "${var.project}-backend"
  port                 = 4000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 15

  health_check {
    path                = "/health"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group" "frontend" {
  name                 = "${var.project}-frontend"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = aws_vpc.main.id
  deregistration_delay = 15

  health_check {
    path                = "/"
    matcher             = "200"
    interval            = 15
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "alb_http" {
  load_balancer_arn = aws_lb.alb.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_listener_rule" "backend" {
  listener_arn = aws_lb_listener.alb_http.arn
  priority     = 10

  condition {
    path_pattern {
      values = ["/api/*", "/socket.io/*"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
}

# ---------- Public NLB with the Elastic IP ----------

resource "aws_lb" "nlb" {
  name                             = "${var.project}-nlb"
  internal                         = false
  load_balancer_type               = "network"
  security_groups                  = [aws_security_group.nlb.id]
  enable_cross_zone_load_balancing = true

  # One subnet = one fixed IP. (Add a second mapping + EIP for zone redundancy.)
  subnet_mapping {
    subnet_id     = aws_subnet.public[0].id
    allocation_id = aws_eip.public.id
  }
}

resource "aws_lb_target_group" "nlb_to_alb" {
  name        = "${var.project}-nlb-to-alb"
  port        = 80
  protocol    = "TCP"
  target_type = "alb"
  vpc_id      = aws_vpc.main.id

  health_check {
    protocol = "HTTP"
    path     = "/"
    matcher  = "200"
  }
}

resource "aws_lb_target_group_attachment" "alb" {
  target_group_arn = aws_lb_target_group.nlb_to_alb.arn
  target_id        = aws_lb.alb.arn
  port             = 80
  depends_on       = [aws_lb_listener.alb_http]
}

resource "aws_lb_listener" "nlb_http" {
  load_balancer_arn = aws_lb.nlb.arn
  port              = 80
  protocol          = "TCP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.nlb_to_alb.arn
  }
}
