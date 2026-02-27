"""Shared helpers for API functions."""
import json


def json_response(data, status=200):
    return {
        "statusCode": status,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(data, default=str)
    }


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


def compute_projections_from_db(query_fn):
    """Riegel: T2 = T1 * (D2/D1)^1.06"""
    projections = {}
    for src, src_dist, targets in [
        ("10k", 10000, [("semi", 21097.5), ("marathon", 42195)]),
        ("semi", 21097.5, [("marathon", 42195)]),
    ]:
        best = query_fn(
            "SELECT MIN(time) as best_time FROM personal_records WHERE distance_type=?",
            (src,), one=True
        )
        if best and best["best_time"]:
            for tgt_name, tgt_dist in targets:
                projected = best["best_time"] * ((tgt_dist / src_dist) ** 1.06)
                key = f"{tgt_name}_from_{src}"
                projections[key] = {
                    "seconds": round(projected),
                    "formatted": fmt_time(round(projected)),
                    "source_time": fmt_time(best["best_time"]),
                    "source_distance": src,
                }
    return projections
