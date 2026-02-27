from http.server import BaseHTTPRequestHandler
import os

CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "97899")
REDIRECT_URI = os.environ.get("STRAVA_REDIRECT_URI", "")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        url = (
            f"https://www.strava.com/oauth/authorize"
            f"?client_id={CLIENT_ID}"
            f"&redirect_uri={REDIRECT_URI}"
            f"&response_type=code"
            f"&scope=read,read_all,activity:read,activity:read_all"
            f"&approval_prompt=auto"
        )
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()
