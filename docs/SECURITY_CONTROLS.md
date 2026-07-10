# Security Controls Mapping

This document maps the Atlas RAG platform's security controls to SOC 2 Trust Services Criteria (TSC) and NIST SP 800-53 control families.

## Overview

| Trust Services Category | Key Controls |
|-------------------------|-------------|
| **Security** | Authentication, access control, encryption, vulnerability management, secure SDLC |
| **Availability** | Health monitoring, capacity planning, disaster recovery, backup procedures |
| **Confidentiality** | Tenant isolation, data encryption at rest/in transit, least-privilege access |

---

## Implemented Controls

### 1. Authentication (IA, AC — NIST; CC6.1 — SOC 2)

| Control | Description | Status |
|---------|------------|--------|
| Auth0 JWT validation | RS256-signed tokens validated against JWKS endpoint with issuer/audience/expiry checks | Implemented |
| JWKS key rotation | Keys cached for 1 hour, refreshed on expiry; supports Auth0 key rotation | Implemented |
| Dev mode guard | `auth_disabled` enforced only in `local`/`test` environments; prevents unsafe prod config | Implemented |
| Bearer token enforcement | Missing credentials in non-dev environments return HTTP 401 | Implemented |

### 2. Authorization (AC — NIST; CC6.3 — SOC 2)

| Control | Description | Status |
|---------|------------|--------|
| Permission-based access | `require_permission(permission)` decorator enforces fine-grained access (documents:read, agents:run, etc.) | Implemented |
| Tenant isolation | `tenant_id` extracted from JWT claims; all data operations scoped to tenant via `SET search_path TO tenant_<id>` or equivalent | Implemented |
| Row-level security (RLS) | PostgreSQL RLS policies enforce tenant-scoped data access at the database layer | Implemented |
| Clearance levels | Integer clearance field in `AuthContext` enables hierarchical data access controls | Implemented |

### 3. Encryption (SC — NIST; CC6.1 — SOC 2)

| Control | Description | Status |
|---------|------------|--------|
| TLS in transit | All external service connections (Auth0 JWKS, Qdrant, Redis, Kafka, LLM APIs) use HTTPS/TLS | Implemented |
| Encryption at rest | S3 buckets configured with AES-256 server-side encryption | Implemented |
| HMAC citation signing | `citation_hmac_secret` used to sign and verify document citations (tamper detection) | Implemented |
| Secret management | All secrets injected via environment variables or secrets manager; no hardcoded credentials in code | Implemented |

### 4. Input / Output Safety (SI — NIST; CC7.1 — SOC 2)

| Control | Description | Status |
|---------|------------|--------|
| Prompt injection detection | Regex-based inspection flags "ignore previous instructions", "act as unrestricted", shell/SQL/cypher execution patterns | Implemented |
| Credential pattern rejection | Detects and rejects OpenAI API keys (sk-), AWS access keys (AKIA), and PEM private keys in user input | Implemented |
| Output credential scanning | Model-generated outputs are scanned for credential patterns before returning to the caller | Implemented |
| Evidence sanitization | Retrieved document chunks are stripped of HTML tags and Markdown link syntax before inclusion | Implemented |
| File upload quarantine | Uploaded documents are validated and placed in a quarantine bucket before processing (clamav optional) | Implemented |

### 5. Audit Logging (AU — NIST; CC7.2 — SOC 2)

| Control | Description | Status |
|---------|------------|--------|
| Structured logging | structlog with JSON output, correlation IDs, tenant IDs, and trace context | Implemented |
| Retrieval request metrics | Per-request audit trail in database with `retrieval_request_metrics` table | Implemented |
| Kafka event stream | All ingestion and mutation events published to Kafka for downstream audit consumers | Implemented |

### 6. Infrastructure Security (CM, PL — NIST; CC5.2 — SOC 2)

| Control | Description | Status |
|---------|------------|--------|
| Containerized deployment | Docker Compose for local; Kubernetes manifests for production | Implemented |
| CI/CD pipeline | GitHub Actions with lint, type-check, unit tests, and security scanning | Implemented |
| Dependency scanning | Dependabot configured for automated dependency updates and vulnerability alerts | Implemented |
| Least-privilege IAM | S3, Qdrant, Redis, and Kafka connections use scoped credentials with minimal required permissions | Implemented |

---

## Controls Requiring Operational Procedures

These controls are designed into the platform but require operational procedures to be fully effective.

| Control Area | Requires | Reference |
|-------------|----------|-----------|
| Incident response | IR plan, on-call rotation, escalation path | NIST IR family |
| Penetration testing | Annual external pentest, quarterly internal scans | NIST CA-8 |
| Vulnerability management | SLAs for critical/high/medium CVEs; patch cadence | NIST SI-2 |
| Access reviews | Quarterly review of IAM roles, API keys, and user permissions | NIST AC-2 |
| Backup and restore | Regular database and object store backups with tested restore procedure | NIST CP-9 |
| Key rotation | Periodic rotation of signing keys, HMAC secrets, and API credentials | NIST SC-12 |
| Security training | Annual security awareness training for all engineers | NIST AT-2 |
| Third-party risk | Vendor security assessments for Auth0, OpenAI, Redis Cloud, Qdrant Cloud | NIST SA-9 |
| Change management | CAB process for production changes; risk assessment template | NIST CM-3 |
| Business continuity | BCP tested annually; RTO/RPO defined per service tier | NIST CP-2 |
| Data classification | Policy defining PII, PHI, PCI scope; data labeling requirements | NIST RA-2 |
| Log retention | Audit log retention periods defined and enforced (see RETENTION_POLICY.md) | NIST AU-11 |

---

## NIST SP 800-53 Family Mapping

| Family | Description | Implemented Controls |
|--------|------------|---------------------|
| AC — Access Control | Auth, authorization, tenant isolation, RLS, clearance levels | Yes |
| AU — Audit and Accountability | Structured logging, audit trail, event streaming | Yes |
| AT — Awareness and Training | Security training | Operational |
| CM — Configuration Management | CI/CD, dependency scanning, change management | Partial |
| CP — Contingency Planning | Backup/restore, BCP | Operational |
| IA — Identification and Authentication | Auth0 JWT, key rotation, dev mode guard | Yes |
| IR — Incident Response | IR plan, on-call | Operational |
| PL — Planning | SDLC, branching model | Yes |
| RA — Risk Assessment | Dependency scanning, data classification | Partial |
| SA — System and Services Acquisition | Third-party risk | Operational |
| SC — System and Communications Protection | TLS, encryption at rest, HMAC, secret management | Yes |
| SI — System and Information Integrity | Input/output guardrails, vulnerability management | Partial |

## SOC 2 TSC Mapping

| Criteria | Description | Relevant Controls |
|----------|------------|-------------------|
| CC1.x (COSO) | Control environment | CI/CD, branching model, security training |
| CC2.x | Communication and information | Incident response, change management |
| CC3.x | Risk assessment | Dependency scanning, third-party risk |
| CC4.x | Monitoring activities | Health monitoring, audit logging, pentest |
| CC5.x | Control activities | Auth, authz, encryption, guardrails, IAM |
| CC6.1 | Logical access | Auth0 JWT, RLS, tenant isolation |
| CC6.2 | User access provisioning | Permission-based access, access reviews |
| CC6.3 | Security awareness | Security training, PR template security checklist |
| CC6.6 | External threats | Prompt injection, credential scanning, WAF |
| CC7.1 | Change detection | Audit logging, event stream, diff reviews |
| CC7.2 | Incident detection | Health monitoring, error rate alerts |
| CC7.3 | Incident response | IR plan, runbook, on-call |
| CC7.4 | Recovery | Backup/restore, BCP, rollback plan |
