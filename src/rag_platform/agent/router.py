from __future__ import annotations

import ast
import re
from dataclasses import dataclass
from enum import StrEnum

from rag_platform.config import Settings


class Route(StrEnum):
    internal = "INTERNAL_RAG"
    web = "WEB"
    composite = "COMPOSITE"
    calculator = "CALCULATOR"
    graph = "GRAPH_RAG"
    clarify = "CLARIFY"


@dataclass(frozen=True, slots=True)
class RouteDecision:
    route: Route
    confidence: float
    reason: str


_CURRENT_TERMS = re.compile(
    r"\b(latest|today|current|right now|breaking|this week|recent news|live)\b", re.I
)
_INTERNAL_TERMS = re.compile(
    r"\b(our|internal|document|policy|contract|manual|uploaded|corpus|company)\b", re.I
)
_CALC = re.compile(r"^[\d\s.+\-*/%()^]+$")
_GRAPH_TERMS = re.compile(
    r"\b(depends? on|relationship|related to|connected to|ownership|owns?|"
    r"multi-hop|impact path|upstream|downstream)\b",
    re.I,
)


class SemanticRouter:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def route(self, query: str, has_corpora: bool) -> RouteDecision:
        if _CALC.fullmatch(query.strip()) and any(char.isdigit() for char in query):
            return RouteDecision(Route.calculator, 0.99, "arithmetic_expression")
        if _GRAPH_TERMS.search(query) and has_corpora and self.settings.neo4j_enabled:
            return RouteDecision(Route.graph, 0.92, "relationship_or_dependency_query")
        current = bool(_CURRENT_TERMS.search(query))
        internal = bool(_INTERNAL_TERMS.search(query)) or has_corpora
        if current and internal and self.settings.web_search_enabled:
            return RouteDecision(Route.composite, 0.90, "current_and_internal_evidence")
        if current and self.settings.web_search_enabled:
            return RouteDecision(Route.web, 0.90, "current_information")
        if has_corpora:
            return RouteDecision(Route.internal, 0.85, "authorized_corpus_selected")
        return RouteDecision(Route.clarify, 0.45, "no_authorized_knowledge_scope")


def calculate(expression: str) -> float:
    expression = expression.replace("^", "**")
    tree = ast.parse(expression, mode="eval")

    def evaluate(node: ast.AST, depth: int = 0) -> float:
        if depth > 10:
            raise ValueError("Expression is too deeply nested")
        if isinstance(node, ast.Expression):
            return evaluate(node.body, depth + 1)
        if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
            return float(node.value)
        if isinstance(node, ast.BinOp):
            left = evaluate(node.left, depth + 1)
            right = evaluate(node.right, depth + 1)
            if abs(left) > 1e100 or abs(right) > 1e100:
                raise ValueError("Expression exceeds numeric bounds")
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
            if isinstance(node.op, ast.Mod):
                return left % right
            if isinstance(node.op, ast.Pow):
                return float(left**right)
        if isinstance(node, ast.UnaryOp):
            operand = evaluate(node.operand, depth + 1)
            if isinstance(node.op, ast.USub):
                return -operand
            if isinstance(node.op, ast.UAdd):
                return operand
        raise ValueError("Expression contains an unsupported operation")

    result = evaluate(tree)
    if abs(result) > 1e100:
        raise ValueError("Result exceeds numeric bounds")
    return result
