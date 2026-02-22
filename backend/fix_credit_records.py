"""
One-time script to fix old SMS records where credit transactions
were incorrectly marked as needs_clarification=True or risk_level=high_risk.

Run from the backend directory:
  python fix_credit_records.py
"""

import json
import glob
import os

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

def fix_file(path):
    with open(path, "r", encoding="utf-8") as f:
        records = json.load(f)

    if not isinstance(records, list):
        return 0

    changed = 0
    for rec in records:
        t = rec.get("parsed_type") or rec.get("transaction_type") or rec.get("type") or ""
        if t.lower() == "credit":
            dirty = False
            if rec.get("needs_clarification"):
                rec["needs_clarification"] = False
                dirty = True
            if not rec.get("clarified"):
                rec["clarified"] = True
                dirty = True
            if rec.get("risk_score", 0) != 0.0:
                rec["risk_score"] = 0.0
                dirty = True
            if rec.get("risk_level", "safe") not in ("safe",):
                rec["risk_level"] = "safe"
                dirty = True
            if dirty:
                changed += 1

    if changed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(records, f, indent=2, ensure_ascii=False)
        print(f"  Fixed {changed} credit record(s) in {os.path.basename(path)}")

    return changed


def main():
    sms_files = glob.glob(os.path.join(DATA_DIR, "*_sms_records.json"))
    if not sms_files:
        print("No SMS record files found in", DATA_DIR)
        return

    total = 0
    for path in sms_files:
        total += fix_file(path)

    print(f"\nDone. Total records fixed: {total}")


if __name__ == "__main__":
    main()
