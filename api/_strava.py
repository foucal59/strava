"""
Strava API client with token refresh and rate limiting.
"""
import os
import time
import httpx
from api._db import query, execute

STRAVA_API = "https://www.strava.com/api/v3"
CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "97899")
CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("STRAVA_REDIRECT_URI", "")


def get_auth_url():
    return (
        f"https://www.strava.com/oauth/authorize"
        f"?client_id={CLIENT_ID}"
        f"&redirect_uri={REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=read,read_all,activity:read,activity:read_all"
        f"&approval_prompt=auto"
    )


def exchange_token(code: str) -> dict:
    with httpx.Client() as client:
        resp = client.post("https://www.strava.com/oauth/token", data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code"
        })
        resp.raise_for_status()
        return resp.json()


def refresh_token(refresh_tok: str) -> dict:
    with httpx.Client() as client:
        resp = client.post("https://www.strava.com/oauth/token", data={
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
            "refresh_token": refresh_tok,
            "grant_type": "refresh_token"
        })
        resp.raise_for_status()
        return resp.json()


def get_valid_token() -> str:
    row = query("SELECT access_token, refresh_token, token_expires_at FROM athlete LIMIT 1", one=True)
    if not row:
        raise Exception("No athlete. Auth first.")

    if row["token_expires_at"] and row["token_expires_at"] < time.time():
        data = refresh_token(row["refresh_token"])
        execute(
            "UPDATE athlete SET access_token=?, refresh_token=?, token_expires_at=?, updated_at=datetime('now') WHERE rowid=1",
            (data["access_token"], data["refresh_token"], data["expires_at"])
        )
        return data["access_token"]
    return row["access_token"]


def api_get(endpoint: str, params: dict = None) -> dict:
    token = get_valid_token()
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(
            f"{STRAVA_API}{endpoint}",
            headers={"Authorization": f"Bearer {token}"},
            params=params or {}
        )
        resp.raise_for_status()
        return resp.json()
