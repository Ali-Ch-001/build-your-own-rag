output "backend_config" {
  description = "Values to copy into a stack backend.hcl file."
  value = {
    bucket         = aws_s3_bucket.state.id
    region         = var.aws_region
    dynamodb_table = aws_dynamodb_table.locks.name
    encrypt        = true
    kms_key_id     = aws_kms_key.state.arn
  }
}

output "account_id" {
  description = "AWS account in which state was bootstrapped."
  value       = data.aws_caller_identity.current.account_id
}
