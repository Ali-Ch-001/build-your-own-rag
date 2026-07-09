variable "aws_region" {
  description = "AWS region for this regional data plane."
  type        = string
  default     = "us-east-1"

  validation {
    condition     = can(regex("^[a-z]{2}(-[a-z]+)+-[0-9]+$", var.aws_region))
    error_message = "aws_region must be a valid AWS region name."
  }
}

variable "environment" {
  description = "Deployment environment name."
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,11}$", var.environment))
    error_message = "environment must be 2-12 lowercase alphanumeric or hyphen characters."
  }
}

variable "name_prefix" {
  description = "Prefix applied to regional resources."
  type        = string
  default     = "atlas-rag"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,19}$", var.name_prefix))
    error_message = "name_prefix must be 3-20 lowercase alphanumeric or hyphen characters."
  }
}

variable "vpc_cidr" {
  description = "IPv4 CIDR for the regional VPC. A /16 is recommended."
  type        = string
  default     = "10.40.0.0/16"

  validation {
    condition     = can(cidrnetmask(var.vpc_cidr)) && try(tonumber(split("/", var.vpc_cidr)[1]) <= 20, false)
    error_message = "vpc_cidr must be a valid IPv4 CIDR with a /20 or larger address space."
  }
}

variable "nat_gateway_mode" {
  description = "NAT topology: per_az for resilience, single for lower cost, or none for private-only workloads."
  type        = string
  default     = "per_az"

  validation {
    condition     = contains(["per_az", "single", "none"], var.nat_gateway_mode)
    error_message = "nat_gateway_mode must be per_az, single, or none."
  }
}

variable "enable_vpc_endpoints" {
  description = "Create S3 gateway and common AWS interface endpoints."
  type        = bool
  default     = true
}

variable "eks_cluster_version" {
  description = "EKS Kubernetes minor version."
  type        = string
  default     = "1.32"

  validation {
    condition     = can(regex("^1\\.[0-9]{2}$", var.eks_cluster_version))
    error_message = "eks_cluster_version must be a Kubernetes minor version such as 1.32."
  }
}

variable "eks_addon_versions" {
  description = "Pinned EKS managed add-on versions compatible with eks_cluster_version."
  type        = map(string)
  default = {
    coredns    = "v1.11.4-eksbuild.2"
    kube-proxy = "v1.32.0-eksbuild.2"
    vpc-cni    = "v1.19.2-eksbuild.1"
  }

  validation {
    condition = alltrue([
      for addon in ["coredns", "kube-proxy", "vpc-cni"] :
      can(regex("^v[0-9]+\\.[0-9]+\\.[0-9]+-eksbuild\\.[0-9]+$", lookup(var.eks_addon_versions, addon, "")))
    ])
    error_message = "eks_addon_versions must contain pinned coredns, kube-proxy, and vpc-cni versions."
  }
}

variable "eks_endpoint_public_access" {
  description = "Expose the EKS API publicly in addition to private access."
  type        = bool
  default     = false
}

variable "eks_public_access_cidrs" {
  description = "Trusted CIDRs for the EKS public API when enabled."
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for cidr in var.eks_public_access_cidrs : can(cidrnetmask(cidr)) && cidr != "0.0.0.0/0"
    ])
    error_message = "EKS public access CIDRs must be valid IPv4 CIDRs and must not include 0.0.0.0/0."
  }
}

variable "enable_cluster_creator_admin" {
  description = "Grant the applying principal EKS cluster-admin access. Disable after explicit access entries exist."
  type        = bool
  default     = true
}

variable "system_instance_types" {
  description = "Instance types for the per-AZ system node groups."
  type        = list(string)
  default     = ["m7i.large"]

  validation {
    condition     = length(var.system_instance_types) > 0
    error_message = "system_instance_types must not be empty."
  }
}

variable "online_instance_types" {
  description = "Instance types for latency-sensitive online workloads."
  type        = list(string)
  default     = ["m7i.xlarge", "m6i.xlarge"]

  validation {
    condition     = length(var.online_instance_types) > 0
    error_message = "online_instance_types must not be empty."
  }
}

variable "batch_instance_types" {
  description = "Diversified instance types for spot ingestion workers."
  type        = list(string)
  default     = ["m7i.2xlarge", "m6i.2xlarge", "m6a.2xlarge"]

  validation {
    condition     = length(var.batch_instance_types) >= 2
    error_message = "batch_instance_types must contain at least two types for Spot diversification."
  }
}

variable "sandbox_instance_types" {
  description = "On-demand instance types for untrusted parsing and tools."
  type        = list(string)
  default     = ["m7i.xlarge"]

  validation {
    condition     = length(var.sandbox_instance_types) > 0
    error_message = "sandbox_instance_types must not be empty."
  }
}

variable "enable_gpu_batch" {
  description = "Create a scale-to-zero spot GPU node group."
  type        = bool
  default     = false
}

variable "gpu_batch_instance_types" {
  description = "GPU instance types for embedding and OCR batch jobs."
  type        = list(string)
  default     = ["g6.xlarge", "g5.xlarge"]

  validation {
    condition     = length(var.gpu_batch_instance_types) > 0
    error_message = "gpu_batch_instance_types must not be empty."
  }
}

variable "db_instance_class" {
  description = "RDS PostgreSQL instance class."
  type        = string
  default     = "db.r7g.large"
}

variable "db_allocated_storage_gib" {
  description = "Initial gp3 storage for PostgreSQL."
  type        = number
  default     = 100

  validation {
    condition     = var.db_allocated_storage_gib >= 20
    error_message = "db_allocated_storage_gib must be at least 20 GiB."
  }
}

variable "db_max_allocated_storage_gib" {
  description = "Maximum PostgreSQL autoscaled storage."
  type        = number
  default     = 1000

  validation {
    condition     = var.db_max_allocated_storage_gib >= var.db_allocated_storage_gib
    error_message = "db_max_allocated_storage_gib must be at least db_allocated_storage_gib."
  }
}

variable "db_backup_retention_days" {
  description = "RDS automated backup retention."
  type        = number
  default     = 14

  validation {
    condition     = var.db_backup_retention_days >= 7 && var.db_backup_retention_days <= 35
    error_message = "db_backup_retention_days must be between 7 and 35."
  }
}

variable "db_deletion_protection" {
  description = "Prevent accidental RDS deletion."
  type        = bool
  default     = true
}

variable "redis_node_type" {
  description = "ElastiCache node type."
  type        = string
  default     = "cache.r7g.large"
}

variable "quarantine_expiration_days" {
  description = "Days to retain rejected or abandoned quarantine objects."
  type        = number
  default     = 30

  validation {
    condition     = var.quarantine_expiration_days >= 7
    error_message = "quarantine_expiration_days must be at least 7."
  }
}

variable "workload_namespace" {
  description = "Kubernetes namespace trusted by the application IRSA role."
  type        = string
  default     = "atlas-rag"

  validation {
    condition     = can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", var.workload_namespace)) && length(var.workload_namespace) <= 63
    error_message = "workload_namespace must be a valid Kubernetes DNS label."
  }
}

variable "workload_service_account" {
  description = "Kubernetes service account trusted by the application IRSA role."
  type        = string
  default     = "atlas-rag"

  validation {
    condition     = can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", var.workload_service_account)) && length(var.workload_service_account) <= 63
    error_message = "workload_service_account must be a valid Kubernetes service account name."
  }
}

variable "create_github_actions_role" {
  description = "Create an ECR publisher role trusted by an existing GitHub OIDC provider."
  type        = bool
  default     = false
}

variable "github_oidc_provider_arn" {
  description = "ARN of the account-level token.actions.githubusercontent.com OIDC provider."
  type        = string
  default     = null
  nullable    = true
}

variable "github_repository" {
  description = "GitHub repository in owner/name form allowed to publish releases."
  type        = string
  default     = null
  nullable    = true

  validation {
    condition     = var.github_repository == null || can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository must use owner/name form."
  }
}

variable "github_environments" {
  description = "Protected GitHub environments allowed to assume the release role."
  type        = set(string)
  default     = ["staging", "production"]

  validation {
    condition     = length(var.github_environments) > 0 && alltrue([for name in var.github_environments : length(trimspace(name)) > 0])
    error_message = "github_environments must contain at least one non-empty environment name."
  }
}

variable "tags" {
  description = "Additional resource tags."
  type        = map(string)
  default     = {}
}
