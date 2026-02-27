from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta
from api._utils import extract_token, get_all_activities


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        token = extract_token(self.headers)
        if not token:
            self._json({"error": "No token"}, 401)
            return

        params = parse_qs(urlparse(self.path).query)
        mode = params.get("mode", ["weekly"])[0]

        try:
            activities = get_all_activities(token)
            if mode == "weekly":
                data = self._weekly(activities, params)
            elif mode == "monthly":
                data = self._monthly(activities)
            elif mode == "yearly":
                data = self._yearly(activities)
            elif mode == "rolling":
                data = self._rolling(activities, params)
            else:
                data = []
            self._json(data)
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _parse(self, d):
        return datetime.fromisoformat(d.replace("Z", "+00:00").replace("+00:00", ""))

    def _weekly(self, activities, params):
        years_str = params.get("years", [None])[0]
        year_filter = years_str.split(",") if years_str else None

        buckets = {}
        for a in activities:
            dt = self._parse(a["start_date_local"])
            yr = str(dt.year)
            if year_filter and yr not in year_filter:
                continue
            wk = dt.strftime("%W")
            key = (yr, wk)
            if key not in buckets:
                buckets[key] = {"year": yr, "week": wk, "km": 0, "runs": 0, "time_s": 0, "elev": 0}
            buckets[key]["km"] += a["distance"] / 1000
            buckets[key]["runs"] += 1
            buckets[key]["time_s"] += a.get("moving_time", 0)
            buckets[key]["elev"] += a.get("total_elevation_gain", 0)

        rows = sorted(buckets.values(), key=lambda x: (x["year"], x["week"]))
        for r in rows:
            r["km"] = round(r["km"], 2)
            r["elev"] = round(r["elev"], 1)

        for i, d in enumerate(rows):
            window = rows[max(0, i - 3):i + 1]
            d["ma_4w"] = round(sum(w["km"] for w in window) / len(window), 2)
        return rows

    def _monthly(self, activities):
        buckets = {}
        for a in activities:
            dt = self._parse(a["start_date_local"])
            key = (str(dt.year), f"{dt.month:02d}")
            if key not in buckets:
                buckets[key] = {"year": key[0], "month": key[1], "km": 0, "runs": 0, "time_s": 0}
            buckets[key]["km"] += a["distance"] / 1000
            buckets[key]["runs"] += 1
            buckets[key]["time_s"] += a.get("moving_time", 0)

        rows = sorted(buckets.values(), key=lambda x: (x["year"], x["month"]))
        for r in rows:
            r["km"] = round(r["km"], 2)
        return rows

    def _yearly(self, activities):
        buckets = {}
        for a in activities:
            dt = self._parse(a["start_date_local"])
            yr = str(dt.year)
            if yr not in buckets:
                buckets[yr] = {"year": yr, "km": 0, "runs": 0, "time_s": 0, "elev": 0}
            buckets[yr]["km"] += a["distance"] / 1000
            buckets[yr]["runs"] += 1
            buckets[yr]["time_s"] += a.get("moving_time", 0)
            buckets[yr]["elev"] += a.get("total_elevation_gain", 0)

        rows = sorted(buckets.values(), key=lambda x: x["year"])
        for r in rows:
            r["km"] = round(r["km"], 2)
            r["elev"] = round(r["elev"], 1)
        return rows

    def _rolling(self, activities, params):
        days = int(params.get("days", [90])[0])
        today = datetime.now()
        start = today - timedelta(days=days * 2)

        daily = {}
        for a in activities:
            dt = self._parse(a["start_date_local"])
            if dt < start:
                continue
            d = dt.strftime("%Y-%m-%d")
            daily[d] = daily.get(d, 0) + a["distance"] / 1000

        result = []
        d = start
        while d <= today:
            ds = d.strftime("%Y-%m-%d")
            window_start = d - timedelta(days=days)
            ws = window_start.strftime("%Y-%m-%d")
            total = sum(v for k, v in daily.items() if ws <= k <= ds)
            result.append({"date": ds, "km": round(total, 2)})
            d += timedelta(days=1)
        return result

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors()
        self.end_headers()

    def _json(self, data, status=200):
        self.send_response(status)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
