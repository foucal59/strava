from http.server import BaseHTTPRequestHandler
import json
from api._db import init_db, query


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        init_db()
        row = query("SELECT id, username, firstname, lastname, profile_pic FROM athlete LIMIT 1", one=True)

        data = {"authenticated": bool(row)}
        if row:
            data["athlete"] = row

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
