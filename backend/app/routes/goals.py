"""Savings goals routes – Appwrite primary, local-file fallback."""

import os
import logging
import httpx
from datetime import datetime
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException
from app.auth import get_current_user
from app.models import GoalCreate, AddMoneyRequest

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/goals", tags=["goals"])

_demo_goals: list[dict] = []


def _use_appwrite() -> bool:
    try:
        from app.appwrite_service import appwrite_available
        return appwrite_available()
    except Exception:
        return False


def _use_local_for(user: dict) -> bool:
    """Return True if we should use file-based local storage for this user."""
    return user.get("is_local", False) or not _use_appwrite()


async def _fetch_product_price(product_name: str) -> dict | None:
    """Fetch Indian retail price for a product name or URL.
    - Amazon URLs: scrape price directly with httpx, extract slug as fallback label
    - Other URLs: extract domain/path as display name
    - Plain names: ask Groq AI for current market price estimate
    """
    import re, json

    query_name = product_name  # human-readable name for Groq
    scraped_price: dict | None = None

    # ── Amazon scraper ──────────────────────────────────────────────────────
    if re.search(r'amazon\.(in|com)', product_name):
        # Extract readable product title from URL slug (before /dp/)
        slug_match = re.search(r'amazon\.(?:in|com)/([A-Za-z0-9][A-Za-z0-9\-]{4,})/dp/', product_name)
        if slug_match:
            query_name = slug_match.group(1).replace('-', ' ').title()
        try:
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                              'AppleWebKit/537.36 (KHTML, like Gecko) '
                              'Chrome/124.0.0.0 Safari/537.36',
                'Accept-Language': 'en-IN,en;q=0.9',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            }
            async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
                resp = await client.get(product_name, headers=headers)
                html = resp.text
            # Try corePriceDisplay JSON
            price_match = re.search(r'"priceAmount"\s*:\s*(\d[\d\.]*)', html)
            if not price_match:
                # span.a-price-whole (INR digit block)
                price_match = re.search(r'<span class="a-price-whole">([0-9,]+)<', html)
            if price_match:
                price = float(price_match.group(1).replace(',', ''))
                # Get page <title> as product label
                title_m = re.search(r'<title>([^<]{10,100}?)(?:\s*[:\|].*)?</title>', html)
                note = title_m.group(1).strip()[:80] if title_m else query_name
                scraped_price = {'price': price, 'currency': 'INR', 'note': note, 'trend': 'stable'}
        except Exception as exc:
            logger.warning('Amazon scrape failed for %s: %s', product_name[:60], exc)

    if scraped_price:
        return scraped_price

    # ── Groq AI fallback (also handles plain product names) ─────────────────
    try:
        groq_key = os.getenv('GROQ_API_KEY', '')
        if not groq_key:
            return None
        from groq import Groq
        client = Groq(api_key=groq_key)
        today = datetime.now().strftime('%B %Y')
        prompt = (
            f"What is the current market retail price of '{query_name}' in India (INR) as of {today}? "
            f"Reply with JSON only: {{\"price\": <number>, \"currency\": \"INR\", \"note\": \"<brief source>\", \"trend\": \"rising|stable|falling\"}}. "
            f"If unknown or unavailable set price to null."
        )
        resp = client.chat.completions.create(
            model='llama-3.1-8b-instant',
            messages=[{'role': 'user', 'content': prompt}],
            max_tokens=150,
            temperature=0.1,
        )
        text = resp.choices[0].message.content.strip()
        m = re.search(r'\{.*\}', text, re.DOTALL)
        if m:
            data = json.loads(m.group())
            # Attach human-readable name if it was extracted from URL
            if query_name != product_name and not data.get('note'):
                data['note'] = query_name
            return data
    except Exception as exc:
        logger.warning('Product price lookup failed: %s', exc)
    return None


def _seed_demo_goals():
    if _demo_goals:
        return
    seeds = [
        ("Emergency Fund", 100000, "2025-12-31", "shield", 45000, 8000, None),
        ("New Laptop",      75000,  "2025-09-30", "laptop", 32000, 10000, "Apple MacBook Air M3"),
        ("Goa Vacation",   50000,  "2025-08-15", "palmtree", 18000, 6000, None),
    ]
    for name, target, td, icon, current, contrib, product in seeds:
        _demo_goals.append(
            {
                "id": str(uuid4()),
                "user_id": "demo-user-001",
                "name": name,
                "target_amount": target,
                "current_amount": current,
                "target_date": td,
                "icon": icon,
                "monthly_contribution": contrib,
                "track_product": product,
                "created_at": datetime.now().isoformat(),
            }
        )


@router.get("")
async def list_goals(user: dict = Depends(get_current_user)):
    if user.get("is_demo"):
        _seed_demo_goals()
        return {"goals": [g for g in _demo_goals if g["user_id"] == user["id"]]}

    if _use_local_for(user):
        from app.local_storage import get_goals
        return {"goals": get_goals(user["id"])}

    # Appwrite
    from app.appwrite_service import aw_list, COL_GOALS
    from appwrite.query import Query
    docs = aw_list(COL_GOALS, queries=[Query.equal("user_id", user["id"])])
    if docs is None:
        from app.local_storage import get_goals
        return {"goals": get_goals(user["id"])}
    return {"goals": docs}


@router.post("")
async def create_goal(body: GoalCreate, user: dict = Depends(get_current_user)):
    record = {
        "id": str(uuid4()),
        "user_id": user["id"],
        "name": body.name,
        "target_amount": body.target_amount,
        "current_amount": 0.0,
        "target_date": body.target_date.isoformat(),
        "icon": body.icon,
        "monthly_contribution": body.monthly_contribution,
        "track_product": body.track_product,
        "created_at": datetime.now().isoformat(),
    }

    if user.get("is_demo"):
        _seed_demo_goals()
        _demo_goals.append(record)
        return record

    if _use_local_for(user):
        from app.local_storage import get_goals, save_goals
        goals = get_goals(user["id"])
        goals.append(record)
        save_goals(user["id"], goals)
        return record

    # Appwrite
    from app.appwrite_service import aw_create, COL_GOALS
    doc = aw_create(COL_GOALS, record, document_id=record["id"])
    if doc is None:
        from app.local_storage import get_goals, save_goals
        goals = get_goals(user["id"])
        goals.append(record)
        save_goals(user["id"], goals)
    return record


@router.post("/{goal_id}/add-money")
async def add_money(
    goal_id: str, body: AddMoneyRequest, user: dict = Depends(get_current_user)
):
    if user.get("is_demo"):
        _seed_demo_goals()
        for g in _demo_goals:
            if g["id"] == goal_id and g["user_id"] == user["id"]:
                g["current_amount"] = min(
                    g["current_amount"] + body.amount, g["target_amount"]
                )
                return g
        raise HTTPException(status_code=404, detail="Goal not found")

    if _use_local_for(user):
        from app.local_storage import get_goals, save_goals
        goals = get_goals(user["id"])
        for g in goals:
            if g["id"] == goal_id:
                g["current_amount"] = min(
                    g["current_amount"] + body.amount, g["target_amount"]
                )
                save_goals(user["id"], goals)
                return g
        raise HTTPException(status_code=404, detail="Goal not found")

    # Appwrite
    from app.appwrite_service import aw_get, aw_update, COL_GOALS
    doc = aw_get(COL_GOALS, goal_id)
    if not doc or doc.get("user_id") != user["id"]:
        raise HTTPException(status_code=404, detail="Goal not found")
    new_amount = min(doc["current_amount"] + body.amount, doc["target_amount"])
    updated = aw_update(COL_GOALS, goal_id, {"current_amount": new_amount})
    return updated or {**doc, "current_amount": new_amount}


@router.delete("/{goal_id}")
async def delete_goal(goal_id: str, user: dict = Depends(get_current_user)):
    if user.get("is_demo"):
        _seed_demo_goals()
        before = len(_demo_goals)
        _demo_goals[:] = [
            g for g in _demo_goals if not (g["id"] == goal_id and g["user_id"] == user["id"])
        ]
        if len(_demo_goals) == before:
            raise HTTPException(status_code=404, detail="Goal not found")
        return {"ok": True}

    if _use_local_for(user):
        from app.local_storage import get_goals, save_goals
        goals = get_goals(user["id"])
        new_goals = [g for g in goals if g["id"] != goal_id]
        if len(new_goals) == len(goals):
            raise HTTPException(status_code=404, detail="Goal not found")
        save_goals(user["id"], new_goals)
        return {"ok": True}

    # Appwrite
    from app.appwrite_service import aw_delete, COL_GOALS
    aw_delete(COL_GOALS, goal_id)
    return {"ok": True}


@router.get("/product-price")
async def get_product_price_by_query(
    q: str, user: dict = Depends(get_current_user)
):
    """GET /goals/product-price?q=iPhone+15  — returns current market price estimate."""
    if not q.strip():
        raise HTTPException(status_code=400, detail="q is required")
    price_data = await _fetch_product_price(q.strip())
    if not price_data:
        return {
            "product": q,
            "price": None,
            "currency": "INR",
            "note": "Price data unavailable (configure GROQ_API_KEY)",
            "trend": "unknown",
        }
    return {"product": q, **price_data}


@router.get("/{goal_id}/product-price")
async def get_goal_product_price(
    goal_id: str, user: dict = Depends(get_current_user)
):
    """Returns current market price for the product linked to a specific goal."""
    # Locate the goal
    goal = None
    if user.get("is_demo"):
        _seed_demo_goals()
        goal = next(
            (g for g in _demo_goals if g["id"] == goal_id and g["user_id"] == user["id"]),
            None,
        )
    elif _use_local_for(user):
        from app.local_storage import get_goals
        goal = next((g for g in get_goals(user["id"]) if g["id"] == goal_id), None)
    else:
        from app.appwrite_service import aw_get, COL_GOALS
        goal = aw_get(COL_GOALS, goal_id)

    if not goal:
        raise HTTPException(status_code=404, detail="Goal not found")
    product = goal.get("track_product")
    if not product:
        raise HTTPException(status_code=400, detail="No product linked to this goal")

    price_data = await _fetch_product_price(product)
    target = goal["target_amount"]
    base = {"product": product, "goal_target": target}
    if not price_data:
        return {**base, "price": None, "currency": "INR", "note": "Unavailable", "trend": "unknown", "difference": 0}
    diff = (price_data.get("price") or target) - target
    return {**base, **price_data, "difference": diff}
