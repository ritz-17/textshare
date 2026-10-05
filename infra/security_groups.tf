# Traffic chain: internet -> NLB (Elastic IP) -> internal ALB -> containers -> database.
# Each layer only accepts traffic from the layer in front of it.

resource "aws_security_group" "nlb" {
  name        = "${var.project}-nlb"
  description = "Public entry point (Elastic IP)"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "nlb_http" {
  security_group_id = aws_security_group.nlb.id
  description       = "HTTP from the internet"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_security_group" "alb" {
  name        = "${var.project}-alb"
  description = "Internal ALB behind the NLB"
  vpc_id      = aws_vpc.main.id
}

# The ALB is internal (private IPs only), so it is unreachable from the internet
# even with this rule. 0.0.0.0/0 is needed because the NLB preserves client IPs.
resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP forwarded by the NLB"
  cidr_ipv4         = "0.0.0.0/0"
  from_port         = 80
  to_port           = 80
  ip_protocol       = "tcp"
}

resource "aws_security_group" "app" {
  name        = "${var.project}-app"
  description = "ECS containers"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "app_from_alb" {
  for_each                     = { backend = 4000, frontend = 3000 }
  security_group_id            = aws_security_group.app.id
  description                  = "${each.key} traffic from the ALB"
  referenced_security_group_id = aws_security_group.alb.id
  from_port                    = each.value
  to_port                      = each.value
  ip_protocol                  = "tcp"
}

resource "aws_security_group" "db" {
  name        = "${var.project}-db"
  description = "RDS Postgres"
  vpc_id      = aws_vpc.main.id
}

resource "aws_vpc_security_group_ingress_rule" "db_from_app" {
  security_group_id            = aws_security_group.db.id
  description                  = "Postgres from the containers"
  referenced_security_group_id = aws_security_group.app.id
  from_port                    = 5432
  to_port                      = 5432
  ip_protocol                  = "tcp"
}

# Outbound: allow everything (pulling images, AWS APIs, database).
resource "aws_vpc_security_group_egress_rule" "all" {
  for_each          = { nlb = aws_security_group.nlb.id, alb = aws_security_group.alb.id, app = aws_security_group.app.id }
  security_group_id = each.value
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}
