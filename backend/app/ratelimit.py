"""In-memory sliding-window rate limiter.

Good enough for a single instance. For multiple instances, back this with
Redis so limits are shared across processes.
"""

import time
from collections import defaultdict, deque
from threading import Lock

from fastapi import Depends, HTTPException, Request

from .auth import get_current_user
from .config import settings
from .models import User

_hits: dict[str, deque] = defaultdict(deque)
_lock = Lock()


def _check(key: str, limit: int, window_seconds: int = 60) -> None:
    now = time.monotonic()
    with _lock:
        bucket = _hits[key]
        while bucket and now - bucket[0] > window_seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            retry = int(window_seconds - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=429,
                detail=f"Too many requests. Try again in {retry}s.",
                headers={"Retry-After": str(retry)},
            )
        bucket.append(now)


def auth_rate_limit(request: Request) -> None:
    client_ip = request.client.host if request.client else "unknown"
    _check(f"auth:{client_ip}", settings.auth_rate_limit_per_minute)


def ai_rate_limit(current_user: User = Depends(get_current_user)) -> User:
    _check(f"ai:{current_user.id}", settings.ai_rate_limit_per_minute)
    return current_user


def help_rate_limit(current_user: User = Depends(get_current_user)) -> User:
    """In-app help is free for students, so it gets its own tighter limit."""
    _check(f"help:{current_user.id}", settings.help_rate_limit_per_minute)
    _check(f"help-day:{current_user.id}", settings.help_daily_limit, window_seconds=86400)
    return current_user


def video_rate_limit(current_user: User = Depends(get_current_user)) -> User:
    _check(f"video:{current_user.id}", settings.video_rate_limit_per_minute)
    return current_user
