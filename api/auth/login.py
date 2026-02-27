from http.server import BaseHTTPRequestHandler
from api._strava import get_auth_url
from api._db import init_db


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        init_db()
        url = get_auth_url()
        self.send_response(302)
        self.send_header("Location", url)
        self.end_headers()
