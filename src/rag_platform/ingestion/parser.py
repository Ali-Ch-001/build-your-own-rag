from __future__ import annotations

import re
import statistics
from typing import Any

import fitz  # type: ignore[import-untyped]
import structlog

from rag_platform.ingestion.ocr import check_page_quality, merge_blocks, ocr_page
from rag_platform.ingestion.schemas import ParsedDocument, PdfExtractionError, TextBlock

logger = structlog.get_logger(__name__)

_NUMBERED_HEADING = re.compile(r"^(?:\d+(?:\.\d+){0,4}|[A-Z]|[IVXLC]+)[.)]?\s+\S+")


def _block_text(block: dict[str, Any]) -> tuple[str, float]:
    lines: list[str] = []
    sizes: list[float] = []
    for line in block.get("lines", []):
        spans = line.get("spans", [])
        line_text = "".join(str(span.get("text", "")) for span in spans).strip()
        if line_text:
            lines.append(line_text)
        sizes.extend(float(span.get("size", 0)) for span in spans if span.get("text", "").strip())
    return "\n".join(lines).strip(), max(sizes, default=0.0)


def _heading_level(text: str, font_size: float, body_size: float) -> int | None:
    compact = " ".join(text.split())
    if not compact or len(compact) > 180 or compact.endswith((".", ";", ",")):
        return None
    ratio = font_size / body_size if body_size else 1.0
    looks_numbered = bool(_NUMBERED_HEADING.match(compact))
    looks_upper = compact.isupper() and 2 <= len(compact.split()) <= 12
    if ratio >= 1.55:
        return 1
    if ratio >= 1.30:
        return 2
    if ratio >= 1.15 or looks_numbered or looks_upper:
        return 3
    return None


def _extract_native_blocks(
    page_dict: dict[str, Any],
    page_number: int,
) -> list[TextBlock]:
    blocks: list[TextBlock] = []
    for block in page_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        text, max_size = _block_text(block)
        if not text:
            continue
        bbox_values = block.get("bbox", (0.0, 0.0, 0.0, 0.0))
        bbox = tuple(float(value) for value in bbox_values)
        if len(bbox) != 4:
            continue
        blocks.append(
            TextBlock(
                text=text,
                page=page_number,
                bbox=bbox,
                font_size=max_size,
                heading_level=None,
                extraction_method="native",
            )
        )
    return blocks


def parse_pdf(
    content: bytes,
    max_pages: int,
    ocr_enabled: bool = False,
    ocr_dpi: int = 300,
    ocr_language: str = "eng",
) -> ParsedDocument:
    try:
        document = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:
        raise PdfExtractionError("PyMuPDF could not open the PDF") from exc

    try:
        if document.needs_pass:
            raise PdfExtractionError("Encrypted PDFs require an approved decryption workflow")
        if document.page_count > max_pages:
            raise PdfExtractionError(f"PDF has {document.page_count} pages; maximum is {max_pages}")

        native_blocks: list[TextBlock] = []
        ocr_blocks: list[TextBlock] = []
        sizes: list[float] = []

        for page_number, page in enumerate(document, start=1):
            page_dict = page.get_text("dict", sort=True)
            page_rect = page.rect

            quality_ok = check_page_quality(page_dict, page_rect.width, page_rect.height)

            if quality_ok:
                page_blocks = _extract_native_blocks(page_dict, page_number)
                native_blocks.extend(page_blocks)
                sizes.extend(b.font_size for b in page_blocks)
                continue

            if ocr_enabled:
                logger.info("ocr_fallback_triggered", page=page_number)
                ocr_result = ocr_page(page, dpi=ocr_dpi, language=ocr_language)
                if ocr_result:
                    ocr_blocks.extend(ocr_result)
                    logger.info(
                        "ocr_page_succeeded",
                        page=page_number,
                        blocks=len(ocr_result),
                    )
                else:
                    logger.warning(
                        "ocr_page_no_result",
                        page=page_number,
                        detail="OCR produced no text for this page",
                    )
            else:
                logger.warning(
                    "page_quality_poor_ocr_disabled",
                    page=page_number,
                    detail="Page failed quality gate and OCR is not enabled",
                )

        all_blocks = merge_blocks(native_blocks, ocr_blocks)

        if not all_blocks:
            raise PdfExtractionError("No extractable text was found; enable OCR for scanned PDFs")

        body_size = statistics.median(size for size in sizes if size > 0) if sizes else 10.0
        blocks = tuple(
            TextBlock(
                text=block.text,
                page=block.page,
                bbox=block.bbox,
                font_size=block.font_size,
                heading_level=_heading_level(block.text, block.font_size, body_size),
                extraction_method=block.extraction_method,
                confidence=block.confidence,
            )
            for block in all_blocks
        )
        metadata = {
            str(key): str(value)
            for key, value in (document.metadata or {}).items()
            if value is not None
        }
        return ParsedDocument(page_count=document.page_count, blocks=blocks, metadata=metadata)
    finally:
        document.close()
