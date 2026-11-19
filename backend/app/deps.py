"""Shared helpers for routers: ownership checks and serializers."""

from datetime import date, datetime
from typing import TypeVar
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import Header, HTTPException
from sqlalchemy.orm import Session

from .models import Flashcard, StudyTask, Subject, Topic, User

T = TypeVar("T")


def get_owned(db: Session, model: type[T], obj_id: int, user: User, label: str = "Item") -> T:
    obj = db.get(model, obj_id)
    if obj is None or getattr(obj, "user_id", None) != user.id:
        raise HTTPException(status_code=404, detail=f"{label} not found.")
    return obj


def get_owned_topic(db: Session, topic_id: int, user: User) -> Topic:
    topic = db.get(Topic, topic_id)
    if topic is None or topic.subject is None or topic.subject.user_id != user.id:
        raise HTTPException(status_code=404, detail="Topic not found.")
    return topic


def topic_out(t: Topic) -> dict:
    accuracy = round(t.quiz_correct / t.quiz_total * 100) if t.quiz_total else None
    return {
        "id": t.id,
        "subject_id": t.subject_id,
        "unit_id": t.unit_id,
        "name": t.name,
        "position": t.position,
        "status": t.status,
        "confidence": t.confidence,
        "priority": t.priority,
        "est_minutes": t.est_minutes,
        "note": t.note,
        "quiz_accuracy": accuracy,
        "quiz_total": t.quiz_total,
        "last_studied_at": t.last_studied_at,
    }


def subject_progress(s: Subject) -> dict:
    total = len(s.topics)
    done = sum(1 for t in s.topics if t.status in ("done", "revised"))
    learning = sum(1 for t in s.topics if t.status == "learning")
    remaining = sum(
        t.est_minutes * (0.5 if t.status == "learning" else 1) for t in s.topics if t.status in ("not_started", "learning")
    )
    return {
        "remaining_minutes": int(remaining),
        "topic_count": total,
        "done_count": done,
        "learning_count": learning,
        "progress": round((done + learning * 0.4) / total * 100) if total else 0,
    }


def subject_out(s: Subject, include_topics: bool = False) -> dict:
    data = {
        "id": s.id,
        "name": s.name,
        "exam_name": s.exam_name,
        "board_university": s.board_university,
        "class_semester": s.class_semester,
        "exam_date": s.exam_date,
        "color": s.color,
        "has_syllabus": bool(s.syllabus_text) or bool(s.topics),
        "syllabus_source": s.syllabus_source,
        "catalog_exam_id": s.catalog_exam_id,
        "created_at": s.created_at,
        **subject_progress(s),
    }
    if include_topics:
        data["units"] = [{"id": u.id, "name": u.name, "position": u.position} for u in s.units]
        data["topics"] = [topic_out(t) for t in s.topics]
    return data


def task_out(t: StudyTask) -> dict:
    return {
        "id": t.id,
        "plan_id": t.plan_id,
        "subject_id": t.subject_id,
        "topic_id": t.topic_id,
        "date": t.date,
        "title": t.title,
        "kind": t.kind,
        "minutes": t.minutes,
        "done": t.done,
        "done_at": t.done_at,
    }


def card_out(c: Flashcard) -> dict:
    return {
        "id": c.id,
        "subject_id": c.subject_id,
        "topic_id": c.topic_id,
        "front": c.front,
        "back": c.back,
        "due": c.due,
        "reps": c.reps,
        "interval_days": c.interval_days,
        "lapses": c.lapses,
    }


def client_tz(x_timezone: str | None = Header(default=None)) -> ZoneInfo:
    """The student's IANA timezone (sent by the frontend), defaulting to IST."""
    try:
        return ZoneInfo(x_timezone) if x_timezone else ZoneInfo("Asia/Kolkata")
    except (ZoneInfoNotFoundError, ValueError):
        return ZoneInfo("Asia/Kolkata")


def local_today(tz: ZoneInfo) -> date:
    return datetime.now(tz).date()
