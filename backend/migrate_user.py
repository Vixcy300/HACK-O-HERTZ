import json, shutil, os

data_dir = r"C:\Users\vigne\OneDrive\Desktop\code-4-change-vscod\backend\data"
new_uid = "3470c879739194bff82cdb74b9587210"
old_uid = "92f1e026db2d33a10a8704e90666291a"

# 1. Update device mapping
devices = [{"phone": "+919600700120", "user_id": new_uid, "registered_at": "2026-02-21T00:00:00"}]
with open(os.path.join(data_dir, "global_sms_devices.json"), "w", encoding="utf-8") as f:
    json.dump(devices, f, ensure_ascii=False, indent=2)
print("Device mapped to", new_uid)

# 2. Copy SMS records to new user file
src = os.path.join(data_dir, f"{old_uid}_sms_records.json")
dst = os.path.join(data_dir, f"{new_uid}_sms_records.json")
shutil.copy2(src, dst)
records = json.load(open(dst, encoding="utf-8"))
# Filter out empty dicts
records = [r for r in records if r and r.get("id")]
with open(dst, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False)
print(f"Copied {len(records)} SMS records to new user file: {dst}")
