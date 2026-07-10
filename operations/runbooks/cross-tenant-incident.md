# Runbook: Cross-Tenant Incident

**Alerts:** `RAGCrossTenantAccessAttempt`, `RAGInjectionAttemptDetected`, `RAGExcessiveTokenUsage`, `RAGUnauthorizedEndpointAccess`
**Severity:** Critical (cross-tenant), Warning (injection/quota)
**Service:** atlas-rag / security
**Dashboard:** [Atlas RAG — Overview](https://grafana.example.com/d/atlas-rag-overview)

---

## 1. Immediate Containment (5 minutes)

### 1.1 Assess the blast radius

```promql
# Which tenants are involved in cross-tenant access attempts?
sum by (tenant_id) (
  rate(atlas_http_requests_total{
    status="403",
    tenant_mismatch="true"
  }[5m])
)

# Which source IPs?
sum by (source_ip) (
  rate(atlas_http_requests_total{
    status="403",
    tenant_mismatch="true"
  }[5m])
)

# How many unique tenant pairs are involved?
count(
  count by (tenant_id, target_tenant_id) (
    atlas_cross_tenant_access_total
  )
)
```

### 1.2 Isolate the affected tenant(s)

```bash
# Option A: Revoke the tenant's API key / JWKS access
# (via your identity provider or API key management)
# This is the fastest containment mechanism.

# Option B: Block at the load balancer / ingress level
kubectl annotate ingress atlas-rag-api \
  nginx.ingress.kubernetes.io/server-snippet="if (\$http_x_tenant_id = \"<AFFECTED_TENANT_ID>\") { return 403; }"

# Option C: Disable auth for emergency shutdown (only in extreme cases)
# AUTH_DISABLED=true — DO NOT do this casually; it disables ALL auth
```

### 1.3 Preserve evidence

```bash
# Dump API logs for the incident window to cold storage
kubectl logs -l app=atlas-rag-api --since=1h > /tmp/incident-api-logs-$(date +%s).txt

# Capture Prometheus time series snapshot
# (use the Prometheus snapshot API or Grafana dashboard screenshot)

# Dump relevant database audit records
PGPASSWORD=... psql -h localhost -U rag -d rag \
  -c "COPY (SELECT * FROM retrieval_request_log WHERE created_at > now() - interval '2 hours') TO STDOUT CSV HEADER" \
  > /tmp/incident-retrieval-logs.csv
```

---

## 2. Root Cause Categories

### Category A: Misconfigured SDK / Client

**Symptoms:** One tenant making requests that target another tenant's resources with their own JWT.
**Common causes:**
- Hardcoded tenant ID in client code
- Stale JWT token cache across tenant switches
- SDK bug in multi-tenant session management

**Remediation:**
1. Contact the tenant's engineering team
2. Ask them to rotate their API keys
3. Verify their SDK version is up to date

### Category B: JWT Manipulation / Forgery Attempt

**Symptoms:** Claims in the JWT that don't match the signing key or contain escalated permissions.
**Common causes:**
- Expired or compromised signing key
- None algorithm attack (JWT with `"alg": "none"`)
- Key confusion attack (HMAC vs RSA)

**Remediation:**
1. Rotate the JWKS signing key immediately
2. Audit your auth middleware for algorithm validation
3. Verify `AUTH0_ALGORITHMS` setting restricts to expected algorithms
4. Check if `auth_disabled` was accidentally set to `true`

### Category C: Internal Code Bug (Tenant Isolation Failure)

**Symptoms:** The platform itself serves one tenant's data to another with valid auth.
**Common causes:**
- Missing `set_tenant_context()` call in a new code path
- Row-level security (RLS) bypass in a new query
- Shared cache entry collision across tenants
- Vector search filter not correctly scoped to tenant

**Remediation:**
1. Audit `src/rag_platform/db/tenant.py` for correct context setting
2. Check `set_tenant_context()` is called on every session path
3. Verify RLS policies on PostgreSQL tables
4. Verify Qdrant payload filter includes `tenant_id` on every query
5. Verify Redis semantic cache keys include tenant_id and ACL fingerprint

---

## 3. Notification Template

**Subject:** `[SECURITY] Cross-Tenant Access Incident — Atlas RAG — {{DATE}}`

```
At approximately {{TIME}}, the Atlas RAG monitoring system detected
potential cross-tenant access patterns.

Affected Tenants: {{LIST}}
Nature: {{CROSS_TENANT_READ / INJECTION_ATTEMPT / QUOTA_EXCEEDED}}
Status: {{INVESTIGATING / CONTAINED / RESOLVED}}

We have:
- [X] Isolated the affected tenant IDs
- [X] Preserved evidence and logs
- [ ] Engaged the affected tenant's technical contact
- [ ] Root cause identified: {{ROOT_CAUSE}}
- [ ] Remediation applied: {{DESCRIPTION}}

If you believe your data may have been affected, please contact
security@example.com immediately with reference {{INCIDENT_ID}}.
```

---

## 4. Evidence Collection Checklist

- [ ] API access logs for the incident window (all replicas)
- [ ] Prometheus time series snapshot (atlas_http_requests_total, atlas_cross_tenant_access_total)
- [ ] Database audit logs (retrieval_request_log, retrieval_log for affected windows)
- [ ] Kafka message logs for document.accepted.v1 and document.failed.v1 topics
- [ ] Grafana dashboard screenshots (RAG Overview, Infrastructure)
- [ ] Git commit log for recent changes to auth, tenant, or cache code
- [ ] Kubernetes events for the incident window
- [ ] Identity provider audit logs (Auth0, etc.)

---

## 5. Post-Mortem Template

### 5.1 Incident Summary
- **Incident ID:** {{ID}}
- **Date/Time:** {{START}} — {{END}} ({{DURATION}})
- **Severity:** {{SEV1/SEV2/SEV3}}
- **Detected by:** {{ALERT NAME / CUSTOMER REPORT}}
- **Responders:** {{NAMES}}

### 5.2 Timeline (UTC)
| Time | Event |
|------|-------|
| HH:MM | Alert fired |
| HH:MM | On-call acknowledged |
| HH:MM | Containment applied |
| HH:MM | Root cause identified |
| HH:MM | Fix deployed |
| HH:MM | Incident resolved |

### 5.3 Root Cause
{{DETAILED DESCRIPTION OF TECHNICAL ROOT CAUSE}}

### 5.4 Impact
- Tenants affected: {{COUNT}}
- Records potentially accessed: {{COUNT or "N/A"}}
- Duration of exposure: {{DURATION}}

### 5.5 Action Items
| Action | Owner | Due Date |
|--------|-------|----------|
| Add automated test for tenant isolation on code path {{PATH}} | {{NAME}} | {{DATE}} |
| Add alert for {{NEW ALERT CONDITION}} | {{NAME}} | {{DATE}} |
| Update tenant isolation documentation | {{NAME}} | {{DATE}} |
| Penetration test for multi-tenant boundaries | {{NAME}} | {{DATE}} |

### 5.6 Lessons Learned
{{NARRATIVE}}

---

## 6. Escalation

| Role | When | Contact |
|------|------|---------|
| Security on-call | Immediately upon detection | PagerDuty: security-oncall |
| CISO | If cross-tenant data access is confirmed | @ciso on Slack |
| Legal/Compliance | If PII or regulated data is involved | @legal on Slack |
| Affected tenant(s) | After containment and initial assessment | Via registered contact |
| Public relations | If public disclosure is needed | @pr on Slack |
