from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

import httpx

from rag_platform.config import Settings
from rag_platform.security.guardrails import sanitize_evidence


@dataclass(frozen=True, slots=True)
class WebResult:
    title: str
    url: str
    content: str
    score: float
    acquired_at: datetime


class TavilySearch:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def search(self, query: str, max_results: int = 5) -> list[WebResult]:
        if not self.settings.web_search_enabled or not self.settings.tavily_api_key:
            raise RuntimeError("Web search is not enabled")
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.post(
                f"{str(self.settings.tavily_base_url).rstrip('/')}/search",
                json={
                    "api_key": self.settings.tavily_api_key,
                    "query": query,
                    "search_depth": "advanced",
                    "max_results": min(max_results, 10),
                    "include_answer": False,
                    "include_raw_content": False,
                },
            )
            response.raise_for_status()
        now = datetime.now(UTC)
        return [
            WebResult(
                title=str(item.get("title") or "Untitled web source")[:500],
                url=str(item.get("url") or ""),
                content=sanitize_evidence(str(item.get("content") or "")).text[:8000],
                score=float(item.get("score") or 0),
                acquired_at=now,
            )
            for item in response.json().get("results", [])
            if item.get("url") and item.get("content")
        ]
