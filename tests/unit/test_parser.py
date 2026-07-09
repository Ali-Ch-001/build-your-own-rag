import fitz  # type: ignore[import-untyped]

from rag_platform.ingestion.parser import parse_pdf


def test_parses_pdf_text_and_page_coordinates() -> None:
    document = fitz.open()
    page = document.new_page()
    page.insert_text((72, 72), "Architecture Overview", fontsize=18)
    page.insert_text(
        (72, 110), "The retrieval service applies metadata filters first.", fontsize=11
    )
    content = document.tobytes()
    document.close()

    parsed = parse_pdf(content, max_pages=5)

    assert parsed.page_count == 1
    assert any("metadata filters" in item.text for item in parsed.blocks)
    assert all(item.page == 1 for item in parsed.blocks)
