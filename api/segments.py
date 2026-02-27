from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from api._utils import extract_token, strava_get, fmt_time


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        token = extract_token(self.headers)
        if not token:
            self._json({"error": "No token"}, 401)
            return

        params = parse_qs(urlparse(self.path).query)
        mode = params.get("mode", ["starred"])[0]

        try:
            if mode == "starred":
                self._json(self._starred(token))
            elif mode == "legends":
                self._json(self._legends(token))
            else:
                self._json([])
        except Exception as e:
            self._json({"error": str(e)}, 500)

    def _starred(self, token):
        """Fetch starred segments with local legend status."""
        segments = []
        page = 1
        while True:
            batch = strava_get(token, "/segments/starred", {"page": page, "per_page": 100})
            if not batch:
                break
            segments.extend(batch)
            if len(batch) < 100:
                break
            page += 1

        result = []
        for s in segments:
            result.append({
                "id": s["id"],
                "name": s["name"],
                "distance": s.get("distance"),
                "average_grade": s.get("average_grade"),
                "climb_category": s.get("climb_category"),
                "city": s.get("city"),
                "state": s.get("state"),
                "athlete_pr_effort": s.get("athlete_pr_effort"),
            })
        return result

    def _legends(self, token):
        """Check local legend status on starred segments."""
        starred = strava_get(token, "/segments/starred", {"per_page": 50})
        legends = []
        for s in starred[:30]:  # Limit to avoid rate limits
            try:
                detail = strava_get(token, f"/segments/{s['id']}")
                ll = detail.get("local_legend") or {}
                if ll.get("is_local_legend"):
                    legends.append({
                        "segment_id": s["id"],
                        "name": s["name"],
                        "effort_count": ll.get("effort_count", 0),
                    })
            except Exception:
                continue

        return {
            "current": legends,
            "total": len(legends),
            "timeline": {},
            "monthly": [],
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
