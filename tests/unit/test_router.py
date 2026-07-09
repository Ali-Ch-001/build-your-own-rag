import pytest

from rag_platform.agent.router import Route, SemanticRouter, calculate
from rag_platform.config import Settings


def test_routes_selected_corpus_to_internal_rag() -> None:
    decision = SemanticRouter(Settings()).route("What is the retention policy?", has_corpora=True)
    assert decision.route == Route.internal


def test_routes_current_question_to_web_when_enabled() -> None:
    settings = Settings(web_search_enabled=True, tavily_api_key="test-key")
    decision = SemanticRouter(settings).route("What is the latest release today?", False)
    assert decision.route == Route.web


def test_calculator_uses_allowlisted_ast() -> None:
    assert calculate("(12 + 8) / 4") == 5
    with pytest.raises(ValueError, match="unsupported"):
        calculate("__import__('os').system('id')")
