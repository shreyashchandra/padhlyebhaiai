from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ai
from ..auth import get_current_user
from ..billing import pdf_parse_estimate_usd, vision_parse_estimate_usd
from ..config import settings
from ..db import get_db
from ..deps import get_owned, get_owned_topic, subject_out, topic_out
from ..models import Subject, Topic, Unit, User
from ..ratelimit import ai_rate_limit
from ..schemas import SubjectCreate, SubjectUpdate, TopicCreate, TopicUpdate, UnitCreate, UnitUpdate
from ..services.documents import read_upload

router = APIRouter(prefix="/api/subjects", tags=["subjects"])

SYLLABUS_SYSTEM = """You turn exam syllabi into a clean, structured study outline.
Return JSON only, shaped exactly as:
{
  "subject_guess": "",
  "exam_guess": "",
  "units": [
    {"name": "Unit name", "topics": [
      {"name": "Topic name", "priority": "must|should|low", "est_minutes": 60}
    ]}
  ]
}
Rules:
- Keep the syllabus's own unit order and wording; split long comma lists into separate topics.
- A topic should be one sitting-sized concept (roughly 30-150 minutes of study).
- priority: "must" for core/high-weightage/foundational topics, "low" only for peripheral ones.
- est_minutes: realistic first-pass study time for an average student (include practice).
- Do not invent topics that are not in the syllabus."""


def _owned_subject(db: Session, subject_id: int, user: User) -> Subject:
    return get_owned(db, Subject, subject_id, user, "Subject")


@router.get("")
def list_subjects(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subjects = db.scalars(
        select(Subject).where(Subject.user_id == current_user.id).order_by(Subject.exam_date.is_(None), Subject.exam_date, Subject.id)
    ).all()
    return [subject_out(s) for s in subjects]


@router.post("", status_code=201)
def create_subject(payload: SubjectCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subject = Subject(user_id=current_user.id, **payload.model_dump())
    db.add(subject)
    db.commit()
    db.refresh(subject)
    return subject_out(subject, include_topics=True)


@router.get("/{subject_id}")
def get_subject(subject_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return subject_out(_owned_subject(db, subject_id, current_user), include_topics=True)


@router.patch("/{subject_id}")
def update_subject(
    subject_id: int,
    payload: SubjectUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subject = _owned_subject(db, subject_id, current_user)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(subject, key, value)
    db.commit()
    db.refresh(subject)
    return subject_out(subject, include_topics=True)


@router.delete("/{subject_id}", status_code=204)
def delete_subject(subject_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_owned_subject(db, subject_id, current_user))
    db.commit()


@router.post("/{subject_id}/syllabus")
async def import_syllabus(
    subject_id: int,
    text: str = Form(""),
    replace: bool = Form(True),
    file: UploadFile | None = File(None),
    current_user: User = Depends(ai_rate_limit),
    db: Session = Depends(get_db),
):
    """Parse a syllabus (PDF, photo or pasted text) into units and topics."""
    subject = _owned_subject(db, subject_id, current_user)

    syllabus_text = text.strip()
    images: list[str] = []
    extra_cost = 0.0
    if file is not None and file.filename:
        parsed = await read_upload(file)
        syllabus_text = "\n\n".join(p for p in (syllabus_text, parsed.text) if p)
        images = parsed.images
        extra_cost = pdf_parse_estimate_usd if parsed.kind == "pdf" else vision_parse_estimate_usd

    if not syllabus_text and not images:
        raise HTTPException(status_code=400, detail="Upload a syllabus file or paste the syllabus text.")

    context = f"Subject: {subject.name}. Exam: {subject.exam_name or 'unknown'}. Board/University: {subject.board_university or 'unknown'}."
    content: list[dict] = [{"type": "text", "text": f"{context}\n\nSyllabus:\n{syllabus_text[:15000] or '(see images)'}"}]
    content += [{"type": "image_url", "image_url": {"url": url}} for url in images[:3]]

    outline = ai.chat_json(
        db,
        current_user.id,
        SYLLABUS_SYSTEM,
        content,
        model=settings.vision_model if images else settings.planner_model,
        temperature=0,
        extra_cost=extra_cost,
    )

    if not save_outline(db, subject, outline.get("units", []), replace=replace, source="upload"):
        raise HTTPException(status_code=422, detail="Couldn't find any topics in that syllabus. Try a clearer photo or paste the text.")

    subject.syllabus_text = (syllabus_text or subject.syllabus_text or "")[:50000] or None
    if not subject.exam_name and outline.get("exam_guess"):
        subject.exam_name = str(outline["exam_guess"])[:160]
    db.commit()
    db.refresh(subject)
    return subject_out(subject, include_topics=True)


GENERATE_SYSTEM = SYLLABUS_SYSTEM + """
You are drafting the syllabus from your own knowledge of the official, publicly published
syllabus for the named exam/board/course (no document is provided). Use the official
unit/chapter names. If you do not recognise the exam well enough to be reasonably accurate,
return {"units": []} instead of guessing."""


@router.post("/{subject_id}/syllabus/generate")
def generate_syllabus(
    subject_id: int,
    replace: bool = True,
    current_user: User = Depends(ai_rate_limit),
    db: Session = Depends(get_db),
):
    """Draft a syllabus with AI for exams that aren't in the catalog."""
    subject = _owned_subject(db, subject_id, current_user)
    if not (subject.exam_name or subject.board_university or subject.class_semester):
        raise HTTPException(status_code=400, detail="Add the exam, board/university or class first so AI knows which syllabus to draft.")
    prompt = (
        f"Subject: {subject.name}\nExam: {subject.exam_name or '-'}\n"
        f"Board/University: {subject.board_university or '-'}\nClass/Semester: {subject.class_semester or '-'}\n"
        "Draft the complete official syllabus for this subject."
    )
    outline = ai.chat_json(db, current_user.id, GENERATE_SYSTEM, prompt, temperature=0)
    if not save_outline(db, subject, outline.get("units", []), replace=replace, source="ai"):
        raise HTTPException(
            status_code=422,
            detail="AI isn't confident about this exam's syllabus. Upload or paste the official syllabus instead.",
        )
    db.commit()
    db.refresh(subject)
    return subject_out(subject, include_topics=True)


def save_outline(db: Session, subject: Subject, units: list, replace: bool, source: str, default_minutes: int = 60) -> bool:
    """Write units/topics from an outline ({name, topics: [str | {name, priority, est_minutes}]})."""
    units = [u for u in units if isinstance(u, dict) and u.get("topics")]
    if not units:
        return False

    if replace:
        for t in list(subject.topics):
            db.delete(t)
        for u in list(subject.units):
            db.delete(u)
        db.flush()
        db.expire(subject, ["topics", "units"])
        unit_offset = topic_offset = 0
    else:
        unit_offset = len(subject.units)
        topic_offset = len(subject.topics)

    for ui, unit_data in enumerate(units):
        unit = Unit(subject_id=subject.id, name=str(unit_data.get("name") or f"Unit {ui + 1}")[:255], position=unit_offset + ui)
        db.add(unit)
        db.flush()
        for topic_data in unit_data["topics"]:
            if isinstance(topic_data, str):
                topic_data = {"name": topic_data}
            name = str(topic_data.get("name") or "").strip()
            if not name:
                continue
            priority = topic_data.get("priority") if topic_data.get("priority") in ("must", "should", "low") else "should"
            try:
                est = int(topic_data.get("est_minutes") or default_minutes)
            except (TypeError, ValueError):
                est = default_minutes
            db.add(
                Topic(
                    subject_id=subject.id,
                    unit_id=unit.id,
                    name=name[:255],
                    priority=priority,
                    est_minutes=min(300, max(20, est)),
                    position=topic_offset,
                )
            )
            topic_offset += 1
    subject.syllabus_source = source if replace or not subject.syllabus_source else subject.syllabus_source
    return True


# ---------- units ----------
@router.post("/{subject_id}/units", status_code=201)
def add_unit(subject_id: int, payload: UnitCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    subject = _owned_subject(db, subject_id, current_user)
    unit = Unit(subject_id=subject.id, name=payload.name.strip(), position=len(subject.units))
    db.add(unit)
    db.commit()
    return {"id": unit.id, "name": unit.name, "position": unit.position}


def _owned_unit(db: Session, unit_id: int, user: User) -> Unit:
    unit = db.get(Unit, unit_id)
    if unit is None or unit.subject.user_id != user.id:
        raise HTTPException(status_code=404, detail="Unit not found.")
    return unit


@router.patch("/units/{unit_id}")
def rename_unit(unit_id: int, payload: UnitUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    unit = _owned_unit(db, unit_id, current_user)
    unit.name = payload.name.strip()
    db.commit()
    return {"id": unit.id, "name": unit.name, "position": unit.position}


@router.delete("/units/{unit_id}", status_code=204)
def delete_unit(unit_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Delete a unit together with its topics."""
    unit = _owned_unit(db, unit_id, current_user)
    for topic in db.scalars(select(Topic).where(Topic.unit_id == unit.id)).all():
        db.delete(topic)
    db.delete(unit)
    db.commit()


@router.post("/{subject_id}/topics", status_code=201)
def add_topic(
    subject_id: int,
    payload: TopicCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    subject = _owned_subject(db, subject_id, current_user)
    if payload.unit_id is not None and payload.unit_id not in {u.id for u in subject.units}:
        raise HTTPException(status_code=400, detail="Unit does not belong to this subject.")
    subject.syllabus_source = subject.syllabus_source or "manual"
    topic = Topic(
        subject_id=subject.id,
        unit_id=payload.unit_id,
        name=payload.name.strip(),
        priority=payload.priority,
        position=len(subject.topics),
    )
    db.add(topic)
    db.commit()
    db.refresh(topic)
    return topic_out(topic)


@router.patch("/topics/{topic_id}")
def update_topic(
    topic_id: int,
    payload: TopicUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    topic = get_owned_topic(db, topic_id, current_user)
    data = payload.model_dump(exclude_unset=True)
    if data.get("unit_id") is not None and data["unit_id"] not in {u.id for u in topic.subject.units}:
        raise HTTPException(status_code=400, detail="Unit does not belong to this subject.")
    for key, value in data.items():
        setattr(topic, key, value)
    if data.get("status") in ("learning", "done", "revised"):
        topic.last_studied_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(topic)
    return topic_out(topic)


@router.delete("/topics/{topic_id}", status_code=204)
def delete_topic(topic_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned_topic(db, topic_id, current_user))
    db.commit()
