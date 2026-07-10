# Release Checklist

## 1. Code Freeze

- [ ] All feature branches targeting the release are merged into `develop`
- [ ] `develop` branch protected; only release manager may push
- [ ] CHANGELOG updated with all user-facing changes
- [ ] Version bump applied (`pyproject.toml`, package metadata)
- [ ] Final CI pipeline on `develop` is green (tests, lint, type-check, security scan)
- [ ] Dependency audit complete (`pip-audit` or equivalent) — no critical/high CVEs

## 2. Migration Verification

- [ ] Database migration diff reviewed (`alembic upgrade head` dry-run)
- [ ] Rollback migration tested (`alembic downgrade -1`)
- [ ] Data migration scripts validated on a production-sized snapshot (or staging clone)
- [ ] No long-running or locking DDL statements without prior DBA approval
- [ ] Index usage verified (no missing or unused indexes for new queries)

## 3. Canary Deployment

- [ ] Release branch (`release/v*`) created from `develop` and pushed
- [ ] Staging environment deployed and passing smoke tests
- [ ] Canary deployment configured (1-5% of production traffic for 30+ minutes)
- [ ] Error rate, latency p95/p99, and throughput monitored during canary
- [ ] Semantic cache hit rate and retrieval latency tracked
- [ ] Guardrail violation rate and auth failure rate stable

## 4. SLO Validation

- [ ] API availability ≥ 99.9% (rolling 30-min window)
- [ ] p95 search latency ≤ 500ms
- [ ] p95 agent response latency ≤ 5s
- [ ] Ingestion throughput ≥ baseline
- [ ] Embedding generation error rate ≤ 0.1%
- [ ] Upstream dependency health checks pass (DB, Qdrant, Redis, Kafka, LLM API)

## 5. Rollback Plan

- [ ] Rollback procedure documented and tested
- [ ] Database rollback migration verified (`alembic downgrade -1`)
- [ ] Previous Docker image tag identified and available in registry
- [ ] Rollback decision trigger defined: error rate >X%, p95 latency >Y ms, or guardrail violation spike
- [ ] Runbook contact list current and accessible

## 6. Communication

- [ ] Release notes published to stakeholders (internal Slack / email)
- [ ] Customer-facing changelog updated (if applicable)
- [ ] Known issues documented with workarounds
- [ ] On-call engineer briefed and acknowledged

## 7. Post-Release Monitoring

- [ ] Full production traffic on new version for ≥ 1 hour
- [ ] Dashboards reviewed: error rate, latency, throughput, guardrail violations
- [ ] Tenant isolation verified (no cross-tenant data leakage in retrieval logs)
- [ ] Audit log stream healthy and complete
- [ ] Any anomalies triaged within the monitoring period
- [ ] `main` branch updated with release tag
