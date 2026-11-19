import datetime as dt
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

TopicStatus = Literal["not_started", "learning", "done", "revised"]
Priority = Literal["must", "should", "low"]
Weekday = Literal["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


# ---------- auth ----------
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    name: str | None = Field(default=None, max_length=120)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    name: str | None = None
    daily_goal_minutes: int | None = 120
    tour_completed: bool = False
    created_at: datetime


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=120)
    daily_goal_minutes: int | None = Field(default=None, ge=15, le=960)
    tour_completed: bool | None = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


class UsageBucketOut(BaseModel):
    limit_usd: float
    spent_usd: float
    remaining_usd: float
    percent_left: int
    request_count: int
    reset_at: str


class BillingSummaryOut(BaseModel):
    daily: UsageBucketOut
    monthly: UsageBucketOut
    is_limited: bool
    limited_by: str | None = None
    approx_messages_left: int
    reset_at: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserOut
    billing: BillingSummaryOut


class MeResponse(BaseModel):
    user: UserOut
    billing: BillingSummaryOut


# ---------- subjects ----------
class SubjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    exam_name: str | None = Field(default=None, max_length=160)
    board_university: str | None = Field(default=None, max_length=160)
    class_semester: str | None = Field(default=None, max_length=80)
    exam_date: date | None = None
    color: str = Field(default="indigo", max_length=20)


class SubjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    exam_name: str | None = None
    board_university: str | None = None
    class_semester: str | None = None
    exam_date: date | None = None
    color: str | None = None


class TopicCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    unit_id: int | None = None
    priority: Priority = "should"


class TopicUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    status: TopicStatus | None = None
    confidence: int | None = Field(default=None, ge=0, le=5)
    priority: Priority | None = None
    est_minutes: int | None = Field(default=None, ge=10, le=600)
    unit_id: int | None = None


class UnitCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class UnitUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class CatalogAdd(BaseModel):
    subject_keys: list[str] = Field(min_length=1)
    exam_date: date | None = None


# ---------- plans ----------
class PlanCreate(BaseModel):
    subject_ids: list[int] = Field(min_length=1)
    start_date: date
    end_date: date
    daily_minutes: int = Field(ge=20, le=960)
    session_minutes: int = Field(default=60, ge=20, le=240)
    study_days: list[Weekday] = Field(min_length=1)
    prep_mode: Literal["full-prep", "last-month", "crash-prep"] = "full-prep"
    use_ai_priorities: bool = True
    web_research: bool = False


class TaskUpdate(BaseModel):
    done: bool | None = None
    date: dt.date | None = None


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    date: dt.date
    minutes: int = Field(default=30, ge=5, le=600)
    subject_id: int | None = None


# ---------- quizzes ----------
class QuizCreate(BaseModel):
    subject_id: int
    topic_ids: list[int] = Field(default_factory=list)
    count: int = Field(default=10, ge=3, le=25)
    difficulty: Literal["easy", "medium", "hard", "exam"] = "medium"
    focus_weak: bool = False


class QuizSubmit(BaseModel):
    answers: list[int | None]


# ---------- flashcards ----------
class FlashcardCreate(BaseModel):
    subject_id: int | None = None
    topic_id: int | None = None
    front: str = Field(min_length=1, max_length=2000)
    back: str = Field(min_length=1, max_length=4000)


class FlashcardGenerate(BaseModel):
    subject_id: int
    topic_id: int | None = None
    count: int = Field(default=12, ge=3, le=40)
    source_text: str | None = Field(default=None, max_length=20000)


class FlashcardReview(BaseModel):
    grade: Literal["again", "hard", "good", "easy"]


# ---------- sessions ----------
class SessionCreate(BaseModel):
    minutes: int = Field(ge=1, le=600)
    subject_id: int | None = None
    topic_id: int | None = None
    note: str | None = Field(default=None, max_length=300)


# ---------- tutor ----------
class ThreadCreate(BaseModel):
    subject_id: int | None = None
    title: str | None = Field(default=None, max_length=200)
