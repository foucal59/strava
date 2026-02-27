"""Shared utilities for serverless functions."""
import json
import httpx

STRAVA_API = "https://www.strava.com/api/v3"


def json_resp(data, status=200):
    body = json.dumps(data, default=str)
    return body, status, {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
    }


def strava_get(token, endpoint, params=None):
    """Direct Strava API call."""
    with httpx.Client(timeout=30.0) as client:
        r = client.get(
            f"{STRAVA_API}{endpoint}",
            headers={"Authorization": f"Bearer {token}"},
            params=params or {}
        )
        r.raise_for_status()
        return r.json()


def get_all_activities(token, per_page=200):
    """Fetch all running activities (paginated)."""
    all_acts = []
    page = 1
    while True:
        acts = strava_get(token, "/athlete/activities", {"page": page, "per_page": per_page})
        if not acts:
            break
        all_acts.extend([a for a in acts if a.get("type") == "Run"])
        if len(acts) < per_page:
            break
        page += 1
    return all_acts


def fmt_time(seconds):
    if not seconds:
        return "-"
    seconds = int(seconds)
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}h{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def compute_pace(time_s, dist_type):
    distances = {"5k": 5, "10k": 10, "semi": 21.0975, "marathon": 42.195}
    d = distances.get(dist_type, 0)
    if d == 0 or not time_s:
        return ""
    pace_s = time_s / d
    return f"{int(pace_s // 60)}:{int(pace_s % 60):02d}/km"


def extract_token(headers):
    """Extract Bearer token from Authorization header."""
    auth = headers.get("Authorization") or headers.get("authorization") or ""
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


def match_distance(distance_m, dist_type):
    """Check if an activity distance matches a standard race distance."""
    thresholds = {
        "5k": (4500, 5500),
        "10k": (9500, 10500),
        "semi": (20500, 22000),
        "marathon": (41500, 43500),
    }
    lo, hi = thresholds.get(dist_type, (0, 0))
    return lo <= distance_m <= hi


def compute_prs(activities):
    """Compute personal records from activity list."""
    prs = {}
    for dist_type in ["5k", "10k", "semi", "marathon"]:
        matching = []
        for a in activities:
            if match_distance(a.get("distance", 0), dist_type):
                matching.append({
                    "date": a["start_date_local"],
                    "time": a["moving_time"],
                    "activity_id": a["id"],
                    "distance": a["distance"],
                })
        matching.sort(key=lambda x: x["time"])
        if matching:
            best_time = matching[0]["time"]
            for m in matching:
                m["formatted"] = fmt_time(m["time"])
                m["pace"] = compute_pace(m["time"], dist_type)
                m["is_best"] = m["time"] == best_time
                m["pct_off_best"] = round(((m["time"] - best_time) / best_time) * 100, 1) if best_time > 0 else 0
        prs[dist_type] = matching
    return prs


def riegel_projection(t1, d1, d2):
    """Riegel formula: T2 = T1 * (D2/D1)^1.06"""
    return t1 * ((d2 / d1) ** 1.06)
