variable "aws_region" {
  description = "AWS region containing the state bucket and lock table."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for Terraform/OpenTofu state."
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "state_bucket_name must be a valid 3-63 character S3 bucket name."
  }
}

variable "lock_table_name" {
  description = "DynamoDB table used for state locking."
  type        = string
  default     = "atlas-rag-terraform-locks"
}

variable "force_destroy" {
  description = "Allow destroying a non-empty state bucket. Keep false outside disposable accounts."
  type        = bool
  default     = false
}
