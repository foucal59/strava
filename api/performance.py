from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from datetime import datetime, timedelta
from api._utils import extract_token, get_all_activities, compute_prs, riegel_projection, fmt_time, compute_pace


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        token = extract_token(self.headers)
        if not token:
            self._json({"error": "No token"}, 401)
            return

        params = parse_qs(urlparse(self.path).query)
        mode = params.get("mode", ["records"])[0]

        try:
            activities = get_all_activities(token)
            prs = compute_prs(activities)

            if mode == "records":
                self._json(prs)
            elif mode == "best_by_year":
                self._json(self._best_by_year(prs))
            elif mode == "projections":
                self._json(self._projections(prs, activities))
            else:
                self._json({})
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _best_by_year(self, prs):
        result = {}
        for dist_type, records in prs.items():
            by_year = {}
            for r in records:
                yr = r["date"][:4]
                if yr not in by_year or r["time"] < by_year[yr]["time"]:
                    by_year[yr] = r
            result[dist_type] = sorted(
                [{"year": yr, "time": v["time"], "formatted": v["formatted"], "pace": v["pace"]}
                 for yr, v in by_year.items()],
                key=lambda x: x["year"]
            )
        return result

    def _projections(self, prs, activities):
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

        # Timeline: running best over time
        timeline = {}
        for dist_type in ["10k", "semi"]:
            sorted_runs = sorted(prs.get(dist_type, []), key=lambda x: x["date"])
            running_best = None
            for r in sorted_runs:
                if running_best is None or r["time"] < running_best:
                    running_best = r["time"]
                d = r["date"][:10]
                if d not in timeline:
                    timeline[d] = {}
                if dist_type == "10k":
                    timeline[d]["marathon_from_10k"] = round(riegel_projection(running_best, 10000, 42195))
                    timeline[d]["semi_from_10k"] = round(riegel_projection(running_best, 10000, 21097.5))
                elif dist_type == "semi":
                    timeline[d]["marathon_from_semi"] = round(riegel_projection(running_best, 21097.5, 42195))

        # Confidence based on 90d volume
        now = datetime.now()
        d90 = now - timedelta(days=90)
        vol_90 = sum(
            a["distance"] for a in activities
            if datetime.fromisoformat(a["start_date_local"].replace("Z", "")) >= d90
        ) / 1000

        confidence = "low"
        if vol_90 > 300:
            confidence = "high"
        elif vol_90 > 150:
            confidence = "medium"

        return {
            "current": projections,
            "timeline": [{"date": k, **v} for k, v in sorted(timeline.items())],
            "confidence": confidence,
            "volume_90d_km": round(vol_90, 1),
        }

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
