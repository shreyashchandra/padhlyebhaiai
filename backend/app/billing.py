import json
import os
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .models import MonthlyUsage

monthly_free_limit_usd = float(os.getenv("MONTHLY_FREE_LIMIT_USD", "2.0"))
payments_enabled = os.getenv("PAYMENTS_ENABLED", "false").lower() == "true"

vision_parse_estimate_usd = float(
    os.getenv("VISION_PARSE_ESTIMATE_USD", "0.02")
)
pdf_parse_estimate_usd = float(os.getenv("PDF_PARSE_ESTIMATE_USD", "0.03"))
web_research_estimate_usd = float(
    os.getenv("WEB_RESEARCH_ESTIMATE_USD", "0.02")
)

default_model_prices = {
    "gpt-4o": {"input_per_1m": 5.0, "output_per_1m": 15.0},
    "gpt-4o-mini": {"input_per_1m": 0.15, "output_per_1m": 0.60},
    "gpt-4.1": {"input_per_1m": 2.0, "output_per_1m": 8.0},
    "gpt-4.1-mini": {"input_per_1m": 0.40, "output_per_1m": 1.60},
}

raw_prices = os.getenv("MODEL_PRICING_JSON", "").strip()

if raw_prices:
    model_prices = json.loads(raw_prices)
else:
    model_prices = default_model_prices


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def current_month_key(now: datetime | None = None) -> str:
    current = now or utcnow()
    return current.strftime("%Y-%m")


def next_month_reset_iso(now: datetime | None = None) -> str:
    current = now or utcnow()

    if current.month == 12:
        next_month = current.replace(
            year=current.year + 1,
            month=1,
            day=1,
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )
    else:
        next_month = current.replace(
            month=current.month + 1,
            day=1,
            hour=0,
            minute=0,
            second=0,
            microsecond=0,
        )

    return next_month.isoformat()


def get_or_create_month_record(db: Session, user_id: int) -> MonthlyUsage:
    month_key = current_month_key()

    row = db.scalar(
        select(MonthlyUsage).where(
            MonthlyUsage.user_id == user_id,
            MonthlyUsage.month_key == month_key,
        )
    )

    if row:
        return row

    row = MonthlyUsage(
        user_id=user_id,
        month_key=month_key,
        spent_usd=0.0,
        request_count=0,
        prompt_tokens=0,
        completion_tokens=0,
        search_calls=0,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return row


def get_credit_summary(db: Session, user_id: int) -> dict:
    row = get_or_create_month_record(db, user_id)

    spent = round(float(row.spent_usd or 0.0), 4)
    remaining = max(0.0, round(monthly_free_limit_usd - spent, 4))
    is_limited = spent >= monthly_free_limit_usd

    return {
        "limit_usd": round(monthly_free_limit_usd, 2),
        "spent_usd": spent,
        "remaining_usd": remaining,
        "reset_at": next_month_reset_iso(),
        "request_count": int(row.request_count or 0),
        "is_limited": is_limited,
    }


def limit_message(reset_at: str) -> str:
    return (
        "Your free monthly limit has been utilized for this month. "
        "Payments are disabled right now. "
        f"Your limit will reset on {reset_at}."
    )


def ensure_credit_available(db: Session, user_id: int) -> None:
    summary = get_credit_summary(db, user_id)

    if summary["is_limited"]:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=limit_message(summary["reset_at"]),
        )


def read_usage_field(usage, field_name: str) -> int:
    if usage is None:
        return 0

    if isinstance(usage, dict):
        return int(usage.get(field_name, 0) or 0)

    return int(getattr(usage, field_name, 0) or 0)


def estimate_openai_cost(model: str, usage) -> float:
    prices = model_prices.get(model)

    if not prices:
        return 0.0

    prompt_tokens = read_usage_field(usage, "prompt_tokens")
    completion_tokens = read_usage_field(usage, "completion_tokens")

    input_cost = (
        prompt_tokens / 1_000_000
    ) * float(prices["input_per_1m"])
    output_cost = (
        completion_tokens / 1_000_000
    ) * float(prices["output_per_1m"])

    return round(input_cost + output_cost, 6)


def record_usage(
    db: Session,
    user_id: int,
    cost_usd: float,
    prompt_tokens: int = 0,
    completion_tokens: int = 0,
    search_calls: int = 0,
) -> dict:
    row = get_or_create_month_record(db, user_id)

    row.spent_usd = round(float(row.spent_usd or 0.0) + float(cost_usd), 6)
    row.request_count = int(row.request_count or 0) + 1
    row.prompt_tokens = int(row.prompt_tokens or 0) + int(prompt_tokens or 0)
    row.completion_tokens = int(row.completion_tokens or 0) + int(
        completion_tokens or 0
    )
    row.search_calls = int(row.search_calls or 0) + int(search_calls or 0)

    db.add(row)
    db.commit()
    db.refresh(row)

    return get_credit_summary(db, user_id)