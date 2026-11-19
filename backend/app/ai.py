"""Thin wrapper around the OpenAI client with usage accounting.

Every AI call goes through here so that credit checks, cost tracking and
error handling stay consistent across features.
"""

import base64
import json
import logging
from typing import Iterator

from fastapi import HTTPException
from openai import OpenAI, OpenAIError
from sqlalchemy.orm import Session

from .billing import (
    ensure_credit_available,
    estimate_openai_cost,
    read_usage_field,
    record_usage,
)
from .config import settings

logger = logging.getLogger("padhlyebhai.ai")

_client: OpenAI | None = OpenAI(api_key=settings.openai_api_key) if settings.openai_api_key else None


def get_client() -> OpenAI:
    if _client is None:
        raise HTTPException(
            status_code=503,
            detail="AI is not configured on the server. Add OPENAI_API_KEY to backend/.env.",
        )
    return _client


def image_data_url(image_bytes: bytes, content_type: str = "image/png") -> str:
    encoded = base64.b64encode(image_bytes).decode("ascii")
    return f"data:{content_type};base64,{encoded}"


def _bill(db: Session, user_id: int, model: str, usage, extra_cost: float = 0.0, search_calls: int = 0):
    cost = estimate_openai_cost(model, usage) + extra_cost
    return record_usage(
        db=db,
        user_id=user_id,
        cost_usd=round(cost, 6),
        prompt_tokens=read_usage_field(usage, "prompt_tokens"),
        completion_tokens=read_usage_field(usage, "completion_tokens"),
        search_calls=search_calls,
    )


def chat_json(
    db: Session,
    user_id: int,
    system: str,
    user_content,
    model: str | None = None,
    temperature: float = 0.2,
    extra_cost: float = 0.0,
    search_calls: int = 0,
) -> dict:
    """Run a chat completion that must return a JSON object."""
    ensure_credit_available(db, user_id)
    model = model or settings.planner_model
    try:
        response = get_client().chat.completions.create(
            model=model,
            temperature=temperature,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_content},
            ],
        )
    except OpenAIError as exc:
        logger.exception("OpenAI JSON call failed")
        raise HTTPException(status_code=502, detail="The AI service failed to respond. Please try again.") from exc

    _bill(db, user_id, model, response.usage, extra_cost, search_calls)

    raw = response.choices[0].message.content or "{}"
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("AI returned invalid JSON: %s", raw[:300])
        raise HTTPException(status_code=502, detail="The AI returned an unreadable response. Please retry.") from exc


def chat_stream(
    db: Session,
    user_id: int,
    messages: list[dict],
    model: str | None = None,
    temperature: float = 0.4,
    max_tokens: int = 1800,
    bill: bool = True,
) -> Iterator[str]:
    """Yield text chunks from a streaming completion.

    With bill=True the user's allowance is checked first and charged at the end;
    bill=False is for free, tightly-capped features like in-app help.
    """
    if bill:
        ensure_credit_available(db, user_id)
    model = model or settings.chat_model
    client = get_client()

    try:
        stream = client.chat.completions.create(
            model=model,
            temperature=temperature,
            messages=messages,
            max_tokens=max_tokens,
            stream=True,
            stream_options={"include_usage": True},
        )
    except OpenAIError as exc:
        logger.exception("OpenAI stream failed to start")
        raise HTTPException(status_code=502, detail="The AI service failed to respond. Please try again.") from exc

    usage = None
    for chunk in stream:
        if chunk.usage is not None:
            usage = chunk.usage
        if chunk.choices:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    if bill:
        _bill(db, user_id, model, usage)
    else:
        logger.info("Unbilled %s call: %s prompt / %s completion tokens", model, read_usage_field(usage, "prompt_tokens"), read_usage_field(usage, "completion_tokens"))
