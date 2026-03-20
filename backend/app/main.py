import io
import json
import os
from datetime import date
from typing import Optional

import cloudinary
import cloudinary.uploader
import fitz
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
from sqlalchemy import select
from sqlalchemy.orm import Session
from tavily import TavilyClient

from .auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from .billing import (
    ensure_credit_available,
    estimate_openai_cost,
    get_credit_summary,
    pdf_parse_estimate_usd,
    read_usage_field,
    record_usage,
    vision_parse_estimate_usd,
    web_research_estimate_usd,
)
from .db import Base, engine, get_db
from .models import User
from .schemas import (
    AuthResponse,
    BillingSummaryOut,
    MeResponse,
    UserLogin,
    UserRegister,
)

load_dotenv()

app = FastAPI(title="PadhLyeBhaiAI API")

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    Base.metadata.create_all(bind=engine)


openai_api_key = os.getenv("OPENAI_API_KEY")
if not openai_api_key:
    raise RuntimeError("OPENAI_API_KEY is missing in .env")

client = OpenAI(api_key=openai_api_key)

vision_model = os.getenv("OPENAI_VISION_MODEL", "gpt-4o")
planner_model = os.getenv("OPENAI_PLANNER_MODEL", "gpt-4.1-mini")

cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME")
cloudinary_api_key = os.getenv("CLOUDINARY_API_KEY")
cloudinary_api_secret = os.getenv("CLOUDINARY_API_SECRET")

if cloud_name and cloudinary_api_key and cloudinary_api_secret:
    cloudinary.config(
        cloud_name=cloud_name,
        api_key=cloudinary_api_key,
        api_secret=cloudinary_api_secret,
    )

tavily_api_key = os.getenv("TAVILY_API_KEY")
tavily_client = TavilyClient(api_key=tavily_api_key) if tavily_api_key else None


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.post("/api/auth/register", response_model=AuthResponse, status_code=201)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    existing_user = db.scalar(
        select(User).where(User.email == payload.email.lower())
    )

    if existing_user:
        raise HTTPException(status_code=409, detail="Account already exists.")

    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token = create_access_token(user.id)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
        "billing": get_credit_summary(db, user.id),
    }


@app.post("/api/auth/login", response_model=AuthResponse)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password.",
        )

    access_token = create_access_token(user.id)

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": user,
        "billing": get_credit_summary(db, user.id),
    }


@app.get("/api/auth/me", response_model=MeResponse)
def me(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return {
        "user": current_user,
        "billing": get_credit_summary(db, current_user.id),
    }


@app.get("/api/billing/summary", response_model=BillingSummaryOut)
def billing_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_credit_summary(db, current_user.id)


def parse_bool(value: str) -> bool:
    return str(value).strip().lower() in {"true", "1", "yes", "on"}


def ensure_cloudinary_configured():
    if not all([cloud_name, cloudinary_api_key, cloudinary_api_secret]):
        raise HTTPException(
            status_code=500,
            detail=(
                "Cloudinary is not configured. Add CLOUDINARY_CLOUD_NAME, "
                "CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET in backend/.env."
            ),
        )


def upload_bytes_to_cloudinary(
    file_bytes: bytes,
    filename: str,
    file_format: Optional[str] = None,
) -> str:
    ensure_cloudinary_configured()

    file_obj = io.BytesIO(file_bytes)
    file_obj.name = filename

    result = cloudinary.uploader.upload(
        file_obj,
        folder="padhlyebhaiai",
        resource_type="image",
        format=file_format,
    )
    return result["secure_url"]


def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    pages = []

    try:
        for index in range(len(document)):
            page = document.load_page(index)
            text = page.get_text("text").strip()
            if text:
                pages.append(f"Page {index + 1}:\n{text}")
    finally:
        document.close()

    return "\n\n".join(pages)


def render_pdf_pages_to_urls(pdf_bytes: bytes, max_pages: int = 4) -> list[str]:
    if not all([cloud_name, cloudinary_api_key, cloudinary_api_secret]):
        return []

    document = fitz.open(stream=pdf_bytes, filetype="pdf")
    page_urls = []

    try:
        total_pages = min(len(document), max_pages)

        for index in range(total_pages):
            page = document.load_page(index)
            pixmap = page.get_pixmap(matrix=fitz.Matrix(2, 2))
            image_bytes = pixmap.tobytes("png")

            url = upload_bytes_to_cloudinary(
                image_bytes,
                filename=f"pdf-page-{index + 1}.png",
                file_format="png",
            )
            page_urls.append(url)
    finally:
        document.close()

    return page_urls


def extract_syllabus_outline(
    preview_urls: list[str],
    syllabus_text: str,
) -> dict:
    if not preview_urls and not syllabus_text.strip():
        return {
            "exam_name_guess": "",
            "subject_guess": "",
            "units": [],
            "all_topics": [],
        }

    content = [
        {
            "type": "text",
            "text": """
Extract the syllabus details from the given image/PDF content.

Return only valid JSON with this exact shape:
{
  "exam_name_guess": "",
  "subject_guess": "",
  "units": [
    {
      "name": "",
      "topics": ["", ""]
    }
  ],
  "all_topics": ["", ""]
}
""".strip(),
        }
    ]

    if syllabus_text.strip():
        content.append(
            {
                "type": "text",
                "text": f"Extracted PDF text:\n\n{syllabus_text[:12000]}",
            }
        )

    for url in preview_urls[:3]:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": url},
            }
        )

    response = client.chat.completions.create(
        model=vision_model,
        temperature=0,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You extract structured syllabus data. "
                    "Return JSON only."
                ),
            },
            {
                "role": "user",
                "content": content,
            },
        ],
    )

    raw_content = response.choices[0].message.content or "{}"
    parsed = json.loads(raw_content)

    return {
        "exam_name_guess": parsed.get("exam_name_guess", ""),
        "subject_guess": parsed.get("subject_guess", ""),
        "units": parsed.get("units", []),
        "all_topics": parsed.get("all_topics", []),
    }


def build_research_queries(
    exam_name: str,
    board_university: str,
    class_semester: str,
    subject_name: str,
    extracted_topics: list[str],
) -> list[str]:
    parts = [
        exam_name.strip(),
        board_university.strip(),
        class_semester.strip(),
        subject_name.strip(),
    ]
    base_context = " ".join([part for part in parts if part])

    topic_seed = ", ".join(extracted_topics[:5])

    queries = [
        f"{base_context} important topics chapter wise weightage",
        f"{base_context} previous year questions repeated topics",
        f"{base_context} exam pattern marking scheme important chapters",
        f"{base_context} high scoring topics difficult topics preparation tips",
    ]

    if topic_seed:
        queries.append(f"{base_context} topics {topic_seed} most important units")

    for topic in extracted_topics[:3]:
        queries.append(f"{base_context} {topic} important questions weightage")

    deduped = []
    seen = set()

    for query in queries:
        cleaned = " ".join(query.split())
        if cleaned and cleaned not in seen:
            deduped.append(cleaned)
            seen.add(cleaned)

    return deduped[:6]


def run_web_research(queries: list[str]) -> dict:
    if not tavily_client:
        return {"research_text": "", "sources": []}

    sources = []
    source_urls = set()
    chunks = []

    for query in queries:
        try:
            result = tavily_client.search(
                query=query,
                search_depth="advanced",
                max_results=4,
                include_answer=True,
                include_raw_content=False,
            )

            answer = result.get("answer")
            if answer:
                chunks.append(f"Query: {query}\nSearch summary: {answer}")

            for item in result.get("results", [])[:4]:
                url = item.get("url")
                title = item.get("title", "Untitled")
                content = (item.get("content") or "").strip()

                if url and url not in source_urls:
                    source_urls.add(url)
                    sources.append(
                        {
                            "title": title,
                            "url": url,
                            "snippet": content[:280],
                        }
                    )

                snippet = content[:500]
                chunks.append(f"Title: {title}\nURL: {url}\nSnippet: {snippet}")

        except Exception:
            continue

    return {
        "research_text": "\n\n".join(chunks)[:18000],
        "sources": sources[:12],
    }


def build_planner_prompt(
    study_time: float,
    start_date: date,
    end_date: date,
    study_days: list[str],
    max_session_length: str,
    break_interval: str,
    prep_mode: str,
    exam_name: str,
    board_university: str,
    class_semester: str,
    subject_name: str,
    syllabus_outline: dict,
    syllabus_text: str,
    research_text: str,
) -> str:
    return f"""
You are an expert exam strategist and study planner.

Your job is to create a practical timetable and also give smart guidance based
on:
1. the user's syllabus
2. exam context
3. internet research about topic importance, weightage, and repeated patterns

Student context:
- Exam name: {exam_name or syllabus_outline.get("exam_name_guess", "")}
- Board/University/Course: {board_university}
- Class/Semester: {class_semester}
- Subject: {subject_name or syllabus_outline.get("subject_guess", "")}
- Preparation mode: {prep_mode}

Study preferences:
- Start date: {start_date}
- End date: {end_date}
- Daily study time: {study_time} hours
- Available study days: {", ".join(study_days)}
- Maximum study session length: {max_session_length}
- Break interval: {break_interval}

Extracted syllabus outline:
{json.dumps(syllabus_outline, indent=2)}

Extracted PDF text:
{syllabus_text[:10000] if syllabus_text else "N/A"}

Internet research evidence:
{research_text[:12000] if research_text else "No web research available."}

Rules:
1. Prefer the uploaded syllabus over internet sources if there is any conflict.
2. Never recommend skipping a core/fundamental topic completely.
3. If time is limited, classify topics into:
   - Must Do
   - Should Do
   - Low Priority if time-constrained
4. Mention likely high-weightage topics if supported by the evidence.
5. Mention repeated patterns from previous papers only as guidance, not
   certainty.
6. Keep the timetable realistic and balanced.
7. Include revision days.
8. Return clean Markdown only.

Required output sections:
## Study Plan Summary
## Internet Research Insights
## Topic Priority Map
- Must Do
- Should Do
- Low Priority if Time-Constrained
## Common Exam Patterns and Pitfalls
## Recommended Resources
## Timetable

For the timetable, use a Markdown table with columns:
Date | Day | Topics to Study | Total Time | Session Plan | Priority | Notes

## Final Advice
""".strip()


@app.post("/api/study-plan")
async def generate_study_plan(
    study_time: float = Form(...),
    start_date: str = Form(...),
    end_date: str = Form(...),
    study_days: str = Form(...),
    max_session_length: str = Form(...),
    break_interval: str = Form(...),
    prep_mode: str = Form("last-month"),
    exam_name: str = Form(""),
    board_university: str = Form(""),
    class_semester: str = Form(""),
    subject_name: str = Form(""),
    enable_web_research: str = Form("true"),
    source_url: Optional[str] = Form(None),
    source_file: Optional[UploadFile] = File(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ensure_credit_available(db, current_user.id)

    try:
        parsed_start_date = date.fromisoformat(start_date)
        parsed_end_date = date.fromisoformat(end_date)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Dates must be in YYYY-MM-DD format.",
        ) from exc

    if parsed_start_date > parsed_end_date:
        raise HTTPException(
            status_code=400,
            detail="Start date cannot be after end date.",
        )

    try:
        parsed_study_days = json.loads(study_days)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="study_days must be a valid JSON array.",
        ) from exc

    if not isinstance(parsed_study_days, list) or not parsed_study_days:
        raise HTTPException(
            status_code=400,
            detail="Please select at least one study day.",
        )

    web_research_enabled = parse_bool(enable_web_research)

    final_source_url = (source_url or "").strip()
    preview_urls = []
    preview_url = None
    syllabus_text = ""
    source_type = "image"

    if source_file is not None:
        filename = source_file.filename or "upload"
        lower_filename = filename.lower()
        content_type = (source_file.content_type or "").lower()
        file_bytes = await source_file.read()

        is_image = content_type.startswith("image/") or lower_filename.endswith(
            (".png", ".jpg", ".jpeg", ".webp")
        )
        is_pdf = content_type == "application/pdf" or lower_filename.endswith(
            ".pdf"
        )

        if is_image:
            uploaded_url = upload_bytes_to_cloudinary(file_bytes, filename)
            preview_urls = [uploaded_url]
            preview_url = uploaded_url

        elif is_pdf:
            source_type = "pdf"
            syllabus_text = extract_text_from_pdf(file_bytes)
            preview_urls = render_pdf_pages_to_urls(file_bytes, max_pages=3)
            preview_url = preview_urls[0] if preview_urls else None

            if not syllabus_text.strip() and not preview_urls:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Could not read the uploaded PDF. "
                        "Please upload a clearer file."
                    ),
                )

        else:
            raise HTTPException(
                status_code=400,
                detail="Only image files and PDF files are supported.",
            )

    elif final_source_url:
        if final_source_url.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=400,
                detail="PDF URL is not supported yet. Please upload the PDF.",
            )

        preview_urls = [final_source_url]
        preview_url = final_source_url

    else:
        raise HTTPException(
            status_code=400,
            detail="Please provide an image URL or upload an image/PDF file.",
        )

    try:
        syllabus_outline = extract_syllabus_outline(
            preview_urls=preview_urls,
            syllabus_text=syllabus_text,
        )
    except Exception:
        syllabus_outline = {
            "exam_name_guess": "",
            "subject_guess": "",
            "units": [],
            "all_topics": [],
        }

    extracted_topics = syllabus_outline.get("all_topics", [])[:10]

    research_text = ""
    research_sources = []

    if web_research_enabled:
        queries = build_research_queries(
            exam_name=exam_name,
            board_university=board_university,
            class_semester=class_semester,
            subject_name=subject_name,
            extracted_topics=extracted_topics,
        )

        research_result = run_web_research(queries)
        research_text = research_result["research_text"]
        research_sources = research_result["sources"]

    prompt = build_planner_prompt(
        study_time=study_time,
        start_date=parsed_start_date,
        end_date=parsed_end_date,
        study_days=parsed_study_days,
        max_session_length=max_session_length,
        break_interval=break_interval,
        prep_mode=prep_mode,
        exam_name=exam_name,
        board_university=board_university,
        class_semester=class_semester,
        subject_name=subject_name,
        syllabus_outline=syllabus_outline,
        syllabus_text=syllabus_text,
        research_text=research_text,
    )

    content = [{"type": "text", "text": prompt}]

    for url in preview_urls[:3]:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": url},
            }
        )

    try:
        response = client.chat.completions.create(
            model=planner_model,
            temperature=0.2,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are a high-quality exam study planner. "
                        "Return clean Markdown only."
                    ),
                },
                {
                    "role": "user",
                    "content": content,
                },
            ],
        )

        schedule = response.choices[0].message.content or ""

        planner_usage = response.usage
        planner_cost_usd = estimate_openai_cost(planner_model, planner_usage)

        source_parse_cost_usd = (
            pdf_parse_estimate_usd
            if source_type == "pdf"
            else vision_parse_estimate_usd
        )

        research_cost_usd = (
            web_research_estimate_usd if web_research_enabled else 0.0
        )

        total_estimated_cost_usd = round(
            planner_cost_usd + source_parse_cost_usd + research_cost_usd,
            6,
        )

        billing = record_usage(
            db=db,
            user_id=current_user.id,
            cost_usd=total_estimated_cost_usd,
            prompt_tokens=read_usage_field(planner_usage, "prompt_tokens"),
            completion_tokens=read_usage_field(
                planner_usage,
                "completion_tokens",
            ),
            search_calls=1 if web_research_enabled else 0,
        )

        return {
            "success": True,
            "source_type": source_type,
            "preview_url": preview_url,
            "schedule_markdown": schedule,
            "research_sources": research_sources,
            "syllabus_outline": syllabus_outline,
            "billing": billing,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"OpenAI request failed: {str(exc)}",
        ) from exc