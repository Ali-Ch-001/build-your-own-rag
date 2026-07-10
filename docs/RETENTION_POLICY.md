# Data Retention Policy

## Retention Periods

| Data Category | Retention Period | Justification |
|--------------|-----------------|---------------|
| **Documents** (source files) | Indefinite (until tenant deletion) | Core business asset; subject to customer agreement |
| **Chunks** (text segments) | Indefinite (derived from documents) | Required for RAG retrieval; regenerated on re-ingestion |
| **Embeddings** (vector data) | Indefinite (derived from chunks) | Computationally expensive to regenerate; tied to chunk lifecycle |
| **Conversation history** | 90 days (rolling) | Debugging and analytics; purged via scheduled job |
| **Audit logs** | 1 year (then archived to cold storage) | Compliance (SOC 2, NIST AU-11); archived logs retained 7 years |
| **Retrieval logs** (request metrics) | 90 days (aggregated); raw purged after 30 days | Performance monitoring; PII risk from query content |
| **Backups** (database + object store) | 30 days (daily), 12 months (monthly) | Disaster recovery; monthly backups retained 12 months |
| **Quarantined files** | 7 days (then permanently deleted) | Failed or suspicious uploads; not needed after triage |
| **Cache entries** (Redis) | Volatile: 1 hour; Stable: 24 hours | Performance; no durability requirement |
| **Kafka event stream** | 7 days (default topic retention) | Event replay window; extended retention requires explicit config |

## Legal Hold Procedures

When a legal hold is received (litigation, investigation, regulatory inquiry):

1. **Notify** the Data Governance Officer and Legal team immediately.
2. **Identify** the affected tenant(s), user(s), and date ranges.
3. **Suspend deletion** — pause all scheduled purging jobs for the affected data:
   - Set `legal_hold = true` on the tenant record (prevents tenant deletion).
   - Disable conversation history purge cron job.
   - Disable retrieval log purge cron job.
   - Bump Kafka topic retention to `retention.ms = -1` for hold duration.
4. **Export** a point-in-time snapshot of all affected data to a secure, access-controlled bucket.
5. **Document** the hold in the incident management system with:
   - Hold ID, date initiated, scope, custodian, legal reference number.
6. **Resume normal deletion** only after written release from Legal.

## Deletion Certification

Data deletion must be certified by an authorized operator. Each deletion event produces a certification entry:

```
{
  "certificate_id": "del-20260710-001",
  "operator": "security-operator@atlas-rag.example.com",
  "scope": {
    "tenant_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "data_categories": ["documents", "chunks", "embeddings", "conversation_history"]
  },
  "method": "hard_delete",
  "verification": {
    "database_rows_zeroed": true,
    "object_store_keys_removed": 1234,
    "vector_store_points_removed": 567890,
    "cache_keys_flushed": true
  },
  "timestamp": "2026-07-10T12:00:00Z",
  "approved_by": "data-governance-officer@atlas-rag.example.com"
}
```

Certificates are stored in a write-only, append-only log for audit purposes and retained for 7 years.

## Automated Enforcement

| Mechanism | Description |
|-----------|------------|
| `pg_cron` scheduled jobs | Purge conversation_history and retrieval_logs beyond retention window |
| Redis TTL | Volatile cache entries expire via `EXPIRE`; stable cache via `EXPIRE` at 24h |
| S3 lifecycle policies | Quarantine bucket: delete objects after 7 days; backup bucket: transition to Glacier after 30 days, delete after 12 months |
| Kafka `log.retention.ms` | Topic-level retention of 7 days (604800000 ms) |
| Tenant deletion workflow | Hard-deletes all rows, vector points, object store keys, and cache entries; produces deletion certificate |

## Exceptions

Exceptions to this policy require:
1. Written approval from the Data Governance Officer.
2. Documented business justification.
3. Time-bound exception window (max 90 days, renewable).
4. Logged in the policy exceptions register.
