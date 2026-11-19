"""Free AI allowance per user.

Two limits work together:
- a DAILY allowance that refreshes every midnight (in BILLING_TIMEZONE), so a
  heavy study day never locks a student out for the rest of the month, and
- a MONTHLY cap that bounds the operator's worst-case cost per user.

Costs are computed from the real token usage OpenAI reports.
"""

import json
import os
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings  # noqa: F401  (loads .env first)
from .models import DailyUsage, MonthlyUsage

daily_free_limit_usd = float(os.getenv("DAILY_FREE_LIMIT_USD", "0.25"))
monthly_free_limit_usd = float(os.getenv("MONTHLY_FREE_LIMIT_USD", "6.0"))
payments_enabled = os.getenv("PAYMENTS_ENABLED", "false").lower() == "true"
billing_tz = ZoneInfo(os.getenv("BILLING_TIMEZONE", "Asia/Kolkata"))
# Typical cost of one AI-tutor answer; used only to show "≈ N questions left".
approx_cost_per_message_usd = float(os.getenv("APPROX_COST_PER_MESSAGE_USD", "0.003"))

# Optional flat surcharges on top of measured token cost (default: none).
vision_parse_estimate_usd = float(os.getenv("VISION_PARSE_ESTIMATE_USD", "0"))
pdf_parse_estimate_usd = float(os.getenv("PDF_PARSE_ESTIMATE_USD", "0"))
web_research_estimate_usd = float(os.getenv("WEB_RESEARCH_ESTIMATE_USD", "0.03"))

# USD per 1M tokens.
default_model_prices = {
    "gpt-4o": {"input_per_1m": 2.50, "output_per_1m": 10.00},
    "gpt-4o-mini": {"input_per_1m": 0.15, "output_per_1m": 0.60},
    "gpt-4.1": {"input_per_1m": 2.00, "output_per_1m": 8.00},
    "gpt-4.1-mini": {"input_per_1m": 0.40, "output_per_1m": 1.60},
    "gpt-4.1-nano": {"input_per_1m": 0.10, "output_per_1m": 0.40},
}
# Unknown models are billed conservatively rather than for free.
fallback_price = {"input_per_1m": 2.50, "output_per_1m": 10.00}

raw_prices = os.getenv("MODEL_PRICING_JSON", "").strip()
model_prices = json.loads(raw_prices) if raw_prices else default_model_prices


def _now() -> datetime:
    return datetime.now(billing_tz)


def _day_key(now: datetime) -> str:
    return now.strftime("%Y-%m-%d")


def _month_key(now: datetime) -> str:
    return now.strftime("%Y-%m")


def _next_midnight(now: datetime) -> datetime:
    return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


def _next_month(now: datetime) -> datetime:
    first = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return (first + timedelta(days=32)).replace(day=1)


def _get_or_create(db: Session, model, user_id: int, key_field: str, key: str):
    row = db.scalar(select(model).where(model.user_id == user_id, getattr(model, key_field) == key))
    if row is None:
        row = model(user_id=user_id, spent_usd=0.0, request_count=0, **{key_field: key})
        if model is MonthlyUsage:
            row.prompt_tokens = row.completion_tokens = row.search_calls = 0
        db.add(row)
        db.flush()
    return row


def _bucket(limit: float, spent: float, requests: int, reset_at: datetime) -> dict:
    remaining = max(0.0, limit - spent)
    return {
        "limit_usd": round(limit, 2),
        "spent_usd": round(spent, 4),
        "remaining_usd": round(remaining, 4),
        "percent_left": round(remaining / limit * 100) if limit else 0,
        "request_count": requests,
        "reset_at": reset_at.isoformat(),
    }


def get_credit_summary(db: Session, user_id: int) -> dict:
    now = _now()
    day = db.scalar(select(DailyUsage).where(DailyUsage.user_id == user_id, DailyUsage.day_key == _day_key(now)))
    month = db.scalar(select(MonthlyUsage).where(MonthlyUsage.user_id == user_id, MonthlyUsage.month_key == _month_key(now)))

    daily = _bucket(daily_free_limit_usd, float(day.spent_usd) if day else 0.0, int(day.request_count) if day else 0, _next_midnight(now))
    monthly = _bucket(
        monthly_free_limit_usd, float(month.spent_usd) if month else 0.0, int(month.request_count) if month else 0, _next_month(now)
    )

    limited_by = None
    if monthly["remaining_usd"] <= 0:
        limited_by = "monthly"
    elif daily["remaining_usd"] <= 0:
        limited_by = "daily"

    usable = min(daily["remaining_usd"], monthly["remaining_usd"])
    return {
        "daily": daily,
        "monthly": monthly,
        "is_limited": limited_by is not None,
        "limited_by": limited_by,
        "approx_messages_left": int(usable / approx_cost_per_message_usd) if approx_cost_per_message_usd else 0,
        "reset_at": monthly["reset_at"] if limited_by == "monthly" else daily["reset_at"],
    }


def limit_message(summary: dict) -> str:
    if summary["limited_by"] == "monthly":
        when = datetime.fromisoformat(summary["monthly"]["reset_at"]).strftime("%d %b")
        return (
            f"You've used this month's free AI allowance. It refreshes on {when}. "
            "Your planner, flashcard reviews, focus timer and progress still work as usual."
        )
    when = datetime.fromisoformat(summary["daily"]["reset_at"]).strftime("%I:%M %p").lstrip("0")
    return (
        f"You've used today's free AI allowance. It refreshes at {when} (IST). "
        "Meanwhile your planner, flashcard reviews, focus timer and progress all keep working."
    )


def ensure_credit_available(db: Session, user_id: int) -> None:
    summary = get_credit_summary(db, user_id)
    if summary["is_limited"]:
        raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=limit_message(summary))


def read_usage_field(usage, field_name: str) -> int:
    if usage is None:
        return 0
    if isinstance(usage, dict):
        return int(usage.get(field_name, 0) or 0)
    return int(getattr(usage, field_name, 0) or 0)


def estimate_openai_cost(model: str, usage) -> float:
    prices = model_prices.get(model)
    if prices is None:
        # Dated snapshots like "gpt-4.1-mini-2025-04-14" share the base model's price.
        base = next((k for k in sorted(model_prices, key=len, reverse=True) if model.startswith(k)), None)
        prices = model_prices[base] if base else fallback_price
    prompt_tokens = read_usage_field(usage, "prompt_tokens")
    completion_tokens = read_usage_field(usage, "completion_tokens")
    cost = prompt_tokens / 1_000_000 * float(prices["input_per_1m"]) + completion_tokens / 1_000_000 * float(prices["output_per_1m"])
    return round(cost, 6)


def record_usage(
    db: Session,
    user_id: int,
    cost_usd: float,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    search_calls: int = 0,
) -> dict:
    now = _now()
    month = _get_or_create(db, MonthlyUsage, user_id, "month_key", _month_key(now))
    day = _get_or_create(db, DailyUsage, user_id, "day_key", _day_key(now))

    month.spent_usd = round(float(month.spent_usd or 0) + cost_usd, 6)
    month.request_count = int(month.request_count or 0) + 1
    month.prompt_tokens = int(month.prompt_tokens or 0) + int(prompt_tokens or 0)
    month.completion_tokens = int(month.completion_tokens or 0) + int(completion_tokens or 0)
    month.search_calls = int(month.search_calls or 0) + int(search_calls or 0)

    day.spent_usd = round(float(day.spent_usd or 0) + cost_usd, 6)
    day.request_count = int(day.request_count or 0) + 1

    db.commit()
    return get_credit_summary(db, user_id)
