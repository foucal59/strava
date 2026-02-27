from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from datetime import date, timedelta
from api._db import init_db, query


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        init_db()
        params = parse_qs(urlparse(self.path).query)
        mode = params.get("mode", ["weekly"])[0]

        if mode == "weekly":
            data = self._weekly(params)
        elif mode == "monthly":
            data = self._monthly()
        elif mode == "yearly":
            data = self._yearly()
        elif mode == "rolling":
            data = self._rolling(params)
        else:
            data = []

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _weekly(self, params):
        years_str = params.get("years", [None])[0]
        sql = """
            SELECT strftime('%Y', date) as year,
                   strftime('%W', date) as week,
                   SUM(distance)/1000 as km,
                   COUNT(*) as runs,
                   SUM(moving_time) as time_s,
                   SUM(total_elevation_gain) as elev
            FROM activities WHERE type='Run'
        """
        p = []
        if years_str:
            year_list = years_str.split(",")
            placeholders = ",".join(["?"] * len(year_list))
            sql += f" AND strftime('%Y', date) IN ({placeholders})"
            p.extend(year_list)
        sql += " GROUP BY year, week ORDER BY year, week"
        rows = query(sql, tuple(p))

        for i, d in enumerate(rows):
            window = rows[max(0, i-3):i+1]
            d["ma_4w"] = round(sum(w["km"] for w in window) / len(window), 2)
        return rows

    def _monthly(self):
        return query("""
            SELECT strftime('%Y', date) as year,
                   strftime('%m', date) as month,
                   SUM(distance)/1000 as km,
                   COUNT(*) as runs,
                   SUM(moving_time) as time_s
            FROM activities WHERE type='Run'
            GROUP BY year, month ORDER BY year, month
        """)

    def _yearly(self):
        return query("""
            SELECT strftime('%Y', date) as year,
                   SUM(distance)/1000 as km,
                   COUNT(*) as runs,
                   SUM(moving_time) as time_s,
                   SUM(total_elevation_gain) as elev
            FROM activities WHERE type='Run'
            GROUP BY year ORDER BY year
        """)

    def _rolling(self, params):
        days = int(params.get("days", [90])[0])
        today = date.today()
        start = today - timedelta(days=days * 2)

        rows = query("""
            SELECT date, distance/1000 as km
            FROM activities WHERE date >= ? AND type='Run' ORDER BY date
        """, (start.isoformat(),))

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
