from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import fitz  # type: ignore[import-untyped]
import pytest

from rag_platform.ingestion.ocr import _extract_block_text, check_page_quality, merge_blocks
from rag_platform.ingestion.parser import parse_pdf as _parse_pdf
from rag_platform.ingestion.schemas import PdfExtractionError, TextBlock


def _make_text_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page(width=612, height=792)
    page.insert_text((72, 72), "Architecture Overview", fontsize=18)
    for i, line in enumerate(
        (
            "The retrieval service applies metadata filters first.",
            "After filtering, dense and sparse candidates are merged.",
            "The fusion algorithm uses Reciprocal Rank Fusion.",
            "Finally, evidence is surfaced to the LLM for generation.",
        ),
    ):
        page.insert_text((72, 110 + i * 20), line, fontsize=11)
    content: bytes = document.tobytes()
    document.close()
    return content


def _make_scanned_page_pdf() -> bytes:
    document = fitz.open()
    page = document.new_page(width=612, height=792)
    img = fitz.Pixmap(fitz.csRGB, fitz.IRect(0, 0, 200, 100), False)
    img.clear_with(255)
    page.insert_image(page.rect, pixmap=img)
    content: bytes = document.tobytes()
    document.close()
    return content


def _page_dict_from_pdf(content: bytes) -> dict[str, Any]:
    doc = fitz.open(stream=content, filetype="pdf")
    page_dict: dict[str, Any] = doc[0].get_text("dict", sort=True)
    doc.close()
    return page_dict


class TestCheckPageQuality:
    def test_native_text_passes_quality(self) -> None:
        content = _make_text_pdf()
        page_dict = _page_dict_from_pdf(content)
        assert check_page_quality(page_dict, 612, 792) is True

    def test_scanned_page_fails_quality(self) -> None:
        content = _make_scanned_page_pdf()
        page_dict = _page_dict_from_pdf(content)
        assert check_page_quality(page_dict, 612, 792) is False

    def test_empty_page_fails_quality(self) -> None:
        page_dict: dict[str, Any] = {"blocks": []}
        assert check_page_quality(page_dict, 612, 792) is False

    def test_replacement_char_density_fails(self) -> None:
        page_dict: dict[str, Any] = {
            "blocks": [
                {
                    "type": 0,
                    "bbox": [0, 0, 100, 100],
                    "lines": [
                        {
                            "spans": [{"text": "\ufffd" * 50, "size": 10}],
                        }
                    ],
                }
            ]
        }
        assert check_page_quality(page_dict, 612, 792) is False

    def test_zero_area_page_fails(self) -> None:
        page_dict: dict[str, Any] = {
            "blocks": [
                {
                    "type": 0,
                    "bbox": [0, 0, 100, 100],
                    "lines": [
                        {
                            "spans": [{"text": "Some valid text here yes", "size": 10}],
                        }
                    ],
                }
            ]
        }
        assert check_page_quality(page_dict, 0, 0) is False


class TestMergeBlocks:
    def test_native_preferred_over_ocr_same_page(self) -> None:
        native = [
            TextBlock(
                text="native text",
                page=1,
                bbox=(0, 0, 100, 20),
                font_size=12,
                heading_level=None,
                extraction_method="native",
            )
        ]
        ocr = [
            TextBlock(
                text="ocr text",
                page=1,
                bbox=(0, 0, 100, 20),
                font_size=0,
                heading_level=None,
                extraction_method="ocr",
                confidence=0.8,
            )
        ]
        merged = merge_blocks(native, ocr)
        assert len(merged) == 1
        assert merged[0].extraction_method == "native"
        assert merged[0].text == "native text"

    def test_ocr_used_when_no_native_for_page(self) -> None:
        native: list[TextBlock] = []
        ocr = [
            TextBlock(
                text="ocr text",
                page=1,
                bbox=(0, 0, 100, 20),
                font_size=0,
                heading_level=None,
                extraction_method="ocr",
                confidence=0.8,
            )
        ]
        merged = merge_blocks(native, ocr)
        assert len(merged) == 1
        assert merged[0].extraction_method == "ocr"
        assert merged[0].text == "ocr text"

    def test_mixed_pages_keep_both(self) -> None:
        native = [
            TextBlock(
                text="page 1 native",
                page=1,
                bbox=(0, 0, 100, 20),
                font_size=12,
                heading_level=None,
                extraction_method="native",
            )
        ]
        ocr = [
            TextBlock(
                text="page 2 ocr",
                page=2,
                bbox=(0, 0, 100, 20),
                font_size=0,
                heading_level=None,
                extraction_method="ocr",
                confidence=0.8,
            )
        ]
        merged = merge_blocks(native, ocr)
        assert len(merged) == 2
        methods = {b.extraction_method for b in merged}
        assert methods == {"native", "ocr"}


class TestParsePdfWithOcr:
    def test_native_extraction_succeeds_with_text_pdf(self) -> None:
        content = _make_text_pdf()
        parsed = _parse_pdf(content, max_pages=5, ocr_enabled=False)
        assert parsed.page_count == 1
        assert any("retrieval" in b.text.lower() for b in parsed.blocks)
        assert all(b.extraction_method == "native" for b in parsed.blocks)

    @patch("rag_platform.ingestion.parser.ocr_page")
    def test_ocr_fallback_called_for_scanned_page(self, mock_ocr_page: MagicMock) -> None:
        mock_ocr_page.return_value = [
            TextBlock(
                text="ocr extracted text",
                page=1,
                bbox=(72, 72, 400, 100),
                font_size=0,
                heading_level=None,
                extraction_method="ocr",
                confidence=0.8,
            )
        ]
        content = _make_scanned_page_pdf()
        parsed = _parse_pdf(content, max_pages=5, ocr_enabled=True)
        mock_ocr_page.assert_called_once()
        assert parsed.page_count == 1
        assert any(b.extraction_method == "ocr" for b in parsed.blocks)

    @patch("rag_platform.ingestion.parser.ocr_page")
    def test_ocr_not_called_when_disabled(self, mock_ocr_page: MagicMock) -> None:
        mock_ocr_page.return_value = None
        content = _make_scanned_page_pdf()
        with pytest.raises(PdfExtractionError):
            _parse_pdf(content, max_pages=5, ocr_enabled=False)
        mock_ocr_page.assert_not_called()

    @patch("rag_platform.ingestion.parser.ocr_page")
    def test_ocr_confidence_propagated_to_source_span(self, mock_ocr_page: MagicMock) -> None:
        mock_ocr_page.return_value = [
            TextBlock(
                text="ocr extracted text",
                page=1,
                bbox=(72, 72, 400, 100),
                font_size=0,
                heading_level=None,
                extraction_method="ocr",
                confidence=0.85,
            )
        ]
        content = _make_scanned_page_pdf()
        parsed = _parse_pdf(content, max_pages=5, ocr_enabled=True)
        ocr_blocks = [b for b in parsed.blocks if b.extraction_method == "ocr"]
        assert len(ocr_blocks) == 1
        assert ocr_blocks[0].confidence == 0.85


def test_extract_block_text() -> None:
    block: dict[str, Any] = {
        "lines": [
            {
                "spans": [
                    {"text": "Hello ", "size": 12},
                    {"text": "World", "size": 14},
                ]
            },
            {
                "spans": [
                    {"text": "Second line", "size": 10},
                ]
            },
        ]
    }
    text, size = _extract_block_text(block)
    assert text == "Hello World\nSecond line"
    assert size == 14.0


def test_extract_block_text_empty_spans() -> None:
    block: dict[str, Any] = {
        "lines": [
            {
                "spans": [
                    {"text": "", "size": 0},
                    {"text": "   ", "size": 5},
                ]
            }
        ]
    }
    text, size = _extract_block_text(block)
    assert text == ""
    assert size == 0.0
