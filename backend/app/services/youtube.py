"""YouTube lecture suggestions for syllabus topics.

Uses the YouTube Data API v3: one `search.list` (100 quota units) for relevant
candidates, then one `videos.list` (1 unit) for real view/like counts and
duration. Candidates are ranked mainly by popularity (views, likes) with a
bonus for search relevance, and Shorts/very long streams are dropped.

Results are cached in the database for CACHE_DAYS and shared across users
(everyone studying "Kinematics" for JEE gets the same cached answer), which
keeps us far inside the default 10,000 units/day quota. Without an API key,
or once the daily search budget is used, callers get a YouTube search link.
"""

import logging
import math
import re
import threading
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote_plus

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..models import VideoCache

logger = logging.getLogger("padhlyebhai.youtube")

API = "https://www.googleapis.com/youtube/v3"
CACHE_DAYS = 14
MIN_SECONDS = 4 * 60  # skip Shorts and tiny clips
MAX_SECONDS = 4 * 60 * 60  # skip marathon live streams
LANGS = {"en": "English", "hi": "Hindi"}

_budget_lock = threading.Lock()
_budget = {"day": "", "used": 0}


def search_url(query: str) -> str:
    return f"https://www.youtube.com/results?search_query={quote_plus(query)}"


def build_query(topic: str, subject: str | None, exam: str | None, lang: str) -> str:
    topic = re.sub(r"\s*\((?:part \d+)\)\s*$", "", topic.strip(), flags=re.I)
    parts = [topic, subject or "", exam or "", "full lecture"]
    if lang == "hi":
        parts.append("in Hindi")
    return " ".join(p for p in parts if p).strip()


def _iso_duration_seconds(value: str) -> int:
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", value or "")
    if not m:
        return 0
    d, h, mi, s = (int(x or 0) for x in m.groups())
    return d * 86400 + h * 3600 + mi * 60 + s


def rank_videos(items: list[dict], search_order: list[str]) -> list[dict]:
    """Score = popularity (log views) + engagement (log likes) + relevance bonus."""
    position = {vid: i for i, vid in enumerate(search_order)}
    ranked = []
    for item in items:
        stats = item.get("statistics", {})
        seconds = _iso_duration_seconds(item.get("contentDetails", {}).get("duration", ""))
        if not MIN_SECONDS <= seconds <= MAX_SECONDS:
            continue
        if item.get("snippet", {}).get("liveBroadcastContent") not in (None, "none"):
            continue
        views = int(stats.get("viewCount", 0) or 0)
        likes = int(stats.get("likeCount", 0) or 0)
        rank = position.get(item["id"], len(search_order))
        score = math.log10(views + 1) + 0.35 * math.log10(likes + 1) + 0.6 * (1 - rank / max(1, len(search_order)))
        snippet = item.get("snippet", {})
        thumbs = snippet.get("thumbnails", {})
        thumb = (thumbs.get("high") or thumbs.get("medium") or thumbs.get("default") or {}).get("url")
        ranked.append(
            {
                "id": item["id"],
                "title": snippet.get("title", ""),
                "channel": snippet.get("channelTitle", ""),
                "published_at": snippet.get("publishedAt"),
                "thumbnail": thumb,
                "views": views,
                "likes": likes,
                "duration_seconds": seconds,
                "url": f"https://www.youtube.com/watch?v={item['id']}",
                "score": round(score, 3),
            }
        )
    ranked.sort(key=lambda v: v["score"], reverse=True)
    return ranked


def _take_budget() -> bool:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    with _budget_lock:
        if _budget["day"] != today:
            _budget.update(day=today, used=0)
        if _budget["used"] >= settings.youtube_daily_search_limit:
            return False
        _budget["used"] += 1
        return True


def _fetch(query: str, lang: str) -> list[dict]:
    key = settings.youtube_api_key
    with httpx.Client(timeout=8.0) as client:
        search = client.get(
            f"{API}/search",
            params={
                "key": key,
                "part": "snippet",
                "q": query,
                "type": "video",
                "maxResults": 15,
                "order": "relevance",
                "safeSearch": "strict",
                "videoEmbeddable": "true",
                "relevanceLanguage": lang,
                "regionCode": "IN",
            },
        )
        search.raise_for_status()
        ids = [i["id"]["videoId"] for i in search.json().get("items", []) if i.get("id", {}).get("videoId")]
        if not ids:
            return []
        details = client.get(
            f"{API}/videos",
            params={"key": key, "part": "snippet,statistics,contentDetails", "id": ",".join(ids)},
        )
        details.raise_for_status()
    return rank_videos(details.json().get("items", []), ids)[:5]


def suggest(db: Session, query: str, lang: str) -> dict:
    lang = lang if lang in LANGS else "en"
    result = {"query": query, "lang": lang, "search_url": search_url(query), "videos": [], "source": "search_link"}
    cache_key = f"{lang}:{query.lower()}"[:400]

    cached = db.scalar(select(VideoCache).where(VideoCache.query_key == cache_key))
    if cached:
        fetched = cached.fetched_at if cached.fetched_at.tzinfo else cached.fetched_at.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) - fetched < timedelta(days=CACHE_DAYS):
            return {**result, "videos": cached.results, "source": "youtube" if cached.results else "search_link", "cached": True}

    if not settings.youtube_api_key:
        return {**result, "reason": "not_configured"}
    if not _take_budget():
        logger.warning("YouTube daily search budget used up; returning search link")
        return {**result, "reason": "busy"}

    started = time.perf_counter()
    try:
        videos = _fetch(query, lang)
    except (httpx.HTTPError, KeyError, ValueError):
        logger.exception("YouTube lookup failed for %r", query)
        return {**result, "reason": "error"}
    logger.info("YouTube lookup %r -> %d videos (%.0f ms)", query, len(videos), (time.perf_counter() - started) * 1000)

    if cached:
        cached.results, cached.fetched_at = videos, datetime.now(timezone.utc)
    else:
        db.add(VideoCache(query_key=cache_key, results=videos, fetched_at=datetime.now(timezone.utc)))
    db.commit()
    return {**result, "videos": videos, "source": "youtube" if videos else "search_link"}
