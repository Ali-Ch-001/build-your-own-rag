from __future__ import annotations

from typing import Any

import fitz  # type: ignore[import-untyped]
import structlog

from rag_platform.ingestion.schemas import TextBlock

logger = structlog.get_logger(__name__)

_MIN_TEXT_DENSITY = 0.0005
_MAX_REPLACEMENT_CHAR_RATIO = 0.15
_MIN_CHAR_COUNT = 10


def _extract_block_text(block: dict[str, Any]) -> tuple[str, float]:
    lines: list[str] = []
    sizes: list[float] = []
    for line in block.get("lines", []):
        spans = line.get("spans", [])
        line_text = "".join(str(span.get("text", "")) for span in spans).strip()
        if line_text:
            lines.append(line_text)
        sizes.extend(float(span.get("size", 0)) for span in spans if span.get("text", "").strip())
    return "\n".join(lines).strip(), max(sizes, default=0.0)


def check_page_quality(page_dict: dict[str, Any], page_width: float, page_height: float) -> bool:
    text_blocks = [b for b in page_dict.get("blocks", []) if b.get("type") == 0]
    if not text_blocks:
        return False

    page_area = page_width * page_height
    if page_area <= 0:
        return False
    text_area = sum(
        (b["bbox"][2] - b["bbox"][0]) * (b["bbox"][3] - b["bbox"][1]) for b in text_blocks
    )
    if text_area / page_area < _MIN_TEXT_DENSITY:
        return False

    all_text = "".join(
        str(span.get("text", ""))
        for b in text_blocks
        for line in b.get("lines", [])
        for span in line.get("spans", [])
    )
    if len(all_text) < _MIN_CHAR_COUNT:
        return False

    replacement_chars = sum(1 for c in all_text if c == "\ufffd")
    if replacement_chars / len(all_text) > _MAX_REPLACEMENT_CHAR_RATIO:
        return False

    return True


def ocr_page(
    page: fitz.Page,
    dpi: int = 300,
    language: str = "eng",
) -> list[TextBlock] | None:
    try:
        tp = page.get_textpage_ocr(flags=3, dpi=dpi, language=language)
    except RuntimeError as exc:
        msg = str(exc).lower()
        if "tesseract" in msg or "ocr" in msg:
            logger.warning("ocr_tesseract_unavailable", detail=str(exc))
            return None
        raise

    ocr_dict = page.get_text("dict", textpage=tp, sort=True)

    blocks: list[TextBlock] = []
    for block in ocr_dict.get("blocks", []):
        if block.get("type") != 0:
            continue
        text, _ = _extract_block_text(block)
        if not text:
            continue
        bbox_raw = block.get("bbox", (0.0, 0.0, 0.0, 0.0))
        bbox = tuple(float(v) for v in bbox_raw)
        if len(bbox) != 4:
            continue
        blocks.append(
            TextBlock(
                text=text,
                page=page.number + 1,
                bbox=bbox,
                font_size=0.0,
                heading_level=None,
                extraction_method="ocr",
                confidence=0.8,
            )
        )

    if not blocks:
        logger.warning("ocr_page_no_text", page=page.number + 1)
        return None

    return blocks


def merge_blocks(
    native_blocks: list[TextBlock],
    ocr_blocks: list[TextBlock],
) -> list[TextBlock]:
    native_pages = {b.page for b in native_blocks}
    merged: list[TextBlock] = list(native_blocks)
    for ocr_block in ocr_blocks:
        if ocr_block.page not in native_pages:
            merged.append(ocr_block)
    return merged
