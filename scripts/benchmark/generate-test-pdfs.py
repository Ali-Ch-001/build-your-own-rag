#!/usr/bin/env python3
"""Generate realistic PDFs for ingestion pipeline load testing.

Creates N PDFs with configurable page count, text content (policy,
compliance, or technical documentation styles), tables, and optional
simulated scanned pages. Uses pymupdf (fitz) to create PDFs in-memory
and saves them to a directory or optionally uploads them via HTTP.

Example:
    python generate-test-pdfs.py --count 100 --pages 5 --output-dir ./test-pdfs
    python generate-test-pdfs.py --count 50 --upload-url http://localhost:8000/v1/documents
"""

from __future__ import annotations

import argparse
import io
import random
import uuid

import fitz

DOCUMENT_TYPES = ["policy", "compliance", "technical", "report", "manual"]

TEXT_CONTENT = {
    "policy": {
        "titles": [
            "Information Security Policy",
            "Data Classification Standard",
            "Access Control Policy",
            "Incident Response Plan",
            "Acceptable Use Policy",
            "Third-Party Risk Management Policy",
            "Business Continuity Plan",
            "Privacy and Data Protection Policy",
        ],
        "sections": [
            "Purpose and Scope",
            "Policy Statement",
            "Roles and Responsibilities",
            "Compliance Requirements",
            "Enforcement and Sanctions",
            "Exceptions Process",
            "Review Cycle",
            "Related Documents",
        ],
        "paragraphs": [
            (
                "This policy establishes the requirements for protecting "
                "organizational information assets from unauthorized access, "
                "disclosure, modification, or destruction. All employees, "
                "contractors, and third-party service providers must comply "
                "with this policy in its entirety."
            ),
            (
                "Information assets shall be classified according to their "
                "sensitivity and criticality. The classification levels are: "
                "Public, Internal, Confidential, and Restricted. Each level "
                "imposes specific handling, storage, and transmission controls "
                "that must be implemented by data custodians."
            ),
            (
                "Access to information systems shall be granted based on the "
                "principle of least privilege. Access reviews shall be conducted "
                "quarterly by system owners. Any deviation from approved access "
                "levels must be documented and approved by the Chief Information "
                "Security Officer within 72 hours of detection."
            ),
        ],
    },
    "compliance": {
        "titles": [
            "SOC 2 Type II Audit Report",
            "GDPR Data Processing Agreement",
            "HIPAA Compliance Assessment",
            "PCI DSS Attestation of Compliance",
            "ISO 27001 Certification Scope",
            "NIST CSF Maturity Assessment",
            "CCPA Privacy Notice",
            "SOX IT General Controls Report",
        ],
        "sections": [
            "Executive Summary",
            "Scope and Methodology",
            "Control Environment",
            "Testing Results",
            "Findings and Recommendations",
            "Management Response",
            "Timeline for Remediation",
            "Appendix: Control Matrix",
        ],
        "paragraphs": [
            (
                "This report presents the results of our independent assessment "
                "of the service organization's controls relevant to security, "
                "availability, and confidentiality. The examination was conducted "
                "in accordance with attestation standards established by the "
                "American Institute of Certified Public Accountants."
            ),
            (
                "Control objective A.1.2 requires that logical access to the "
                "production environment is restricted to authorized personnel. "
                "We tested a sample of 150 access requests across the period "
                "and found no instances of unauthorized access. Multi-factor "
                "authentication is enforced for all production accounts."
            ),
            (
                "Exception finding E-03: Password rotation for service accounts "
                "was completed in 95 of 100 instances during the observation "
                "period. Five service accounts exceeded the 90-day rotation "
                "window by an average of 12 days. Management has implemented "
                "automated rotation for all service accounts effective Q3."
            ),
        ],
    },
    "technical": {
        "titles": [
            "System Architecture Design Document",
            "API Integration Specification",
            "Database Schema Reference",
            "Deployment Runbook for v4.2",
            "Performance Optimization Guide",
            "Disaster Recovery Technical Plan",
            "Microservices Communication Protocol",
            "Observability Stack Configuration",
        ],
        "sections": [
            "Overview and Context",
            "Architecture Decisions",
            "Component Details",
            "Data Flow Diagrams",
            "Configuration Reference",
            "Error Handling and Resilience",
            "Monitoring and Alerting",
            "Migration Strategy",
        ],
        "paragraphs": [
            (
                "The retrieval service implements a hybrid search strategy "
                "combining sparse (PostgreSQL full-text search with ts_rank_cd) "
                "and dense (Qdrant HNSW with cosine distance) retrieval paths. "
                "Results are fused using Reciprocal Rank Fusion with k=60 and "
                "re-ranked using a cross-encoder model before MMR diversity "
                "selection reduces the candidate set to the final context window."
            ),
            (
                "The ingestion pipeline follows a staged event-driven architecture. "
                "Documents are uploaded to a quarantine S3 bucket, validated through "
                "an optional ClamAV scanner, parsed using pymupdf for native text "
                "extraction with an OCR fallback, and chunked semantically using "
                "a recursive structure-aware splitter configured with target=450, "
                "max=600, and overlap=60 tokens."
            ),
            (
                "Redis serves three caching tiers: an exact-match cache keyed on "
                "the canonical query plus corpus epoch, a semantic cache using "
                "RediSearch vector similarity with HNSW indexing, and an embedding "
                "result cache to avoid re-computing frequently queried embeddings. "
                "Cache entries carry volatile (1h) or stable (24h) TTLs depending "
                "on whether they derive from a mutable corpus."
            ),
        ],
    },
}

TABLE_DATA = [
    {
        "headers": ["Control ID", "Description", "Status", "Evidence"],
        "rows": [
            ["CC-001", "Access control policy", "Compliant", "AC-POL-v3.pdf"],
            ["CC-002", "User access review", "Compliant", "UAR-2025-Q2.xlsx"],
            ["CC-003", "Encryption at rest", "Compliant", "AWS-KMS-config.json"],
            ["CC-004", "Vulnerability scanning", "Partial", "Nessus-scan-0625.html"],
            ["CC-005", "Incident response testing", "Non-Compliant", "IR-TT-2025.pdf"],
        ],
    },
    {
        "headers": ["Metric", "Target", "Q1", "Q2", "Q3", "Q4"],
        "rows": [
            ["Availability", "99.95%", "99.98%", "99.97%", "99.99%", "99.96%"],
            ["P95 Latency", "<500ms", "312ms", "298ms", "345ms", "401ms"],
            ["Error Rate", "<0.1%", "0.05%", "0.03%", "0.08%", "0.04%"],
            ["Ingestion Rate", ">100/min", "142", "156", "138", "167"],
        ],
    },
    {
        "headers": ["Region", "Instances", "vCPU", "Memory", "Storage"],
        "rows": [
            ["us-east-1", "12", "48", "192 GB", "2.4 TB"],
            ["eu-west-1", "8", "32", "128 GB", "1.6 TB"],
            ["ap-southeast-1", "6", "24", "96 GB", "1.2 TB"],
        ],
    },
]


def _generate_paragraphs(content_type: str, count: int) -> list[str]:
    pool = TEXT_CONTENT[content_type]["paragraphs"]
    result: list[str] = []
    for i in range(count):
        base = pool[i % len(pool)]
        variant = f"{base} This is paragraph {i + 1} of the generated document."
        result.append(variant)
    return result


def create_pdf(
    title: str,
    content_type: str,
    num_pages: int,
    *,
    include_tables: bool = True,
    include_scanned_pages: bool = False,
) -> bytes:
    doc = fitz.open()

    paragraphs = _generate_paragraphs(content_type, num_pages * 3)
    sections = TEXT_CONTENT[content_type]["sections"]

    for page_num in range(num_pages):
        page = doc.new_page(width=612, height=792)  # US Letter

        if include_scanned_pages and page_num == num_pages - 1:
            rect = fitz.Rect(20, 20, 592, 772)
            page.draw_rect(rect, color=(0.92, 0.92, 0.92), fill=(0.92, 0.92, 0.92))
            page.insert_text(
                (100, 350),
                "[ SIMULATED SCANNED PAGE ]",
                fontsize=18,
                color=(0.4, 0.4, 0.4),
            )
            page.insert_text(
                (100, 380),
                "This page represents an image-based PDF page requiring OCR processing.",
                fontsize=10,
                color=(0.4, 0.4, 0.4),
            )
            continue

        if page_num == 0:
            page.insert_text(
                (50, 72),
                title,
                fontsize=18,
                fontname="helv",
                color=(0.1, 0.1, 0.3),
            )
            page.insert_text(
                (50, 100),
                f"Document Type: {content_type.title()} | Classification: Internal",
                fontsize=10,
                fontname="helv",
                color=(0.3, 0.3, 0.3),
            )
            page.draw_line((50, 115), (562, 115), color=(0.7, 0.7, 0.7), width=0.5)
            y_start = 135
        else:
            y_start = 72

        y = y_start
        section = sections[page_num % len(sections)]
        page.insert_text(
            (50, y),
            f"{page_num + 1}. {section}",
            fontsize=13,
            fontname="helv",
            color=(0.1, 0.2, 0.4),
        )
        y += 28

        for para_idx in range(3):
            para = paragraphs[page_num * 3 + para_idx % len(paragraphs)]
            tw = fitz.TextWriter(page.rect)
            tw.append(
                (100, y, 100, y + 12),
                para,
                fontsize=10,
                fontname="helv",
                color=(0.1, 0.1, 0.1),
            )
            tw.write_text(page)
            y += 48

        if include_tables and page_num % 2 == 0:
            table_def = TABLE_DATA[page_num % len(TABLE_DATA)]
            y = page_num * 0 + y + 10  # ensure y is not unsigned
            col_width = 480.0 / len(table_def["headers"])
            x_start = 66.0

            for col_idx, header in enumerate(table_def["headers"]):
                x = x_start + col_width * col_idx
                page.draw_rect(
                    fitz.Rect(x, y, x + col_width, y + 20),
                    color=(0.2, 0.2, 0.5),
                    fill=(0.2, 0.2, 0.5),
                )
                page.insert_text(
                    (x + 4, y + 14),
                    header,
                    fontsize=8,
                    fontname="helv",
                    color=(1, 1, 1),
                )

            for row_idx, row in enumerate(table_def["rows"]):
                ry = y + 20 + row_idx * 20
                bg = (0.95, 0.95, 1.0) if row_idx % 2 == 0 else (1, 1, 1)
                for col_idx, cell in enumerate(row):
                    x = x_start + col_width * col_idx
                    page.draw_rect(
                        fitz.Rect(x, ry, x + col_width, ry + 20),
                        color=(0.8, 0.8, 0.8),
                        fill=bg,
                    )
                    page.insert_text(
                        (x + 4, ry + 14),
                        cell,
                        fontsize=8,
                        fontname="helv",
                        color=(0.1, 0.1, 0.1),
                    )

        footer_text = (
            f"Generated Document — Page {page_num + 1} of {num_pages} | "
            f"Doc ID: {uuid.uuid4().hex[:8].upper()} | "
            f"Classification: Internal — Do Not Distribute"
        )
        page.insert_text(
            (50, 772),
            footer_text,
            fontsize=7,
            fontname="helv",
            color=(0.5, 0.5, 0.5),
        )

    buf = io.BytesIO(doc.tobytes())
    doc.close()
    return buf.getvalue()


def upload_pdf(
    pdf_bytes: bytes,
    filename: str,
    base_url: str,
    tenant_id: str,
    corpus_id: str,
    content_type: str,
) -> bool:
    import requests

    resp = requests.post(
        f"{base_url.rstrip('/')}/v1/documents",
        files={"file": (filename, pdf_bytes, "application/pdf")},
        data={
            "corpus_id": corpus_id,
            "title": filename.replace(".pdf", "").replace("_", " ").title(),
            "document_type": content_type,
        },
        headers={"X-Tenant-ID": tenant_id},
        timeout=120,
    )
    return resp.status_code in {200, 202}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate realistic PDFs for Atlas RAG ingestion load testing.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=10,
        help="Number of PDFs to generate (default: 10)",
    )
    parser.add_argument(
        "--pages",
        type=int,
        default=3,
        help="Pages per PDF (default: 3)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="./generated-pdfs",
        help="Directory to save generated PDFs (default: ./generated-pdfs)",
    )
    parser.add_argument(
        "--upload-url",
        type=str,
        default="",
        help="Base URL for document upload API (e.g., http://localhost:8000)",
    )
    parser.add_argument(
        "--tenant-id",
        type=str,
        default="00000000-0000-0000-0000-000000000001",
        help="Tenant ID for upload auth (default: dev tenant)",
    )
    parser.add_argument(
        "--corpus-id",
        type=str,
        default="00000000-0000-0000-0000-000000000100",
        help="Corpus ID for upload (default: dev corpus)",
    )
    parser.add_argument(
        "--include-scanned",
        action="store_true",
        help="Add a simulated scanned page as the last page of each PDF",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for reproducibility (default: 42)",
    )
    args = parser.parse_args()

    random.seed(args.seed)
    import pathlib

    output_dir = pathlib.Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    print(f"Generating {args.count} PDFs with {args.pages} pages each...")
    generated = 0
    uploaded = 0

    for i in range(args.count):
        content_type = DOCUMENT_TYPES[i % len(DOCUMENT_TYPES)]
        title_pool = TEXT_CONTENT[content_type]["titles"]
        title = title_pool[i % len(title_pool)]

        pdf_bytes = create_pdf(
            title,
            content_type,
            args.pages,
            include_tables=True,
            include_scanned_pages=args.include_scanned,
        )

        filename = f"{content_type}_{i:05d}_{uuid.uuid4().hex[:8]}.pdf"
        pdf_path = output_dir / filename
        pdf_path.write_bytes(pdf_bytes)
        generated += 1
        print(f"  [{generated}/{args.count}] {filename} ({len(pdf_bytes):,} bytes)")

        if args.upload_url:
            try:
                ok = upload_pdf(
                    pdf_bytes,
                    filename,
                    args.upload_url,
                    args.tenant_id,
                    args.corpus_id,
                    content_type,
                )
                if ok:
                    uploaded += 1
                    print("    -> Uploaded successfully")
                else:
                    print("    -> Upload returned non-success status")
            except Exception as exc:
                print(f"    -> Upload failed: {exc}")

    print(f"\nDone. {generated} PDFs saved to {output_dir}")
    if args.upload_url:
        print(f"{uploaded}/{generated} uploaded successfully to {args.upload_url}")


if __name__ == "__main__":
    main()
