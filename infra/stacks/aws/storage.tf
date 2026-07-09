resource "aws_s3_bucket" "data" {
  for_each = local.bucket_names

  bucket = each.value
}

resource "aws_s3_bucket_ownership_controls" "data" {
  for_each = aws_s3_bucket.data

  bucket = each.value.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "data" {
  for_each = aws_s3_bucket.data

  bucket                  = each.value.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "data" {
  for_each = aws_s3_bucket.data

  bucket = each.value.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  for_each = aws_s3_bucket.data

  bucket = each.value.id

  rule {
    bucket_key_enabled = true

    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.platform.arn
      sse_algorithm     = "aws:kms"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "data" {
  for_each = aws_s3_bucket.data

  bucket = each.value.id

  depends_on = [aws_s3_bucket_versioning.data]

  rule {
    id     = "incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "noncurrent-versions"
    status = "Enabled"

    filter {}

    dynamic "noncurrent_version_transition" {
      for_each = each.key == "clean" || each.key == "derived" ? [1] : []

      content {
        noncurrent_days = 30
        storage_class   = "STANDARD_IA"
      }
    }

    noncurrent_version_expiration {
      noncurrent_days = each.key == "quarantine" ? var.quarantine_expiration_days : 365
    }
  }

  dynamic "rule" {
    for_each = each.key == "quarantine" ? [1] : []

    content {
      id     = "expire-quarantine"
      status = "Enabled"

      filter {}

      expiration {
        days = var.quarantine_expiration_days
      }
    }
  }

  dynamic "rule" {
    for_each = each.key == "clean" || each.key == "derived" ? [1] : []

    content {
      id     = "intelligent-tiering"
      status = "Enabled"

      filter {}

      transition {
        days          = 30
        storage_class = "INTELLIGENT_TIERING"
      }
    }
  }
}

data "aws_iam_policy_document" "bucket" {
  for_each = aws_s3_bucket.data

  statement {
    sid    = "DenyInsecureTransport"
    effect = "Deny"

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    actions = ["s3:*"]
    resources = [
      each.value.arn,
      "${each.value.arn}/*",
    ]

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "data" {
  for_each = aws_s3_bucket.data

  bucket = each.value.id
  policy = data.aws_iam_policy_document.bucket[each.key].json
}
