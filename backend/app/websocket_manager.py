"""
WebSocket Connection Manager
=============================
Manages persistent WebSocket connections for real-time alerts.
Each user_id has a set of active connections.

Usage:
    manager = ConnectionManager()
    
    @app.websocket("/ws/{user_id}")
    async def websocket_endpoint(ws: WebSocket, user_id: str):
        await manager.connect(ws, user_id)
        ...
"""

import json
import asyncio
from typing import Dict, Set
from fastapi import WebSocket
from datetime import datetime


class ConnectionManager:
    """Manages WebSocket connections, grouped by user_id."""

    def __init__(self):
        # user_id → set of websocket connections
        self._connections: Dict[str, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: str):
        """Accept and register a new WebSocket connection."""
        await websocket.accept()
        if user_id not in self._connections:
            self._connections[user_id] = set()
        self._connections[user_id].add(websocket)
        print(f"[WS] Connected: {user_id}  (total: {self.total_connections})")

    def disconnect(self, websocket: WebSocket, user_id: str):
        """Remove a WebSocket connection when it closes."""
        if user_id in self._connections:
            self._connections[user_id].discard(websocket)
            if not self._connections[user_id]:
                del self._connections[user_id]
        print(f"[WS] Disconnected: {user_id}  (total: {self.total_connections})")

    @property
    def total_connections(self) -> int:
        return sum(len(s) for s in self._connections.values())

    async def send_to_user(self, user_id: str, message: dict):
        """
        Send a JSON message to all connections of a specific user.
        Dead connections are removed automatically.
        """
        if user_id not in self._connections:
            return

        dead: list[WebSocket] = []
        payload = json.dumps(message)

        for ws in list(self._connections[user_id]):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)

        for ws in dead:
            self._connections[user_id].discard(ws)
        if user_id in self._connections and not self._connections[user_id]:
            del self._connections[user_id]

    async def broadcast(self, message: dict):
        """Broadcast a message to ALL connected users."""
        dead: dict[str, list[WebSocket]] = {}
        payload = json.dumps(message)

        for user_id, sockets in list(self._connections.items()):
            for ws in list(sockets):
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.setdefault(user_id, []).append(ws)

        for user_id, sockets in dead.items():
            for ws in sockets:
                self._connections[user_id].discard(ws)

    def is_connected(self, user_id: str) -> bool:
        """Check if a user has at least one active connection."""
        return bool(self._connections.get(user_id))

    def connected_users(self) -> list[str]:
        return list(self._connections.keys())


# ── Global singleton ──────────────────────────────────────
manager = ConnectionManager()


# ── Event builders ────────────────────────────────────────

def sms_alert_event(
    *,
    transaction_type: str,
    amount: float,
    merchant: str,
    risk_score: float,
    risk_level: str,
    alert_message: str,
    suggestion: str,
    needs_clarification: bool,
    is_dirty_spend: bool,
    auto_category: str,
    bank_name: str,
    transaction_mode: str,
    sms_id: str,
    raw_sms: str = "",
) -> dict:
    """Build a standardised SMS alert event for the frontend."""
    return {
        "event": "sms_alert",
        "timestamp": datetime.utcnow().isoformat(),
        "sms_id": sms_id,
        "transaction_type": transaction_type,
        "amount": amount,
        "merchant": merchant,
        "bank_name": bank_name,
        "transaction_mode": transaction_mode,
        "risk_score": risk_score,
        "risk_level": risk_level,
        "alert_message": alert_message,
        "suggestion": suggestion,
        "needs_clarification": needs_clarification,
        "is_dirty_spend": is_dirty_spend,
        "auto_category": auto_category,
        "raw_sms": raw_sms,
    }


def income_added_event(income: dict) -> dict:
    """Build an event for when income is auto-added from SMS."""
    return {
        "event": "income_added",
        "timestamp": datetime.utcnow().isoformat(),
        "income": income,
        "message": f"💰 Income of ₹{income.get('amount', 0):,.0f} detected and added automatically!",
    }


def expense_added_event(expense: dict) -> dict:
    """Build an event for when an expense is auto-added from SMS."""
    return {
        "event": "expense_added",
        "timestamp": datetime.utcnow().isoformat(),
        "expense": expense,
        "message": f"💸 Expense of ₹{expense.get('amount', 0):,.0f} recorded via SMS.",
    }


def transaction_clarification_event(
    sms_id: str,
    amount: float,
    merchant: str,
    risk_score: float,
) -> dict:
    """Ask the user to clarify what they spent money on."""
    return {
        "event": "clarification_needed",
        "timestamp": datetime.utcnow().isoformat(),
        "sms_id": sms_id,
        "amount": amount,
        "merchant": merchant,
        "risk_score": risk_score,
        "message": (
            f"We detected a ₹{amount:,.0f} spend"
            + (f" at {merchant}" if merchant else "")
            + ". What did you buy? (This helps track your budget accurately)"
        ),
        "suggested_categories": [
            "🍕 Food / Dining",
            "🛒 Groceries",
            "🚗 Transport / Fuel",
            "💊 Healthcare",
            "📚 Education / Exam Fee",
            "💡 Utilities / Bills",
            "👗 Shopping / Clothes",
            "🎮 Entertainment",
            "📱 Mobile Recharge",
            "🏠 Rent / Maintenance",
            "💰 Savings / Investment",
            "Other",
        ],
    }
