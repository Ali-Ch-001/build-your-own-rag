data "aws_iam_policy_document" "application" {
  statement {
    sid = "ListApplicationBuckets"
    actions = [
      "s3:GetBucketLocation",
      "s3:ListBucket",
      "s3:ListBucketMultipartUploads",
    ]
    resources = [for bucket in aws_s3_bucket.data : bucket.arn]
  }

  statement {
    sid = "ReadWriteApplicationObjects"
    actions = [
      "s3:AbortMultipartUpload",
      "s3:DeleteObject",
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:ListMultipartUploadParts",
      "s3:PutObject",
    ]
    resources = [for bucket in aws_s3_bucket.data : "${bucket.arn}/*"]
  }

  statement {
    sid = "UsePlatformKey"
    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
      "kms:Encrypt",
      "kms:GenerateDataKey",
      "kms:ReEncryptFrom",
      "kms:ReEncryptTo",
    ]
    resources = [aws_kms_key.platform.arn]
  }

  statement {
    sid       = "ReadApplicationSecrets"
    actions   = ["secretsmanager:DescribeSecret", "secretsmanager:GetSecretValue"]
    resources = local.application_secret_arns
  }

  statement {
    sid = "ConnectKafkaCluster"
    actions = [
      "kafka-cluster:Connect",
      "kafka-cluster:DescribeCluster",
    ]
    resources = [aws_msk_serverless_cluster.this.arn]
  }

  statement {
    sid = "UseKafkaTopics"
    actions = [
      "kafka-cluster:CreateTopic",
      "kafka-cluster:DescribeTopic",
      "kafka-cluster:ReadData",
      "kafka-cluster:WriteData",
    ]
    resources = ["${local.kafka_topic_arn_prefix}/*"]
  }

  statement {
    sid = "UseKafkaConsumerGroups"
    actions = [
      "kafka-cluster:AlterGroup",
      "kafka-cluster:DescribeGroup",
    ]
    resources = ["${local.kafka_group_arn_prefix}/*"]
  }

  statement {
    sid       = "ConnectRedis"
    actions   = ["elasticache:Connect"]
    resources = [aws_elasticache_replication_group.this.arn, aws_elasticache_user.application.arn]
  }
}

resource "aws_iam_policy" "application" {
  name        = "${local.name}-application"
  description = "Least-privilege data-plane access for Atlas RAG workloads"
  policy      = data.aws_iam_policy_document.application.json
}

data "aws_iam_policy_document" "application_assume" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [module.eks.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${module.eks.oidc_provider}:sub"
      values   = ["system:serviceaccount:${var.workload_namespace}:${var.workload_service_account}"]
    }
  }
}

resource "aws_iam_role" "application" {
  name                 = "${local.name}-application"
  description          = "IRSA role for the Atlas RAG Kubernetes service account"
  assume_role_policy   = data.aws_iam_policy_document.application_assume.json
  max_session_duration = 3600
}

resource "aws_iam_role_policy_attachment" "application" {
  role       = aws_iam_role.application.name
  policy_arn = aws_iam_policy.application.arn
}

data "aws_iam_policy_document" "github_assume" {
  count = var.create_github_actions_role ? 1 : 0

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = [for environment in var.github_environments : "repo:${local.github_repository}:environment:${environment}"]
    }
  }
}

resource "aws_iam_role" "github_actions" {
  count = var.create_github_actions_role ? 1 : 0

  name               = "${local.name}-github-release"
  description        = "GitHub OIDC role for immutable ECR release publishing"
  assume_role_policy = data.aws_iam_policy_document.github_assume[0].json

  lifecycle {
    precondition {
      condition     = var.github_oidc_provider_arn != null && var.github_repository != null
      error_message = "github_oidc_provider_arn and github_repository are required when create_github_actions_role is true."
    }
  }
}

data "aws_iam_policy_document" "github_actions" {
  count = var.create_github_actions_role ? 1 : 0

  statement {
    sid       = "GetEcrAuthorizationToken"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "PublishApplicationImages"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:CompleteLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [for repository in aws_ecr_repository.application : repository.arn]
  }
}

resource "aws_iam_role_policy" "github_actions" {
  count = var.create_github_actions_role ? 1 : 0

  name   = "ecr-publish"
  role   = aws_iam_role.github_actions[0].id
  policy = data.aws_iam_policy_document.github_actions[0].json
}
