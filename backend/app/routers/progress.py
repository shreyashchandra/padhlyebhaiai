"""Focus sessions, dashboard and analytics."""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..billing import get_credit_summary
from ..db import get_db
from ..deps import client_tz, get_owned, get_owned_topic, local_today, subject_out, task_out, topic_out
from ..models import Flashcard, Quiz, StudyPlan, StudySession, StudyTask, Subject, User
from ..schemas import SessionCreate
from .plans import _active_task_filter

router = APIRouter(prefix="/api", tags=["progress"])


def _day_start(d: date, tz: ZoneInfo) -> datetime:
    """Start of a local calendar day, as UTC (naive values in SQLite are UTC)."""
    return datetime.combine(d, time.min, tzinfo=tz).astimezone(timezone.utc)


def _as_date(value: datetime, tz: ZoneInfo) -> date:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(tz).date()


@router.post("/sessions", status_code=201)
def log_session(payload: SessionCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.subject_id is not None:
        get_owned(db, Subject, payload.subject_id, current_user, "Subject")
    if payload.topic_id is not None:
        topic = get_owned_topic(db, payload.topic_id, current_user)
        topic.last_studied_at = datetime.now(timezone.utc)
        if topic.status == "not_started":
            topic.status = "learning"
    session = StudySession(user_id=current_user.id, **payload.model_dump())
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "minutes": session.minutes, "subject_id": session.subject_id, "started_at": session.started_at}


@router.get("/sessions")
def list_sessions(
    days: int = Query(30, ge=1, le=365),
    tz: ZoneInfo = Depends(client_tz),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    since = _day_start(local_today(tz) - timedelta(days=days - 1), tz)
    rows = db.scalars(
        select(StudySession)
        .where(StudySession.user_id == current_user.id, StudySession.started_at >= since)
        .order_by(StudySession.started_at.desc())
    ).all()
    return [
        {"id": s.id, "minutes": s.minutes, "subject_id": s.subject_id, "topic_id": s.topic_id, "note": s.note, "started_at": s.started_at}
        for s in rows
    ]


def _activity_by_day(db: Session, user: User, days: int, tz: ZoneInfo) -> dict[date, int]:
    start = local_today(tz) - timedelta(days=days - 1)
    minutes: dict[date, int] = {}
    for s in db.scalars(
        select(StudySession).where(StudySession.user_id == user.id, StudySession.started_at >= _day_start(start, tz))
    ):
        d = _as_date(s.started_at, tz)
        minutes[d] = minutes.get(d, 0) + s.minutes
    # Completed plan tasks count as study time on days without a logged timer session.
    task_minutes: dict[date, int] = {}
    for t in db.scalars(
        select(StudyTask).where(StudyTask.user_id == user.id, StudyTask.done.is_(True), StudyTask.done_at >= _day_start(start, tz))
    ):
        d = _as_date(t.done_at, tz)
        task_minutes[d] = task_minutes.get(d, 0) + t.minutes
    for d, m in task_minutes.items():
        minutes[d] = max(minutes.get(d, 0), m)
    return minutes


def _streak(activity: dict[date, int], today: date) -> int:
    day = today
    if not activity.get(day):
        day -= timedelta(days=1)  # today isn't over yet; keep yesterday's streak alive
    streak = 0
    while activity.get(day):
        streak += 1
        day -= timedelta(days=1)
    return streak


@router.get("/dashboard")
def dashboard(
    tz: ZoneInfo = Depends(client_tz),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = local_today(tz)

    subjects = db.scalars(select(Subject).where(Subject.user_id == current_user.id)).all()
    subject_cards = []
    for s in subjects:
        data = subject_out(s)
        data["days_left"] = (s.exam_date - today).days if s.exam_date else None
        subject_cards.append(data)
    subject_cards.sort(key=lambda s: (s["days_left"] is None or s["days_left"] < 0, s["days_left"] or 0))

    task_filter = _active_task_filter(current_user)
    today_tasks = db.scalars(
        select(StudyTask).where(task_filter, StudyTask.date == today).order_by(StudyTask.position, StudyTask.id)
    ).all()
    overdue = db.scalars(
        select(StudyTask).where(task_filter, StudyTask.date < today, StudyTask.done.is_(False)).order_by(StudyTask.date)
    ).all()

    activity = _activity_by_day(db, current_user, 60, tz)
    week = [
        {"date": d, "label": d.strftime("%a"), "minutes": activity.get(d, 0)}
        for d in (today - timedelta(days=i) for i in range(6, -1, -1))
    ]
    heatmap = [{"date": d, "minutes": activity.get(d, 0)} for d in (today - timedelta(days=i) for i in range(59, -1, -1))]

    weak = []
    for s in subjects:
        for t in s.topics:
            acc = t.quiz_correct / t.quiz_total if t.quiz_total else None
            if (acc is not None and acc < 0.6) or (t.status != "not_started" and 0 < t.confidence <= 2):
                weak.append({**topic_out(t), "subject_name": s.name, "subject_color": s.color})
    weak.sort(key=lambda t: (t["quiz_accuracy"] if t["quiz_accuracy"] is not None else 50, t["confidence"]))

    due_cards = len(
        db.scalars(select(Flashcard.id).where(Flashcard.user_id == current_user.id, Flashcard.due <= today)).all()
    )
    recent_quizzes = db.scalars(
        select(Quiz)
        .where(Quiz.user_id == current_user.id, Quiz.completed_at.is_not(None))
        .order_by(Quiz.completed_at.desc())
        .limit(5)
    ).all()
    active_plan = db.scalar(select(StudyPlan).where(StudyPlan.user_id == current_user.id, StudyPlan.is_active.is_(True)))

    goal = current_user.daily_goal_minutes or 120
    return {
        "user": {"name": current_user.name, "email": current_user.email, "daily_goal_minutes": goal},
        "today": {
            "date": today,
            "minutes": activity.get(today, 0),
            "goal_minutes": goal,
            "tasks": [task_out(t) for t in today_tasks],
        },
        "overdue": [task_out(t) for t in overdue[:20]],
        "overdue_count": len(overdue),
        "streak": _streak(activity, today),
        "week": week,
        "heatmap": heatmap,
        "week_minutes": sum(d["minutes"] for d in week),
        "subjects": subject_cards,
        "weak_topics": weak[:8],
        "due_cards": due_cards,
        "recent_quizzes": [
            {"id": q.id, "title": q.title, "score": q.score, "total": q.total, "completed_at": q.completed_at, "subject_id": q.subject_id}
            for q in recent_quizzes
        ],
        "active_plan": (
            {"id": active_plan.id, "title": active_plan.title, "end_date": active_plan.end_date} if active_plan else None
        ),
        "billing": get_credit_summary(db, current_user.id),
    }


@router.get("/analytics")
def analytics(
    days: int = Query(30, ge=7, le=180),
    tz: ZoneInfo = Depends(client_tz),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = local_today(tz)
    start = today - timedelta(days=days - 1)
    sessions = db.scalars(
        select(StudySession).where(StudySession.user_id == current_user.id, StudySession.started_at >= _day_start(start, tz))
    ).all()
    subjects = {s.id: s for s in db.scalars(select(Subject).where(Subject.user_id == current_user.id))}

    by_subject: dict[int | None, int] = {}
    for s in sessions:
        by_subject[s.subject_id] = by_subject.get(s.subject_id, 0) + s.minutes

    activity = _activity_by_day(db, current_user, days, tz)
    quizzes = db.scalars(
        select(Quiz).where(Quiz.user_id == current_user.id, Quiz.completed_at.is_not(None)).order_by(Quiz.completed_at)
    ).all()

    return {
        "daily": [{"date": d, "minutes": activity.get(d, 0)} for d in (start + timedelta(days=i) for i in range(days))],
        "by_subject": [
            {
                "subject_id": sid,
                "name": subjects[sid].name if sid in subjects else "General",
                "color": subjects[sid].color if sid in subjects else "slate",
                "minutes": m,
            }
            for sid, m in sorted(by_subject.items(), key=lambda kv: -kv[1])
        ],
        "quiz_trend": [
            {"date": _as_date(q.completed_at, tz), "title": q.title, "percent": round((q.score or 0) / q.total * 100)} for q in quizzes[-20:]
        ],
        "total_minutes": sum(activity.values()),
        "active_days": sum(1 for m in activity.values() if m),
        "streak": _streak(_activity_by_day(db, current_user, 365, tz), today),
        "subjects": [subject_out(s) for s in subjects.values()],
    }
