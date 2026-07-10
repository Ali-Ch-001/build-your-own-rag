#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bold="$(tput bold 2>/dev/null || echo "")"
green="$(tput setaf 2 2>/dev/null || echo "")"
yellow="$(tput setaf 3 2>/dev/null || echo "")"
reset="$(tput sgr0 2>/dev/null || echo "")"

usage() {
  cat <<EOF
${bold}Atlas RAG — AWS Deployment${reset}

Usage:  ./scripts/deploy-aws.sh <command> [options]

${bold}Commands:${reset}
  bootstrap      Create remote state bucket and DynamoDB lock (once per account/region)
  plan           Show Terraform diff without applying
  apply          Provision infrastructure (VPC, EKS, RDS, Redis, MSK, S3, KMS, ECR)
  secrets        Print the ARNs of empty Secrets Manager placeholders to populate
  kubeconfig     Configure kubectl for the provisioned EKS cluster
  platform       Write the full platform contract to platform-contract.json
  deploy-app     Install or upgrade the Helm release
  all            Run bootstrap, plan, apply, kubeconfig, and deploy-app

${bold}Options:${reset}
  -e, --environment  Deployment environment (dev, staging, prod) [default: dev]
  -r, --region       AWS region [default: us-east-1]
  -p, --profile      AWS SSO profile [default: atlas-platform]
  -h, --help         Show this help

${bold}Examples:${reset}
  ./scripts/deploy-aws.sh bootstrap -e prod -r us-west-2
  ./scripts/deploy-aws.sh plan -e staging
  ./scripts/deploy-aws.sh all
EOF
  exit 0
}

ENVIRONMENT="dev"
REGION="us-east-1"
PROFILE="atlas-platform"
COMMAND=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    -e|--environment) ENVIRONMENT="$2"; shift 2 ;;
    -r|--region)      REGION="$2"; shift 2 ;;
    -p|--profile)     PROFILE="$2"; shift 2 ;;
    -h|--help)        usage ;;
    bootstrap|plan|apply|secrets|kubeconfig|platform|deploy-app|all)
      COMMAND="$1"; shift ;;
    *) echo "Unknown argument: $1"; usage ;;
  esac
done

if [[ -z "$COMMAND" ]]; then usage; fi

export AWS_PROFILE="$PROFILE"
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || echo "")"
BOOTSTRAP_DIR="$ROOT_DIR/infra/bootstrap/aws"
STACK_DIR="$ROOT_DIR/infra/stacks/aws"
CHART_DIR="$ROOT_DIR/deploy/charts/atlas-rag"

log_step() { echo -e "\n${bold}${green}==>${reset} ${bold}$*${reset}"; }
log_warn() { echo -e "${yellow}[!]${reset} $*"; }

check_aws() {
  if [[ -z "$AWS_ACCOUNT_ID" ]]; then
    log_warn "AWS credentials not found. Run: aws sso login --profile $PROFILE"
    aws sso login --profile "$PROFILE" || {
      echo "Authentication failed. Set up AWS SSO first: docs/SETUP.md"
      exit 1
    }
    AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
  fi
  echo "AWS account: $AWS_ACCOUNT_ID | region: $REGION | environment: $ENVIRONMENT"
}

do_bootstrap() {
  log_step "Bootstrapping remote state"
  cd "$BOOTSTRAP_DIR"
  [[ -f terraform.tfvars ]] || cp terraform.tfvars.example terraform.tfvars
  terraform init
  terraform validate
  terraform plan -out=tfplan -var "region=$REGION"
  echo ""
  read -rp "Apply remote state bootstrap? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Skipped. Rerun with 'apply' or 'all' to continue."
    exit 0
  fi
  terraform apply tfplan
  terraform output -json backend_config
}

do_plan() {
  log_step "Planning $ENVIRONMENT in $REGION"
  cd "$STACK_DIR"
  [[ -f backend.hcl ]] || { log_warn "Missing backend.hcl. Run bootstrap first."; exit 1; }
  [[ -f "${ENVIRONMENT}.tfvars" ]] || cp dev.tfvars.example "${ENVIRONMENT}.tfvars"
  terraform init -backend-config=backend.hcl
  terraform validate
  terraform plan -var-file="${ENVIRONMENT}.tfvars" -out=tfplan
}

do_apply() {
  log_step "Applying $ENVIRONMENT in $REGION"
  cd "$STACK_DIR"
  echo ""
  echo "This will create ~40 AWS resources including:"
  echo "  - VPC (3 AZs), EKS cluster, RDS PostgreSQL, Redis, MSK Serverless"
  echo "  - S3 buckets (3), KMS keys, ECR repos, Secrets Manager, IAM roles"
  echo "  Estimated monthly cost: see infra/stacks/aws/README.md"
  echo ""
  read -rp "Apply Terraform plan? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Skipped. Rerun with 'apply' or 'all' to continue."
    exit 0
  fi
  terraform apply tfplan
  terraform output -json platform_contract > "$ROOT_DIR/platform-contract.json"
  log_step "Platform contract written to platform-contract.json"
}

do_secrets() {
  log_step "Secrets Manager placeholders"
  cd "$STACK_DIR"
  terraform output -json platform_contract 2>/dev/null | python3 -c "
import json, sys
contract = json.load(sys.stdin)
secrets = contract.get('secrets', {}).get('placeholders', {})
if not secrets:
    print('No secrets found. Apply the stack first.')
    sys.exit(1)
for name, arn in secrets.items():
    print(f'  /atlas-rag/{ENVIRONMENT}/{name}  ->  {arn}')
print()
print('Populate each secret with JSON. Example for OpenAI:')
print('  aws secretsmanager put-secret-value \\')
print('    --secret-id /atlas-rag/{}/openai \\'.format(ENVIRONMENT))
print('    --secret-string \'{\"api_key\":\"sk-...\"}\'')
"
}

do_kubeconfig() {
  log_step "Configuring kubectl"
  cd "$STACK_DIR"
  cluster_name="$(terraform output -json platform_contract 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin)['kubernetes']['cluster_name'])")"
  aws eks update-kubeconfig --region "$REGION" --name "$cluster_name"
  kubectl cluster-info
}

do_platform() {
  log_step "Writing platform contract"
  cd "$STACK_DIR"
  terraform output -json platform_contract > "$ROOT_DIR/platform-contract.json"
  echo "Written to: $ROOT_DIR/platform-contract.json"
  echo ""
  echo "Key endpoints (from contract):"
  python3 -c "
import json
with open('$ROOT_DIR/platform-contract.json') as f:
    c = json.load(f)
print(f'  PostgreSQL: {c[\"postgresql\"][\"endpoint\"]}:{c[\"postgresql\"][\"port\"]}')
print(f'  Redis:      {c[\"cache\"][\"endpoint\"]}:{c[\"cache\"][\"port\"]} (IAM: {c[\"cache\"][\"authentication\"]})')
print(f'  Kafka:      {c[\"kafka\"][\"bootstrap_brokers\"]}')
print(f'  EKS:        {c[\"kubernetes\"][\"cluster_name\"]}')
print(f'  IRSA role:  {c[\"kubernetes\"][\"workload_role_arn\"]}')
print(f'  Buckets:    quarantine={c[\"object_store\"][\"quarantine_bucket\"]} clean={c[\"object_store\"][\"clean_bucket\"]} derived={c[\"object_store\"][\"derived_bucket\"]}')
"
}

do_deploy_app() {
  log_step "Deploying application via Helm"
  cd "$ROOT_DIR"
  echo "Install controllers first: External Secrets Operator, KEDA, ingress controller, Prometheus Operator"
  echo ""
  read -rp "Continue with Helm deploy? [y/N] " confirm
  if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Skipped."
    exit 0
  fi
  helm upgrade --install atlas-rag "$CHART_DIR" \
    --namespace atlas-rag --create-namespace \
    -f "$CHART_DIR/values-production.example.yaml"
  echo ""
  kubectl -n atlas-rag get pods
}

case "$COMMAND" in
  bootstrap)      check_aws; do_bootstrap ;;
  plan)           check_aws; do_plan ;;
  apply)          check_aws; do_apply ;;
  secrets)        check_aws; do_secrets ;;
  kubeconfig)     check_aws; do_kubeconfig ;;
  platform)       check_aws; do_platform ;;
  deploy-app)     check_aws; do_deploy_app ;;
  all)
    check_aws
    do_bootstrap
    do_plan
    do_apply
    do_kubeconfig
    do_platform
    do_secrets
    do_deploy_app
    ;;
esac

echo ""
echo -e "${bold}${green}Done.${reset} Review platform-contract.json for endpoints and secret ARNs."
echo "Open the frontend at the ingress hostname configured in your Helm values."
