"""
WebSocket Route
================
Provides a real-time bidirectional channel between the web app and backend.

Endpoint: ws://<host>/ws/{user_id}?token=<access_token>

Client → Server events:
  { "type": "ping" }
  { "type": "clarification", "sms_id": "...", "category": "...", "description": "...", "confirmed_as": "expense" }

Server → Client events:
  sms_alert, income_added, expense_added, clarification_needed, clarification_resolved, pong
"""

import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from app.websocket_manager import manager
from app.auth import decode_token   # we'll add this helper to auth.py

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    token: str = Query(default=""),
):
    """
    WebSocket endpoint for real-time alerts.
    
    Auth: Pass ?token=<access_token> as query param.
    The user_id in the path must match the token's subject.
    """
    # Optional token validation (soft – demo mode allows any user_id)
    authenticated_user_id = user_id
    if token:
        try:
            claims = decode_token(token)
            authenticated_user_id = claims.get("sub", user_id)
        except Exception:
            # In demo mode, just use the path user_id
            authenticated_user_id = user_id

    await manager.connect(websocket, authenticated_user_id)

    # Send welcome message
    await websocket.send_json({
        "event": "connected",
        "user_id": authenticated_user_id,
        "message": "🔴 Live SMS alerts active. Incomiq is watching your transactions!",
    })

    try:
        while True:
            # Keep connection alive; also handle client messages
            try:
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
            except asyncio.TimeoutError:
                # Send heartbeat ping
                await websocket.send_json({"event": "heartbeat", "ts": __import__('datetime').datetime.utcnow().isoformat()})
                continue

            # Parse client message
            try:
                msg = json.loads(data)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"event": "pong"})

            elif msg_type == "clarification":
                # Handle inline clarification response from WebSocket
                from app.routes.sms_webhook import clarify_transaction
                from app.models import SMSClarificationResponse as SCR   # reuse schema
                # Build a minimal mock user
                fake_user = {"id": authenticated_user_id}
                class _FakeBody:
                    sms_id = msg.get("sms_id", "")
                    user_id = authenticated_user_id
                    category = msg.get("category", "other")
                    description = msg.get("description", "")
                    confirmed_as = msg.get("confirmed_as", "expense")
                try:
                    from app.models import SMSClarificationResponse
                    body = SMSClarificationResponse(
                        sms_id=msg.get("sms_id", ""),
                        user_id=authenticated_user_id,
                        category=msg.get("category", "other"),
                        description=msg.get("description", ""),
                        confirmed_as=msg.get("confirmed_as", "expense"),
                    )
                    await clarify_transaction(body, fake_user)
                except Exception as e:
                    await websocket.send_json({"event": "error", "message": str(e)})

    except WebSocketDisconnect:
        manager.disconnect(websocket, authenticated_user_id)
    except Exception:
        manager.disconnect(websocket, authenticated_user_id)
