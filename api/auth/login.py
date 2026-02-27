from http.server import BaseHTTPRequestHandler
import os

CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "97899")


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        redirect_uri = os.environ.get("STRAVA_REDIRECT_URI", "")
        if not redirect_uri:
            vercel_url = os.environ.get("VERCEL_URL", "")
            if vercel_url:
                redirect_uri = f"https://{vercel_url}/api/auth/callback"
            else:
                redirect_uri = "http://localhost:3000/api/auth/callback"

        url = (
            f"https://www.strava.com/oauth/authorize"
            f"?client_id={CLIENT_ID}"
            f"&redirect_uri={redirect_uri}"
            f"&response_type=code"
            f"&scope=read,read_all,activity:read,activity:read_all"
            f"&approval_prompt=auto"
        )
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()
