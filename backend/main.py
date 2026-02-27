"""
Strava Dashboard Backend — FastAPI
"""
import os
import math
from datetime import datetime, date, timedelta
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from dotenv import load_dotenv

load_dotenv()

from database import init_db, get_db
from strava_client import strava, CLIENT_ID
from sync import full_sync, sync_activities, sync_activity_details, snapshot_local_legends, compute_personal_records

scheduler = AsyncIOScheduler()


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    scheduler.add_job(full_sync, "cron", hour=4, minute=0, id="daily_sync")
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="Strava Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── AUTH ────────────────────────────────────────────────────────
@app.get("/auth/login")
async def auth_login():
    return RedirectResponse(strava.get_auth_url())


@app.get("/auth/callback")
async def auth_callback(code: str = Query(...)):
    token_data = await strava.exchange_token(code)
    athlete = token_data.get("athlete", {})

    with get_db() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO athlete (id, username, firstname, lastname, weight, profile_pic,
                                            access_token, refresh_token, token_expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            athlete.get("id"),
            athlete.get("username"),
            athlete.get("firstname"),
            athlete.get("lastname"),
            athlete.get("weight"),
            athlete.get("profile"),
            token_data["access_token"],
            token_data["refresh_token"],
            token_data["expires_at"],
        ))

    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:5173")
    return RedirectResponse(f"{frontend_url}?auth=success")


@app.get("/auth/status")
async def auth_status():
    with get_db() as conn:
        row = conn.execute("SELECT id, username, firstname, lastname, profile_pic FROM athlete LIMIT 1").fetchone()
        if row:
            return {"authenticated": True, "athlete": dict(row)}
        return {"authenticated": False}


# ─── SYNC ────────────────────────────────────────────────────────
@app.post("/sync")
async def trigger_sync():
    try:
        await full_sync()
        return {"status": "ok"}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/sync/status")
async def sync_status():
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM sync_log ORDER BY id DESC LIMIT 1"
        ).fetchone()
        return dict(row) if row else {"status": "never_synced"}


# ─── COCKPIT (Module A) ─────────────────────────────────────────
@app.get("/api/cockpit")
async def cockpit():
    today = date.today()
    week_start = today - timedelta(days=today.weekday())
    d90 = today - timedelta(days=90)
    d28 = today - timedelta(days=28)

    with get_db() as conn:
        # Current week volume
        week_vol = conn.execute(
            "SELECT COALESCE(SUM(distance), 0) as vol FROM activities WHERE date >= ? AND type='Run'",
            (week_start.isoformat(),)
        ).fetchone()["vol"]

        # 90-day rolling volume
        vol_90 = conn.execute(
            "SELECT COALESCE(SUM(distance), 0) as vol FROM activities WHERE date >= ? AND type='Run'",
            (d90.isoformat(),)
        ).fetchone()["vol"]

        # 4-week average (weekly)
        vol_28 = conn.execute(
            "SELECT COALESCE(SUM(distance), 0) as vol FROM activities WHERE date >= ? AND type='Run'",
            (d28.isoformat(),)
        ).fetchone()["vol"]
        avg_4w = vol_28 / 4

        # Alerts
        alerts = []
        if avg_4w > 0 and week_vol > avg_4w * 1.2:
            alerts.append({"type": "warning", "message": f"Volume semaine +{((week_vol/avg_4w)-1)*100:.0f}% vs moyenne 4 sem."})

        # Previous 90d for trend
        d180 = today - timedelta(days=180)
        prev_90 = conn.execute(
            "SELECT COALESCE(SUM(distance), 0) as vol FROM activities WHERE date >= ? AND date < ? AND type='Run'",
            (d180.isoformat(), d90.isoformat())
        ).fetchone()["vol"]
        if prev_90 > 0 and vol_90 < prev_90 * 0.85:
            alerts.append({"type": "danger", "message": f"Volume 90j en baisse de {((1 - vol_90/prev_90))*100:.0f}%"})

        # PRs in last 90 days
        pr_count = conn.execute(
            "SELECT COUNT(*) as c FROM personal_records WHERE date >= ?",
            (d90.isoformat(),)
        ).fetchone()["c"]

        # Local legends count
        ll_count = conn.execute("""
            SELECT COUNT(*) as c FROM local_legend_snapshot
            WHERE date = (SELECT MAX(date) FROM local_legend_snapshot)
            AND is_local_legend = 1
        """).fetchone()["c"]

        # Lost legends (was LL yesterday, not today)
        yesterday = (today - timedelta(days=1)).isoformat()
        lost = conn.execute("""
            SELECT s.name FROM local_legend_snapshot ll1
            JOIN local_legend_snapshot ll2 ON ll1.segment_id = ll2.segment_id
            JOIN segments s ON s.id = ll1.segment_id
            WHERE ll1.date = ? AND ll1.is_local_legend = 1
            AND ll2.date = ? AND ll2.is_local_legend = 0
        """, (yesterday, today.isoformat())).fetchall()
        for l in lost:
            alerts.append({"type": "danger", "message": f"Local Legend perdue: {l['name']}"})

        # Projections (Riegel model)
        projections = _compute_projections(conn)

    return {
        "week_volume": round(week_vol / 1000, 2),
        "volume_90d": round(vol_90 / 1000, 2),
        "avg_4_weeks": round(avg_4w / 1000, 2),
        "local_legends": ll_count,
        "pr_90d": pr_count,
        "projections": projections,
        "alerts": alerts,
    }


def _compute_projections(conn):
    """Riegel formula: T2 = T1 * (D2/D1)^1.06"""
    projections = {}
    for src, src_dist, targets in [
        ("10k", 10000, [("semi", 21097.5), ("marathon", 42195)]),
        ("semi", 21097.5, [("marathon", 42195)]),
    ]:
        best = conn.execute(
            "SELECT MIN(time) as best_time FROM personal_records WHERE distance_type=?",
            (src,)
        ).fetchone()
        if best and best["best_time"]:
            for tgt_name, tgt_dist in targets:
                projected = best["best_time"] * ((tgt_dist / src_dist) ** 1.06)
                key = f"{tgt_name}_from_{src}"
                projections[key] = {
                    "seconds": round(projected),
                    "formatted": _fmt_time(round(projected)),
                    "source_time": _fmt_time(best["best_time"]),
                    "source_distance": src,
                }
    return projections


def _fmt_time(seconds: int) -> str:
    h = seconds // 3600
    m = (seconds % 3600) // 60
    s = seconds % 60
    if h > 0:
        return f"{h}h{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


# ─── VOLUME (Module B) ──────────────────────────────────────────
@app.get("/api/volume/weekly")
async def volume_weekly(years: str = Query(default=None)):
    with get_db() as conn:
        query = """
            SELECT strftime('%Y', date) as year,
                   strftime('%W', date) as week,
                   SUM(distance)/1000 as km,
                   COUNT(*) as runs,
                   SUM(moving_time) as time_s,
                   SUM(total_elevation_gain) as elev
            FROM activities WHERE type='Run'
        """
        params = []
        if years:
            year_list = years.split(",")
            placeholders = ",".join(["?"] * len(year_list))
            query += f" AND strftime('%Y', date) IN ({placeholders})"
            params.extend(year_list)
        query += " GROUP BY year, week ORDER BY year, week"
        rows = conn.execute(query, params).fetchall()

    data = [dict(r) for r in rows]
    # Compute 4-week moving average
    for i, d in enumerate(data):
        window = data[max(0, i-3):i+1]
        d["ma_4w"] = round(sum(w["km"] for w in window) / len(window), 2)
    return data


@app.get("/api/volume/monthly")
async def volume_monthly():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT strftime('%Y', date) as year,
                   strftime('%m', date) as month,
                   SUM(distance)/1000 as km,
                   COUNT(*) as runs,
                   SUM(moving_time) as time_s
            FROM activities WHERE type='Run'
            GROUP BY year, month ORDER BY year, month
        """).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/volume/yearly")
async def volume_yearly():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT strftime('%Y', date) as year,
                   SUM(distance)/1000 as km,
                   COUNT(*) as runs,
                   SUM(moving_time) as time_s,
                   SUM(total_elevation_gain) as elev
            FROM activities WHERE type='Run'
            GROUP BY year ORDER BY year
        """).fetchall()
    return [dict(r) for r in rows]


@app.get("/api/volume/rolling")
async def volume_rolling(days: int = Query(default=90)):
    today = date.today()
    start = today - timedelta(days=days * 2)  # Double window for comparison

    with get_db() as conn:
        rows = conn.execute("""
            SELECT date, distance/1000 as km
            FROM activities
            WHERE date >= ? AND type='Run'
            ORDER BY date
        """, (start.isoformat(),)).fetchall()

    # Build daily cumulative for rolling window
    daily = {}
    for r in rows:
        d = r["date"][:10]
        daily[d] = daily.get(d, 0) + r["km"]

    result = []
    d = start
    while d <= today:
        window_start = d - timedelta(days=days)
        total = sum(v for k, v in daily.items() if window_start.isoformat() <= k <= d.isoformat())
        result.append({"date": d.isoformat(), "km": round(total, 2)})
        d += timedelta(days=1)

    return result


# ─── PERFORMANCE (Module C) ─────────────────────────────────────
@app.get("/api/performance/records")
async def performance_records():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT distance_type, date, time, activity_id
            FROM personal_records
            ORDER BY distance_type, date
        """).fetchall()

    result = {}
    for r in rows:
        dt = r["distance_type"]
        if dt not in result:
            result[dt] = []
        result[dt].append({
            "date": r["date"],
            "time": r["time"],
            "formatted": _fmt_time(r["time"]),
            "pace": _compute_pace(r["time"], dt),
            "activity_id": r["activity_id"],
        })

    # Add best per distance
    for dt in result:
        times = result[dt]
        best = min(times, key=lambda x: x["time"])
        for t in times:
            t["is_best"] = t["time"] == best["time"]
            if best["time"] > 0:
                t["pct_off_best"] = round(((t["time"] - best["time"]) / best["time"]) * 100, 1)

    return result


def _compute_pace(time_s: int, dist_type: str) -> str:
    distances = {"5k": 5, "10k": 10, "semi": 21.0975, "marathon": 42.195}
    d = distances.get(dist_type, 0)
    if d == 0:
        return ""
    pace_s = time_s / d
    return f"{int(pace_s // 60)}:{int(pace_s % 60):02d}/km"


@app.get("/api/performance/best-by-year")
async def best_by_year():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT distance_type, strftime('%Y', date) as year, MIN(time) as best_time
            FROM personal_records
            GROUP BY distance_type, year
            ORDER BY distance_type, year
        """).fetchall()

    result = {}
    for r in rows:
        dt = r["distance_type"]
        if dt not in result:
            result[dt] = []
        result[dt].append({
            "year": r["year"],
            "time": r["best_time"],
            "formatted": _fmt_time(r["best_time"]),
            "pace": _compute_pace(r["best_time"], dt),
        })
    return result


# ─── PROJECTIONS (Module D) ─────────────────────────────────────
@app.get("/api/projections")
async def projections():
    with get_db() as conn:
        proj = _compute_projections(conn)

        # Projection over time (based on evolving PRs)
        timeline = {}
        for dist_type in ["10k", "semi"]:
            records = conn.execute(
                "SELECT date, MIN(time) OVER (ORDER BY date) as running_best FROM personal_records WHERE distance_type=? ORDER BY date",
                (dist_type,)
            ).fetchall()

            for r in records:
                d = r["date"][:10]
                if d not in timeline:
                    timeline[d] = {}
                if dist_type == "10k":
                    timeline[d]["marathon_from_10k"] = round(r["running_best"] * ((42195 / 10000) ** 1.06))
                    timeline[d]["semi_from_10k"] = round(r["running_best"] * ((21097.5 / 10000) ** 1.06))
                elif dist_type == "semi":
                    timeline[d]["marathon_from_semi"] = round(r["running_best"] * ((42195 / 21097.5) ** 1.06))

        sorted_timeline = [{"date": k, **v} for k, v in sorted(timeline.items())]

        # Confidence based on 90d volume
        d90 = (date.today() - timedelta(days=90)).isoformat()
        vol_90 = conn.execute(
            "SELECT COALESCE(SUM(distance), 0)/1000 as km FROM activities WHERE date >= ? AND type='Run'",
            (d90,)
        ).fetchone()["km"]

        confidence = "low"
        if vol_90 > 300:
            confidence = "high"
        elif vol_90 > 150:
            confidence = "medium"

    return {
        "current": proj,
        "timeline": sorted_timeline,
        "confidence": confidence,
        "volume_90d_km": round(vol_90, 1),
    }


# ─── SEGMENTS (Module E) ────────────────────────────────────────
@app.get("/api/segments/local-legends")
async def local_legends():
    with get_db() as conn:
        # Current status
        latest = conn.execute("SELECT MAX(date) as d FROM local_legend_snapshot").fetchone()["d"]
        current = conn.execute("""
            SELECT ll.segment_id, s.name, ll.effort_count
            FROM local_legend_snapshot ll
            JOIN segments s ON s.id = ll.segment_id
            WHERE ll.date = ? AND ll.is_local_legend = 1
        """, (latest,)).fetchall() if latest else []

        # Timeline
        timeline = conn.execute("""
            SELECT ll.date, ll.segment_id, s.name, ll.is_local_legend
            FROM local_legend_snapshot ll
            JOIN segments s ON s.id = ll.segment_id
            ORDER BY ll.segment_id, ll.date
        """).fetchall()

        # Compute possession periods
        segments_timeline = {}
        for r in timeline:
            sid = r["segment_id"]
            if sid not in segments_timeline:
                segments_timeline[sid] = {"name": r["name"], "periods": [], "current": None}

            st = segments_timeline[sid]
            if r["is_local_legend"]:
                if not st["current"]:
                    st["current"] = {"start": r["date"]}
            else:
                if st["current"]:
                    st["current"]["end"] = r["date"]
                    st["periods"].append(st["current"])
                    st["current"] = None

        # Close open periods
        for sid, st in segments_timeline.items():
            if st["current"]:
                st["current"]["end"] = None  # Still active
                st["periods"].append(st["current"])
                st["current"] = None

        # Monthly gains/losses
        monthly = conn.execute("""
            SELECT strftime('%Y-%m', date) as month,
                   SUM(CASE WHEN is_local_legend = 1 THEN 1 ELSE 0 END) as legends,
                   COUNT(DISTINCT segment_id) as segments_tracked
            FROM local_legend_snapshot
            GROUP BY month ORDER BY month
        """).fetchall()

    return {
        "current": [dict(r) for r in current],
        "total": len(current),
        "timeline": {str(k): {"name": v["name"], "periods": v["periods"]} for k, v in segments_timeline.items()},
        "monthly": [dict(r) for r in monthly],
    }


@app.get("/api/segments/prs")
async def segment_prs():
    with get_db() as conn:
        # PR per month
        monthly = conn.execute("""
            SELECT strftime('%Y-%m', date) as month, COUNT(*) as prs
            FROM segment_efforts WHERE pr_rank = 1
            GROUP BY month ORDER BY month
        """).fetchall()

        # Top segments by effort count
        top = conn.execute("""
            SELECT se.segment_id, s.name, COUNT(*) as efforts,
                   MIN(se.elapsed_time) as best_time,
                   MAX(se.elapsed_time) as worst_time
            FROM segment_efforts se
            JOIN segments s ON s.id = se.segment_id
            GROUP BY se.segment_id
            ORDER BY efforts DESC
            LIMIT 20
        """).fetchall()

        # Progression on top segments
        progression = {}
        for seg in top:
            efforts = conn.execute("""
                SELECT date, elapsed_time, pr_rank
                FROM segment_efforts
                WHERE segment_id = ?
                ORDER BY date
            """, (seg["segment_id"],)).fetchall()
            progression[seg["segment_id"]] = {
                "name": seg["name"],
                "best": seg["best_time"],
                "efforts": [dict(e) for e in efforts],
            }

    return {
        "monthly_prs": [dict(r) for r in monthly],
        "top_segments": [dict(r) for r in top],
        "progression": progression,
    }


@app.get("/api/segments/heatmap")
async def segment_heatmap():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT s.id, s.name, s.start_latlng, s.end_latlng,
                   COUNT(se.id) as efforts,
                   MIN(se.elapsed_time) as best_time,
                   MAX(CASE WHEN se.pr_rank = 1 THEN 1 ELSE 0 END) as has_pr,
                   MAX(CASE WHEN ll.is_local_legend = 1 THEN 1 ELSE 0 END) as is_legend
            FROM segments s
            LEFT JOIN segment_efforts se ON se.segment_id = s.id
            LEFT JOIN local_legend_snapshot ll ON ll.segment_id = s.id
                AND ll.date = (SELECT MAX(date) FROM local_legend_snapshot)
            WHERE s.start_latlng IS NOT NULL
            GROUP BY s.id
        """).fetchall()
    return [dict(r) for r in rows]


# ─── ANALYSIS (Module F) ────────────────────────────────────────
@app.get("/api/analysis/pace-stability")
async def pace_stability():
    with get_db() as conn:
        rows = conn.execute("""
            SELECT id, date, name, distance, moving_time, average_speed,
                   average_heartrate
            FROM activities
            WHERE type='Run' AND distance > 3000
            ORDER BY date DESC LIMIT 100
        """).fetchall()

    result = []
    for r in rows:
        pace = r["moving_time"] / (r["distance"] / 1000) if r["distance"] > 0 else 0
        result.append({
            "date": r["date"],
            "name": r["name"],
            "distance_km": round(r["distance"] / 1000, 2),
            "pace_s_km": round(pace, 1),
            "pace_formatted": f"{int(pace // 60)}:{int(pace % 60):02d}",
            "heartrate": r["average_heartrate"],
        })
    return result


@app.get("/api/analysis/cardiac-decoupling")
async def cardiac_decoupling():
    """Activities with HR data to analyze pace vs HR relationship."""
    with get_db() as conn:
        rows = conn.execute("""
            SELECT date, name, distance, moving_time, average_speed,
                   average_heartrate, max_heartrate
            FROM activities
            WHERE type='Run' AND average_heartrate IS NOT NULL AND distance > 5000
            ORDER BY date DESC LIMIT 200
        """).fetchall()

    result = []
    for r in rows:
        pace = r["moving_time"] / (r["distance"] / 1000) if r["distance"] > 0 else 0
        efficiency = (r["average_speed"] * 3.6) / r["average_heartrate"] if r["average_heartrate"] else None
        result.append({
            "date": r["date"],
            "name": r["name"],
            "pace_s_km": round(pace, 1),
            "avg_hr": r["average_heartrate"],
            "max_hr": r["max_heartrate"],
            "efficiency": round(efficiency, 4) if efficiency else None,
        })
    return result


@app.get("/api/analysis/volume-vs-performance")
async def volume_vs_performance():
    """30-day rolling volume correlated with 10k performance."""
    with get_db() as conn:
        runs_10k = conn.execute("""
            SELECT date, time FROM personal_records
            WHERE distance_type='10k' ORDER BY date
        """).fetchall()

        result = []
        for r in runs_10k:
            d = r["date"][:10]
            d30 = (datetime.fromisoformat(d) - timedelta(days=30)).isoformat()
            vol = conn.execute(
                "SELECT COALESCE(SUM(distance), 0)/1000 as km FROM activities WHERE date BETWEEN ? AND ? AND type='Run'",
                (d30, d)
            ).fetchone()["km"]
            result.append({
                "date": d,
                "time_10k": r["time"],
                "formatted": _fmt_time(r["time"]),
                "volume_30d_km": round(vol, 1),
            })

    return result


# ─── ACTIVITIES RAW ──────────────────────────────────────────────
@app.get("/api/activities")
async def list_activities(
    limit: int = Query(default=50),
    offset: int = Query(default=0),
    year: str = Query(default=None),
    date_from: str = Query(default=None),
    date_to: str = Query(default=None),
):
    with get_db() as conn:
        query = "SELECT * FROM activities WHERE type='Run'"
        params = []
        if year:
            query += " AND strftime('%Y', date) = ?"
            params.append(year)
        if date_from:
            query += " AND date >= ?"
            params.append(date_from)
        if date_to:
            query += " AND date <= ?"
            params.append(date_to)
        query += " ORDER BY date DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        rows = conn.execute(query, params).fetchall()
        total = conn.execute(
            "SELECT COUNT(*) as c FROM activities WHERE type='Run'"
        ).fetchone()["c"]

    return {"data": [dict(r) for r in rows], "total": total}
