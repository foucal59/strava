import sqlite3
import os
from contextlib import contextmanager

DB_PATH = os.environ.get("DB_PATH", "strava_dashboard.db")


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


@contextmanager
def get_db():
    conn = get_connection()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
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
            created_at TEXT DEFAULT (datetime('now')),
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
            end_latlng TEXT,
            average_cadence REAL,
            calories REAL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (athlete_id) REFERENCES athlete(id)
        );

        CREATE INDEX IF NOT EXISTS idx_activities_date ON activities(date);
        CREATE INDEX IF NOT EXISTS idx_activities_type ON activities(type);
        CREATE INDEX IF NOT EXISTS idx_activities_athlete ON activities(athlete_id);

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
            max_heartrate REAL,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (activity_id) REFERENCES activities(id),
            FOREIGN KEY (segment_id) REFERENCES segments(id)
        );

        CREATE INDEX IF NOT EXISTS idx_efforts_segment ON segment_efforts(segment_id);
        CREATE INDEX IF NOT EXISTS idx_efforts_date ON segment_efforts(date);
        CREATE INDEX IF NOT EXISTS idx_efforts_activity ON segment_efforts(activity_id);

        CREATE TABLE IF NOT EXISTS local_legend_snapshot (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            segment_id INTEGER NOT NULL,
            is_local_legend INTEGER NOT NULL DEFAULT 0,
            effort_count INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (segment_id) REFERENCES segments(id),
            UNIQUE(date, segment_id)
        );

        CREATE INDEX IF NOT EXISTS idx_ll_date ON local_legend_snapshot(date);
        CREATE INDEX IF NOT EXISTS idx_ll_segment ON local_legend_snapshot(segment_id);

        CREATE TABLE IF NOT EXISTS personal_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            athlete_id INTEGER,
            distance_type TEXT NOT NULL,
            date TEXT NOT NULL,
            time INTEGER NOT NULL,
            activity_id INTEGER,
            created_at TEXT DEFAULT (datetime('now')),
            FOREIGN KEY (athlete_id) REFERENCES athlete(id),
            FOREIGN KEY (activity_id) REFERENCES activities(id)
        );

        CREATE INDEX IF NOT EXISTS idx_pr_type ON personal_records(distance_type);
        CREATE INDEX IF NOT EXISTS idx_pr_date ON personal_records(date);

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
    print("Database initialized.")
