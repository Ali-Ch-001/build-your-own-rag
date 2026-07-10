# Scaling Guide

The backpressure controller prevents cascading failure but it also determines
throughput. Defaults are safe for single-node production. Tune for your scale.

## Backpressure Configuration

| Setting | Default | Purpose | Scale Up When |
|---|---|---|---|
| `EMBEDDING_MAX_CONCURRENCY` | 48 | Max concurrent OpenAI embedding calls across all workers | OpenAI tier supports higher concurrency |
| `QDRANT_WRITE_RATE_PER_SECOND` | 100 | Qdrant bulk write rate limit | Qdrant shards can handle more write throughput |
| `QDRANT_WRITE_BURST` | 200 | Burst writes before rate limiting | Short spikes cause unnecessary queueing |
| `INGESTION_BACKPRESSURE_P95_THRESHOLD_MS` | 500 | Pause ingestion when retrieval p95 exceeds this | Your SLA allows higher query latency during bulk ingest |

## Throughput Estimates By Scale

### 1,000 documents (defaults)
```
30 chunks/doc × 1,000 docs = 30,000 chunks
48 concurrent × 128 batch × ~500ms/call = ~12 minutes embedding
Qdrant: 30,000 points / 100/sec = 5 minutes indexing
Total: ~17 minutes
```

### 10,000 documents (defaults)
```
48 concurrent × 128 batch × ~500ms = ~2 hours embedding
Qdrant: 300,000 points / 100/sec = 50 minutes indexing
Total: ~3 hours
```

### 100,000 documents (tuned)
```
EMBEDDING_MAX_CONCURRENCY=128, QDRANT_WRITE_RATE=1000
~8 hours embedding, ~2 hours indexing
Total: ~10 hours
```

### 1,000,000 documents (dedicated GPU)
```
Dedicated GPU embedding nodes, batch inference
~3 days continuous embedding
Qdrant: 64 shards, 5,000 writes/sec
Total: ~4 days
```

### 10,000,000 documents (enterprise)
```
Multi-GPU cluster, pre-created 64 Qdrant shards
Use separate hot/warm indexes: backfill into warm, serve from hot
4-6 weeks continuous backfill while live traffic runs on hot index
```

## Qdrant Sharding

Default is 1 shard for local, 32 for production. For >1M documents:

```python
# In vector_store.py ensure_collection():
shard_number = 64  # pre-create, not auto-expand
```

Each shard should target 5-15M points. At 300M points total:
- 32 shards: ~9.4M points/shard (within range)
- 64 shards: ~4.7M points/shard (comfortable)

## OpenAI Rate Limits

| Tier | RPM (requests/min) | TPM (tokens/min) |
|---|---|---|
| Free | 3 | 40,000 |
| Tier 1 | 500 | 200,000 |
| Tier 2 | 5,000 | 2,000,000 |
| Tier 3 | 50,000 | 20,000,000 |
| Tier 4 | 500,000 | 200,000,000 |

At 48 concurrent calls with `text-embedding-3-small` (512 tokens/input):
- Per minute: ~5,760 batches × 128 texts × 512 tokens = ~377M tokens/min
- Requires Tier 4 at minimum

Reduce `EMBEDDING_MAX_CONCURRENCY` if you hit 429s. The backpressure controller
prevents the cascade, but you still need enough headroom in your OpenAI tier.

## KEDA Autoscaling Tuning

The Helm chart defaults `maxReplicaCount: 100`. With the backpressure controller,
this is safe -- workers will queue on `acquire_embedding_slot()` rather than
flooding OpenAI. Keep `maxReplicaCount` high. The application-layer semaphore is
the real governor.

## Retrieval Performance at Scale

As the index grows, retrieval latency increases. Tune these if p95 degrades:

```
Qdrant:        hnsw_ef=128  → increase query ef for better recall at cost of latency
PostgreSQL:    partitioned by tenant → add more partitions, tune work_mem
Caching:       increase SEMANTIC_CACHE_THRESHOLD (lower = more hits, more false positives)
Reranking:     FUSION_CANDIDATES=20 → reduce to 15 if reranker is the bottleneck
```

## Signs You Need to Scale

| Symptom | Action |
|---|---|
| P95 retrieval > 500ms consistently | Increase `INGESTION_BACKPRESSURE_P95_THRESHOLD_MS` temporarily, then add Qdrant shards |
| Ingestion paused more than 50% of the time | Add dedicated embedding GPU nodes, increase `QDRANT_WRITE_RATE` |
| `openai_embedding_429` in logs more than 1% | Reduce `EMBEDDING_MAX_CONCURRENCY` or upgrade OpenAI tier |
| `qdrant_write_queued` with wait > 30s | Increase `QDRANT_WRITE_RATE`, verify Qdrant disk IOPS |
| `cache_thrashing_detected` on bulk ingest | Increase `CACHE_STABLE_TTL_SECONDS` during backfill windows |
| `postgres_partition_scan` > 200ms | Partition by `(tenant_id, corpus_id)` instead of just `tenant_id` |
