# Provider and Production Setup

This guide lists what must be created outside the repository and where each value belongs. Never send secrets through chat, commit them, put them in Terraform variable files, or expose them through `NEXT_PUBLIC_*` variables.

## Local Development

`make quickstart` needs no paid provider. It creates `.env` from `.env.example` and uses deterministic local model adapters.

To use live providers locally, edit the untracked root `.env` file.

## OpenAI

1. Create a project at [platform.openai.com](https://platform.openai.com/).
2. Set project budgets and usage alerts.
3. Create a restricted project API key.
4. Put it only in root `.env` as `OPENAI_API_KEY`.
5. Set `MODEL_PROVIDER=openai`.

Production: store JSON such as `{"api_key":"..."}` in the Terraform-created `/atlas-rag/<environment>/openai` secret.

## Tavily

1. Create an account at [tavily.com](https://tavily.com/).
2. Create a scoped API key and usage limit.
3. Put it only in root `.env` as `TAVILY_API_KEY`.
4. Set `WEB_SEARCH_ENABLED=true`.

Production: store `{"api_key":"..."}` in `/atlas-rag/<environment>/tavily`.

## Auth0

Create two Auth0 applications:

1. A **Regular Web/API resource** with identifier matching `AUTH0_AUDIENCE`, for example `https://api.atlas-rag.example.com`.
2. A **Single Page Application** for the Next.js browser client.

Configure SPA callback, logout, and web-origin URLs:

```text
http://localhost:3000
https://your-production-domain.example.com
```

Create API permissions:

```text
documents:read
documents:write
agents:run
```

Add tenant and group claims through an Auth0 Action under a namespace you control. The backend accepts `tenant_id` directly or `https://atlas-rag.example.com/tenant_id`; change the namespace in `security/auth.py` for your domain.

Root backend `.env`:

```dotenv
AUTH_DISABLED=false
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api.atlas-rag.example.com
```

Browser-safe `frontend/.env.local`:

```dotenv
NEXT_PUBLIC_AUTH0_DOMAIN=your-tenant.us.auth0.com
NEXT_PUBLIC_AUTH0_CLIENT_ID=your-spa-client-id
NEXT_PUBLIC_AUTH0_AUDIENCE=https://api.atlas-rag.example.com
```

An Auth0 SPA client ID is public. An Auth0 client secret is not used by the browser and must never be placed in `NEXT_PUBLIC_*`.

## Qdrant

Local Qdrant is included. For production, choose Qdrant Cloud or operate a dedicated cluster with three-zone placement, encrypted disks, API authentication, snapshots, restore tests, capacity tests, and private connectivity.

Set backend values:

```dotenv
QDRANT_URL=https://your-qdrant-endpoint
QDRANT_API_KEY=...
QDRANT_REPLICATION_FACTOR=2
```

Production: store `{"api_key":"..."}` in `/atlas-rag/<environment>/qdrant` and keep the endpoint in Helm configuration.

## AWS

Use AWS IAM Identity Center rather than long-lived user keys:

```bash
aws configure sso --profile atlas-platform
aws sso login --profile atlas-platform
export AWS_PROFILE=atlas-platform
```

Then:

1. Apply `infra/bootstrap/aws` once for encrypted remote state.
2. Configure `backend.hcl` and environment tfvars under `infra/stacks/aws`.
3. Review and apply a saved Terraform plan.
4. Populate the Terraform-created Secrets Manager records.
5. Create/configure production Qdrant.
6. Install the Kubernetes controllers required by the Helm chart.
7. Build and publish immutable API/frontend images.
8. Fill the production values from `terraform output -json platform_contract`.
9. Deploy through the protected GitHub environment and GitOps pull request.

The pods use IRSA. MSK and ElastiCache credentials are generated dynamically from workload identity; no static Kafka or Redis password is required.

## Citation Secret

Generate at least 32 random bytes and store the encoded value as `CITATION_HMAC_SECRET`:

```bash
openssl rand -base64 48
```

Changing this value changes opaque source identifiers. Plan rotation rather than changing it casually.

## GitHub Environments

Create protected `staging` and `production` environments. Configure the variables listed in [`.github/DEPLOYMENT.md`](../.github/DEPLOYMENT.md), require reviewers for production, and use the Terraform-created GitHub OIDC role. Do not create AWS access-key repository secrets.
