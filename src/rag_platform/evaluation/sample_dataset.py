from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class GoldenCase:
    question: str
    reference_answer: str
    relevant_chunks: list[str]


SAMPLE_DATASET: list[GoldenCase] = [
    GoldenCase(
        question="What is the data retention policy for customer financial records?",
        reference_answer=(
            "Customer financial records must be retained for a minimum of seven years "
            "from the date of the last transaction, in accordance with SEC Rule 17a-4. "
            "Records must be stored in a non-rewritable, non-erasable format (WORM). "
            "After seven years, records may be archived to cold storage for an additional "
            "three years before final destruction with documented chain of custody."
        ),
        relevant_chunks=[
            "customer financial records retention seven years SEC Rule 17a-4",
            "Customer financial records must be retained for a minimum of seven years "
            "from the date of the last transaction, in accordance with SEC Rule 17a-4.",
            "Records must be stored in a non-rewritable, non-erasable format (WORM).",
            "After seven years, records may be archived to cold storage for an "
            "additional three years before final destruction with documented chain of custody.",
        ],
    ),
    GoldenCase(
        question="What are the access control requirements for PII data?",
        reference_answer=(
            "Access to PII data requires multi-factor authentication (MFA), role-based "
            "access control (RBAC) with least privilege, and all access must be logged "
            "with an immutable audit trail. Data at rest must be encrypted with AES-256. "
            "Access reviews must be conducted quarterly by the data governance committee. "
            "Any bulk export of PII requires director-level approval and is limited to "
            "1000 records per 24-hour period."
        ),
        relevant_chunks=[
            "PII data access control multi-factor authentication MFA role-based "
            "access control RBAC least privilege",
            "Access to PII data requires multi-factor authentication (MFA) and "
            "role-based access control (RBAC) with least privilege.",
            "All PII access must be logged with an immutable audit trail.",
            "Data at rest containing PII must be encrypted with AES-256.",
            "Access reviews must be conducted quarterly by the data governance committee.",
            "Bulk export of PII requires director-level approval and is limited "
            "to 1000 records per 24-hour period.",
        ],
    ),
    GoldenCase(
        question="What is the incident response SLA for critical security events?",
        reference_answer=(
            "Critical security events (P1) must be acknowledged within 15 minutes of "
            "detection and a dedicated incident commander must be assigned within 30 "
            "minutes. Initial containment must begin within 1 hour. A preliminary root "
            "cause analysis must be delivered within 4 hours. All P1 incidents require "
            "a formal post-mortem within 5 business days. The on-call rotation is "
            "managed via PagerDuty escalation policy SEC-ONCALL-v3."
        ),
        relevant_chunks=[
            "Critical security events P1 acknowledged within 15 minutes detection",
            "Critical security events (P1) must be acknowledged within 15 minutes of detection.",
            "A dedicated incident commander must be assigned within 30 minutes.",
            "Initial containment must begin within 1 hour.",
            "A preliminary root cause analysis must be delivered within 4 hours.",
            "All P1 incidents require a formal post-mortem within 5 business days.",
            "The on-call rotation is managed via PagerDuty escalation policy SEC-ONCALL-v3.",
        ],
    ),
    GoldenCase(
        question="How does the platform handle cross-region data residency requirements?",
        reference_answer=(
            "The platform supports data residency through region-scoped storage pools. "
            "Each tenant can designate permitted processing regions that map to specific "
            "AWS regions. Data is never replicated outside the designated regions without "
            "explicit opt-in. All cross-region transfers are encrypted in transit using "
            "TLS 1.3 and logged for compliance auditing. The platform maintains SOC 2 "
            "Type II certification and supports GDPR, CCPA, and HIPAA compliance "
            "configurations through region-aware policy enforcement."
        ),
        relevant_chunks=[
            "data residency region-scoped storage pools processing regions",
            "The platform supports data residency through region-scoped storage pools.",
            "Each tenant can designate permitted processing regions that map to "
            "specific AWS regions.",
            "Data is never replicated outside the designated regions without explicit opt-in.",
            "All cross-region transfers are encrypted in transit using TLS 1.3 "
            "and logged for compliance auditing.",
            "The platform maintains SOC 2 Type II certification and supports "
            "GDPR, CCPA, and HIPAA compliance configurations.",
        ],
    ),
    GoldenCase(
        question="What model versioning and rollback procedures exist for production deployments?",
        reference_answer=(
            "All production model deployments follow a canary release strategy. New "
            "models receive 5% of traffic for the first 30 minutes, escalating to 25%, "
            "50%, and 100% at 30-minute intervals if no quality regression is detected "
            "by the automated evaluation pipeline. Rollback is automated if the RAGAS "
            "faithfulness score drops below 90% or if P95 latency exceeds 2.2 seconds. "
            "All model artifacts are versioned in the model registry with a complete "
            "provenance record including training data hash, hyperparameters, and "
            "evaluation benchmark scores."
        ),
        relevant_chunks=[
            "model deployment canary release strategy automated rollback",
            "All production model deployments follow a canary release strategy.",
            "New models receive 5% of traffic for the first 30 minutes, escalating "
            "to 25%, 50%, and 100% at 30-minute intervals.",
            "Automated rollback if faithfulness score drops below 90% or P95 "
            "latency exceeds 2.2 seconds.",
            "All model artifacts are versioned in the model registry with a "
            "complete provenance record including training data hash, "
            "hyperparameters, and evaluation benchmark scores.",
        ],
    ),
]
