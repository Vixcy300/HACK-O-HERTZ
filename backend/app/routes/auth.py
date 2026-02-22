"""Auth routes – login, signup, demo, profile."""

import os
import logging
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from app.models import LoginRequest, SignupRequest, DemoLoginRequest
from app.auth import DEMO_USER, get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

# Check if Supabase is configured
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
USE_LOCAL_AUTH = not SUPABASE_URL or "your-project" in SUPABASE_URL


def _auto_register_phone(user_id: str, email: str) -> None:
    """If the user has a phone_number in their profile, register it in global_sms_devices."""
    try:
        from app.local_auth import get_user_phone
        from app.local_storage import _load_data, _save_data
        phone = get_user_phone(email)
        if not phone:
            return
        devices = _load_data("global", "sms_devices")
        # Remove old entry for this phone or this user
        devices = [d for d in devices if d.get("phone") != phone and d.get("user_id") != user_id]
        devices.append({
            "phone": phone,
            "user_id": user_id,
            "registered_at": datetime.utcnow().isoformat(),
        })
        _save_data("global", "sms_devices", devices)
        logger.info(f"Auto-registered phone {phone} -> user_id={user_id}")
    except Exception as exc:
        logger.warning(f"Auto-register phone failed for {email}: {exc}")


@router.post("/login")
async def login(body: LoginRequest):
    if USE_LOCAL_AUTH:
        from app.local_auth import login as local_login
        try:
            result = local_login(body.email, body.password)
            # Auto-register phone device if user has one saved
            _auto_register_phone(result["user"]["id"], body.email)
            return result
        except ValueError as e:
            raise HTTPException(status_code=401, detail=str(e))
    else:
        try:
            from app.config import get_supabase
            sb = get_supabase()
            res = sb.auth.sign_in_with_password(
                {"email": body.email, "password": body.password}
            )
            return {
                "access_token": res.session.access_token,
                "user": {
                    "id": res.user.id,
                    "email": res.user.email,
                    "full_name": res.user.user_metadata.get("full_name", "User"),
                },
            }
        except Exception as e:
            raise HTTPException(status_code=401, detail=str(e))


@router.post("/signup")
async def signup(body: SignupRequest):
    if USE_LOCAL_AUTH:
        from app.local_auth import signup as local_signup
        try:
            result = local_signup(body.email, body.password, body.full_name)
            # Auto-register phone if provided at signup (future-proof)
            _auto_register_phone(result["user"]["id"], body.email)
            return result
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    else:
        try:
            from app.config import get_supabase
            sb = get_supabase()
            res = sb.auth.sign_up(
                {
                    "email": body.email,
                    "password": body.password,
                    "options": {"data": {"full_name": body.full_name}},
                }
            )
            return {
                "access_token": res.session.access_token if res.session else None,
                "user": {
                    "id": res.user.id,
                    "email": res.user.email,
                    "full_name": body.full_name,
                },
                "message": "Account created successfully",
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=str(e))


@router.post("/demo")
async def demo_login(_body: DemoLoginRequest):
    return {
        "access_token": "demo-token",
        "user": DEMO_USER,
    }


class ProfileUpdate(BaseModel):
    phone_number: Optional[str] = None
    full_name: Optional[str] = None


@router.patch("/profile")
async def update_profile(
    body: ProfileUpdate,
    user: dict = Depends(get_current_user),
):
    """Update the current user's profile (phone number, full name, etc.)."""
    if not USE_LOCAL_AUTH:
        raise HTTPException(status_code=501, detail="Profile update only supported in local auth mode")

    email = user.get("email")
    if not email:
        raise HTTPException(status_code=400, detail="Cannot determine user email")

    from app.local_auth import update_user_phone, _load_users, _save_users
    users = _load_users()
    if email not in users:
        raise HTTPException(status_code=404, detail="User not found")

    updated = False
    if body.phone_number is not None:
        phone = body.phone_number.strip()
        users[email]["phone_number"] = phone
        updated = True
        # Auto-register the new phone immediately
        if phone:
            _auto_register_phone(user["id"], email)

    if body.full_name is not None:
        users[email]["full_name"] = body.full_name.strip()
        updated = True

    if updated:
        _save_users(users)

    return {
        "status": "updated",
        "phone_number": users[email].get("phone_number", ""),
        "full_name": users[email].get("full_name", ""),
    }
