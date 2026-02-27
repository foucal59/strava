from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta
from api._db import init_db, query
from api._helpers import fmt_time


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        init_db()
        params = parse_qs(urlparse(self.path).query)
        mode = params.get("mode", ["pace"])[0]

        if mode == "pace":
            data = self._pace_stability()
        elif mode == "cardiac":
            data = self._cardiac()
        elif mode == "volume_perf":
            data = self._volume_vs_perf()
        else:
            data = []

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _pace_stability(self):
        rows = query("""
            SELECT id, date, name, distance, moving_time, average_speed, average_heartrate
            FROM activities WHERE type='Run' AND distance > 3000
            ORDER BY date DESC LIMIT 100
        """)
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

    def _cardiac(self):
        rows = query("""
            SELECT date, name, distance, moving_time, average_speed,
                   average_heartrate, max_heartrate
            FROM activities
            WHERE type='Run' AND average_heartrate IS NOT NULL AND distance > 5000
            ORDER BY date DESC LIMIT 200
        """)
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

    def _volume_vs_perf(self):
        runs_10k = query("""
            SELECT date, time FROM personal_records
            WHERE distance_type='10k' ORDER BY date
        """)
        result = []
        for r in runs_10k:
            d = r["date"][:10]
            d30 = (datetime.fromisoformat(d) - timedelta(days=30)).isoformat()
            vol = query(
                "SELECT COALESCE(SUM(distance), 0)/1000 as km FROM activities WHERE date BETWEEN ? AND ? AND type='Run'",
                (d30, d), one=True
            )["km"]
            result.append({
                "date": d,
                "time_10k": r["time"],
                "formatted": fmt_time(r["time"]),
                "volume_30d_km": round(vol, 1),
            })
        return result
