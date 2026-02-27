from http.server import BaseHTTPRequestHandler
import json
from urllib.parse import urlparse, parse_qs
from api._db import init_db, query
from api._helpers import fmt_time


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        init_db()
        params = parse_qs(urlparse(self.path).query)
        mode = params.get("mode", ["legends"])[0]

        if mode == "legends":
            data = self._legends()
        elif mode == "prs":
            data = self._prs()
        elif mode == "heatmap":
            data = self._heatmap()
        else:
            data = {}

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _legends(self):
        latest = query("SELECT MAX(date) as d FROM local_legend_snapshot", one=True)
        latest_date = latest["d"] if latest else None
        current = []
        if latest_date:
            current = query("""
                SELECT ll.segment_id, s.name, ll.effort_count
                FROM local_legend_snapshot ll
                JOIN segments s ON s.id = ll.segment_id
                WHERE ll.date = ? AND ll.is_local_legend = 1
            """, (latest_date,))

        timeline_rows = query("""
            SELECT ll.date, ll.segment_id, s.name, ll.is_local_legend
            FROM local_legend_snapshot ll
            JOIN segments s ON s.id = ll.segment_id
            ORDER BY ll.segment_id, ll.date
        """)

        segments_tl = {}
        for r in timeline_rows:
            sid = r["segment_id"]
            if sid not in segments_tl:
                segments_tl[sid] = {"name": r["name"], "periods": [], "_cur": None}
            st = segments_tl[sid]
            if r["is_local_legend"]:
                if not st["_cur"]:
                    st["_cur"] = {"start": r["date"]}
            else:
                if st["_cur"]:
                    st["_cur"]["end"] = r["date"]
                    st["periods"].append(st["_cur"])
                    st["_cur"] = None

        for sid, st in segments_tl.items():
            if st["_cur"]:
                st["_cur"]["end"] = None
                st["periods"].append(st["_cur"])
            del st["_cur"]

        monthly = query("""
            SELECT strftime('%Y-%m', date) as month,
                   SUM(CASE WHEN is_local_legend = 1 THEN 1 ELSE 0 END) as legends,
                   COUNT(DISTINCT segment_id) as segments_tracked
            FROM local_legend_snapshot GROUP BY month ORDER BY month
        """)

        return {
            "current": current,
            "total": len(current),
            "timeline": {str(k): {"name": v["name"], "periods": v["periods"]} for k, v in segments_tl.items()},
            "monthly": monthly,
        }

    def _prs(self):
        monthly = query("""
            SELECT strftime('%Y-%m', date) as month, COUNT(*) as prs
            FROM segment_efforts WHERE pr_rank = 1
            GROUP BY month ORDER BY month
        """)

        top = query("""
            SELECT se.segment_id, s.name, COUNT(*) as efforts,
                   MIN(se.elapsed_time) as best_time,
                   MAX(se.elapsed_time) as worst_time
            FROM segment_efforts se
            JOIN segments s ON s.id = se.segment_id
            GROUP BY se.segment_id ORDER BY efforts DESC LIMIT 20
        """)

        progression = {}
        for seg in top:
            efforts = query("""
                SELECT date, elapsed_time, pr_rank
                FROM segment_efforts WHERE segment_id = ? ORDER BY date
            """, (seg["segment_id"],))
            progression[seg["segment_id"]] = {
                "name": seg["name"],
                "best": seg["best_time"],
                "efforts": efforts,
            }

        return {
            "monthly_prs": monthly,
            "top_segments": top,
            "progression": progression,
        }

    def _heatmap(self):
        return query("""
            SELECT s.id, s.name, s.start_latlng, s.end_latlng,
                   COUNT(se.id) as efforts,
                   MIN(se.elapsed_time) as best_time,
                   MAX(CASE WHEN se.pr_rank = 1 THEN 1 ELSE 0 END) as has_pr
            FROM segments s
            LEFT JOIN segment_efforts se ON se.segment_id = s.id
            WHERE s.start_latlng IS NOT NULL
            GROUP BY s.id
        """)
