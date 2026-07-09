resource "aws_security_group" "postgresql" {
  name_prefix = "${local.name}-postgresql-"
  description = "PostgreSQL access from EKS application nodes"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "PostgreSQL from EKS nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }

  lifecycle {
    create_before_destroy = true
  }
}

module "postgresql" {
  source  = "terraform-aws-modules/rds/aws"
  version = "7.2.0"

  identifier = "${local.name}-postgresql"

  engine               = "postgres"
  engine_version       = "16"
  family               = "postgres16"
  major_engine_version = "16"
  instance_class       = var.db_instance_class

  allocated_storage     = var.db_allocated_storage_gib
  max_allocated_storage = var.db_max_allocated_storage_gib
  storage_type          = "gp3"
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.platform.arn

  db_name  = "rag"
  username = "rag_admin"
  port     = 5432

  manage_master_user_password   = true
  master_user_secret_kms_key_id = aws_kms_key.platform.key_id

  multi_az               = true
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.postgresql.id]
  publicly_accessible    = false

  backup_retention_period = var.db_backup_retention_days
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:04:30-sun:05:30"
  copy_tags_to_snapshot   = true
  deletion_protection     = var.db_deletion_protection
  skip_final_snapshot     = false

  performance_insights_enabled          = true
  performance_insights_kms_key_id       = aws_kms_key.platform.arn
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  create_monitoring_role                = true

  enabled_cloudwatch_logs_exports        = ["postgresql", "upgrade"]
  create_cloudwatch_log_group            = true
  cloudwatch_log_group_kms_key_id        = aws_kms_key.platform.arn
  cloudwatch_log_group_retention_in_days = 90

  parameters = [
    {
      name         = "rds.force_ssl"
      value        = "1"
      apply_method = "immediate"
    },
    {
      name         = "log_connections"
      value        = "1"
      apply_method = "immediate"
    },
    {
      name         = "log_disconnections"
      value        = "1"
      apply_method = "immediate"
    },
    {
      name         = "log_min_duration_statement"
      value        = "1000"
      apply_method = "immediate"
    },
  ]
}
