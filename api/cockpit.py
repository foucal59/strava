from http.server import BaseHTTPRequestHandler
import json
from datetime import datetime, timedelta
from api._utils import extract_token, get_all_activities, compute_prs, riegel_projection, fmt_time


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        token = extract_token(self.headers)
        if not token:
            self._json({"error": "No token"}, 401)
            return

        try:
            activities = get_all_activities(token)
            now = datetime.now()
            week_start = now - timedelta(days=now.weekday())
            d90 = now - timedelta(days=90)
            d28 = now - timedelta(days=28)
            d180 = now - timedelta(days=180)

            def parse_date(d):
                return datetime.fromisoformat(d.replace("Z", "+00:00").replace("+00:00", ""))

            week_vol = sum(a["distance"] for a in activities if parse_date(a["start_date_local"]) >= week_start)
            vol_90 = sum(a["distance"] for a in activities if parse_date(a["start_date_local"]) >= d90)
            vol_28 = sum(a["distance"] for a in activities if parse_date(a["start_date_local"]) >= d28)
            avg_4w = vol_28 / 4 if vol_28 else 0
            prev_90 = sum(a["distance"] for a in activities if d180 <= parse_date(a["start_date_local"]) < d90)

            alerts = []
            if avg_4w > 0 and week_vol > avg_4w * 1.2:
                alerts.append({"type": "warning", "message": f"Volume semaine +{((week_vol/avg_4w)-1)*100:.0f}% vs moyenne 4 sem."})
            if prev_90 > 0 and vol_90 < prev_90 * 0.85:
                alerts.append({"type": "danger", "message": f"Volume 90j en baisse de {((1 - vol_90/prev_90))*100:.0f}%"})

            prs = compute_prs(activities)
            pr_90d = sum(1 for dist in prs.values() for p in dist if p.get("is_best") and parse_date(p["date"]) >= d90)

            # Projections Riegel
            projections = {}
            for src, src_dist, targets in [
                ("10k", 10000, [("semi", 21097.5), ("marathon", 42195)]),
                ("semi", 21097.5, [("marathon", 42195)]),
            ]:
                if prs.get(src):
                    best = prs[src][0]["time"]
                    for tgt_name, tgt_dist in targets:
                        proj = riegel_projection(best, src_dist, tgt_dist)
                        projections[f"{tgt_name}_from_{src}"] = {
                            "seconds": round(proj),
                            "formatted": fmt_time(round(proj)),
                            "source_time": fmt_time(best),
                            "source_distance": src,
                        }

            self._json({
                "week_volume": round(week_vol / 1000, 2),
                "volume_90d": round(vol_90 / 1000, 2),
                "avg_4_weeks": round(avg_4w / 1000, 2),
                "local_legends": 0,
                "pr_90d": pr_90d,
                "projections": projections,
                "alerts": alerts,
                "total_activities": len(activities),
            })

        except Exception as e:
            self._json({"error": str(e)}, 500)

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
