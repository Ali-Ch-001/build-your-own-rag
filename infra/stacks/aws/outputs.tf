output "platform_contract" {
  description = "Provider-neutral contract consumed by Kubernetes and GitOps configuration. Contains identifiers, not secret values."
  value = {
    schema_version = "1.0"
    environment    = var.environment
    region         = var.aws_region
    account_id     = data.aws_caller_identity.current.account_id

    network = {
      vpc_id             = module.vpc.vpc_id
      availability_zones = local.azs
      public_subnet_ids  = module.vpc.public_subnets
      private_subnet_ids = module.vpc.private_subnets
      data_subnet_ids    = module.vpc.database_subnets
      nat_gateway_mode   = var.nat_gateway_mode
    }

    kubernetes = {
      cluster_name      = module.eks.cluster_name
      cluster_arn       = module.eks.cluster_arn
      cluster_endpoint  = module.eks.cluster_endpoint
      oidc_provider_arn = module.eks.oidc_provider_arn
      namespace         = var.workload_namespace
      service_account   = var.workload_service_account
      workload_role_arn = aws_iam_role.application.arn
    }

    object_store = {
      quarantine_bucket = aws_s3_bucket.data["quarantine"].id
      clean_bucket      = aws_s3_bucket.data["clean"].id
      derived_bucket    = aws_s3_bucket.data["derived"].id
    }

    postgresql = {
      endpoint          = module.postgresql.db_instance_address
      port              = module.postgresql.db_instance_port
      database          = module.postgresql.db_instance_name
      master_secret_arn = module.postgresql.db_instance_master_user_secret_arn
      tls_required      = true
    }

    cache = {
      endpoint       = aws_elasticache_replication_group.this.primary_endpoint_address
      port           = aws_elasticache_replication_group.this.port
      username       = aws_elasticache_user.application.user_name
      authentication = "iam"
      tls_required   = true
    }

    kafka = {
      cluster_arn       = aws_msk_serverless_cluster.this.arn
      bootstrap_brokers = aws_msk_serverless_cluster.this.bootstrap_brokers_sasl_iam
      authentication    = "iam"
      tls_required      = true
    }

    kms = {
      key_arn = aws_kms_key.platform.arn
    }

    secrets = {
      placeholders = { for name, secret in aws_secretsmanager_secret.application : name => secret.arn }
    }

    registry = {
      repositories = { for name, repository in aws_ecr_repository.application : name => repository.repository_url }
    }

    vector_store = {
      provider = "qdrant"
      managed  = "kubernetes-or-external"
    }

    disaster_recovery = {
      regional_stack          = true
      cross_region_configured = false
    }
  }
}

output "github_actions_role_arn" {
  description = "OIDC release role for the GitHub deployment workflow, when enabled."
  value       = try(aws_iam_role.github_actions[0].arn, null)
}
