from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    created_at: datetime


class BillingSummaryOut(BaseModel):
    limit_usd: float
    spent_usd: float
    remaining_usd: float
    reset_at: str
    request_count: int
    is_limited: bool


class AuthResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserOut
    billing: BillingSummaryOut


class MeResponse(BaseModel):
    user: UserOut
    billing: BillingSummaryOut