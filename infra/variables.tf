variable "region" {
  description = "AWS region to deploy into"
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Name prefix for every resource"
  type        = string
  default     = "textshare"
}

variable "github_repo" {
  description = "GitHub repository (owner/name) allowed to deploy via OIDC"
  type        = string
  default     = "ritz-17/textshare"
}

variable "image_tag" {
  description = "Image tag used when Terraform (re)creates task definitions. GitHub Actions deploys later tags."
  type        = string
  default     = "initial"
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "db_engine_version" {
  description = "Postgres major version"
  type        = string
  default     = "17"
}

variable "db_backup_retention_days" {
  type    = number
  default = 7
}

variable "db_deletion_protection" {
  description = "Blocks accidental deletion of the database. Set to false before `terraform destroy`."
  type        = bool
  default     = true
}

variable "frontend_desired_count" {
  description = "Number of frontend containers (stateless, safe to scale)"
  type        = number
  default     = 1
}

variable "log_retention_days" {
  type    = number
  default = 14
}
