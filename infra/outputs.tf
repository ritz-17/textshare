output "app_url" {
  description = "Open this in your browser"
  value       = local.app_url
}

output "elastic_ip" {
  value = aws_eip.public.public_ip
}

output "nlb_dns_name" {
  value = aws_lb.nlb.dns_name
}

output "ecr_repositories" {
  value = { for k, repo in aws_ecr_repository.app : k => repo.repository_url }
}

output "github_deploy_role_arn" {
  description = "Set as the AWS_ROLE_ARN variable in GitHub"
  value       = aws_iam_role.github_deploy.arn
}

output "database_endpoint" {
  value = aws_db_instance.main.address
}

output "ecs_cluster" {
  value = aws_ecs_cluster.main.name
}
