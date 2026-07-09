resource "aws_secretsmanager_secret" "application" {
  for_each = local.secret_names

  name                    = "/${var.name_prefix}/${var.environment}/${each.value}"
  description             = "Externally populated Atlas RAG ${each.value} configuration"
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = 30

  tags = {
    SecretOwner = "platform-security"
  }
}
