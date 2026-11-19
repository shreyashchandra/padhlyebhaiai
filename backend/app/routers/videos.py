import re

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import get_owned, get_owned_topic
from ..models import StudyTask, Subject, User
from ..ratelimit import video_rate_limit
from ..services import youtube

router = APIRouter(prefix="/api/videos", tags=["videos"])

TITLE_PREFIX = re.compile(r"^(Learn|Revise weak topic|Quick recall|Full revision|Timed mock paper):\s*", re.I)


def _subject_bits(subject: Subject | None) -> tuple[str | None, str | None]:
    if subject is None:
        return None, None
    return subject.name, subject.exam_name or subject.class_semester


@router.get("/topic/{topic_id}")
def videos_for_topic(
    topic_id: int,
    lang: str = Query("en", pattern="^(en|hi)$"),
    current_user: User = Depends(video_rate_limit),
    db: Session = Depends(get_db),
):
    topic = get_owned_topic(db, topic_id, current_user)
    subject_name, exam = _subject_bits(topic.subject)
    return youtube.suggest(db, youtube.build_query(topic.name, subject_name, exam, lang), lang)


@router.get("/task/{task_id}")
def videos_for_task(
    task_id: int,
    lang: str = Query("en", pattern="^(en|hi)$"),
    current_user: User = Depends(video_rate_limit),
    db: Session = Depends(get_db),
):
    task = get_owned(db, StudyTask, task_id, current_user, "Task")
    subject = db.get(Subject, task.subject_id) if task.subject_id else None
    subject_name, exam = _subject_bits(subject)

    if task.topic_id:
        topic = get_owned_topic(db, task.topic_id, current_user)
        query = youtube.build_query(topic.name, subject_name, exam, lang)
    elif task.kind == "revise":
        query = " ".join(p for p in (subject_name, exam, "full revision one shot", "in Hindi" if lang == "hi" else "") if p)
    elif task.kind == "mock":
        query = " ".join(p for p in (exam, subject_name, "previous year paper solution", "in Hindi" if lang == "hi" else "") if p)
    else:
        query = youtube.build_query(TITLE_PREFIX.sub("", task.title), subject_name, exam, lang)
    return youtube.suggest(db, query, lang)
