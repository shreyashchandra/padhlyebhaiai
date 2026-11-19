"""Optional web research (Tavily) about exam patterns and topic weightage."""

import logging

from ..config import settings

logger = logging.getLogger("padhlyebhai.research")

try:
    from tavily import TavilyClient

    _tavily = TavilyClient(api_key=settings.tavily_api_key) if settings.tavily_api_key else None
except Exception:  # pragma: no cover - optional dependency
    _tavily = None


def research_available() -> bool:
    return _tavily is not None


def build_queries(exam: str, board: str, klass: str, subject: str, topics: list[str]) -> list[str]:
    base = " ".join(p.strip() for p in (exam, board, klass, subject) if p and p.strip())
    if not base:
        return []
    queries = [
        f"{base} chapter wise weightage important topics",
        f"{base} previous year questions most repeated topics",
        f"{base} exam pattern marking scheme",
    ]
    if topics:
        queries.append(f"{base} most important questions {', '.join(topics[:4])}")
    return queries


def run_research(queries: list[str]) -> dict:
    if not _tavily or not queries:
        return {"text": "", "sources": []}

    chunks, sources, seen = [], [], set()
    for query in queries:
        try:
            result = _tavily.search(
                query=query, search_depth="advanced", max_results=4, include_answer=True
            )
        except Exception:
            logger.warning("Tavily search failed for %r", query, exc_info=True)
            continue

        if result.get("answer"):
            chunks.append(f"Query: {query}\nSummary: {result['answer']}")
        for item in result.get("results", [])[:4]:
            url = item.get("url")
            content = (item.get("content") or "").strip()
            if url and url not in seen:
                seen.add(url)
                sources.append({"title": item.get("title") or url, "url": url, "snippet": content[:240]})
            chunks.append(f"Source: {item.get('title')} ({url})\n{content[:500]}")

    return {"text": "\n\n".join(chunks)[:14000], "sources": sources[:10]}
