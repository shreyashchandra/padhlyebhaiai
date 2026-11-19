from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..catalog import EXAMS, EXAMS_BY_ID, exam_detail, exam_summary
from ..db import get_db
from ..deps import subject_out
from ..models import Subject, User
from ..schemas import CatalogAdd
from .subjects import save_outline

router = APIRouter(prefix="/api/catalog", tags=["catalog"])


def _exam_or_404(exam_id: str):
    exam = EXAMS_BY_ID.get(exam_id)
    if exam is None:
        raise HTTPException(status_code=404, detail="Exam not found in the catalog.")
    return exam


@router.get("")
def list_exams(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    added = {
        (row.catalog_exam_id, row.catalog_subject_key)
        for row in db.execute(
            select(Subject.catalog_exam_id, Subject.catalog_subject_key).where(
                Subject.user_id == current_user.id, Subject.catalog_exam_id.is_not(None)
            )
        )
    }
    exams = []
    for exam in EXAMS:
        data = exam_summary(exam)
        for s in data["subjects"]:
            s["added"] = (exam.id, s["key"]) in added
        exams.append(data)
    return exams


@router.get("/{exam_id}")
def get_exam(exam_id: str, current_user: User = Depends(get_current_user)):
    return exam_detail(_exam_or_404(exam_id))


@router.post("/{exam_id}/add", status_code=201)
def add_exam(exam_id: str, payload: CatalogAdd, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Create subjects pre-filled with the exam's syllabus. Already-added papers are skipped."""
    exam = _exam_or_404(exam_id)
    by_key = {s.key: s for s in exam.subjects}
    unknown = [k for k in payload.subject_keys if k not in by_key]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown subject(s): {', '.join(unknown)}")

    existing = set(
        db.scalars(
            select(Subject.catalog_subject_key).where(Subject.user_id == current_user.id, Subject.catalog_exam_id == exam.id)
        ).all()
    )
    created, skipped = [], []
    for key in dict.fromkeys(payload.subject_keys):
        cat = by_key[key]
        if key in existing:
            skipped.append(cat.name)
            continue
        subject = Subject(
            user_id=current_user.id,
            name=cat.name,
            exam_name=exam.name,
            board_university=exam.conducted_by,
            exam_date=payload.exam_date,
            color=cat.color,
            catalog_exam_id=exam.id,
            catalog_subject_key=key,
        )
        db.add(subject)
        db.flush()
        save_outline(db, subject, cat.outline(), replace=True, source="catalog", default_minutes=cat.est_minutes)
        created.append(subject)

    db.commit()
    for s in created:
        db.refresh(s)
    return {"created": [subject_out(s) for s in created], "skipped": skipped}
