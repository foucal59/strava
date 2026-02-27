from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta
from api._utils import extract_token, get_all_activities, fmt_time, match_distance


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        token = extract_token(self.headers)
        if not token:
            self._json({"error": "No token"}, 401)
            return

        params = parse_qs(urlparse(self.path).query)
        mode = params.get("mode", ["pace"])[0]

        try:
            activities = get_all_activities(token)

            if mode == "pace":
                self._json(self._pace(activities))
            elif mode == "cardiac":
                self._json(self._cardiac(activities))
            elif mode == "volume_perf":
                self._json(self._vol_perf(activities))
            else:
                self._json([])
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _pace(self, activities):
        result = []
        runs = [a for a in activities if a.get("distance", 0) > 3000]
        runs.sort(key=lambda x: x["start_date_local"], reverse=True)
        for a in runs[:100]:
            pace = a["moving_time"] / (a["distance"] / 1000) if a["distance"] > 0 else 0
            result.append({
                "date": a["start_date_local"],
                "name": a.get("name", ""),
                "distance_km": round(a["distance"] / 1000, 2),
                "pace_s_km": round(pace, 1),
                "pace_formatted": f"{int(pace // 60)}:{int(pace % 60):02d}",
                "heartrate": a.get("average_heartrate"),
            })
        return result

    def _cardiac(self, activities):
        result = []
        runs = [a for a in activities if a.get("average_heartrate") and a.get("distance", 0) > 5000]
        runs.sort(key=lambda x: x["start_date_local"], reverse=True)
        for a in runs[:200]:
            pace = a["moving_time"] / (a["distance"] / 1000) if a["distance"] > 0 else 0
            speed_kmh = a.get("average_speed", 0) * 3.6
            eff = speed_kmh / a["average_heartrate"] if a["average_heartrate"] else None
            result.append({
                "date": a["start_date_local"],
                "name": a.get("name", ""),
                "pace_s_km": round(pace, 1),
                "avg_hr": a["average_heartrate"],
                "max_hr": a.get("max_heartrate"),
                "efficiency": round(eff, 4) if eff else None,
            })
        return result

    def _vol_perf(self, activities):
        runs_10k = sorted(
            [a for a in activities if match_distance(a.get("distance", 0), "10k")],
            key=lambda x: x["start_date_local"]
        )
        result = []
        for r in runs_10k:
            d = r["start_date_local"][:10]
            dt = datetime.fromisoformat(d)
            d30 = dt - timedelta(days=30)
            vol = sum(
                a["distance"] for a in activities
                if d30.isoformat() <= a["start_date_local"][:10] <= d
            ) / 1000
            result.append({
                "date": d,
                "time_10k": r["moving_time"],
                "formatted": fmt_time(r["moving_time"]),
                "volume_30d_km": round(vol, 1),
            })
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
