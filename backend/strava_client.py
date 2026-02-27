import httpx
import time
import os
from database import get_db

STRAVA_API_BASE = "https://www.strava.com/api/v3"
STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"

CLIENT_ID = os.environ.get("STRAVA_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("STRAVA_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("STRAVA_REDIRECT_URI", "http://localhost:8000/auth/callback")

# Rate limiting: 100 requests per 15 min, 1000 per day
REQUEST_DELAY = 1.2  # seconds between requests


class StravaClient:
    def __init__(self):
        self.last_request_time = 0

    def _rate_limit(self):
        elapsed = time.time() - self.last_request_time
        if elapsed < REQUEST_DELAY:
            time.sleep(REQUEST_DELAY - elapsed)
        self.last_request_time = time.time()

    def get_auth_url(self):
        return (
            f"{STRAVA_AUTH_URL}?client_id={CLIENT_ID}"
            f"&redirect_uri={REDIRECT_URI}"
            f"&response_type=code"
            f"&scope=read,read_all,activity:read,activity:read_all"
            f"&approval_prompt=auto"
        )

    async def exchange_token(self, code: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(STRAVA_TOKEN_URL, data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code"
            })
            resp.raise_for_status()
            return resp.json()

    async def refresh_access_token(self, refresh_token: str) -> dict:
        async with httpx.AsyncClient() as client:
            resp = await client.post(STRAVA_TOKEN_URL, data={
                "client_id": CLIENT_ID,
                "client_secret": CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token"
            })
            resp.raise_for_status()
            return resp.json()

    def _get_valid_token(self) -> str:
        with get_db() as conn:
            row = conn.execute(
                "SELECT access_token, refresh_token, token_expires_at FROM athlete LIMIT 1"
            ).fetchone()
            if not row:
                raise Exception("No athlete found. Please authenticate first.")

            if row["token_expires_at"] < time.time():
                import asyncio
                token_data = asyncio.get_event_loop().run_until_complete(
                    self.refresh_access_token(row["refresh_token"])
                )
                conn.execute(
                    """UPDATE athlete SET access_token=?, refresh_token=?, token_expires_at=?, updated_at=datetime('now')
                    WHERE rowid=1""",
                    (token_data["access_token"], token_data["refresh_token"], token_data["expires_at"])
                )
                return token_data["access_token"]
            return row["access_token"]

    async def _get_token(self) -> str:
        with get_db() as conn:
            row = conn.execute(
                "SELECT access_token, refresh_token, token_expires_at FROM athlete LIMIT 1"
            ).fetchone()
            if not row:
                raise Exception("No athlete found. Please authenticate first.")

            if row["token_expires_at"] < time.time():
                token_data = await self.refresh_access_token(row["refresh_token"])
                conn.execute(
                    """UPDATE athlete SET access_token=?, refresh_token=?, token_expires_at=?, updated_at=datetime('now')
                    WHERE rowid=1""",
                    (token_data["access_token"], token_data["refresh_token"], token_data["expires_at"])
                )
                return token_data["access_token"]
            return row["access_token"]

    async def api_get(self, endpoint: str, params: dict = None) -> dict:
        self._rate_limit()
        token = await self._get_token()
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{STRAVA_API_BASE}{endpoint}",
                headers={"Authorization": f"Bearer {token}"},
                params=params or {},
                timeout=30.0
            )
            resp.raise_for_status()
            return resp.json()

    async def fetch_activities(self, after: int = None, page: int = 1, per_page: int = 100) -> list:
        params = {"page": page, "per_page": per_page}
        if after:
            params["after"] = after
        return await self.api_get("/athlete/activities", params)

    async def fetch_activity_detail(self, activity_id: int) -> dict:
        return await self.api_get(f"/activities/{activity_id}")

    async def fetch_segment(self, segment_id: int) -> dict:
        return await self.api_get(f"/segments/{segment_id}")

    async def fetch_starred_segments(self, page: int = 1) -> list:
        return await self.api_get("/segments/starred", {"page": page, "per_page": 100})

    async def fetch_athlete(self) -> dict:
        return await self.api_get("/athlete")


strava = StravaClient()
