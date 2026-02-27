"""
Sync engine: incremental sync from Strava API to local SQLite.
Handles activities, segments, segment efforts, local legends snapshots.
"""
import time
from datetime import datetime, date
from database import get_db
from strava_client import strava


async def sync_activities(full: bool = False):
    """Incremental activity sync. Only fetches new activities since last sync."""
    with get_db() as conn:
        if not full:
            row = conn.execute(
                "SELECT MAX(date) as last_date FROM activities"
            ).fetchone()
            last_date = row["last_date"] if row and row["last_date"] else None
        else:
            last_date = None

        after = None
        if last_date:
            after = int(datetime.fromisoformat(last_date).timestamp()) - 86400  # 1 day overlap

        log_id = conn.execute(
            "INSERT INTO sync_log (sync_type) VALUES ('activities') RETURNING id"
        ).fetchone()["id"]

    total_synced = 0
    page = 1

    try:
        while True:
            activities = await strava.fetch_activities(after=after, page=page)
            if not activities:
                break

            with get_db() as conn:
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
                    total_synced += 1

            page += 1
            if len(activities) < 100:
                break

        with get_db() as conn:
            conn.execute(
                "UPDATE sync_log SET completed_at=datetime('now'), records_synced=?, status='completed' WHERE id=?",
                (total_synced, log_id)
            )

    except Exception as e:
        with get_db() as conn:
            conn.execute(
                "UPDATE sync_log SET completed_at=datetime('now'), status='error', error=? WHERE id=?",
                (str(e), log_id)
            )
        raise

    return total_synced


async def sync_activity_details(activity_ids: list = None):
    """Fetch detailed activity data including segment efforts."""
    if not activity_ids:
        with get_db() as conn:
            rows = conn.execute("""
                SELECT a.id FROM activities a
                LEFT JOIN segment_efforts se ON se.activity_id = a.id
                WHERE se.id IS NULL
                ORDER BY a.date DESC LIMIT 50
            """).fetchall()
            activity_ids = [r["id"] for r in rows]

    for act_id in activity_ids:
        try:
            detail = await strava.fetch_activity_detail(act_id)
            efforts = detail.get("segment_efforts", [])

            with get_db() as conn:
                for effort in efforts:
                    seg = effort.get("segment", {})
                    # Upsert segment
                    conn.execute("""
                        INSERT OR REPLACE INTO segments
                        (id, name, distance, elevation_gain, average_grade, climb_category, city, state, start_latlng, end_latlng)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        seg["id"],
                        seg.get("name"),
                        seg.get("distance"),
                        seg.get("total_elevation_gain"),
                        seg.get("average_grade"),
                        seg.get("climb_category"),
                        seg.get("city"),
                        seg.get("state"),
                        str(seg.get("start_latlng")) if seg.get("start_latlng") else None,
                        str(seg.get("end_latlng")) if seg.get("end_latlng") else None,
                    ))

                    # Upsert effort
                    conn.execute("""
                        INSERT OR REPLACE INTO segment_efforts
                        (id, activity_id, segment_id, elapsed_time, moving_time, date, pr_rank, kom_rank,
                         average_heartrate, max_heartrate)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        effort["id"],
                        act_id,
                        seg["id"],
                        effort.get("elapsed_time", 0),
                        effort.get("moving_time"),
                        effort.get("start_date_local"),
                        effort.get("pr_rank"),
                        effort.get("kom_rank"),
                        effort.get("average_heartrate"),
                        effort.get("max_heartrate"),
                    ))

        except Exception as e:
            print(f"Error syncing activity {act_id}: {e}")
            continue


async def snapshot_local_legends():
    """Daily snapshot of local legend status for all known segments."""
    today = date.today().isoformat()

    with get_db() as conn:
        existing = conn.execute(
            "SELECT COUNT(*) as c FROM local_legend_snapshot WHERE date=?", (today,)
        ).fetchone()["c"]
        if existing > 0:
            return 0

    # Get all segments we've run on
    with get_db() as conn:
        segments = conn.execute(
            "SELECT DISTINCT segment_id FROM segment_efforts"
        ).fetchall()

    count = 0
    for seg_row in segments:
        try:
            seg_data = await strava.fetch_segment(seg_row["segment_id"])
            is_ll = 1 if seg_data.get("local_legend", {}).get("is_local_legend") else 0
            effort_count = seg_data.get("local_legend", {}).get("effort_count", 0)

            with get_db() as conn:
                conn.execute("""
                    INSERT OR REPLACE INTO local_legend_snapshot (date, segment_id, is_local_legend, effort_count)
                    VALUES (?, ?, ?, ?)
                """, (today, seg_row["segment_id"], is_ll, effort_count))
            count += 1
        except Exception as e:
            print(f"Error snapshotting segment {seg_row['segment_id']}: {e}")
            continue

    return count


async def compute_personal_records():
    """Compute best times for standard distances from activity data."""
    distance_thresholds = {
        "5k": (4500, 5500),
        "10k": (9500, 10500),
        "semi": (20500, 22000),
        "marathon": (41500, 43500),
    }

    with get_db() as conn:
        athlete = conn.execute("SELECT id FROM athlete LIMIT 1").fetchone()
        if not athlete:
            return

        for dist_type, (min_d, max_d) in distance_thresholds.items():
            rows = conn.execute("""
                SELECT id, date, moving_time, distance
                FROM activities
                WHERE distance BETWEEN ? AND ?
                AND type = 'Run'
                ORDER BY moving_time ASC
            """, (min_d, max_d)).fetchall()

            for row in rows:
                conn.execute("""
                    INSERT OR REPLACE INTO personal_records (athlete_id, distance_type, date, time, activity_id)
                    SELECT ?, ?, ?, ?, ?
                    WHERE NOT EXISTS (
                        SELECT 1 FROM personal_records
                        WHERE athlete_id=? AND distance_type=? AND activity_id=?
                    )
                """, (
                    athlete["id"], dist_type, row["date"], row["moving_time"], row["id"],
                    athlete["id"], dist_type, row["id"]
                ))


async def full_sync():
    """Run a complete sync: activities, details, local legends, PRs."""
    print(f"[{datetime.now()}] Starting full sync...")
    n = await sync_activities()
    print(f"  Synced {n} activities")
    await sync_activity_details()
    print("  Synced activity details")
    ll = await snapshot_local_legends()
    print(f"  Snapshotted {ll} segments for local legends")
    await compute_personal_records()
    print("  Computed personal records")
    print(f"[{datetime.now()}] Sync complete.")
