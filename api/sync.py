"""
Sync endpoint: fetches activities from Strava, stores in DB, computes PRs.
Called manually or via cron.
"""
from http.server import BaseHTTPRequestHandler
import json
from datetime import datetime
from api._db import init_db, query, execute, get_conn
from api._strava import api_get


def sync_activities():
    """Incremental sync of running activities."""
    row = query("SELECT MAX(date) as last_date FROM activities", one=True)
    last_date = row["last_date"] if row and row["last_date"] else None

    after = None
    if last_date:
        after = int(datetime.fromisoformat(last_date.replace("Z", "")).timestamp()) - 86400

    total = 0
    page = 1

    while True:
        params = {"page": page, "per_page": 100}
        if after:
            params["after"] = after

        activities = api_get("/athlete/activities", params)
        if not activities:
            break

        conn = get_conn()
        for act in activities:
            if act.get("type") != "Run":
                continue
            conn.execute("""
                INSERT OR REPLACE INTO activities
                (id, athlete_id, name, date, distance, moving_time, elapsed_time,
                 average_speed, max_speed, total_elevation_gain, average_heartrate,
                 max_heartrate, type, suffer_score, start_latlng, average_cadence, calories)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                act["id"],
                act.get("athlete", {}).get("id"),
                act.get("name"),
                act["start_date_local"],
                act.get("distance", 0),
                act.get("moving_time", 0),
                act.get("elapsed_time", 0),
                act.get("average_speed"),
                act.get("max_speed"),
                act.get("total_elevation_gain", 0),
                act.get("average_heartrate"),
                act.get("max_heartrate"),
                act.get("type", "Run"),
                act.get("suffer_score"),
                str(act.get("start_latlng")) if act.get("start_latlng") else None,
                act.get("average_cadence"),
                act.get("calories"),
            ))
            total += 1
        conn.commit()
        import os
        if os.environ.get("TURSO_AUTH_TOKEN"):
            conn.sync()

        page += 1
        if len(activities) < 100:
            break

    return total


def sync_details():
    """Fetch segment efforts for recent activities."""
    rows = query("""
        SELECT a.id FROM activities a
        LEFT JOIN segment_efforts se ON se.activity_id = a.id
        WHERE se.id IS NULL AND a.type='Run'
        ORDER BY a.date DESC LIMIT 30
    """)
    activity_ids = [r["id"] for r in rows]
    count = 0

    conn = get_conn()
    for act_id in activity_ids:
        try:
            detail = api_get(f"/activities/{act_id}")
            for effort in detail.get("segment_efforts", []):
                seg = effort.get("segment", {})
                conn.execute("""
                    INSERT OR REPLACE INTO segments
                    (id, name, distance, elevation_gain, average_grade, climb_category, city, state, start_latlng, end_latlng)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    seg["id"], seg.get("name"), seg.get("distance"),
                    seg.get("total_elevation_gain"), seg.get("average_grade"),
                    seg.get("climb_category"), seg.get("city"), seg.get("state"),
                    str(seg.get("start_latlng")) if seg.get("start_latlng") else None,
                    str(seg.get("end_latlng")) if seg.get("end_latlng") else None,
                ))
                conn.execute("""
                    INSERT OR REPLACE INTO segment_efforts
                    (id, activity_id, segment_id, elapsed_time, moving_time, date, pr_rank, kom_rank,
                     average_heartrate, max_heartrate)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, (
                    effort["id"], act_id, seg["id"],
                    effort.get("elapsed_time", 0), effort.get("moving_time"),
                    effort.get("start_date_local"), effort.get("pr_rank"),
                    effort.get("kom_rank"), effort.get("average_heartrate"),
                    effort.get("max_heartrate"),
                ))
                count += 1
        except Exception as e:
            print(f"Error detail {act_id}: {e}")
            continue

    conn.commit()
    import os
    if os.environ.get("TURSO_AUTH_TOKEN"):
        conn.sync()
    return count


def compute_prs():
    """Compute best times for standard distances."""
    thresholds = {
        "5k": (4500, 5500),
        "10k": (9500, 10500),
        "semi": (20500, 22000),
        "marathon": (41500, 43500),
    }
    athlete = query("SELECT id FROM athlete LIMIT 1", one=True)
    if not athlete:
        return

    conn = get_conn()
    for dist_type, (min_d, max_d) in thresholds.items():
        rows = query("""
            SELECT id, date, moving_time FROM activities
            WHERE distance BETWEEN ? AND ? AND type='Run'
            ORDER BY moving_time ASC
        """, (min_d, max_d))

        for row in rows:
            existing = query(
                "SELECT id FROM personal_records WHERE athlete_id=? AND activity_id=?",
                (athlete["id"], row["id"]), one=True
            )
            if not existing:
                conn.execute("""
                    INSERT INTO personal_records (athlete_id, distance_type, date, time, activity_id)
                    VALUES (?, ?, ?, ?, ?)
                """, (athlete["id"], dist_type, row["date"], row["moving_time"], row["id"]))

    conn.commit()
    import os
    if os.environ.get("TURSO_AUTH_TOKEN"):
        conn.sync()


def snapshot_legends():
    """Daily local legend snapshot."""
    from datetime import date as dt_date
    today = dt_date.today().isoformat()

    existing = query("SELECT COUNT(*) as c FROM local_legend_snapshot WHERE date=?", (today,), one=True)
    if existing and existing["c"] > 0:
        return 0

    segments = query("SELECT DISTINCT segment_id FROM segment_efforts")
    count = 0
    conn = get_conn()

    for seg_row in segments:
        try:
            seg_data = api_get(f"/segments/{seg_row['segment_id']}")
            ll = seg_data.get("local_legend") or {}
            is_ll = 1 if ll.get("is_local_legend") else 0
            effort_count = ll.get("effort_count", 0)

            conn.execute("""
                INSERT OR REPLACE INTO local_legend_snapshot (date, segment_id, is_local_legend, effort_count)
                VALUES (?, ?, ?, ?)
            """, (today, seg_row["segment_id"], is_ll, effort_count))
            count += 1
        except Exception as e:
            print(f"LL error {seg_row['segment_id']}: {e}")
            continue

    conn.commit()
    import os
    if os.environ.get("TURSO_AUTH_TOKEN"):
        conn.sync()
    return count


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        init_db()
        try:
            n_act = sync_activities()
            n_det = sync_details()
            compute_prs()
            n_ll = snapshot_legends()

            result = {
                "status": "ok",
                "activities_synced": n_act,
                "details_synced": n_det,
                "legends_snapshotted": n_ll,
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())

    def do_GET(self):
        """Allow GET for cron triggers."""
        self.do_POST()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
