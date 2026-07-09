# AWS State Bootstrap

This stack creates the KMS-encrypted, versioned S3 state bucket and DynamoDB lock table used by the regional Atlas RAG stack. It intentionally starts with local state because a backend cannot create itself.

```bash
aws sso login --profile platform-admin
export AWS_PROFILE=platform-admin
cp terraform.tfvars.example terraform.tfvars
terraform init
terraform plan -out=tfplan
terraform apply tfplan
terraform output -json backend_config
```

Copy the output fields into `infra/stacks/aws/backend.hcl`; add a unique `key` such as `atlas-rag/prod/us-east-1/platform.tfstate`. Restrict bootstrap administration to a small platform role. Do not destroy this stack while any dependent state exists.
