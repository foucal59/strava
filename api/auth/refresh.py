"""Refresh Strava token server-side (needs client_secret)."""
from http.server import BaseHTTPRequestHandler
import os
import json
import httpx

CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "97899")
CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "")


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        refresh_token = body.get("refresh_token")

        if not refresh_token:
            self._json({"error": "missing refresh_token"}, 400)
            return

        try:
            with httpx.Client() as client:
                resp = client.post("https://www.strava.com/oauth/token", data={
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "refresh_token": refresh_token,
                    "grant_type": "refresh_token"
                })
                resp.raise_for_status()
                data = resp.json()

            self._json({
                "access_token": data["access_token"],
                "refresh_token": data["refresh_token"],
                "expires_at": data["expires_at"],
            })

        except Exception as e:
            self._json({"error": str(e)}, 500)

    def do_OPTIONS(self):
        self.send_response(200)
        self._cors_headers()
        self.end_headers()

    def _json(self, data, status=200):
        self.send_response(status)
        self._cors_headers()
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
