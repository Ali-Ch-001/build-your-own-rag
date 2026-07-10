# Runbook: Ingestion Stalled

**Alert:** `RAGIngestionStalled` — 0 documents processed for 15 minutes
**Severity:** Critical
**Service:** atlas-rag / ingestion
**Dashboard:** [Atlas RAG — Overview](https://grafana.example.com/d/atlas-rag-overview)

---

## 1. Verify the Alert (5 minutes)

### 1.1 Check if ingestion is truly stalled

```promql
# Confirms zero throughput
rate(atlas_documents_ingested_total[15m])

# Check if documents are still being uploaded (accepted but not processed)
rate(atlas_documents_accepted_total[15m])

# Check failure rate — are documents failing instead of succeeding?
rate(atlas_documents_failed_total[15m])
```

### 1.2 Check ingestion worker health

```bash
# Check worker pod status
kubectl get pods -l app=atlas-rag-ingestion-worker

# Check worker logs for the most recent errors
kubectl logs -l app=atlas-rag-ingestion-worker --tail=100 | grep -E "ERROR|FAILED|exception"

# Check if workers are in crash loop
kubectl describe pod -l app=atlas-rag-ingestion-worker | grep -A5 "State:"
```

---

## 2. Pipeline Health Check (10 minutes)

### 2.1 Kafka consumer lag

```promql
# Check lag on all RAG topics
sum by (consumergroup, topic) (kafka_consumergroup_lag{
  consumergroup=~"rag-.*"
})

# Check if the consumer group has active members
kafka_consumergroup_members{consumergroup="rag-ingestion-v1"}
```

```bash
# Describe consumer group from Kafka side
kubectl exec -it kafka-0 -- \
  /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:29092 \
  --group rag-ingestion-v1 \
  --describe
```

**If lag is high and growing:** Workers cannot keep up. Scale horizontally.
**If lag is 0 but no ingestion:** Check if documents are being produced to the topic at all.

### 2.2 Dead Letter Queue (DLQ)

```promql
# Check the document.failed.v1 topic message rate
rate(kafka_topic_messages_total{topic="document.failed.v1"}[5m])

# Check if the DLQ has messages piling up
atlas_document_failure_info
```

```bash
# Inspect recent DLQ messages
kubectl exec -it kafka-0 -- \
  /opt/kafka/bin/kafka-console-consumer.sh \
  --bootstrap-server localhost:29092 \
  --topic document.failed.v1 \
  --max-messages 5 \
  --from-beginning
```

### 2.3 Database connectivity

```bash
# Check PostgreSQL connection pool
kubectl port-forward svc/postgres 5432:5432 &
PGPASSWORD=rag-local-password psql -h localhost -U rag -d rag \
  -c "SELECT count(*) AS active_connections FROM pg_stat_activity WHERE state = 'active';"
PGPASSWORD=rag-local-password psql -h localhost -U rag -d rag \
  -c "SELECT count(*) AS idle_in_transaction FROM pg_stat_activity WHERE state = 'idle in transaction' AND query_start < now() - interval '5 minutes';"
```

**If idle-in-transaction is high:** A worker may be holding a stale transaction lock.

### 2.4 Qdrant write pressure

```bash
# Check Qdrant collection status
curl -s http://qdrant:6333/collections | jq '.result.collections[] | select(.name | startswith("rag_chunks"))'
curl -s "http://qdrant:6333/collections/rag_chunks_text_embedding_3_small_1536" | jq '.result | {points_count, indexed_vectors_count, segments_count}'
```

**If indexed_vectors_count < points_count:** Vectors are queued but not yet indexed. Wait for index to catch up or check Qdrant health.

### 2.5 MinIO / S3 connectivity

```bash
# Check if object store is healthy
curl -sf http://minio:9000/minio/health/live
# Check buckets exist
mc alias set local http://minio:9000 minioadmin minioadmin-local-only
mc ls local/rag-quarantine/
mc ls local/rag-clean/
```

---

## 3. Restart Procedure

### 3.1 Controlled restart of ingestion workers

```bash
# Graceful restart (SIGTERM, allows in-flight documents to complete)
kubectl rollout restart deployment/atlas-rag-ingestion-worker

# Wait for new pods to be ready
kubectl rollout status deployment/atlas-rag-ingestion-worker --timeout=120s
```

### 3.2 Scale up if needed

```bash
# Increase worker count (one per partition is the theoretical max)
kubectl scale deployment atlas-rag-ingestion-worker --replicas=4
```

### 3.3 Verify recovery

```promql
# Monitor for 5 minutes
rate(atlas_documents_ingested_total[5m]) > 0
```

```bash
# Check that new documents are flowing
kubectl logs -l app=atlas-rag-ingestion-worker --tail=50 | grep "ingestion_completed"
```

---

## 4. Forced Recovery (if restart doesn't help)

### 4.1 Recreate the consumer group

```bash
# WARNING: This will reset offsets and may re-process documents.
# Only do this if messages are poisoned and failing deterministically.

# Stop all workers first
kubectl scale deployment atlas-rag-ingestion-worker --replicas=0

# Delete consumer group to reset offsets
kubectl exec -it kafka-0 -- \
  /opt/kafka/bin/kafka-consumer-groups.sh \
  --bootstrap-server localhost:29092 \
  --group rag-ingestion-v1 \
  --delete

# Restart workers
kubectl scale deployment atlas-rag-ingestion-worker --replicas=2
```

### 4.2 Purge DLQ and retry

```bash
# If the retry producer is filling the DLQ, clear and re-publish selectively
# This requires a custom script — review failed document IDs first
```

---

## 5. Escalation

| Role | When | Contact |
|------|------|---------|
| On-call SRE | After 15 minutes without resolution | Slack: #atlas-alerts |
| Data pipeline team | If Kafka is root cause | PagerDuty: data-pipeline |
| DBA team | If PostgreSQL is root cause | PagerDuty: db-oncall |
| Platform team | If infrastructure (disk, network) is root cause | Slack: #platform |
| Engineering lead | After 30 minutes | @eng-lead on Slack |

---

## 6. Prevention Checklist

- [ ] Ingestion worker replicas >= number of topic partitions
- [ ] Kafka consumer session timeout is appropriate (not too short to cause rebalances under load)
- [ ] Qdrant has sufficient disk space for new vectors
- [ ] PostgreSQL connection pool is sized for peak concurrent ingestion
- [ ] ClamAV (if enabled) is healthy and not blocking the quarantine scan
- [ ] Object store (S3/MinIO) IAM credentials are valid and not expired
- [ ] DLQ alerting is configured separately from throughput alerting
