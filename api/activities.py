"""Fetch all running activities with GPS polylines for caching."""
from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from api._utils import extract_token, strava_get, json_resp


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        token = extract_token(self.headers)
        if not token:
            body, status, hdrs = json_resp({"error": "No token"}, 401)
            self.send_response(status)
            for k, v in hdrs.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body.encode())
            return

        params = parse_qs(urlparse(self.path).query)
        after = params.get("after", [None])[0]

        try:
            all_acts = []
            page = 1
            req_params = {"per_page": 200}
            if after:
                req_params["after"] = int(after)

            while True:
                req_params["page"] = page
                acts = strava_get(token, "/athlete/activities", req_params)
                if not acts:
                    break
                for a in acts:
                    if a.get("type") != "Run":
                        continue
                    all_acts.append({
                        "id": a["id"],
                        "name": a.get("name", ""),
                        "start_date_local": a.get("start_date_local", ""),
                        "distance": a.get("distance", 0),
                        "moving_time": a.get("moving_time", 0),
                        "elapsed_time": a.get("elapsed_time", 0),
                        "total_elevation_gain": a.get("total_elevation_gain", 0),
                        "average_speed": a.get("average_speed", 0),
                        "max_speed": a.get("max_speed", 0),
                        "average_heartrate": a.get("average_heartrate"),
                        "max_heartrate": a.get("max_heartrate"),
                        "summary_polyline": (a.get("map") or {}).get("summary_polyline", ""),
                        "start_latlng": a.get("start_latlng"),
                        "end_latlng": a.get("end_latlng"),
                        "suffer_score": a.get("suffer_score"),
                        "pr_count": a.get("pr_count", 0),
                    })
                if len(acts) < 200:
                    break
                page += 1

            body, status, hdrs = json_resp({"activities": all_acts, "count": len(all_acts)})
            self.send_response(status)
            for k, v in hdrs.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body.encode())
        except Exception as e:
            body, status, hdrs = json_resp({"error": str(e)}, 500)
            self.send_response(status)
            for k, v in hdrs.items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body.encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
