from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_access_token, get_current_user, hash_password, verify_password
from ..billing import get_credit_summary
from ..db import get_db
from ..models import User
from ..ratelimit import auth_rate_limit
from ..schemas import (
    AuthResponse,
    BillingSummaryOut,
    MeResponse,
    PasswordChange,
    ProfileUpdate,
    UserLogin,
    UserOut,
    UserRegister,
)

router = APIRouter(prefix="/api", tags=["auth"])


def _auth_payload(db: Session, user: User) -> dict:
    return {
        "access_token": create_access_token(user.id),
        "token_type": "bearer",
        "user": user,
        "billing": get_credit_summary(db, user.id),
    }


@router.post("/auth/register", response_model=AuthResponse, status_code=201, dependencies=[Depends(auth_rate_limit)])
def register(payload: UserRegister, db: Session = Depends(get_db)):
    email = payload.email.lower()
    if db.scalar(select(User).where(User.email == email)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    user = User(email=email, hashed_password=hash_password(payload.password), name=(payload.name or "").strip() or None)
    db.add(user)
    db.commit()
    db.refresh(user)
    return _auth_payload(db, user)


@router.post("/auth/login", response_model=AuthResponse, dependencies=[Depends(auth_rate_limit)])
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return _auth_payload(db, user)


@router.get("/auth/me", response_model=MeResponse)
def me(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"user": current_user, "billing": get_credit_summary(db, current_user.id)}


@router.patch("/auth/me", response_model=UserOut)
def update_profile(
    payload: ProfileUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.name is not None:
        current_user.name = payload.name.strip() or None
    if payload.daily_goal_minutes is not None:
        current_user.daily_goal_minutes = payload.daily_goal_minutes
    if payload.tour_completed is not None:
        current_user.tour_completed = payload.tour_completed
    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/auth/change-password", status_code=204, dependencies=[Depends(auth_rate_limit)])
def change_password(
    payload: PasswordChange,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    current_user.hashed_password = hash_password(payload.new_password)
    db.commit()


@router.delete("/auth/me", status_code=204)
def delete_account(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(current_user)
    db.commit()


@router.get("/billing/summary", response_model=BillingSummaryOut)
def billing_summary(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return get_credit_summary(db, current_user.id)
