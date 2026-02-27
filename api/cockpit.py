from http.server import BaseHTTPRequestHandler
import json
from datetime import date, timedelta
from api._db import init_db, query
from api._helpers import fmt_time, compute_projections_from_db


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        init_db()
        today = date.today()
        week_start = today - timedelta(days=today.weekday())
        d90 = today - timedelta(days=90)
        d28 = today - timedelta(days=28)

        week_vol = query(
            "SELECT COALESCE(SUM(distance), 0) as vol FROM activities WHERE date >= ? AND type='Run'",
            (week_start.isoformat(),), one=True
        )["vol"]

        vol_90 = query(
            "SELECT COALESCE(SUM(distance), 0) as vol FROM activities WHERE date >= ? AND type='Run'",
            (d90.isoformat(),), one=True
        )["vol"]

        vol_28 = query(
            "SELECT COALESCE(SUM(distance), 0) as vol FROM activities WHERE date >= ? AND type='Run'",
            (d28.isoformat(),), one=True
        )["vol"]
        avg_4w = vol_28 / 4 if vol_28 else 0

        alerts = []
        if avg_4w > 0 and week_vol > avg_4w * 1.2:
            alerts.append({"type": "warning", "message": f"Volume semaine +{((week_vol/avg_4w)-1)*100:.0f}% vs moyenne 4 sem."})

        d180 = today - timedelta(days=180)
        prev_90 = query(
            "SELECT COALESCE(SUM(distance), 0) as vol FROM activities WHERE date >= ? AND date < ? AND type='Run'",
            (d180.isoformat(), d90.isoformat()), one=True
        )["vol"]
        if prev_90 > 0 and vol_90 < prev_90 * 0.85:
            alerts.append({"type": "danger", "message": f"Volume 90j en baisse de {((1 - vol_90/prev_90))*100:.0f}%"})

        pr_count = query(
            "SELECT COUNT(*) as c FROM personal_records WHERE date >= ?",
            (d90.isoformat(),), one=True
        )["c"]

        ll_count = query("""
            SELECT COUNT(*) as c FROM local_legend_snapshot
            WHERE date = (SELECT MAX(date) FROM local_legend_snapshot)
            AND is_local_legend = 1
        """, one=True)["c"]

        yesterday = (today - timedelta(days=1)).isoformat()
        lost = query("""
            SELECT s.name FROM local_legend_snapshot ll1
            JOIN local_legend_snapshot ll2 ON ll1.segment_id = ll2.segment_id
            JOIN segments s ON s.id = ll1.segment_id
            WHERE ll1.date = ? AND ll1.is_local_legend = 1
            AND ll2.date = ? AND ll2.is_local_legend = 0
        """, (yesterday, today.isoformat()))
        for l in lost:
            alerts.append({"type": "danger", "message": f"Local Legend perdue: {l['name']}"})

        projections = compute_projections_from_db(query)

        data = {
            "week_volume": round(week_vol / 1000, 2),
            "volume_90d": round(vol_90 / 1000, 2),
            "avg_4_weeks": round(avg_4w / 1000, 2),
            "local_legends": ll_count,
            "pr_90d": pr_count,
            "projections": projections,
            "alerts": alerts,
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
