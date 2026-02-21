"""
SMS Webhook Route
==================
Receives incoming bank SMS messages from:
  - httpSMS Android app
  - Any HTTP forwarder that POSTs SMS data

Endpoint: POST /api/sms/webhook
Authentication: webhook secret header (X-Webhook-Secret)

Flow:
  1. Receive SMS payload
  2. Validate secret
  3. Parse SMS using sms_parser
  4. Run risk scoring via risk_engine
  5. Auto-add income/expense if confident enough
  6. Push real-time alert via WebSocket
  7. Send push notification if browser registered
  8. Store SMS record in storage
"""

import uuid
import os
from datetime import datetime, date
from fastapi import APIRouter, Header, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional
from dotenv import load_dotenv

from app.auth import get_current_user
from app.sms_parser import parse_sms, is_bank_sms
from app.risk_engine import score_transaction, classify_income_sms
from app.websocket_manager import (
    manager,
    sms_alert_event,
    income_added_event,
    expense_added_event,
    transaction_clarification_event,
)
from app.local_storage import add_income, add_expense, _load_data, _save_data

load_dotenv()
WEBHOOK_SECRET = os.getenv("SMS_WEBHOOK_SECRET", "incomiq-sms-secret-2024")

router = APIRouter(prefix="/sms", tags=["sms"])


# ── Models ────────────────────────────────────────────────

class SMSWebhookPayload(BaseModel):
    """Payload from httpSMS or Android SMS forwarder."""
    message_id: Optional[str] = None      # httpSMS message ID
    owner: Optional[str] = None           # phone number that received SMS
    contact: Optional[str] = None         # sender's number
    content: str                           # SMS body
    sent_at: Optional[str] = None         # ISO timestamp
    sender_id: Optional[str] = None       # Sender ID (e.g., HDFCBK)
    user_id: Optional[str] = None         # Optional: override user association


class SMSClarificationResponse(BaseModel):
    """User's clarification on a transaction."""
    sms_id: str
    user_id: str
    category: str
    description: str
    confirmed_as: str  # 'expense' | 'income' | 'ignore'


class SMSRecord(BaseModel):
    id: str
    user_id: str
    content: str
    sender_id: Optional[str]
    parsed_amount: Optional[float]
    parsed_type: Optional[str]
    parsed_merchant: Optional[str]
    risk_score: Optional[float]
    risk_level: Optional[str]
    auto_processed: bool
    needs_clarification: bool
    clarified: bool
    clarification_category: Optional[str]
    timestamp: str


# ── Helpers ───────────────────────────────────────────────

def _store_sms(user_id: str, record: dict):
    data = _load_data(user_id, "sms_records")
    data.append(record)
    # Keep last 500 records
    if len(data) > 500:
        data = data[-500:]
    _save_data(user_id, "sms_records", data)


def _get_user_monthly_income(user_id: str) -> float:
    incomes = _load_data(user_id, "incomes")
    current_month = datetime.now().strftime("%Y-%m")
    monthly = [i for i in incomes if str(i.get("date", "")).startswith(current_month)]
    return sum(i.get("amount", 0) for i in monthly)


def _get_recent_expenses(user_id: str, limit: int = 20) -> list:
    expenses = _load_data(user_id, "expenses")
    return expenses[-limit:] if expenses else []


def _find_sms_user(phone_number: str) -> Optional[str]:
    """Map a phone number to a user_id via registered devices."""
    devices = _load_data("global", "sms_devices")
    for d in devices:
        if d.get("phone") == phone_number:
            return d.get("user_id")
    return None


# ── Routes ────────────────────────────────────────────────

@router.post("/webhook")
async def receive_sms(
    payload: SMSWebhookPayload,
    x_webhook_secret: Optional[str] = Header(default=None, alias="X-Webhook-Secret"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """
    Receive an incoming bank SMS from httpSMS or Android forwarder.
    Does NOT require user auth – uses webhook secret instead.
    """
    # Validate webhook secret
    if x_webhook_secret != WEBHOOK_SECRET:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    sms_body = payload.content.strip()
    sender_id = payload.sender_id or ""

    # Determine user_id from headers, payload, or phone mapping
    user_id = x_user_id or payload.user_id
    if not user_id and payload.owner:
        user_id = _find_sms_user(payload.owner)
    if not user_id:
        # Default to demo user if no mapping found
        user_id = "demo-user-001"

    # Check if it's a financial SMS
    if not is_bank_sms(sms_body, sender_id):
        return {"status": "ignored", "reason": "Not a bank SMS"}

    # Parse the SMS
    parsed = parse_sms(sms_body, sender_id)
    sms_id = payload.message_id or str(uuid.uuid4())

    if not parsed.is_transaction or not parsed.amount:
        return {"status": "ignored", "reason": "No transaction found in SMS"}

    # Risk scoring
    monthly_income = _get_user_monthly_income(user_id)
    recent_expenses = _get_recent_expenses(user_id)
    amount_history = [e.get("amount", 0) for e in recent_expenses if e.get("amount")]
    risk = score_transaction(
        parsed=parsed,
        monthly_income=monthly_income,
        amount_history=amount_history,
        recent_transactions=recent_expenses,
    )

    # Build SMS record
    record = {
        "id": sms_id,
        "user_id": user_id,
        "content": sms_body,
        "sender_id": sender_id,
        "parsed_amount": parsed.amount,
        "parsed_type": parsed.transaction_type,
        "parsed_merchant": parsed.merchant,
        "parsed_mode": parsed.transaction_mode,
        "bank_name": parsed.bank_name,
        "risk_score": risk.score,
        "risk_level": risk.level,
        "auto_processed": False,
        "needs_clarification": risk.needs_clarification,
        "clarified": False,
        "clarification_category": None,
        "timestamp": payload.sent_at or datetime.utcnow().isoformat(),
    }
    _store_sms(user_id, record)

    # Auto-process income transactions with high confidence
    if parsed.is_income:
        income_info = classify_income_sms(parsed)
        if income_info["confidence"] >= 0.6:
            income_record = {
                "id": str(uuid.uuid4()),
                "amount": parsed.amount,
                "source_name": income_info["source_name"],
                "category": income_info["category"],
                "date": date.today().isoformat(),
                "description": f"Auto-detected via SMS: {parsed.merchant or sender_id}",
                "sms_id": sms_id,
                "via_sms": True,
            }
            add_income(user_id, income_record)
            await manager.send_to_user(user_id, income_added_event(income_record))
            record["auto_processed"] = True
            _store_sms(user_id, record)

    # Auto-process low-risk expense transactions
    elif parsed.is_expense and risk.score < 30 and risk.is_necessity:
        expense_record = {
            "id": str(uuid.uuid4()),
            "amount": parsed.amount,
            "category": risk.auto_category,
            "date": date.today().isoformat(),
            "description": f"{parsed.merchant or 'SMS transaction'} via {parsed.transaction_mode}",
            "payment_method": "upi" if parsed.transaction_mode == "UPI" else "card",
            "sms_id": sms_id,
            "via_sms": True,
        }
        add_expense(user_id, expense_record)
        await manager.send_to_user(user_id, expense_added_event(expense_record))
        record["auto_processed"] = True

    # Send real-time alert for all transactions
    alert_evt = sms_alert_event(
        transaction_type=parsed.transaction_type,
        amount=parsed.amount,
        merchant=parsed.merchant or "",
        risk_score=risk.score,
        risk_level=risk.level,
        alert_message=risk.alert_message,
        suggestion=risk.suggestion,
        needs_clarification=risk.needs_clarification,
        is_dirty_spend=risk.is_dirty_spend,
        auto_category=risk.auto_category,
        bank_name=parsed.bank_name or "",
        transaction_mode=parsed.transaction_mode or "",
        sms_id=sms_id,
    )
    await manager.send_to_user(user_id, alert_evt)

    # Send clarification request if needed
    if risk.needs_clarification and parsed.is_expense:
        clarify_evt = transaction_clarification_event(
            sms_id=sms_id,
            amount=parsed.amount,
            merchant=parsed.merchant or "",
            risk_score=risk.score,
        )
        await manager.send_to_user(user_id, clarify_evt)

    return {
        "status": "processed",
        "sms_id": sms_id,
        "transaction_type": parsed.transaction_type,
        "amount": parsed.amount,
        "risk_score": risk.score,
        "risk_level": risk.level,
        "auto_processed": record["auto_processed"],
        "needs_clarification": risk.needs_clarification,
    }


@router.post("/clarify")
async def clarify_transaction(
    body: SMSClarificationResponse,
    user: dict = Depends(get_current_user),
):
    """
    User responds to a transaction clarification request.
    The expense/income is then properly categorized and saved.
    """
    user_id = user["id"]
    sms_records = _load_data(user_id, "sms_records")

    # Find the SMS record
    target = next((s for s in sms_records if s.get("id") == body.sms_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="SMS record not found")

    # Mark as clarified
    for record in sms_records:
        if record.get("id") == body.sms_id:
            record["clarified"] = True
            record["clarification_category"] = body.category
            record["clarification_description"] = body.description
    _save_data(user_id, "sms_records", sms_records)

    # Save the actual transaction
    if body.confirmed_as == "expense":
        expense_record = {
            "id": str(uuid.uuid4()),
            "amount": target.get("parsed_amount", 0),
            "category": body.category,
            "date": date.today().isoformat(),
            "description": body.description or f"{target.get('parsed_merchant', 'Unknown')} (clarified via SMS)",
            "payment_method": "upi" if target.get("parsed_mode") == "UPI" else "other",
            "sms_id": body.sms_id,
            "via_sms": True,
        }
        add_expense(user_id, expense_record)

        # Notify real-time
        await manager.send_to_user(user_id, {
            "event": "clarification_resolved",
            "sms_id": body.sms_id,
            "category": body.category,
            "message": f"✅ ₹{target.get('parsed_amount', 0):,.0f} categorized as {body.category}",
        })
        return {"status": "saved", "type": "expense", "category": body.category}

    elif body.confirmed_as == "income":
        income_record = {
            "id": str(uuid.uuid4()),
            "amount": target.get("parsed_amount", 0),
            "source_name": body.description or target.get("parsed_merchant", "Unknown"),
            "category": body.category,
            "date": date.today().isoformat(),
            "description": body.description,
            "sms_id": body.sms_id,
            "via_sms": True,
        }
        add_income(user_id, income_record)
        return {"status": "saved", "type": "income", "category": body.category}

    return {"status": "ignored"}


@router.get("/records")
async def get_sms_records(
    user: dict = Depends(get_current_user),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Get all SMS records for a user (most recent first)."""
    user_id = user["id"]
    records = _load_data(user_id, "sms_records")
    records.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
    total = len(records)
    start = (page - 1) * limit
    return {
        "records": records[start: start + limit],
        "total": total,
        "page": page,
    }


@router.post("/register-device")
async def register_sms_device(
    phone: str,
    user: dict = Depends(get_current_user),
):
    """Link a phone number to the current user for SMS webhook routing."""
    user_id = user["id"]
    devices = _load_data("global", "sms_devices")
    # Remove old entry for this phone
    devices = [d for d in devices if d.get("phone") != phone]
    devices.append({
        "phone": phone,
        "user_id": user_id,
        "registered_at": datetime.utcnow().isoformat(),
    })
    _save_data("global", "sms_devices", devices)
    return {"status": "registered", "phone": phone, "user_id": user_id}


@router.get("/webhook-info")
async def get_webhook_info(user: dict = Depends(get_current_user)):
    """Get webhook configuration info for httpSMS setup."""
    base_url = os.getenv("APP_BASE_URL", "http://localhost:8000")
    return {
        "webhook_url": f"{base_url}/api/sms/webhook",
        "method": "POST",
        "secret_header": "X-Webhook-Secret",
        "user_id_header": "X-User-Id",
        "user_id": user["id"],
        "secret": WEBHOOK_SECRET,
        "setup_instructions": {
            "app": "httpSMS (Android) — https://httpsms.com",
            "step1": "Install httpSMS on your Android phone",
            "step2": f"Set webhook URL to: {base_url}/api/sms/webhook",
            "step3": f"Add header X-Webhook-Secret: {WEBHOOK_SECRET}",
            "step4": f"Add header X-User-Id: {user['id']}",
            "step5": "Enable SMS forwarding and test with a bank transaction",
        },
    }
