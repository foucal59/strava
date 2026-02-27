from http.server import BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
import os
from api._strava import exchange_token
from api._db import init_db, execute


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        init_db()
        params = parse_qs(urlparse(self.path).query)
        code = params.get("code", [None])[0]

        if not code:
            self.send_response(400)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(b"Missing code parameter")
            return

        try:
            data = exchange_token(code)
            athlete = data.get("athlete", {})

            execute("""
                INSERT OR REPLACE INTO athlete (id, username, firstname, lastname, weight, profile_pic,
                                                access_token, refresh_token, token_expires_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                athlete.get("id"),
                athlete.get("username"),
                athlete.get("firstname"),
                athlete.get("lastname"),
                athlete.get("weight"),
                athlete.get("profile"),
                data["access_token"],
                data["refresh_token"],
                data["expires_at"],
            ))

            # Redirect to frontend
            base = os.environ.get("VERCEL_URL", "")
            if base and not base.startswith("http"):
                base = f"https://{base}"
            redirect = base or "/"

            self.send_response(302)
            self.send_header("Location", f"{redirect}/?auth=success")
            self.end_headers()

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "text/plain")
            self.end_headers()
            self.wfile.write(f"Auth error: {str(e)}".encode())
