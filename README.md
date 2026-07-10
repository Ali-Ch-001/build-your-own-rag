# Atlas RAG

> An open, production-oriented starting guide for building controlled retrieval and agentic AI systems over millions of documents.

[![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-3776AB?style=flat-square)](https://www.python.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?style=flat-square)](https://nextjs.org/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-ready-326CE5?style=flat-square)](https://kubernetes.io/)
[![Terraform](https://img.shields.io/badge/Terraform-AWS-844FBA?style=flat-square)](infra/stacks/aws)
[![License](https://img.shields.io/badge/License-Apache--2.0-4c1?style=flat-square)](LICENSE)

Atlas RAG is a working reference platform for teams that want to move beyond a single-vector-database demo. It combines secure PDF ingestion, structure-aware chunking, exact deduplication, hybrid retrieval, reranking, grounded citations, bounded tool use, streaming responses, observability, and cloud deployment assets in one repository.

Use the complete stack, adopt individual services, or use the architecture and contracts as a guide for your own deployment. The repository is intentionally modular: the application contracts stay stable while storage, model, search, identity, and infrastructure providers can be replaced.

The design target is demanding by intention: **10,000,000+ PDFs and hundreds of millions of chunks without an unfiltered vector flood**.

<p align="center">
  <img src="public-img/Ask%20the%20corpus.png" width="48%" alt="Grounded chat with citations, source metadata, and token usage" />
  <img src="public-img/Document%20inventory.png" width="48%" alt="Live document inventory showing real PDFs, processing states, and upload form" />
</p>
<p align="center">
  <img src="public-img/Infrastructure%20%26%20SLOs.png" width="48%" alt="Live SLO dashboard with real P95 latency, cache hit rate, dependency status, and budget burn" />
  <img src="public-img/Retrieval%20operations.png" width="48%" alt="Operations overview with live corpus metrics, throughput charts, and latency time series" />
</p>

## Why Atlas RAG

Most RAG examples stop after `embed -> vector search -> prompt`. That path is useful for a prototype, but it breaks down under large corpora, multi-tenancy, access control, document updates, deletion requirements, and production latency.

Atlas starts with different rules:

- Filter by tenant, ACL, corpus, type, date, classification, and active version before expensive search.
- Run PostgreSQL lexical search and filtered Qdrant ANN in parallel.
- Fuse ranks with Reciprocal Rank Fusion instead of mixing incompatible raw scores.
- Rerank a small candidate set, remove redundancy with MMR, and compress extractively.
- Register every source and validate citations before presenting a grounded answer.
- Treat PDFs, websites, tool output, and model output as untrusted data.
- Keep object storage authoritative and make search indexes rebuildable projections.
- Separate online query workloads from offline parsing, embedding, and indexing workloads.
- Prove quality, latency, isolation, deletion, backup, and rollback rather than assuming them.

The full rationale, capacity model, diagrams, SLOs, and phased roadmap are in [`HYPERSCALE_RAG_ARCHITECTURE.md`](HYPERSCALE_RAG_ARCHITECTURE.md).

## What Is Implemented

### Data and retrieval plane

- Quarantined PDF upload to MinIO or S3.
- SHA-256 source and chunk hashing.
- Active-content and optional ClamAV scanning.
- PyMuPDF structure extraction with page coordinates and metadata.
- Heading-aware semantic chunking with bounded token sizes and overlap.
- Idempotent Kafka ingestion with PostgreSQL stage state and bounded retries.
- Offline deterministic or OpenAI embeddings.
- Partition-ready Qdrant collections and indexed authorization payloads.
- PostgreSQL full-text retrieval with a production BM25/OpenSearch extension path.
- Metadata and ACL pre-filtering, dense ANN, sparse retrieval, RRF, reranking, MMR, and extractive compression.
- Redis exact, embedding, and vector-similarity semantic caches with corpus epochs.
- HMAC-backed source identifiers, page/section metadata, and citation validation.
- Tombstone-first deletion with asynchronous vector, object, graph, and cache cleanup.

### Agent and security plane

- Deterministic routes for internal RAG, GraphRAG, current web search, composite retrieval, and calculator requests.
- OpenAI-compatible generation with a key-free deterministic local provider.
- Tavily web search adapter.
- Neo4j document, chunk, entity, and relationship projection with bounded multi-hop retrieval.
- Auth0 JWT validation, tenant context, permissions, groups, and clearance.
- Browser-side Auth0 SPA support with in-memory tokens.
- Prompt-injection and credential-pattern controls.
- Bounded tool execution, safe arithmetic parsing, output inspection, abstention, and cancellation.
- Server-Sent Events for status, tools, sources, tokens, citations, usage, completion, and errors.

### Platform and interface

- Responsive Next.js operations console and grounded chat workspace.
- Live document inventory, upload, chat, health, and retrieval metrics when the API is available.
- Clearly labeled fixtures for screens whose operational/evaluation backends are not connected.
- Hardened backend and frontend containers.
- One-command Docker Compose environment.
- Helm chart with API, frontend, ingestion/deletion workers, migrations, HPA, KEDA, PDBs, topology spread, network policy, External Secrets, and ServiceMonitor support.
- Terraform/OpenTofu AWS foundation for VPC, EKS, RDS PostgreSQL, ElastiCache IAM, MSK Serverless IAM, S3, KMS, ECR, Secrets Manager, and workload identity.
- AWS IAM token generation for MSK and ElastiCache, with no static broker/cache passwords.
- GitHub Actions for backend/frontend quality, container scanning, SBOMs, Terraform validation, Helm validation, and digest-based GitOps promotion.

## Data Sources

All pages indicate whether they display live operational data or representative datasets used during development and evaluation.

| Screen | Data source | Mode |
|---|---|---|
| Grounded chat | Live API: retrieval, generation, and SSE | Operational when backend is connected |
| Documents | Live PostgreSQL and ingestion API | Operational when backend is connected |
| Overview (counts, latency, cache) | Live PostgreSQL, Qdrant, and request logs | Operational after migrations; fallback uses representative data |
| Ingestion operations | Connected to live ingestion summary API | Operational when ingestion worker is active |
| Evaluation | Representative RAGAS dataset | Requires evaluation dataset and judge model configuration |
| Infrastructure operations | Representative telemetry dataset | Requires observability backend connection |

Local deterministic embeddings and extractive answers are functional integration paths suitable for development and testing, not semantically equivalent to a production model. Set `MODEL_PROVIDER=openai` and provide credentials to activate the full semantic pipeline.

## Architecture

```text
PDF sources
    |
    v
Quarantine -> scan -> parse/OCR -> semantic chunks -> SHA-256 dedup
    |                                          |
    |                                          v
    |                                 offline embeddings
    v                                          |
Object storage <-> PostgreSQL metadata/BM25 <-> Qdrant ANN
                         \                     /
                          \--- RRF fusion ----/
                                  |
                         CPU cross-encoder
                                  |
                    MMR + extractive compression
                                  |
                     evidence registry + citations
                                  |
User -> Auth0 -> router -> RAG / GraphRAG / Tavily / tools
                                  |
                        grounded LLM response
                                  |
                    SSE tokens, sources, and usage
```

## Quick Start

### Requirements

- Docker Desktop or Docker Engine with Compose.
- At least 8 GB of available memory for the complete local stack.
- `make` and `curl` for the convenience commands.

### Start the complete local platform

```bash
make quickstart
```

This builds and starts PostgreSQL, Redis Stack, MinIO, Qdrant, Kafka, migrations, API, ingestion worker, deletion worker, and the Next.js frontend. No paid API key is required because local mode uses deterministic embeddings and extractive answers.

Open:

- Frontend: [http://localhost:3000](http://localhost:3000)
- API documentation: [http://localhost:8000/docs](http://localhost:8000/docs)
- MinIO console: [http://localhost:9001](http://localhost:9001)

Check the stack:

```bash
make status
make smoke
```

Stop it without deleting data:

```bash
make down
```

Delete local containers and persistent volumes:

```bash
make clean-local
```

### Developer mode without application containers

```bash
cp .env.example .env
uv sync
docker compose up -d postgres redis minio qdrant kafka
uv run alembic upgrade head
uv run uvicorn rag_platform.api.app:app --reload
```

In another terminal:

```bash
uv run python -m rag_platform.workers.ingestion
```

## Enable Production Providers

Keep secrets in `.env` locally and in a secret manager in production. Never commit keys or paste them into frontend variables.

```dotenv
MODEL_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4.1-mini

WEB_SEARCH_ENABLED=true
TAVILY_API_KEY=...

AUTH_DISABLED=false
AUTH0_DOMAIN=your-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api.atlas-rag.example.com
```

The browser-safe Auth0 domain, SPA client ID, and audience belong in `frontend/.env.local`; the OpenAI and Tavily keys never do.

Detailed account setup and secret locations are documented in [`docs/SETUP.md`](docs/SETUP.md).

## Deployment Options

### Docker Compose (local, one command)

Best for local development, demonstrations, and architecture evaluation. Starts every service in containers.

```bash
make quickstart
```

Opens the frontend at `http://localhost:3000`. No API keys required — local mode uses deterministic embeddings and extractive answers. Paid providers activate when you add keys to `.env`.

### Existing Kubernetes cluster

The Helm chart is provider-neutral. Point it at your PostgreSQL, Kafka, Redis, S3-compatible storage, and Qdrant endpoints:

```bash
helm upgrade --install atlas-rag deploy/charts/atlas-rag \
  --namespace atlas-rag \
  --create-namespace \
  -f deploy/charts/atlas-rag/values-production.example.yaml
```

The chart deploys the API, frontend, ingestion worker, deletion worker, migration job, HPA, KEDA ScaledObjects, PDBs, topology spread, network policies, resource quotas, External Secrets, ServiceMonitor, and optional ingress. See [`deploy/charts/atlas-rag/README.md`](deploy/charts/atlas-rag/README.md) for controller prerequisites and AWS IAM configuration.

**What you bring:** PostgreSQL, Kafka, Redis, S3-compatible object store, Qdrant endpoint.

### AWS (full production data plane)

The AWS stack provisions a production-ready regional data plane in ~30 minutes. It is designed for AWS IAM Identity Center (SSO) and reviewed plan/apply workflows — no long-lived access keys.

**Step-by-step:**

```bash
# 1. Authenticate
aws sso login --profile atlas-platform
export AWS_PROFILE=atlas-platform

# 2-9. One-command deployment (interactive, confirms each step)
./scripts/deploy-aws.sh all

# Or step-by-step:
./scripts/deploy-aws.sh bootstrap -e prod -r us-east-1
./scripts/deploy-aws.sh plan -e prod
./scripts/deploy-aws.sh apply -e prod
./scripts/deploy-aws.sh platform
./scripts/deploy-aws.sh secrets
./scripts/deploy-aws.sh kubeconfig
./scripts/deploy-aws.sh deploy-app
```

**What Terraform provisions:** 3-AZ VPC with public/private/database subnets, EKS with 5 node groups (system, online CPU, batch spot, sandbox, optional GPU), encrypted S3 buckets (quarantine, clean, derived), Multi-AZ RDS PostgreSQL 16, TLS-encrypted Redis replication group with IAM auth, MSK Serverless with IAM auth, ECR repositories, KMS key, Secrets Manager placeholders, IRSA workload identity, and GitHub OIDC release role.

**What you still configure outside Terraform:** Auth0 tenant, DNS/certificates (ACM), Qdrant endpoint (Cloud or self-managed), OpenAI and Tavily accounts, GitHub environments and protected branches.

Full details: [`infra/stacks/aws/README.md`](infra/stacks/aws/README.md), [`infra/bootstrap/aws/README.md`](infra/bootstrap/aws/README.md), [`docs/SETUP.md`](docs/SETUP.md).

### Bells and Whistles

These assets are included and ready to activate:

| Layer | What's included | How to activate |
|---|---|---|
| **Retrieval quality** | RAGAS evaluation pipeline, golden dataset, automated scoring, release gates | `POST /v1/evaluation/run` after indexing documents |
| **Observability** | 3 Grafana dashboards (RAG overview, infrastructure, SLO budget), 14 Prometheus alert rules, 3 operational runbooks | Import `observability/dashboards/*.json` and `observability/alerts/*.yml` into your Grafana/Prometheus stack |
| **Scale testing** | Configurable PDF generator, Locust load test (search, upload, agent SSE, health checks) | `python scripts/benchmark/generate-test-pdfs.py --count 1000` then `locust -f scripts/benchmark/locustfile.py` |
| **GraphRAG** | Neo4j entity/relationship projection, bounded multi-hop traversal, Cypher template safety | Set `NEO4J_ENABLED=true` and point at a Neo4j instance |
| **OCR** | PyMuPDF Tesseract fallback with page quality gates, 14 tests, configurable DPI/language | Set `OCR_ENABLED=true` in `.env` |
| **Security** | Auth0 JWT validation, RBAC, PostgreSQL RLS, prompt injection guard, SSRF-protected web fetcher, OWASP LLM pen-test checklist | Configure Auth0 in `frontend/.env.local`, review `docs/SECURITY_CONTROLS.md` |
| **Compliance** | SOC2 TCS mapping, NIST 800-53 controls, data retention policy, deletion certification template | Review `docs/SECURITY_CONTROLS.md`, `docs/RETENTION_POLICY.md` |
| **CI/CD** | GitHub Actions for lint/test/build/scan/SBOM/sign, Terraform/Helm validate, digest-based GitOps promotion | Push to `main` or open a PR |

### Deployment Portability

| Environment | Deployment path |
|---|---|
| Local development | `make quickstart` — single command, no external credentials |
| Existing Kubernetes cluster | One `helm install` after managed services and controllers are provisioned |
| AWS production | Guided Terraform workflow (remote state bootstrap → plan review → apply → Kubernetes deployment) |
| GCP, Azure, on-premises | Portable containers and Helm chart. Provider-specific Terraform modules are available for AWS; additional providers are supported through the Helm chart with externally managed infrastructure. |

The Terraform stack provisions approximately 40 AWS resources. Costs vary by region, instance types, and throughput. Review the plan output and the architecture document's capacity model before applying to production.

## API Example

Upload a PDF in local mode:

```bash
curl -X POST http://localhost:8000/v1/documents \
  -H "X-Tenant-ID: 00000000-0000-0000-0000-000000000001" \
  -H "X-Subject-ID: local-developer" \
  -F "file=@document.pdf;type=application/pdf" \
  -F "corpus_id=00000000-0000-0000-0000-000000000100" \
  -F "title=Example policy" \
  -F "document_type=policy"
```

Search the corpus:

```bash
curl -X POST http://localhost:8000/v1/search \
  -H "Content-Type: application/json" \
  -H "X-Tenant-ID: 00000000-0000-0000-0000-000000000001" \
  -H "X-Subject-ID: local-developer" \
  --data '{
    "query": "What is the recovery objective?",
    "filters": {
      "corpus_ids": ["00000000-0000-0000-0000-000000000100"]
    },
    "top_k": 5
  }'
```

## Repository Map

```text
src/rag_platform/       Python APIs, domain logic, adapters, retrieval, agents, workers
frontend/               Next.js chat and operations console
database/migrations/    PostgreSQL schema and RLS migrations
deploy/charts/          Portable Kubernetes Helm chart
deploy/environments/    Staging and production GitOps values
infra/bootstrap/aws/    Encrypted Terraform remote-state bootstrap
infra/stacks/aws/       Regional AWS production foundation
observability/          OpenTelemetry, Prometheus, 3 Grafana dashboards, 14 alert rules
scripts/                Quickstart (./scripts/quickstart.sh) and AWS deploy (./scripts/deploy-aws.sh)
tests/                  Unit, contract, and integration tests
docs/                   Setup guide, security controls, retention policy, pen-test checklist
.github/workflows/      CI, security scanning, SBOMs, and digest-based GitOps promotion
```

## Quality and Verification

```bash
# Backend
uv run ruff format --check .
uv run ruff check .
uv run mypy src
uv run pytest

# Frontend
npm --prefix frontend run lint
npm --prefix frontend run test
npm --prefix frontend run build

# Deployment contracts
docker compose config --quiet
terraform -chdir=infra/stacks/aws validate
helm lint deploy/charts/atlas-rag
```

CI additionally builds and scans containers, publishes SBOMs, validates Kubernetes resources, and proposes releases by immutable image digest.

## Performance and Scale

The platform is architected for enterprise-scale document volumes. The following targets inform capacity planning, infrastructure sizing, and acceptance testing:

| Target | Design objective |
|---|---:|
| Logical PDFs | 10,000,000+ |
| Active chunks | Approximately 300,000,000 |
| Sustained ingestion throughput | 2,500 documents/minute |
| Dense vector search latency (p95) | Under 200 ms after metadata pre-filtering |
| Complete retrieval pipeline (p95) | Under 350 ms, including fusion, reranking, and context assembly |
| Retrieval service availability | 99.95% |
| Cross-tenant data isolation | Architecturally enforced at every retrieval layer |

Achievement of these objectives at production scale requires validation against a representative corpus deployed on production-sized infrastructure with provider-specific tuning. The architecture provides the necessary controls; operational outcomes depend on deployment configuration and ongoing capacity management.

## Security Model

- Tenant context is derived from authenticated identity.
- PostgreSQL RLS and vector payload filters enforce isolation in depth.
- Auth0 validates issuer, audience, signature, expiry, subject, permissions, and tenant claims.
- PDFs are quarantined before parsing.
- Parser and tool containers are designed for non-root, read-only, restricted execution.
- AWS uses IRSA, KMS, private networking, IAM-authenticated MSK/Redis, and Secrets Manager.
- The model never grants authorization or invents source IDs.
- Unknown citations, insufficient evidence, and contradictory evidence result in abstention.

Review the threat controls before exposing any deployment to untrusted users. A reference implementation is not a substitute for your organization's security review, data classification, legal requirements, and incident-response process.

## Build on It

Atlas is meant to be extended. Common next steps include:

- Add a source connector for SharePoint, Google Drive, Confluence, or an internal object catalog.
- Replace PostgreSQL FTS with `pg_search`/ParadeDB or OpenSearch BM25 at very large lexical scale.
- Add provider modules for GCP and Azure.
- Connect the evaluation and operations dashboards to your RAGAS and observability APIs.
- Add domain-specific entity extraction and graph relationship schemas.
- Add delegated Jira, Salesforce, or internal action tools behind approval policies.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a change and [`SECURITY.md`](SECURITY.md) for vulnerability reporting.

## License

Licensed under the [Apache License 2.0](LICENSE). You may use, modify, and distribute the project subject to that license.
