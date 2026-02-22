#!/usr/bin/env python3

"""
Appwrite Database Setup for Incomiq
=====================================
Run ONCE to create the database + all collections + attributes in Appwrite Cloud.

Usage:
    cd backend
    python setup_appwrite.py
"""

import os, sys
from dotenv import load_dotenv

load_dotenv()

ENDPOINT    = os.getenv("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1")
PROJECT_ID  = os.getenv("APPWRITE_PROJECT_ID", "")
API_KEY     = os.getenv("APPWRITE_API_KEY", "")
DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID", "incomiq")

if not PROJECT_ID or not API_KEY:
    print("ERROR: Set APPWRITE_PROJECT_ID and APPWRITE_API_KEY in .env first.")
    sys.exit(1)

from appwrite.client import Client
from appwrite.services.databases import Databases
from appwrite.id import ID
from appwrite.exception import AppwriteException

client = Client()
client.set_endpoint(ENDPOINT)
client.set_project(PROJECT_ID)
client.set_key(API_KEY)

db = Databases(client)


def safe(fn, *args, **kwargs):
    """Run Appwrite call, ignore 'already exists' (409) errors."""
    try:
        result = fn(*args, **kwargs)
        return result
    except AppwriteException as e:
        if e.code == 409:
            print(f"  ↳ already exists, skipping")
        else:
            print(f"  ↳ ERROR {e.code}: {e.message}")
        return None


# ── 1. Create Database ──────────────────────────────────────────────────────
print(f"\n📦 Creating database '{DATABASE_ID}'...")
safe(db.create, DATABASE_ID, "Incomiq")


# ── 2. Helper ───────────────────────────────────────────────────────────────
def create_collection(col_id: str, name: str):
    print(f"\n📂 Collection: {col_id}")
    result = safe(db.create_collection, DATABASE_ID, col_id, name)
    return result


def str_attr(col: str, key: str, size=255, required=False, default=None):
    safe(db.create_string_attribute, DATABASE_ID, col, key, size, required, default)
    print(f"  + string  {key}")

def float_attr(col: str, key: str, required=False, default=None, min=None, max=None):
    safe(db.create_float_attribute, DATABASE_ID, col, key, required, default, min, max)
    print(f"  + float   {key}")

def bool_attr(col: str, key: str, required=False, default=False):
    safe(db.create_boolean_attribute, DATABASE_ID, col, key, required, default)
    print(f"  + boolean {key}")

def datetime_attr(col: str, key: str, required=False):
    safe(db.create_datetime_attribute, DATABASE_ID, col, key, required)
    print(f"  + datetime {key}")

def enum_attr(col: str, key: str, elements: list, required=False, default=None):
    safe(db.create_enum_attribute, DATABASE_ID, col, key, elements, required, default)
    print(f"  + enum    {key}")


# ── 3. users ────────────────────────────────────────────────────────────────
create_collection("users", "Users")
str_attr("users", "user_id",        required=True)
str_attr("users", "email",          required=True)
str_attr("users", "full_name",      required=False)
str_attr("users", "phone",          required=False)
float_attr("users", "monthly_income", default=0.0)
float_attr("users", "savings_target", default=0.0)
str_attr("users", "currency",        default="INR")
str_attr("users", "language",        default="en")
datetime_attr("users", "created_at")


# ── 4. incomes ──────────────────────────────────────────────────────────────
create_collection("incomes", "Incomes")
str_attr("incomes", "user_id",     required=True)
str_attr("incomes", "id",          required=True)
str_attr("incomes", "source",      required=True)
float_attr("incomes", "amount",    required=True)
str_attr("incomes", "date",        required=True)
str_attr("incomes", "notes",       default="")
str_attr("incomes", "category",    default="salary")
bool_attr("incomes", "via_sms",    default=False)
str_attr("incomes", "sms_id",      default="")
datetime_attr("incomes", "created_at")


# ── 5. expenses ─────────────────────────────────────────────────────────────
create_collection("expenses", "Expenses")
str_attr("expenses", "user_id",    required=True)
str_attr("expenses", "id",         required=True)
str_attr("expenses", "category",   required=True)
float_attr("expenses", "amount",   required=True)
str_attr("expenses", "date",       required=True)
str_attr("expenses", "notes",      default="")
str_attr("expenses", "merchant",   default="")
bool_attr("expenses", "is_dirty",  default=False)
bool_attr("expenses", "via_sms",   default=False)
str_attr("expenses", "sms_id",     default="")
datetime_attr("expenses", "created_at")


# ── 6. goals ────────────────────────────────────────────────────────────────
create_collection("goals", "Goals")
str_attr("goals", "user_id",       required=True)
str_attr("goals", "id",            required=True)
str_attr("goals", "name",          required=True)
float_attr("goals", "target_amount", required=True)
float_attr("goals", "saved_amount",  default=0.0)
str_attr("goals", "deadline",      default="")
str_attr("goals", "status",        default="active")
str_attr("goals", "category",      default="general")
datetime_attr("goals", "created_at")


# ── 7. investments ──────────────────────────────────────────────────────────
create_collection("investments", "Investments")
str_attr("investments", "user_id",    required=True)
str_attr("investments", "id",         required=True)
str_attr("investments", "name",       required=True)
str_attr("investments", "type",       default="stocks")
float_attr("investments", "amount",   required=True)
float_attr("investments", "current_value", default=0.0)
float_attr("investments", "returns",  default=0.0)
str_attr("investments", "date",       default="")
datetime_attr("investments", "created_at")


# ── 8. sms_records ──────────────────────────────────────────────────────────
create_collection("sms_records", "SMS Records")
str_attr("sms_records", "user_id",      required=True)
str_attr("sms_records", "sms_id",       required=True)
str_attr("sms_records", "raw_body",     size=1000)
str_attr("sms_records", "sender_id",    default="")
str_attr("sms_records", "bank_name",    default="")
float_attr("sms_records", "amount",     default=0.0)
enum_attr("sms_records", "txn_type",    ["credit", "debit", "unknown"], default="unknown")
str_attr("sms_records", "merchant",     default="")
str_attr("sms_records", "txn_mode",     default="")
float_attr("sms_records", "risk_score", default=0.0)
str_attr("sms_records", "risk_level",   default="safe")
str_attr("sms_records", "category",     default="")
bool_attr("sms_records", "is_dirty",    default=False)
bool_attr("sms_records", "clarified",   default=False)
str_attr("sms_records", "linked_record_id", default="")
datetime_attr("sms_records", "received_at")


# ── 9. financial_state ──────────────────────────────────────────────────────
create_collection("financial_state", "Financial State")
str_attr("financial_state", "user_id",     required=True)
float_attr("financial_state", "truly_available",  default=0.0)
float_attr("financial_state", "safe_to_spend",    default=0.0)
float_attr("financial_state", "pending_income",   default=0.0)
float_attr("financial_state", "total_income",     default=0.0)
float_attr("financial_state", "total_expenses",   default=0.0)
datetime_attr("financial_state", "last_updated")


print("\n\n✅ Appwrite setup complete!")
print(f"   Endpoint:    {ENDPOINT}")
print(f"   Project:     {PROJECT_ID}")
print(f"   Database:    {DATABASE_ID}")
print("\nAll collections created with attributes.")
print("You can now start the backend: uvicorn app.main:app --reload")
