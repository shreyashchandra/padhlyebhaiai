import json
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from .. import ai
from ..auth import get_current_user
from ..billing import web_research_estimate_usd
from ..db import get_db
from ..deps import client_tz, get_owned, local_today, task_out
from ..models import StudyPlan, StudyTask, Subject, Topic, User
from ..ratelimit import ai_rate_limit
from ..schemas import PlanCreate, TaskCreate, TaskUpdate
from ..services import research
from ..services.scheduler import SubjectIn, TopicIn, build_schedule

router = APIRouter(prefix="/api", tags=["plans"])

PRIORITY_SYSTEM = """You are an expert exam strategist for Indian and international students.
Given subjects with their topics, the exam context and optional web research, decide
how important each topic is and how long it realistically needs.

Return JSON only:
{
  "topics": [{"id": 123, "priority": "must|should|low", "est_minutes": 60, "note": "why / tip, max 15 words"}],
  "insights_markdown": "..."
}

Rules:
- Include EVERY topic id you were given exactly once.
- Never mark a foundational topic as "low"; "low" is only for peripheral, rarely-asked topics.
- est_minutes covers first-time learning plus a little practice; scale with difficulty (20-240).
- Adjust for the student's confidence (0-5): high confidence -> fewer minutes.
- Prefer the official syllabus over web sources when they conflict; treat past-paper
  patterns as guidance, not certainty.
- insights_markdown: concise Markdown with sections "## Strategy", "## High-weightage areas",
  "## Common mistakes to avoid", "## Exam-day tips". Mention specific topics by name.
  Keep it under 350 words, practical and encouraging."""


def _plan_out(plan: StudyPlan, include_tasks: bool = True, db: Session | None = None) -> dict:
    tasks = plan.tasks
    total = len(tasks)
    done = sum(1 for t in tasks if t.done)
    data = {
        "id": plan.id,
        "title": plan.title,
        "start_date": plan.start_date,
        "end_date": plan.end_date,
        "daily_minutes": plan.daily_minutes,
        "session_minutes": plan.session_minutes,
        "study_days": plan.study_days,
        "subject_ids": plan.subject_ids,
        "prep_mode": plan.prep_mode,
        "insights_markdown": plan.insights_markdown,
        "sources": plan.sources or [],
        "unscheduled": plan.unscheduled or [],
        "is_active": plan.is_active,
        "created_at": plan.created_at,
        "task_count": total,
        "done_count": done,
        "overdue_count": sum(1 for t in tasks if not t.done and t.date < date.today()),
    }
    if include_tasks:
        data["tasks"] = [task_out(t) for t in tasks]
        if db is not None:
            # The student's own tasks (not tied to a plan) that fall inside this plan's dates.
            manual = db.scalars(
                select(StudyTask).where(
                    StudyTask.user_id == plan.user_id,
                    StudyTask.plan_id.is_(None),
                    StudyTask.date >= plan.start_date,
                    StudyTask.date <= plan.end_date,
                )
            ).all()
            data["tasks"] = sorted(data["tasks"] + [task_out(t) for t in manual], key=lambda t: (t["date"], t["id"]))
    return data


def _ai_prioritize(db: Session, user: User, subjects: list[Subject], payload: PlanCreate) -> tuple[str, list]:
    pending = [t for s in subjects for t in s.topics if t.status not in ("revised",)]
    if not pending:
        return "", []

    research_text, sources, search_calls, extra = "", [], 0, 0.0
    if payload.web_research and research.research_available():
        queries = []
        for s in subjects[:3]:
            queries += research.build_queries(
                s.exam_name or "", s.board_university or "", s.class_semester or "", s.name, [t.name for t in s.topics[:4]]
            )[:2]
        found = research.run_research(queries[:6])
        research_text, sources = found["text"], found["sources"]
        search_calls, extra = len(queries[:6]), web_research_estimate_usd

    subject_blocks = []
    for s in subjects:
        subject_blocks.append(
            {
                "subject": s.name,
                "exam": s.exam_name,
                "board_university": s.board_university,
                "class_semester": s.class_semester,
                "exam_date": s.exam_date.isoformat() if s.exam_date else None,
                "topics": [
                    {
                        "id": t.id,
                        "name": t.name,
                        "status": t.status,
                        "confidence": t.confidence,
                        "quiz_accuracy": round(t.quiz_correct / t.quiz_total * 100) if t.quiz_total else None,
                    }
                    for t in s.topics
                    if t.status != "revised"
                ],
            }
        )

    days_available = (payload.end_date - payload.start_date).days + 1
    prompt = (
        f"Preparation mode: {payload.prep_mode}. Plan window: {payload.start_date} to {payload.end_date} "
        f"({days_available} days, {len(payload.study_days)} study days/week, {payload.daily_minutes} min/day).\n\n"
        f"Subjects and topics:\n{json.dumps(subject_blocks, default=str)[:20000]}\n\n"
        f"Web research:\n{research_text or 'None'}"
    )
    result = ai.chat_json(db, user.id, PRIORITY_SYSTEM, prompt, extra_cost=extra, search_calls=search_calls)

    by_id = {t.id: t for t in pending}
    for item in result.get("topics", []):
        if not isinstance(item, dict):
            continue
        topic = by_id.get(item.get("id"))
        if topic is None:
            continue
        if item.get("priority") in ("must", "should", "low"):
            topic.priority = item["priority"]
        try:
            topic.est_minutes = min(300, max(20, int(item.get("est_minutes") or topic.est_minutes)))
        except (TypeError, ValueError):
            pass
        if item.get("note"):
            topic.note = str(item["note"])[:300]
    db.flush()
    return str(result.get("insights_markdown") or ""), sources


def _schedule_into(db: Session, plan: StudyPlan, user: User, start: date) -> None:
    subjects = db.scalars(select(Subject).where(Subject.id.in_(plan.subject_ids), Subject.user_id == user.id)).all()

    done_minutes: dict[int, int] = {}
    for t in plan.tasks:
        if t.done and t.kind == "learn" and t.topic_id:
            done_minutes[t.topic_id] = done_minutes.get(t.topic_id, 0) + t.minutes

    result = build_schedule(
        start=start,
        end=plan.end_date,
        study_days=plan.study_days,
        daily_minutes=plan.daily_minutes,
        session_minutes=plan.session_minutes,
        subjects=[SubjectIn(s.id, s.name, s.exam_date) for s in subjects],
        topics=[
            TopicIn(
                id=t.id,
                subject_id=s.id,
                name=t.name,
                priority=t.priority,
                est_minutes=t.est_minutes,
                status=t.status,
                confidence=t.confidence,
                position=t.position,
                done_minutes=done_minutes.get(t.id, 0),
            )
            for s in subjects
            for t in s.topics
        ],
        mode=plan.prep_mode,
    )
    for i, task in enumerate(result.tasks):
        db.add(
            StudyTask(
                plan_id=plan.id,
                user_id=user.id,
                subject_id=task.subject_id,
                topic_id=task.topic_id,
                date=task.date,
                title=task.title,
                kind=task.kind,
                minutes=task.minutes,
                position=i,
            )
        )
    plan.unscheduled = result.unscheduled


@router.post("/plans", status_code=201)
def create_plan(payload: PlanCreate, current_user: User = Depends(ai_rate_limit), db: Session = Depends(get_db)):
    if payload.start_date > payload.end_date:
        raise HTTPException(status_code=400, detail="Start date cannot be after end date.")
    if (payload.end_date - payload.start_date).days > 366:
        raise HTTPException(status_code=400, detail="Plans can cover at most one year.")

    subjects = [get_owned(db, Subject, sid, current_user, "Subject") for sid in dict.fromkeys(payload.subject_ids)]
    if not any(s.topics for s in subjects):
        raise HTTPException(status_code=400, detail="Add a syllabus or topics to at least one selected subject first.")

    insights, sources = ("", [])
    if payload.use_ai_priorities:
        insights, sources = _ai_prioritize(db, current_user, subjects, payload)

    for old in db.scalars(select(StudyPlan).where(StudyPlan.user_id == current_user.id, StudyPlan.is_active.is_(True))):
        old.is_active = False

    plan = StudyPlan(
        user_id=current_user.id,
        title=" + ".join(s.name for s in subjects)[:200],
        start_date=payload.start_date,
        end_date=payload.end_date,
        daily_minutes=payload.daily_minutes,
        session_minutes=payload.session_minutes,
        study_days=list(payload.study_days),
        subject_ids=[s.id for s in subjects],
        prep_mode=payload.prep_mode,
        insights_markdown=insights or None,
        sources=sources,
        is_active=True,
    )
    db.add(plan)
    db.flush()
    _schedule_into(db, plan, current_user, payload.start_date)
    db.commit()
    db.refresh(plan)
    return _plan_out(plan)


@router.get("/plans")
def list_plans(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plans = db.scalars(select(StudyPlan).where(StudyPlan.user_id == current_user.id).order_by(StudyPlan.created_at.desc())).all()
    return [_plan_out(p, include_tasks=False) for p in plans]


@router.get("/plans/{plan_id}")
def get_plan(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _plan_out(get_owned(db, StudyPlan, plan_id, current_user, "Plan"), db=db)


@router.post("/plans/{plan_id}/activate")
def activate_plan(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = get_owned(db, StudyPlan, plan_id, current_user, "Plan")
    for other in db.scalars(select(StudyPlan).where(StudyPlan.user_id == current_user.id)):
        other.is_active = other.id == plan.id
    db.commit()
    return _plan_out(plan, include_tasks=False)


@router.delete("/plans/{plan_id}", status_code=204)
def delete_plan(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, StudyPlan, plan_id, current_user, "Plan"))
    db.commit()


@router.post("/plans/{plan_id}/rebalance")
def rebalance_plan(
    plan_id: int,
    tz: ZoneInfo = Depends(client_tz),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reschedule all unfinished work from today, keeping completed tasks."""
    plan = get_owned(db, StudyPlan, plan_id, current_user, "Plan")
    today = local_today(tz)
    if today > plan.end_date:
        raise HTTPException(status_code=400, detail="This plan has ended. Create a new plan instead.")

    for task in list(plan.tasks):
        if not task.done:
            plan.tasks.remove(task)
            db.delete(task)
    db.flush()
    _schedule_into(db, plan, current_user, max(today, plan.start_date))
    db.commit()
    db.refresh(plan)
    return _plan_out(plan, db=db)


# ---------- tasks ----------
def _active_task_filter(user: User):
    active_ids = select(StudyPlan.id).where(StudyPlan.user_id == user.id, StudyPlan.is_active.is_(True))
    return (StudyTask.user_id == user.id) & or_(StudyTask.plan_id.is_(None), StudyTask.plan_id.in_(active_ids))


@router.get("/tasks")
def list_tasks(
    start: date = Query(...),
    end: date = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tasks = db.scalars(
        select(StudyTask)
        .where(_active_task_filter(current_user), StudyTask.date >= start, StudyTask.date <= end)
        .order_by(StudyTask.date, StudyTask.position, StudyTask.id)
    ).all()
    return [task_out(t) for t in tasks]


@router.post("/tasks", status_code=201)
def create_task(payload: TaskCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.subject_id is not None:
        get_owned(db, Subject, payload.subject_id, current_user, "Subject")
    task = StudyTask(user_id=current_user.id, kind="practice", position=999, **payload.model_dump())
    db.add(task)
    db.commit()
    db.refresh(task)
    return task_out(task)


@router.patch("/tasks/{task_id}")
def update_task(
    task_id: int,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    task = get_owned(db, StudyTask, task_id, current_user, "Task")
    if payload.date is not None:
        task.date = payload.date
    if payload.done is not None and payload.done != task.done:
        task.done = payload.done
        task.done_at = datetime.now(timezone.utc) if payload.done else None
        if payload.done and task.topic_id:
            _advance_topic(db, task)
    db.commit()
    db.refresh(task)
    return task_out(task)


def _advance_topic(db: Session, task: StudyTask) -> None:
    topic = db.get(Topic, task.topic_id)
    if topic is None:
        return
    topic.last_studied_at = datetime.now(timezone.utc)
    if task.kind == "learn":
        siblings = db.scalars(
            select(StudyTask).where(StudyTask.plan_id == task.plan_id, StudyTask.topic_id == topic.id, StudyTask.kind == "learn")
        ).all()
        all_done = all(t.done or t.id == task.id for t in siblings)
        if topic.status in ("not_started", "learning"):
            topic.status = "done" if all_done else "learning"
    elif task.kind == "revise" and topic.status == "done":
        topic.status = "revised"
        topic.confidence = max(topic.confidence, 3)


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, StudyTask, task_id, current_user, "Task"))
    db.commit()
