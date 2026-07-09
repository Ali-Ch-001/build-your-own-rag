provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      ManagedBy = "terraform"
      Project   = "atlas-rag"
      Stack     = "state-bootstrap"
    }
  }
}
