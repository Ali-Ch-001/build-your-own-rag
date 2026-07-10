"""Locustfile for Atlas RAG load testing.

Simulates realistic user workflows:
  - Upload: POST /v1/documents with generated PDF data
  - Search: POST /v1/search with varied queries
  - Agent: POST /v1/responses with SSE consumption
  - Health: GET /health at steady rate

Usage:
    locust -f scripts/benchmark/locustfile.py --host=http://localhost:8000 --users=50 --spawn-rate=5

Environment variables:
    ATLAS_TENANT_ID: Tenant ID header (default: dev tenant)
    ATLAS_CORPUS_ID: Corpus ID for search scoping (default: dev corpus)
    ATLAS_TEST_PDF_DIR: Directory containing pre-generated PDFs for upload testing
"""

from __future__ import annotations

import io
import os
import random
import time
import uuid

import fitz
from locust import HttpUser, between, task

TENANT_ID = os.getenv("ATLAS_TENANT_ID", "00000000-0000-0000-0000-000000000001")
CORPUS_ID = os.getenv("ATLAS_CORPUS_ID", "00000000-0000-0000-0000-000000000100")
TEST_PDF_DIR = os.getenv("ATLAS_TEST_PDF_DIR", "")

SEARCH_QUERIES = [
    "What are the data classification levels?",
    "Describe the incident response procedure.",
    "What is the password rotation policy for service accounts?",
    "Explain the access control review process.",
    "What are the encryption standards for data at rest?",
    "How are third-party risks assessed and managed?",
    "What is the business continuity plan scope?",
    "Describe the vulnerability management lifecycle.",
    "What are the requirements for multi-factor authentication?",
    "Explain the data retention and disposal policy.",
    "What controls exist for production access?",
    "How is the principle of least privilege enforced?",
    "Describe the change management process for infrastructure.",
    "What are the disaster recovery RTO and RPO targets?",
    "Explain the network segmentation architecture.",
    "What monitoring and alerting is in place for security events?",
    "How are API keys and secrets managed?",
    "Describe the patch management cadence and SLAs.",
    "What is the scope of the SOC 2 Type II audit?",
    "How are data subject access requests handled under GDPR?",
]

PDF_TEMPLATES: list[tuple[str, str, str]] = [
    ("policy", "Information Security Policy", "policy"),
    ("compliance", "SOC 2 Type II Audit Report", "compliance"),
    ("technical", "System Architecture Design Document", "technical"),
    ("policy", "Data Classification Standard", "policy"),
    ("compliance", "GDPR Data Processing Agreement", "compliance"),
    ("technical", "API Integration Specification", "technical"),
    ("policy", "Access Control Policy", "policy"),
    ("report", "Quarterly Metrics Report", "report"),
    ("manual", "Developer Onboarding Guide", "manual"),
    ("compliance", "HIPAA Compliance Assessment", "compliance"),
]


def _generate_pdf_bytes(pages: int = 2) -> bytes:
    doc = fitz.open()
    for page_num in range(pages):
        page = doc.new_page(width=612, height=792)
        page.insert_text(
            (50, 72),
            f"Load Test Document — Page {page_num + 1}",
            fontsize=16,
            fontname="helv",
        )
        y = 120
        for para_num in range(4):
            content = (
                f"This is paragraph {para_num + 1} of load test document "
                f"generated at {time.time():.0f}. It contains realistic "
                f"text to exercise the ingestion pipeline including PDF "
                f"parsing, chunking, embedding, and vector storage. "
                f"Request ID: {uuid.uuid4().hex[:12]}."
            )
            page.insert_text(
                (50, y),
                content,
                fontsize=10,
                fontname="helv",
            )
            y += 60
        page.insert_text(
            (50, 770),
            f"Classification: Internal | Tenant: {TENANT_ID[:8]}",
            fontsize=7,
            fontname="helv",
        )
    buf = io.BytesIO(doc.tobytes())
    doc.close()
    return buf.getvalue()


class RAGUser(HttpUser):
    wait_time = between(1, 5)

    def on_start(self) -> None:
        self.tenant_id = TENANT_ID
        self.corpus_id = CORPUS_ID
        self.headers = {
            "X-Tenant-ID": self.tenant_id,
            "Content-Type": "application/json",
        }
        self._pdf_cache: list[bytes] = []

    def _get_pdf(self) -> tuple[bytes, str, str]:
        if random.random() < 0.3 and self._pdf_cache:
            pdf_bytes = random.choice(self._pdf_cache)
            filename = f"cached_{uuid.uuid4().hex[:8]}.pdf"
            return pdf_bytes, filename, "policy"
        pages = random.randint(1, 4)
        pdf_bytes = _generate_pdf_bytes(pages)
        if len(self._pdf_cache) < 20:
            self._pdf_cache.append(pdf_bytes)
        content_type = random.choice(["policy", "compliance", "technical"])
        filename = f"loadtest_{uuid.uuid4().hex[:8]}.pdf"
        return pdf_bytes, filename, content_type

    @task(10)
    def search(self) -> None:
        query = random.choice(SEARCH_QUERIES)
        payload = {
            "query": query,
            "filters": {
                "corpus_ids": [self.corpus_id],
            },
            "top_k": random.randint(3, 10),
        }
        with self.client.post(
            "/v1/search",
            json=payload,
            headers=self.headers,
            catch_response=True,
            name="/v1/search",
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                result_count = len(data.get("results", []))
                resp.request_meta["result_count"] = result_count
            elif resp.status_code >= 500:
                resp.failure(f"Server error: {resp.status_code}")

    @task(3)
    def upload_document(self) -> None:
        pdf_bytes, filename, content_type = self._get_pdf()
        files = {
            "file": (filename, pdf_bytes, "application/pdf"),
        }
        data = {
            "corpus_id": self.corpus_id,
            "title": filename.replace(".pdf", "").replace("_", " ").title(),
            "document_type": content_type,
        }
        with self.client.post(
            "/v1/documents",
            files=files,
            data=data,
            headers={"X-Tenant-ID": self.tenant_id},
            catch_response=True,
            name="/v1/documents",
        ) as resp:
            if resp.status_code in {200, 202}:
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Upload server error: {resp.status_code}")

    @task(2)
    def agent_response_sse(self) -> None:
        query = random.choice(SEARCH_QUERIES)
        payload = {
            "message": query,
            "corpus_ids": [self.corpus_id],
            "response_mode": "grounded",
        }
        with self.client.post(
            "/v1/responses",
            json=payload,
            headers={**self.headers, "Accept": "text/event-stream"},
            catch_response=True,
            stream=True,
            name="/v1/responses",
        ) as resp:
            if resp.status_code == 200:
                event_count = 0
                for line in resp.iter_lines(decode_unicode=True):
                    if line.startswith("data:"):
                        event_count += 1
                    if event_count > 100:
                        break
                resp.request_meta["sse_event_count"] = event_count
                resp.success()
            elif resp.status_code >= 500:
                resp.failure(f"Agent SSE server error: {resp.status_code}")

    @task(1)
    def health_check(self) -> None:
        self.client.get("/health", name="/health")


class ReadOnlyUser(HttpUser):
    """Simulates a tenant that only performs searches and health checks."""

    wait_time = between(0.5, 2)

    def on_start(self) -> None:
        self.tenant_id = TENANT_ID
        self.corpus_id = CORPUS_ID
        self.headers = {
            "X-Tenant-ID": self.tenant_id,
            "Content-Type": "application/json",
        }

    @task(20)
    def search(self) -> None:
        query = random.choice(SEARCH_QUERIES)
        payload = {
            "query": query,
            "filters": {"corpus_ids": [self.corpus_id]},
            "top_k": 5,
        }
        self.client.post(
            "/v1/search",
            json=payload,
            headers=self.headers,
            name="/v1/search",
        )

    @task(1)
    def health_check(self) -> None:
        self.client.get("/health", name="/health")


class IngestUser(HttpUser):
    """Simulates a heavy document upload workload."""

    wait_time = between(2, 10)

    def on_start(self) -> None:
        self.tenant_id = TENANT_ID
        self.corpus_id = CORPUS_ID

    @task
    def upload_document(self) -> None:
        pdf_bytes = _generate_pdf_bytes(pages=random.randint(1, 3))
        filename = f"bulk_{uuid.uuid4().hex[:8]}.pdf"
        content_type = random.choice(["policy", "compliance", "technical"])
        files = {"file": (filename, pdf_bytes, "application/pdf")}
        data = {
            "corpus_id": self.corpus_id,
            "title": filename.replace(".pdf", "").replace("_", " ").title(),
            "document_type": content_type,
        }
        self.client.post(
            "/v1/documents",
            files=files,
            data=data,
            headers={"X-Tenant-ID": self.tenant_id},
            name="/v1/documents",
        )
