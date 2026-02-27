from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from api._db import init_db, query
from api._helpers import fmt_time, compute_pace, compute_projections_from_db


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        init_db()
        params = parse_qs(urlparse(self.path).query)
        mode = params.get("mode", ["records"])[0]

        if mode == "records":
            data = self._records()
        elif mode == "best_by_year":
            data = self._best_by_year()
        elif mode == "projections":
            data = self._projections()
        else:
            data = {}

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _records(self):
        rows = query("""
            SELECT distance_type, date, time, activity_id
            FROM personal_records ORDER BY distance_type, date
        """)
        result = {}
        for r in rows:
            dt = r["distance_type"]
            if dt not in result:
                result[dt] = []
            result[dt].append({
                "date": r["date"],
                "time": r["time"],
                "formatted": fmt_time(r["time"]),
                "pace": compute_pace(r["time"], dt),
                "activity_id": r["activity_id"],
            })

        for dt in result:
            times = result[dt]
            if not times:
                continue
            best = min(times, key=lambda x: x["time"])
            for t in times:
                t["is_best"] = t["time"] == best["time"]
                if best["time"] > 0:
                    t["pct_off_best"] = round(((t["time"] - best["time"]) / best["time"]) * 100, 1)
        return result

    def _best_by_year(self):
        rows = query("""
            SELECT distance_type, strftime('%Y', date) as year, MIN(time) as best_time
            FROM personal_records GROUP BY distance_type, year ORDER BY distance_type, year
        """)
        result = {}
        for r in rows:
            dt = r["distance_type"]
            if dt not in result:
                result[dt] = []
            result[dt].append({
                "year": r["year"],
                "time": r["best_time"],
                "formatted": fmt_time(r["best_time"]),
                "pace": compute_pace(r["best_time"], dt),
            })
        return result

    def _projections(self):
        from datetime import date, timedelta
        proj = compute_projections_from_db(query)

        timeline = {}
        for dist_type in ["10k", "semi"]:
            records = query("""
                SELECT date, time FROM personal_records
                WHERE distance_type=? ORDER BY date
            """, (dist_type,))

            running_best = None
            for r in records:
                if running_best is None or r["time"] < running_best:
                    running_best = r["time"]
                d = r["date"][:10]
                if d not in timeline:
                    timeline[d] = {}
                if dist_type == "10k":
                    timeline[d]["marathon_from_10k"] = round(running_best * ((42195/10000)**1.06))
                    timeline[d]["semi_from_10k"] = round(running_best * ((21097.5/10000)**1.06))
                elif dist_type == "semi":
                    timeline[d]["marathon_from_semi"] = round(running_best * ((42195/21097.5)**1.06))

        sorted_timeline = [{"date": k, **v} for k, v in sorted(timeline.items())]

        d90 = (date.today() - timedelta(days=90)).isoformat()
        vol = query(
            "SELECT COALESCE(SUM(distance), 0)/1000 as km FROM activities WHERE date >= ? AND type='Run'",
            (d90,), one=True
        )["km"]

        confidence = "low"
        if vol > 300:
            confidence = "high"
        elif vol > 150:
            confidence = "medium"

        return {
            "current": proj,
            "timeline": sorted_timeline,
            "confidence": confidence,
            "volume_90d_km": round(vol, 1),
        }
