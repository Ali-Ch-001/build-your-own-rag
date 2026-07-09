resource "aws_security_group" "redis" {
  name_prefix = "${local.name}-redis-"
  description = "TLS Redis access from EKS application nodes"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "Redis TLS from EKS nodes"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_elasticache_subnet_group" "this" {
  name       = "${local.name}-redis"
  subnet_ids = module.vpc.database_subnets
}

resource "aws_elasticache_user" "default" {
  user_id       = substr("${local.name}-default", 0, 40)
  user_name     = "default"
  access_string = "off ~* -@all"
  engine        = "REDIS"

  authentication_mode {
    type = "no-password-required"
  }
}

resource "aws_elasticache_user" "application" {
  user_id       = substr("${local.name}-application", 0, 40)
  user_name     = "atlas-application"
  access_string = "on ~rag:* ~rag_* +@read +@write +ping -@dangerous"
  engine        = "REDIS"

  authentication_mode {
    type = "iam"
  }
}

resource "aws_elasticache_user_group" "application" {
  engine        = "REDIS"
  user_group_id = substr("${local.name}-application", 0, 40)
  user_ids = [
    aws_elasticache_user.default.user_id,
    aws_elasticache_user.application.user_id,
  ]
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id = "${local.name}-redis"
  description          = "Atlas RAG encrypted Redis replication group"

  engine               = "redis"
  engine_version       = "7.1"
  node_type            = var.redis_node_type
  port                 = 6379
  parameter_group_name = "default.redis7"

  num_cache_clusters         = 3
  automatic_failover_enabled = true
  multi_az_enabled           = true

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = [aws_security_group.redis.id]
  user_group_ids     = [aws_elasticache_user_group.application.user_group_id]

  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  kms_key_id                 = aws_kms_key.platform.arn

  snapshot_retention_limit = 7
  snapshot_window          = "02:00-03:00"
  maintenance_window       = "sun:05:30-sun:06:30"
  apply_immediately        = false
}
