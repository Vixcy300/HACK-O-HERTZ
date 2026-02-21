"""
Appwrite Service – wraps the Appwrite Python SDK for Incomiq.

Uses Appwrite Cloud as the primary database when credentials are present.
Falls back to local JSON storage transparently if Appwrite is unavailable.

Collections (all in database "incomiq"):
  users, incomes, expenses, goals, investments, sms_records
"""

import os
import logging
from functools import lru_cache
from typing import Optional

logger = logging.getLogger(__name__)

# ── Credentials ────────────────────────────────────────────────────────────────
APPWRITE_ENDPOINT   = os.getenv("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1")
APPWRITE_PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID", "")
APPWRITE_API_KEY    = os.getenv("APPWRITE_API_KEY", "")
APPWRITE_DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID", "incomiq")

# Collection IDs (must match what's created in setup_appwrite.py)
COL_USERS       = "users"
COL_INCOMES     = "incomes"
COL_EXPENSES    = "expenses"
COL_GOALS       = "goals"
COL_INVESTMENTS = "investments"
COL_SMS_RECORDS = "sms_records"


def _is_configured() -> bool:
    return bool(APPWRITE_PROJECT_ID and APPWRITE_API_KEY)


@lru_cache(maxsize=1)
def get_appwrite_client():
    """Return a cached Appwrite Client (server-side, uses API key)."""
    if not _is_configured():
        return None
    try:
        from appwrite.client import Client
        client = Client()
        client.set_endpoint(APPWRITE_ENDPOINT)
        client.set_project(APPWRITE_PROJECT_ID)
        client.set_key(APPWRITE_API_KEY)
        return client
    except Exception as e:
        logger.warning(f"Appwrite client init failed: {e}")
        return None


def get_databases():
    """Return an Appwrite Databases service, or None if not configured."""
    client = get_appwrite_client()
    if not client:
        return None
    try:
        from appwrite.services.databases import Databases
        return Databases(client)
    except Exception as e:
        logger.warning(f"Appwrite Databases init failed: {e}")
        return None


def get_users_service():
    """Return an Appwrite Users service (server-side admin), or None."""
    client = get_appwrite_client()
    if not client:
        return None
    try:
        from appwrite.services.users import Users
        return Users(client)
    except Exception as e:
        logger.warning(f"Appwrite Users init failed: {e}")
        return None


# ── Generic CRUD helpers ───────────────────────────────────────────────────────

def aw_list(collection_id: str, queries: list = None) -> Optional[list]:
    """List documents from a collection. Returns None on failure."""
    db = get_databases()
    if not db:
        return None
    try:
        result = db.list_documents(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=collection_id,
            queries=queries or [],
        )
        return result.get("documents", [])
    except Exception as e:
        logger.warning(f"Appwrite list {collection_id} failed: {e}")
        return None


def aw_get(collection_id: str, document_id: str) -> Optional[dict]:
    """Get a single document. Returns None on failure."""
    db = get_databases()
    if not db:
        return None
    try:
        return db.get_document(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=collection_id,
            document_id=document_id,
        )
    except Exception as e:
        logger.warning(f"Appwrite get {collection_id}/{document_id} failed: {e}")
        return None


def aw_create(collection_id: str, data: dict, document_id: str = None) -> Optional[dict]:
    """Create a document. Returns the document or None on failure."""
    db = get_databases()
    if not db:
        return None
    try:
        from appwrite.id import ID
        doc_id = document_id or ID.unique()
        return db.create_document(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=collection_id,
            document_id=doc_id,
            data=data,
        )
    except Exception as e:
        logger.warning(f"Appwrite create {collection_id} failed: {e}")
        return None


def aw_update(collection_id: str, document_id: str, data: dict) -> Optional[dict]:
    """Update a document. Returns updated doc or None on failure."""
    db = get_databases()
    if not db:
        return None
    try:
        return db.update_document(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=collection_id,
            document_id=document_id,
            data=data,
        )
    except Exception as e:
        logger.warning(f"Appwrite update {collection_id}/{document_id} failed: {e}")
        return None


def aw_delete(collection_id: str, document_id: str) -> bool:
    """Delete a document. Returns True on success."""
    db = get_databases()
    if not db:
        return False
    try:
        db.delete_document(
            database_id=APPWRITE_DATABASE_ID,
            collection_id=collection_id,
            document_id=document_id,
        )
        return True
    except Exception as e:
        logger.warning(f"Appwrite delete {collection_id}/{document_id} failed: {e}")
        return False


def appwrite_available() -> bool:
    """Quick health check — can we reach Appwrite?"""
    return get_databases() is not None and _is_configured()
