"""Incomiq - Smart Income & Expense Tracker with AI-Powered Savings - FastAPI Backend."""

import sys
import logging

# Configure root logger so all [SMS-WEBHOOK] etc. messages show in stdout
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    stream=sys.stdout,
)

try:
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # Windows UTF-8 fix
except Exception:
    pass

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routes import auth, incomes, expenses, rules, goals, analytics, investments, notifications, transactions, ai_chat, admin
from app.routes import sms_webhook, ws, stocks
from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    print("[START] Starting Incomiq Backend...")

    # Ensure admin user exists
    try:
        from app.local_auth import ensure_admin_user
        ensure_admin_user()
    except Exception as e:
        print(f"[WARN] Admin user initialization failed: {e}")

    # Auto-register all users who have a phone_number saved in their profile
    try:
        from app.local_auth import get_all_users_with_phones
        from app.local_storage import _load_data, _save_data
        from datetime import datetime as _dt
        registrations = get_all_users_with_phones()
        if registrations:
            devices = _load_data("global", "sms_devices")
            changed = False
            for entry in registrations:
                phone, uid = entry["phone"], entry["user_id"]
                # Upsert: remove stale entry then add fresh one
                existing = next((d for d in devices if d.get("phone") == phone), None)
                if not existing or existing.get("user_id") != uid:
                    devices = [d for d in devices if d.get("phone") != phone]
                    devices.append({"phone": phone, "user_id": uid,
                                    "registered_at": _dt.utcnow().isoformat()})
                    changed = True
                    print(f"[START] Registered phone {phone} -> {uid}")
            if changed:
                _save_data("global", "sms_devices", devices)
        else:
            print("[START] No users with phone numbers to register yet")
    except Exception as e:
        print(f"[WARN] Startup phone registration failed: {e}")

    yield

    # Shutdown
    print("[STOP] Shutting down Incomiq Backend...")


app = FastAPI(
    title="Incomiq API",
    description="AI-powered income tracking, expense management, smart savings & investment planning",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS – allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://localhost:5179",
        "http://localhost:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers under /api prefix
app.include_router(auth.router, prefix="/api")
app.include_router(incomes.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(rules.router, prefix="/api")
app.include_router(goals.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(investments.router, prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(transactions.router, prefix="/api")
app.include_router(ai_chat.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(sms_webhook.router, prefix="/api")
app.include_router(stocks.router, prefix="/api")

# WebSocket route (no /api prefix — ws://host/ws/{user_id})
app.include_router(ws.router)


@app.get("/api/health")
async def health():
    return {
        "status": "healthy",
        "version": "2.0.0",
        "features": ["sms_webhook", "websocket", "ai_chat", "risk_engine"],
    }
