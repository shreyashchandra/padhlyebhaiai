from datetime import date
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from .. import ai
from ..auth import get_current_user
from ..billing import pdf_parse_estimate_usd, vision_parse_estimate_usd
from ..config import settings
from ..db import get_db
from ..deps import card_out, client_tz, get_owned, get_owned_topic, local_today
from ..models import Flashcard, Subject, User
from ..ratelimit import ai_rate_limit
from ..schemas import FlashcardCreate, FlashcardGenerate, FlashcardReview
from ..services import srs
from ..services.documents import read_upload

router = APIRouter(prefix="/api/flashcards", tags=["flashcards"])

CARDS_SYSTEM = """You create spaced-repetition flashcards that help students remember for exams.
Return JSON only: {"cards": [{"front": "", "back": ""}]}
Rules:
- One atomic fact, definition, formula, or concept per card.
- Front: a specific question or prompt (not just a word). Back: concise answer (max ~40 words).
- Cover the most exam-relevant definitions, formulas, laws, differences, and examples.
- Use LaTeX with $...$ for math. No duplicates."""


def _save_cards(db: Session, user: User, subject_id: int, topic_id: int | None, cards: list) -> list[dict]:
    created = []
    for c in cards:
        if not isinstance(c, dict):
            continue
        front, back = str(c.get("front") or "").strip(), str(c.get("back") or "").strip()
        if front and back:
            card = Flashcard(
                user_id=user.id, subject_id=subject_id, topic_id=topic_id, front=front[:2000], back=back[:4000], due=date.today()
            )
            db.add(card)
            created.append(card)
    if not created:
        raise HTTPException(status_code=502, detail="Couldn't generate flashcards this time. Please try again.")
    db.commit()
    return [card_out(c) for c in created]


@router.get("")
def list_cards(
    subject_id: int | None = None,
    due_only: bool = False,
    limit: int = Query(200, le=500),
    tz: ZoneInfo = Depends(client_tz),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(Flashcard).where(Flashcard.user_id == current_user.id)
    if subject_id is not None:
        query = query.where(Flashcard.subject_id == subject_id)
    if due_only:
        query = query.where(Flashcard.due <= local_today(tz))
    cards = db.scalars(query.order_by(Flashcard.due, Flashcard.id).limit(limit)).all()
    return [card_out(c) for c in cards]


@router.get("/stats")
def card_stats(tz: ZoneInfo = Depends(client_tz), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(
            Flashcard.subject_id,
            func.count(Flashcard.id),
            func.sum(case((Flashcard.due <= local_today(tz), 1), else_=0)),
        )
        .where(Flashcard.user_id == current_user.id)
        .group_by(Flashcard.subject_id)
    ).all()
    return [{"subject_id": sid, "total": total, "due": int(due or 0)} for sid, total, due in rows]


@router.post("", status_code=201)
def create_card(payload: FlashcardCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.subject_id is not None:
        get_owned(db, Subject, payload.subject_id, current_user, "Subject")
    card = Flashcard(user_id=current_user.id, due=date.today(), **payload.model_dump())
    db.add(card)
    db.commit()
    db.refresh(card)
    return card_out(card)


@router.post("/generate", status_code=201)
def generate_cards(payload: FlashcardGenerate, current_user: User = Depends(ai_rate_limit), db: Session = Depends(get_db)):
    subject = get_owned(db, Subject, payload.subject_id, current_user, "Subject")
    topic = get_owned_topic(db, payload.topic_id, current_user) if payload.topic_id else None

    if payload.source_text:
        material = f"Create cards from these notes:\n{payload.source_text}"
    elif topic:
        material = f"Topic: {topic.name}"
    elif subject.topics:
        material = "Topics: " + ", ".join(t.name for t in subject.topics[:40])
    else:
        raise HTTPException(status_code=400, detail="Pick a topic, paste notes, or import a syllabus first.")

    prompt = (
        f"Subject: {subject.name} ({subject.exam_name or 'exam'} {subject.class_semester or ''}).\n"
        f"Number of cards: {payload.count}.\n{material}"
    )
    result = ai.chat_json(db, current_user.id, CARDS_SYSTEM, prompt, temperature=0.4)
    return _save_cards(db, current_user, subject.id, topic.id if topic else None, result.get("cards", [])[: payload.count])


@router.post("/generate-from-file", status_code=201)
async def generate_cards_from_file(
    subject_id: int = Form(...),
    count: int = Form(15),
    file: UploadFile = File(...),
    current_user: User = Depends(ai_rate_limit),
    db: Session = Depends(get_db),
):
    subject = get_owned(db, Subject, subject_id, current_user, "Subject")
    parsed = await read_upload(file)
    count = max(3, min(40, count))

    content: list[dict] = [
        {"type": "text", "text": f"Subject: {subject.name}. Number of cards: {count}. Create cards from these notes:\n{parsed.text[:15000]}"}
    ]
    content += [{"type": "image_url", "image_url": {"url": u}} for u in parsed.images[:3]]
    result = ai.chat_json(
        db,
        current_user.id,
        CARDS_SYSTEM,
        content,
        model=settings.vision_model if parsed.images else settings.planner_model,
        temperature=0.4,
        extra_cost=pdf_parse_estimate_usd if parsed.kind == "pdf" else vision_parse_estimate_usd,
    )
    return _save_cards(db, current_user, subject.id, None, result.get("cards", [])[:count])


@router.post("/{card_id}/review")
def review_card(
    card_id: int,
    payload: FlashcardReview,
    tz: ZoneInfo = Depends(client_tz),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    card = get_owned(db, Flashcard, card_id, current_user, "Card")
    card.ease, card.interval_days, card.reps, card.lapses, card.due = srs.review(
        card.ease, card.interval_days, card.reps, card.lapses, payload.grade, today=local_today(tz)
    )
    db.commit()
    return card_out(card)


@router.delete("/{card_id}", status_code=204)
def delete_card(card_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Flashcard, card_id, current_user, "Card"))
    db.commit()
