import sys, json, os
sys.path.insert(0, r"C:\Users\Einn Tzai\.workbuddy\skills\iconify-icon")
from scripts.config import set_api_key
from scripts.tools import get_icon_data

set_api_key(os.environ["XBY_APIKEY"])

for icon in ["lucide:rss", "lucide:newspaper", "mdi:rss"]:
    r = get_icon_data(icon=icon)
    print(f"===== {icon} success={r['success']} =====")
    if r["success"]:
        raw = r["raw"]
        print(json.dumps(raw, ensure_ascii=False, indent=2))
    else:
        print("message:", r["message"])
    print()
