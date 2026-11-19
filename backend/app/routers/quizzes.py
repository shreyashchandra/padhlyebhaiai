import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ai
from ..auth import get_current_user
from ..db import get_db
from ..deps import get_owned
from ..models import Quiz, Subject, Topic, User
from ..ratelimit import ai_rate_limit
from ..schemas import QuizCreate, QuizSubmit

router = APIRouter(prefix="/api/quizzes", tags=["quizzes"])

QUIZ_SYSTEM = """You write high-quality exam practice questions.
Return JSON only:
{"questions": [{"question": "", "options": ["", "", "", ""], "answer": 0, "explanation": "", "topic_id": 0}]}
Rules:
- Exactly 4 options per question, exactly one correct; "answer" is the 0-based index of it.
- Vary the position of the correct option.
- Distractors must be plausible (common misconceptions), never silly.
- Mix conceptual, application and (where the subject has them) numerical questions.
- "explanation": 1-3 sentences on why the answer is right and the key trap.
- Use LaTeX with $...$ for math.
- "topic_id" must be one of the given topic ids.
- Match the requested difficulty; "exam" means the style and level of real board/university papers."""


def _public_question(q: dict, index: int) -> dict:
    return {"index": index, "question": q["question"], "options": q["options"], "topic_id": q.get("topic_id")}


def _quiz_out(quiz: Quiz) -> dict:
    data = {
        "id": quiz.id,
        "subject_id": quiz.subject_id,
        "title": quiz.title,
        "difficulty": quiz.difficulty,
        "total": quiz.total,
        "score": quiz.score,
        "created_at": quiz.created_at,
        "completed_at": quiz.completed_at,
    }
    if quiz.completed_at is None:
        data["questions"] = [_public_question(q, i) for i, q in enumerate(quiz.questions)]
    else:
        data["questions"] = [
            {**_public_question(q, i), "answer": q["answer"], "explanation": q.get("explanation", ""), "chosen": (quiz.answers or [None] * quiz.total)[i]}
            for i, q in enumerate(quiz.questions)
        ]
    return data


@router.get("")
def list_quizzes(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    quizzes = db.scalars(select(Quiz).where(Quiz.user_id == current_user.id).order_by(Quiz.created_at.desc()).limit(50)).all()
    return [{k: v for k, v in _quiz_out(q).items() if k != "questions"} for q in quizzes]


@router.post("", status_code=201)
def create_quiz(payload: QuizCreate, current_user: User = Depends(ai_rate_limit), db: Session = Depends(get_db)):
    subject = get_owned(db, Subject, payload.subject_id, current_user, "Subject")
    topics = subject.topics
    if payload.topic_ids:
        wanted = set(payload.topic_ids)
        topics = [t for t in topics if t.id in wanted]
    elif payload.focus_weak:
        scored = sorted(
            topics,
            key=lambda t: ((t.quiz_correct / t.quiz_total) if t.quiz_total else 0.7, t.confidence),
        )
        topics = [t for t in scored if t.status != "not_started"][:6] or scored[:6]
    if not topics:
        raise HTTPException(status_code=400, detail="This subject has no topics yet. Import a syllabus first.")

    topic_list = [{"id": t.id, "name": t.name} for t in topics[:40]]
    prompt = (
        f"Subject: {subject.name}. Exam: {subject.exam_name or 'general'} "
        f"{subject.board_university or ''} {subject.class_semester or ''}.\n"
        f"Difficulty: {payload.difficulty}. Number of questions: {payload.count}.\n"
        f"Spread questions across these topics: {json.dumps(topic_list)}"
    )
    result = ai.chat_json(db, current_user.id, QUIZ_SYSTEM, prompt, temperature=0.6)

    valid_topic_ids = {t["id"] for t in topic_list}
    questions = []
    for q in result.get("questions", []):
        try:
            options = [str(o) for o in q["options"]][:4]
            answer = int(q["answer"])
            if len(options) != 4 or not 0 <= answer < 4 or not str(q["question"]).strip():
                continue
        except (KeyError, TypeError, ValueError):
            continue
        topic_id = q.get("topic_id") if q.get("topic_id") in valid_topic_ids else None
        questions.append(
            {"question": str(q["question"]), "options": options, "answer": answer, "explanation": str(q.get("explanation", "")), "topic_id": topic_id}
        )
    if len(questions) < 2:
        raise HTTPException(status_code=502, detail="Couldn't generate a good quiz this time. Please try again.")

    title = topics[0].name if len(topics) == 1 else f"{subject.name} - {'weak topics' if payload.focus_weak and not payload.topic_ids else 'mixed'}"
    quiz = Quiz(
        user_id=current_user.id,
        subject_id=subject.id,
        title=title[:255],
        difficulty=payload.difficulty,
        questions=questions[: payload.count],
        total=min(len(questions), payload.count),
    )
    db.add(quiz)
    db.commit()
    db.refresh(quiz)
    return _quiz_out(quiz)


@router.get("/{quiz_id}")
def get_quiz(quiz_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _quiz_out(get_owned(db, Quiz, quiz_id, current_user, "Quiz"))


@router.post("/{quiz_id}/submit")
def submit_quiz(quiz_id: int, payload: QuizSubmit, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    quiz = get_owned(db, Quiz, quiz_id, current_user, "Quiz")
    if quiz.completed_at is not None:
        raise HTTPException(status_code=400, detail="This quiz was already submitted.")
    answers = (list(payload.answers) + [None] * quiz.total)[: quiz.total]

    score = 0
    per_topic: dict[int, list[int]] = {}
    for q, chosen in zip(quiz.questions, answers):
        correct = chosen is not None and chosen == q["answer"]
        score += int(correct)
        if q.get("topic_id"):
            stats = per_topic.setdefault(q["topic_id"], [0, 0])
            stats[0] += int(correct)
            stats[1] += 1

    for topic_id, (right, total) in per_topic.items():
        topic = db.get(Topic, topic_id)
        if topic is None or topic.subject_id != quiz.subject_id:
            continue
        topic.quiz_correct += right
        topic.quiz_total += total
        accuracy = right / total
        if accuracy >= 0.8:
            topic.confidence = max(topic.confidence, 4)
        elif accuracy < 0.5:
            topic.confidence = min(topic.confidence or 2, 2)

    quiz.answers = answers
    quiz.score = score
    quiz.completed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(quiz)
    return _quiz_out(quiz)


@router.delete("/{quiz_id}", status_code=204)
def delete_quiz(quiz_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, Quiz, quiz_id, current_user, "Quiz"))
    db.commit()
