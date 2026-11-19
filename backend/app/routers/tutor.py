import logging

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import ai
from ..auth import get_current_user
from ..billing import ensure_credit_available
from ..config import settings
from ..db import SessionLocal, get_db
from ..deps import get_owned
from ..models import ChatMessage, ChatThread, Subject, User, utcnow
from ..ratelimit import ai_rate_limit
from ..schemas import ThreadCreate
from ..services.documents import read_upload

logger = logging.getLogger("padhlyebhai.tutor")
router = APIRouter(prefix="/api/tutor", tags=["tutor"])

TUTOR_SYSTEM = """You are "Bhai", a patient, sharp personal tutor for a student preparing for exams.

How you teach:
- Start with the core idea in 1-2 lines, then build up with a simple example or analogy.
- For numericals/derivations: solve step by step, show formulas, state units, box the final answer.
- Use Markdown: short headings, bullet points, tables when comparing. Use LaTeX with $...$ (inline) and $$...$$ (block) for math.
- Point out common exam mistakes and how marks are awarded when relevant.
- Match the student's language: if they write in Hinglish, reply in friendly Hinglish; otherwise English.
- Keep answers focused; offer to go deeper instead of dumping everything.
- When you've taught a concept, end with one short "Quick check" question so they can test themselves.
- If an image is attached, first read the question from it carefully, then solve it.
- If you are unsure about a fact, say so instead of guessing."""


def _thread_out(t: ChatThread) -> dict:
    return {"id": t.id, "subject_id": t.subject_id, "title": t.title, "updated_at": t.updated_at}


def _subject_context(subject: Subject | None) -> str:
    if subject is None:
        return ""
    weak = [t.name for t in subject.topics if (t.quiz_total and t.quiz_correct / t.quiz_total < 0.6) or (t.status != "not_started" and 0 < t.confidence <= 2)]
    topics = ", ".join(t.name for t in subject.topics[:80])
    lines = [
        f"\n\nStudent context: studying {subject.name}"
        + (f" for {subject.exam_name}" if subject.exam_name else "")
        + (f" ({subject.board_university})" if subject.board_university else "")
        + (f", {subject.class_semester}" if subject.class_semester else "")
        + ".",
    ]
    if topics:
        lines.append(f"Syllabus topics: {topics}.")
    if weak:
        lines.append(f"Topics they find hard: {', '.join(weak[:10])}.")
    lines.append("Stay within the level of this syllabus.")
    return "\n".join(lines)


@router.get("/threads")
def list_threads(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    threads = db.scalars(
        select(ChatThread).where(ChatThread.user_id == current_user.id).order_by(ChatThread.updated_at.desc()).limit(100)
    ).all()
    return [_thread_out(t) for t in threads]


@router.post("/threads", status_code=201)
def create_thread(payload: ThreadCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if payload.subject_id is not None:
        get_owned(db, Subject, payload.subject_id, current_user, "Subject")
    thread = ChatThread(user_id=current_user.id, subject_id=payload.subject_id, title=payload.title or "New chat")
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return _thread_out(thread)


@router.get("/threads/{thread_id}")
def get_thread(thread_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    thread = get_owned(db, ChatThread, thread_id, current_user, "Chat")
    return {
        **_thread_out(thread),
        "messages": [
            {"id": m.id, "role": m.role, "content": m.content, "has_image": m.has_image, "created_at": m.created_at}
            for m in thread.messages
        ],
    }


@router.delete("/threads/{thread_id}", status_code=204)
def delete_thread(thread_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(get_owned(db, ChatThread, thread_id, current_user, "Chat"))
    db.commit()


@router.post("/threads/{thread_id}/messages")
async def send_message(
    thread_id: int,
    content: str = Form(""),
    image: UploadFile | None = File(None),
    current_user: User = Depends(ai_rate_limit),
    db: Session = Depends(get_db),
):
    thread = get_owned(db, ChatThread, thread_id, current_user, "Chat")
    content = content.strip()[:8000]

    image_url = None
    if image is not None and image.filename:
        parsed = await read_upload(image, max_pdf_pages_as_images=2)
        if parsed.images:
            image_url = parsed.images[0]
        elif parsed.text:
            content = f"{content}\n\n[Attached document text]\n{parsed.text[:8000]}".strip()

    if not content and not image_url:
        raise HTTPException(status_code=400, detail="Type a question or attach a photo.")

    ensure_credit_available(db, current_user.id)
    ai.get_client()

    subject = db.get(Subject, thread.subject_id) if thread.subject_id else None
    history = thread.messages[-16:]
    messages: list[dict] = [{"role": "system", "content": TUTOR_SYSTEM + _subject_context(subject)}]
    messages += [{"role": m.role, "content": m.content} for m in history]

    user_text = content or "Please solve the question in this image step by step."
    if image_url:
        messages.append(
            {"role": "user", "content": [{"type": "text", "text": user_text}, {"type": "image_url", "image_url": {"url": image_url}}]}
        )
    else:
        messages.append({"role": "user", "content": user_text})

    db.add(ChatMessage(thread_id=thread.id, role="user", content=user_text, has_image=bool(image_url)))
    if thread.title == "New chat":
        thread.title = (content or "Photo question")[:60]
    db.commit()

    model = settings.vision_model if image_url else settings.chat_model
    user_id, tid = current_user.id, thread.id

    def generate():
        parts: list[str] = []
        # The request-scoped session is closed once streaming starts, so use our own.
        stream_db = SessionLocal()
        try:
            for chunk in ai.chat_stream(stream_db, user_id, messages, model=model):
                parts.append(chunk)
                yield chunk
        except Exception:
            logger.exception("Tutor stream failed")
            note = "\n\n_Sorry, the answer was cut off by a server error. Please try again._"
            parts.append(note)
            yield note
        finally:
            answer = "".join(parts).strip()
            if answer:
                stream_db.add(ChatMessage(thread_id=tid, role="assistant", content=answer))
                t = stream_db.get(ChatThread, tid)
                if t is not None:
                    t.updated_at = utcnow()
                stream_db.commit()
            stream_db.close()

    return StreamingResponse(
        generate(),
        media_type="text/plain; charset=utf-8",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
