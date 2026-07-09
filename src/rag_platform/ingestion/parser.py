from __future__ import annotations

import re
import statistics
from dataclasses import dataclass
from typing import Any

import fitz  # type: ignore[import-untyped]


class PdfExtractionError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class TextBlock:
    text: str
    page: int
    bbox: tuple[float, float, float, float]
    font_size: float
    heading_level: int | None
    extraction_method: str = "native"
    confidence: float | None = None


@dataclass(frozen=True, slots=True)
class ParsedDocument:
    page_count: int
    blocks: tuple[TextBlock, ...]
    metadata: dict[str, str]


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


def parse_pdf(content: bytes, max_pages: int) -> ParsedDocument:
    try:
        document = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:
        raise PdfExtractionError("PyMuPDF could not open the PDF") from exc

    try:
        if document.needs_pass:
            raise PdfExtractionError("Encrypted PDFs require an approved decryption workflow")
        if document.page_count > max_pages:
            raise PdfExtractionError(f"PDF has {document.page_count} pages; maximum is {max_pages}")

        raw: list[tuple[str, int, tuple[float, float, float, float], float]] = []
        sizes: list[float] = []
        for page_number, page in enumerate(document, start=1):
            page_dict = page.get_text("dict", sort=True)
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
                raw.append((text, page_number, bbox, max_size))
                sizes.append(max_size)

        if not raw:
            raise PdfExtractionError("No extractable text was found; enable OCR for scanned PDFs")

        body_size = statistics.median(size for size in sizes if size > 0) if sizes else 10.0
        blocks = tuple(
            TextBlock(
                text=text,
                page=page,
                bbox=bbox,
                font_size=font_size,
                heading_level=_heading_level(text, font_size, body_size),
            )
            for text, page, bbox, font_size in raw
        )
        metadata = {
            str(key): str(value)
            for key, value in (document.metadata or {}).items()
            if value is not None
        }
        return ParsedDocument(page_count=document.page_count, blocks=blocks, metadata=metadata)
    finally:
        document.close()
