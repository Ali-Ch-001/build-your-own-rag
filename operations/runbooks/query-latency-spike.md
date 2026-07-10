# Runbook: Query Latency Spike

**Alert:** `RAGRetrievalLatencyHigh` — Retrieval P95 latency > 500ms for 10 minutes
**Severity:** Critical
**Service:** atlas-rag / retrieval
**Dashboard:** [Atlas RAG — Overview](https://grafana.example.com/d/atlas-rag-overview)

---

## 1. Triage (5 minutes)

### 1.1 Identify the affected scope

```promql
# Is it all queries or a specific tenant?
histogram_quantile(0.95,
  sum by (tenant_id) (rate(atlas_http_request_duration_seconds_bucket{
    route="/v1/search"
  }[10m])) by (le, tenant_id)
)

# Is it all routes or just /v1/search?
histogram_quantile(0.95,
  sum by (route) (rate(atlas_http_request_duration_seconds_bucket[10m])) by (le, route)
)
```

### 1.2 Identify the slow leg

```promql
# Check per-stage timings if instrumented
atlas_retrieval_stage_duration_seconds{stage=~"sparse|dense|rerank|generation"}

# Check downstream dependency latency
histogram_quantile(0.95, rate(qdrant_grpc_duration_seconds_bucket[5m]))
histogram_quantile(0.95, rate(pg_stat_statements_duration_bucket[5m]))
atlas_llm_request_duration_seconds
```

**Decision tree:**
- **Sparse leg slow** → PostgreSQL index bloat, missing `websearch_to_tsquery` statistics, or large tsvector columns.
- **Dense leg slow** → Qdrant query pressure, HNSW graph traversal under high cardinality, or index segments need merging.
- **Reranker slow** → Cross-encoder model loading, ONNX runtime contention, or CPU/GPU resource starvation.
- **Model generation slow** → OpenAI/LLM provider latency, rate limiting, token throughput caps.
- **All legs elevated** → Resource contention (CPU, memory, network) or a noisy neighbor.

---

## 2. Check Downstream Dependencies (10 minutes)

| Dependency | Check | Command / Query |
|------------|-------|-----------------|
| PostgreSQL | Connection pool, slow queries | `SELECT * FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 seconds';` |
| Qdrant | Collection health, disk | `curl -s http://qdrant:6333/collections/{collection_name}` |
| Redis | Memory, evictions, latency | `redis-cli INFO memory`, `redis-cli INFO stats` |
| Kafka | Consumer lag, partition leaders | `kafka-consumer-groups --describe --group rag-ingestion-v1` |
| OpenAI/LLM | Provider status, rate limits | Check provider dashboard for elevated errors or latency |

---

## 3. Check Recent Deployments

```bash
# Check what changed recently
git log --oneline --since="2 hours ago"
kubectl get events --sort-by='.lastTimestamp' | tail -20

# Check for config changes
kubectl rollout history deployment/atlas-rag-api
kubectl rollout history deployment/atlas-rag-ingestion-worker
```

**Rollback candidate:** If a config change or deployment correlates with the spike, consider rollback.

---

## 4. Immediate Mitigation

### If cache hit rate is also declining:
```bash
# Check Redis evictions
redis-cli INFO stats | grep evicted_keys

# Bump cache TTL temporarily if appropriate (via env var + restart)
# CACHE_VOLATILE_TTL_SECONDS=7200
# CACHE_STABLE_TTL_SECONDS=172800
```

### If dense retrieval is the bottleneck:
```bash
# Reduce dense candidates as a temporary measure
# DENSE_CANDIDATES=25  (from default 50)
# Requires API restart
```

### If database connections are exhausted:
```bash
# Temporarily increase pool
# DATABASE_POOL_SIZE=20
# DATABASE_MAX_OVERFLOW=40
```

### Scale horizontally:
```bash
kubectl scale deployment atlas-rag-api --replicas=4
```

---

## 5. Rollback Procedure

```bash
# Rollback API deployment
kubectl rollout undo deployment/atlas-rag-api

# Rollback ingestion worker
kubectl rollout undo deployment/atlas-rag-ingestion-worker

# Verify health after rollback
curl -s http://atlas-rag-api:8000/health | jq .
```

Monitor the RAG Overview dashboard for 5 minutes after rollback to confirm resolution.

---

## 6. Escalation

| Role | When to Escalate | Contact |
|------|------------------|---------|
| On-call SRE | After 15 minutes without resolution | Slack: #atlas-alerts |
| Database team | If PostgreSQL is the root cause | PagerDuty: db-oncall |
| ML/Infra team | Qdrant or embedding issues | Slack: #ml-infra |
| Security | If latency spike coincides with unusual access patterns | PagerDuty: security-oncall |
| Engineering lead | After 30 minutes or if rollback is needed | @eng-lead on Slack |

---

## 7. Post-Incident

1. Create an incident ticket with timeline and root cause.
2. Update this runbook with any new findings.
3. Schedule a blameless post-mortem if severity warrants.
4. Add or tune alerting thresholds based on learnings.
