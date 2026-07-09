resource "aws_security_group" "kafka" {
  name_prefix = "${local.name}-kafka-"
  description = "MSK IAM TLS access from EKS application nodes"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "MSK IAM TLS from EKS nodes"
    from_port       = 9098
    to_port         = 9098
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_msk_serverless_cluster" "this" {
  cluster_name = "${local.name}-events"

  vpc_config {
    subnet_ids         = module.vpc.database_subnets
    security_group_ids = [aws_security_group.kafka.id]
  }

  client_authentication {
    sasl {
      iam {
        enabled = true
      }
    }
  }
}
