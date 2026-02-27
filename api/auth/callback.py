"""OAuth callback: exchanges code for tokens, redirects to frontend with tokens in URL fragment."""
from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, urlencode
import os
import json
import httpx

CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "97899")
CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        params = parse_qs(urlparse(self.path).query)
        code = params.get("code", [None])[0]

        if not code:
            self.send_response(400)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Missing code")
            return

        try:
            with httpx.Client() as client:
                resp = client.post("https://www.strava.com/oauth/token", data={
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "code": code,
                    "grant_type": "authorization_code"
                })
                resp.raise_for_status()
                data = resp.json()

            athlete = data.get("athlete", {})
            fragment = urlencode({
                "access_token": data["access_token"],
                "refresh_token": data["refresh_token"],
                "expires_at": data["expires_at"],
                "athlete_id": athlete.get("id", ""),
                "firstname": athlete.get("firstname", ""),
                "lastname": athlete.get("lastname", ""),
                "profile": athlete.get("profile", ""),
            })

            base = os.environ.get("FRONTEND_URL", "")
            if not base:
                vercel_url = os.environ.get("VERCEL_URL", "")
                base = f"https://{vercel_url}" if vercel_url else "/"

            self.send_response(302)
            self.send_header("Location", f"{base}/#{fragment}")
            self.end_headers()

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"Auth error: {str(e)}".encode())
