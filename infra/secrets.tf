# Generated here and handed to the backend container at startup; nobody needs to see them.
# (They are also stored in the Terraform state, which lives in the private, encrypted S3 bucket.)

resource "random_password" "jwt" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.project}/DATABASE_URL"
  recovery_window_in_days = 0 # allow immediate re-creation after a destroy
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://${aws_db_instance.main.username}:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project}/JWT_SECRET"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt.result
}
