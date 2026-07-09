from __future__ import annotations

import asyncio
import struct

from rag_platform.config import Settings


class UnsafeDocumentError(ValueError):
    pass


class DocumentScanner:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def scan(self, content: bytes) -> None:
        if not content.startswith(b"%PDF-"):
            raise UnsafeDocumentError("The uploaded object is not a PDF")
        if b"/JavaScript" in content or b"/JS" in content:
            raise UnsafeDocumentError("Active PDF JavaScript is not permitted")
        if b"/Launch" in content:
            raise UnsafeDocumentError("PDF launch actions are not permitted")
        if self.settings.clamav_enabled:
            await self._scan_clamav(content)

    async def _scan_clamav(self, content: bytes) -> None:
        reader, writer = await asyncio.wait_for(
            asyncio.open_connection(self.settings.clamav_host, self.settings.clamav_port),
            timeout=5,
        )
        try:
            writer.write(b"zINSTREAM\0")
            for start in range(0, len(content), 64 * 1024):
                chunk = content[start : start + 64 * 1024]
                writer.write(struct.pack("!I", len(chunk)))
                writer.write(chunk)
                await writer.drain()
            writer.write(struct.pack("!I", 0))
            await writer.drain()
            result = (await asyncio.wait_for(reader.read(4096), timeout=30)).decode(
                errors="replace"
            )
            if "FOUND" in result or "OK" not in result:
                raise UnsafeDocumentError(f"Malware scan rejected the PDF: {result.strip()}")
        finally:
            writer.close()
            await writer.wait_closed()
