# Atlas RAG AWS Regional Stack

This stack provisions one three-AZ Atlas RAG data plane: VPC, EKS node pools, encrypted object storage, PostgreSQL 16, Redis, MSK Serverless, ECR, KMS, workload identity, and empty Secrets Manager records. Qdrant remains a Kubernetes or externally managed service and is intentionally not provisioned by Terraform.

## Prerequisites

- Terraform/OpenTofu `1.10.5` and AWS provider `5.100.0`.
- AWS CLI v2 configured for IAM Identity Center (AWS SSO).
- The remote-state stack in `infra/bootstrap/aws` applied first.
- Private connectivity to the EKS API when `eks_endpoint_public_access=false`.

Managed EKS add-ons are pinned in `eks_addon_versions`. Update the cluster version and compatible add-on versions together after checking availability in the target region.

Terraform commands are shown below; the equivalent OpenTofu `tofu` commands use the same configuration and lock files.

## Remote-state bootstrap

Bootstrap state once per AWS account/region before initializing this stack:

```bash
cd infra/bootstrap/aws
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform fmt -check
terraform validate
terraform plan -out=tfplan
terraform apply tfplan
terraform output -json backend_config
```

Copy that output into `infra/stacks/aws/backend.hcl`, add a unique environment/region state key, then return to `infra/stacks/aws`.

## SSO workflow

```bash
aws configure sso --profile atlas-platform
aws sso login --profile atlas-platform
export AWS_PROFILE=atlas-platform
cp backend.hcl.example backend.hcl
cp dev.tfvars.example dev.tfvars
terraform init -backend-config=backend.hcl
terraform fmt -check -recursive
terraform validate
terraform plan -var-file=dev.tfvars -out=tfplan
terraform show tfplan
terraform apply tfplan
terraform output -json platform_contract > platform-contract.json
```

Use separate backend keys and variable files for each environment and region. Review the saved plan before apply. CI validates infrastructure, and the deployment workflow never runs `terraform apply`.

## Secret population

Terraform creates metadata-only secrets at `/atlas-rag/<environment>/{openai,tavily,auth0,citation,qdrant}` and does not create a secret version. Populate JSON values through an approved secret-management workflow after apply. RDS creates and rotates its own master credential. Never pass provider keys or passwords through `.tfvars`, plan files, or Terraform outputs.

MSK Serverless and ElastiCache use IAM authentication through the pod IRSA role. The Python adapters generate short-lived MSK OAuth and ElastiCache SigV4 credentials from the workload identity; do not add static broker/cache passwords or weaken transport security.

## Cost and operations

- Three NAT gateways are the resilient default and incur hourly plus data-processing charges. `single` is cheaper with an AZ dependency; `none` requires private endpoints and removes public model-provider egress.
- Interface VPC endpoints, six baseline EKS nodes, Multi-AZ RDS, three Redis nodes, MSK Serverless, flow logs, and KMS all incur ongoing cost.
- Spot node groups start at zero, but a cluster autoscaler or Karpenter must be installed in Kubernetes to increase them.
- Install ingress, External Secrets, KEDA, Prometheus Operator, policy enforcement, and observability through the platform GitOps layer.
- Qdrant is external to this stack and Helm release. Use Qdrant Cloud or a dedicated, capacity-tested deployment with encrypted storage, snapshots, three-zone placement, and restore testing.
- Cross-region replication and disaster recovery are not enabled by this regional stack. Deploy an independent regional stack and explicitly configure replication after validating residency requirements.
