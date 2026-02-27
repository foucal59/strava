"""
Database layer using Turso (libsql) for Vercel serverless.
Falls back to local SQLite for dev.
"""
import os
import libsql_experimental as libsql

TURSO_URL = os.environ.get("TURSO_DATABASE_URL", "file:local.db")
TURSO_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "")


def get_conn():
    if TURSO_TOKEN:
        conn = libsql.connect("strava.db", sync_url=TURSO_URL, auth_token=TURSO_TOKEN)
        conn.sync()
    else:
        conn = libsql.connect(TURSO_URL)
    return conn


def init_db():
    conn = get_conn()
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS athlete (
        id INTEGER PRIMARY KEY,
        username TEXT,
        firstname TEXT,
        lastname TEXT,
        weight REAL,
        profile_pic TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at INTEGER,
        updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activities (
        id INTEGER PRIMARY KEY,
        athlete_id INTEGER,
        name TEXT,
        date TEXT NOT NULL,
        distance REAL NOT NULL DEFAULT 0,
        moving_time INTEGER NOT NULL DEFAULT 0,
        elapsed_time INTEGER NOT NULL DEFAULT 0,
        average_speed REAL,
        max_speed REAL,
        total_elevation_gain REAL DEFAULT 0,
        average_heartrate REAL,
        max_heartrate REAL,
        type TEXT NOT NULL DEFAULT 'Run',
        suffer_score REAL,
        start_latlng TEXT,
        average_cadence REAL,
        calories REAL
    );

    CREATE TABLE IF NOT EXISTS segments (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        distance REAL,
        elevation_gain REAL,
        average_grade REAL,
        climb_category INTEGER,
        city TEXT,
        state TEXT,
        start_latlng TEXT,
        end_latlng TEXT
    );

    CREATE TABLE IF NOT EXISTS segment_efforts (
        id INTEGER PRIMARY KEY,
        activity_id INTEGER,
        segment_id INTEGER,
        elapsed_time INTEGER NOT NULL,
        moving_time INTEGER,
        date TEXT NOT NULL,
        pr_rank INTEGER,
        kom_rank INTEGER,
        average_heartrate REAL,
        max_heartrate REAL
    );

    CREATE TABLE IF NOT EXISTS local_legend_snapshot (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        segment_id INTEGER NOT NULL,
        is_local_legend INTEGER NOT NULL DEFAULT 0,
        effort_count INTEGER,
        UNIQUE(date, segment_id)
    );

    CREATE TABLE IF NOT EXISTS personal_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        athlete_id INTEGER,
        distance_type TEXT NOT NULL,
        date TEXT NOT NULL,
        time INTEGER NOT NULL,
        activity_id INTEGER
    );

    CREATE TABLE IF NOT EXISTS sync_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sync_type TEXT NOT NULL,
        started_at TEXT DEFAULT (datetime('now')),
        completed_at TEXT,
        records_synced INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running',
        error TEXT
    );
    """)
    conn.commit()
    if TURSO_TOKEN:
        conn.sync()
    return conn


def dict_row(cursor, row):
    """Convert a row to dict using cursor description."""
    if row is None:
        return None
    cols = [d[0] for d in cursor.description]
    return dict(zip(cols, row))


def query(sql, params=(), one=False):
    conn = get_conn()
    cur = conn.execute(sql, params)
    if one:
        row = cur.fetchone()
        return dict_row(cur, row)
    rows = cur.fetchall()
    return [dict_row(cur, r) for r in rows]


def execute(sql, params=()):
    conn = get_conn()
    conn.execute(sql, params)
    conn.commit()
    if TURSO_TOKEN:
        conn.sync()


def executemany(sql, params_list):
    conn = get_conn()
    for params in params_list:
        conn.execute(sql, params)
    conn.commit()
    if TURSO_TOKEN:
        conn.sync()
