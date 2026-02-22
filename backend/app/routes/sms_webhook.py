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
import re
import logging
from datetime import datetime, date
from fastapi import APIRouter, Header, HTTPException, Depends, Query, Request

logger = logging.getLogger(__name__)
from pydantic import BaseModel
from typing import Optional, Any, Dict
from dotenv import load_dotenv

from app.auth import get_current_user
from app.sms_parser import parse_sms, is_bank_sms
from app.risk_engine import score_transaction, classify_income_sms
from app.ai_service import ai_classify_sms
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
    sent_at: Optional[str] = None         # legacy timestamp field
    timestamp: Optional[str] = None       # httpSMS timestamp (ISO 8601)
    sender_id: Optional[str] = None       # Sender ID (e.g., HDFCBK) — NOT httpSMS user
    ssms_user_id: Optional[str] = None    # unused — httpSMS internal user id
    encrypted: Optional[bool] = False
    sim: Optional[str] = None

    class Config:
        extra = "ignore"  # ignore any unknown httpSMS fields

    @property
    def received_at(self) -> str:
        return self.timestamp or self.sent_at or datetime.utcnow().isoformat()


def _extract_payload(raw: Dict[str, Any]) -> SMSWebhookPayload:
    """
    httpSMS wraps SMS data inside a 'data' key:
      { "event": "message.phone.received", "data": { "content": "...", ... } }
    Also handle flat format for other forwarders.
    """
    if "data" in raw and isinstance(raw["data"], dict):
        inner = raw["data"]
    else:
        inner = raw

    # httpSMS field name mapping
    return SMSWebhookPayload(
        message_id=inner.get("id") or inner.get("message_id"),
        owner=inner.get("owner"),
        contact=inner.get("contact") or inner.get("from"),
        content=inner.get("content", ""),
        sent_at=inner.get("sent_at"),
        timestamp=inner.get("created_at") or inner.get("timestamp"),
        sender_id=inner.get("sender_id"),
        encrypted=inner.get("encrypted", False),
        sim=inner.get("sim"),
    )


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

def _store_sms(user_id: str, record: dict) -> bool:
    """Store an SMS record. Returns False if duplicate."""
    import hashlib
    data = _load_data(user_id, "sms_records")

    # Deduplication 1: skip if same sms_id already stored (httpSMS message ID)
    sms_id = record.get("id")
    if sms_id and any(r.get("id") == sms_id for r in data):
        logger.info(f"Duplicate SMS id={sms_id} skipped")
        return False

    # Deduplication 2: skip if same content+amount received within last 2 hours
    # Handles httpSMS retries when tunnel was down
    content_key = f"{record.get('content','')[:200]}-{record.get('parsed_amount')}-{record.get('parsed_type')}"
    content_hash = hashlib.md5(content_key.encode()).hexdigest()
    now_ts = datetime.utcnow()
    for existing in data[-50:]:  # only check last 50 records
        if existing.get("content_hash") == content_hash:
            try:
                existing_ts = datetime.fromisoformat(existing.get("timestamp", "").replace("Z", ""))
                age_hours = (now_ts - existing_ts).total_seconds() / 3600
                if age_hours < 2:
                    logger.info(f"Duplicate SMS content (within 2h) skipped: hash={content_hash[:8]}")
                    return False
            except Exception:
                pass

    record["content_hash"] = content_hash
    data.append(record)
    # Keep last 500 records
    if len(data) > 500:
        data = data[-500:]
    _save_data(user_id, "sms_records", data)
    return True


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


# ── Debug webhook — logs EVERYTHING, no auth, no filtering ──────────
# Remove in production; used to verify httpSMS is reaching us

_debug_log: list[dict] = []   # keep last 20 raw payloads in memory

@router.post("/webhook-debug")
async def debug_webhook(request: Request):
    """Accept any POST and log it — used to verify httpSMS connectivity."""
    import json as _json
    headers = dict(request.headers)
    try:
        body = await request.json()
    except Exception:
        body = {"_raw": (await request.body()).decode(errors="replace")[:2000]}
    entry = {"ts": datetime.utcnow().isoformat(), "headers": headers, "body": body}
    _debug_log.append(entry)
    if len(_debug_log) > 20:
        _debug_log.pop(0)
    logger.info(f"[DEBUG-WEBHOOK] headers={headers}")
    logger.info(f"[DEBUG-WEBHOOK] body={_json.dumps(body, default=str)[:500]}")
    return {"status": "debug_ok", "received": True}


@router.get("/webhook-debug")
async def get_debug_log(user: dict = Depends(get_current_user)):
    """View recent debug webhook payloads."""
    return {"count": len(_debug_log), "entries": _debug_log}


# ── Routes ────────────────────────────────────────────────

@router.post("/webhook")
async def receive_sms(
    request: Request,
    x_webhook_secret: Optional[str] = Header(default=None, alias="X-Webhook-Secret"),
    x_httpsms_signature: Optional[str] = Header(default=None, alias="X-Httpsms-Signature"),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
):
    """
    Receive an incoming bank SMS from httpSMS or Android forwarder.
    Does NOT require user auth – uses webhook secret instead.
    httpSMS sends: X-Httpsms-Signature (HMAC) — we accept either header.
    httpSMS wraps payload inside {"event":..., "data":{...}} — _extract_payload handles both.
    """
    # Parse raw body — accept both flat and httpSMS nested format
    try:
        raw = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")

    # ── Detailed logging of every inbound webhook ──────────────────────
    event_type = raw.get("event", "<no-event-field>")
    logger.info(f"[SMS-WEBHOOK] Received event_type={event_type!r}")
    logger.info(f"[SMS-WEBHOOK] Raw keys={list(raw.keys())}")
    if "data" in raw and isinstance(raw["data"], dict):
        logger.info(f"[SMS-WEBHOOK] data.content={raw['data'].get('content', '<empty>')[:120]}")
        logger.info(f"[SMS-WEBHOOK] data.owner={raw['data'].get('owner')} contact={raw['data'].get('contact')}")
    else:
        logger.info(f"[SMS-WEBHOOK] Flat body content={str(raw.get('content', '<empty>'))[:120]}")

    # httpSMS sends both "message.phone.received" (incoming) and "message.phone.sent" (outgoing)
    # We only care about received messages
    if event_type == "message.phone.sent":
        logger.info(f"[SMS-WEBHOOK] Ignoring outbound SMS event")
        return {"status": "ignored", "reason": "Outbound SMS event — only processing inbound"}

    try:
        payload = _extract_payload(raw)
    except Exception as e:
        logger.error(f"[SMS-WEBHOOK] Payload extraction failed: {e}")
        raise HTTPException(status_code=422, detail=f"Cannot parse SMS payload: {e}")

    if not payload.content:
        logger.info(f"[SMS-WEBHOOK] IGNORED: empty content")
        return {"status": "ignored", "reason": "Empty SMS content"}

    # Accept if:
    # 1. X-Webhook-Secret header matches our secret, OR
    # 2. X-Httpsms-Signature is present (httpSMS signed request), OR
    # 3. Default dev secret (always allowed in dev)
    secret_ok = (
        x_webhook_secret == WEBHOOK_SECRET
        or x_httpsms_signature is not None
        or WEBHOOK_SECRET == "incomiq-sms-secret-2024"  # default dev secret always allowed
    )
    if not secret_ok:
        raise HTTPException(status_code=401, detail="Invalid webhook secret")

    sms_body = payload.content.strip()
    # sender_id from contact field (httpSMS) or explicit sender_id
    sender_id = payload.sender_id or payload.contact or ""
    logger.info(f"[SMS-WEBHOOK] Processing: sender={sender_id!r} body={sms_body[:80]!r} user_id_header={x_user_id!r}")

    # Determine user_id — NEVER use httpSMS's own user_id field
    user_id = x_user_id  # from header takes priority
    if not user_id and payload.owner:
        user_id = _find_sms_user(payload.owner)
    _broadcast_alert = not bool(user_id)
    if not user_id:
        # No device mapping found — identify connected users and assign to them
        connected = manager.connected_users()
        if connected:
            # Use the first connected user as primary (most recently active)
            user_id = connected[0]
            logger.warning(f"No device mapping for phone={payload.owner!r} — assigning to connected user {user_id}")
        else:
            logger.warning(f"No device mapping for phone={payload.owner!r} — no connected users, storing as 'unmatched'")
            user_id = "unmatched"

    # Helper: send WS event to this user OR broadcast if no mapping
    async def _notify(event: dict):
        if _broadcast_alert:
            await manager.broadcast(event)
        else:
            await manager.send_to_user(user_id, event)

    # Check if it's a financial SMS
    if not is_bank_sms(sms_body, sender_id):
        logger.info(f"[SMS-WEBHOOK] IGNORED: not a bank SMS — body={sms_body[:80]!r}")
        return {"status": "ignored", "reason": "Not a bank SMS"}

    # Parse the SMS
    parsed = parse_sms(sms_body, sender_id)
    sms_id = payload.message_id or str(uuid.uuid4())
    logger.info(f"[SMS-WEBHOOK] Parsed: amount={parsed.amount} type={parsed.transaction_type} merchant={parsed.merchant} is_txn={parsed.is_transaction}")

    if not parsed.is_transaction or not parsed.amount:
        logger.info(f"[SMS-WEBHOOK] IGNORED: no transaction in SMS")
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
        "timestamp": payload.received_at,
    }

    # ── Auto-track income (ALL credit SMS) ──────────────────────────────
    if parsed.is_income:
        income_info = classify_income_sms(parsed)
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
        await _notify(income_added_event(income_record))
        record["auto_processed"] = True
        record["auto_category"] = income_info["category"]
        # ── Credits NEVER need clarification — force-reset regardless of risk score ──
        record["needs_clarification"] = False
        record["clarified"] = True
        record["risk_score"] = 0.0
        record["risk_level"] = "safe"
        # Build a clean income alert message
        source_label = income_info.get("source_name") or parsed.merchant or sender_id or "UPI sender"
        category_emoji = {
            "salary": "💼", "freelance": "💻", "delivery": "📦",
            "content": "🎬", "refund": "↩️", "investment": "📈",
            "transfer": "🏦", "upi_credit": "💸",
        }.get(income_info["category"], "💰")
        record["income_alert_message"] = f"{category_emoji} ₹{parsed.amount:,.0f} received from {source_label}"

    # ── Auto-track expense (ALL debit SMS) ────────────────────────────────
    elif parsed.is_expense:
        # Detect if merchant is unclear (UPI to phone number / individual)
        _m = (parsed.merchant or '').strip()
        merchant_is_unclear = bool(
            not _m
            or re.match(r'^[+]?91?[6-9][0-9]{9}(@|$)', _m.lower())   # phone number VPA like 9841234567@ybl
            or re.match(r'^[0-9]{10}(@|$)', _m.lower())               # 10-digit phone VPA
            or _m.upper() in ('UPI', 'REF', 'NEFT', 'IMPS', 'TRANSFER')
            or len(_m) < 3
        )
        # Always save the expense with best-guess category
        expense_record = {
            "id": str(uuid.uuid4()),
            "amount": parsed.amount,
            "category": risk.auto_category or "other",
            "date": date.today().isoformat(),
            "description": f"{parsed.merchant or 'UPI Payment'} via {parsed.transaction_mode or 'UPI'}",
            "payment_method": "upi" if (parsed.transaction_mode or "").upper() == "UPI" else "card",
            "sms_id": sms_id,
            "via_sms": True,
            "needs_clarification": bool(merchant_is_unclear or risk.needs_clarification),
        }
        add_expense(user_id, expense_record)
        await _notify(expense_added_event(expense_record))
        record["auto_processed"] = True
        record["needs_clarification"] = bool(merchant_is_unclear or risk.needs_clarification)
        # If merchant unclear, get AI classification suggestion
        if merchant_is_unclear:
            ai_info = await ai_classify_sms(
                sms_content=sms_body,
                amount=parsed.amount,
                merchant=parsed.merchant or "",
                transaction_mode=parsed.transaction_mode or "UPI",
            )
            record["ai_message"] = ai_info["ai_message"]
            record["ai_suggested_categories"] = ai_info["suggested_categories"]
            record["ai_spending_insight"] = ai_info["spending_insight"]
            record["ai_confidence"] = ai_info["confidence"]

    # Save final record (after all AI enrichment)
    _store_sms(user_id, record)

    # ── Build alert message — use income-specific message for credits ──
    final_alert_message = record.get("income_alert_message") or risk.alert_message
    final_needs_clarification = record.get("needs_clarification", risk.needs_clarification)
    final_risk_score = record.get("risk_score", risk.score)
    final_risk_level = record.get("risk_level", risk.level)

    # Send real-time alert for all transactions
    alert_evt = sms_alert_event(
        transaction_type=parsed.transaction_type,
        amount=parsed.amount,
        merchant=parsed.merchant or "",
        risk_score=final_risk_score,
        risk_level=final_risk_level,
        alert_message=final_alert_message,
        suggestion=risk.suggestion if parsed.is_expense else f"₹{parsed.amount:,.0f} auto-added to your income tracker.",
        needs_clarification=False if parsed.is_income else final_needs_clarification,
        is_dirty_spend=risk.is_dirty_spend if parsed.is_expense else False,
        auto_category=record.get("auto_category") or risk.auto_category,
        bank_name=parsed.bank_name or "",
        transaction_mode=parsed.transaction_mode or "",
        sms_id=sms_id,
    )
    await _notify(alert_evt)

    # Send clarification request if needed (merchant unclear or high risk)
    if parsed.is_expense and (record.get("needs_clarification") or risk.needs_clarification):
        clarify_evt = transaction_clarification_event(
            sms_id=sms_id,
            amount=parsed.amount,
            merchant=parsed.merchant or "",
            risk_score=risk.score,
        )
        # Attach AI suggestions if available
        if record.get("ai_message"):
            clarify_evt["ai_message"] = record["ai_message"]
            clarify_evt["suggested_categories"] = record.get("ai_suggested_categories", [])
            clarify_evt["spending_insight"] = record.get("ai_spending_insight", "")
        await _notify(clarify_evt)

    return {
        "status": "processed",
        "sms_id": sms_id,
        "transaction_type": parsed.transaction_type,
        "amount": parsed.amount,
        "risk_score": risk.score,
        "risk_level": risk.level,
        "auto_processed": record["auto_processed"],
        "needs_clarification": record.get("needs_clarification", risk.needs_clarification),
        "merchant": parsed.merchant or "",
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


class SMSClassifyRequest(BaseModel):
    sms_content: str
    amount: float
    merchant: Optional[str] = ""
    transaction_mode: Optional[str] = "UPI"


@router.post("/ai-classify")
async def ai_classify_transaction(
    body: SMSClassifyRequest,
    user: dict = Depends(get_current_user),
):
    """
    Get Groq AI category suggestions for an unclear transaction.
    Called by the frontend clarification dialog.
    """
    result = await ai_classify_sms(
        sms_content=body.sms_content,
        amount=body.amount,
        merchant=body.merchant or "",
        transaction_mode=body.transaction_mode or "UPI",
    )
    return result


class TunnelUrlUpdate(BaseModel):
    url: str  # e.g. https://something.trycloudflare.com


@router.post("/update-tunnel-url")
async def update_tunnel_url(body: TunnelUrlUpdate):
    """
    Called by start-sms-tunnel.ps1 to update the live webhook URL.
    No auth needed – only reachable from localhost / tunnel itself.
    Writes APP_BASE_URL into .env so webhook-info shows the correct public URL.
    """
    url = body.url.rstrip("/")
    # Update process environment so active server uses it immediately
    os.environ["APP_BASE_URL"] = url

    # Persist to .env file so next restart uses it
    env_path = os.path.join(os.path.dirname(__file__), "..", "..", ".env")
    env_path = os.path.normpath(env_path)
    try:
        if os.path.exists(env_path):
            lines = open(env_path, encoding='utf-8').readlines()
            found = False
            new_lines = []
            for line in lines:
                if line.startswith("APP_BASE_URL="):
                    new_lines.append(f"APP_BASE_URL={url}\n")
                    found = True
                else:
                    new_lines.append(line)
            if not found:
                new_lines.append(f"APP_BASE_URL={url}\n")
            with open(env_path, "w", encoding='utf-8') as f:
                f.writelines(new_lines)
    except Exception as e:
        logger.warning(f"Could not update .env: {e}")

    logger.info(f"Tunnel URL updated to: {url}")
    return {"status": "ok", "url": url, "webhook_url": f"{url}/api/sms/webhook"}


@router.get("/webhook-info")
async def get_webhook_info(user: dict = Depends(get_current_user)):
    """Get webhook configuration info for httpSMS setup."""
    base_url = os.getenv("APP_BASE_URL", "http://localhost:8000")
    is_localhost = "localhost" in base_url or "127.0.0.1" in base_url
    return {
        "webhook_url": f"{base_url}/api/sms/webhook",
        "method": "POST",
        "secret_header": "X-Webhook-Secret",
        "user_id_header": "X-User-Id",
        "user_id": user["id"],
        "secret": WEBHOOK_SECRET,
        "is_localhost": is_localhost,
        "base_url": base_url,
        "setup_instructions": {
            "app": "httpSMS (Android) — https://httpsms.com",
            "step1": "Install httpSMS on your Android phone",
            "step2": f"Set webhook URL to: {base_url}/api/sms/webhook",
            "step3": f"Add header X-Webhook-Secret: {WEBHOOK_SECRET}",
            "step4": f"Add header X-User-Id: {user['id']}",
            "step5": "Enable SMS forwarding and test with a bank transaction",
        },
    }
