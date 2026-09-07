#!/usr/bin/env python3
"""
PPE Detection - Industrial Site Survey
Field survey web app: capture camera / server / commercial data from factories,
store it locally, and export it to CSV for analysis.
"""
import csv
import io
import json
import os
import sqlite3
from datetime import datetime

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.exceptions import HTTPException

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "surveys.db")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #
def db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Create the schema if missing. Safe to call on every request, so a
    deleted/moved database file can never take the API down."""
    with db() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS responses (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                ref         TEXT UNIQUE NOT NULL,
                company     TEXT,
                site        TEXT,
                payload     TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                updated_at  TEXT NOT NULL
            )
            """
        )


@app.before_request
def ensure_schema():
    try:
        init_db()
    except Exception as exc:  # pragma: no cover
        app.logger.error("Could not initialise database: %s", exc)


@app.errorhandler(Exception)
def handle_unexpected(exc):
    """Always answer with JSON - the front end must never try to parse an HTML
    error page as data. Regular HTTP errors (404 on the health probe, etc.)
    pass through untouched and unlogged."""
    if isinstance(exc, HTTPException):
        return exc
    app.logger.exception("Unhandled error")
    return jsonify({"ok": False, "error": str(exc)}), 500


# --------------------------------------------------------------------------- #
# CORS - the preview iframe runs on a different origin, so allow all
# --------------------------------------------------------------------------- #
@app.after_request
def add_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    if request.method == "OPTIONS":
        resp.status_code = 204
    return resp


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #
def make_ref():
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    with db() as conn:
        n = conn.execute("SELECT COUNT(*) c FROM responses").fetchone()["c"]
    return f"SUR-{stamp}-{n + 1:03d}"


def flatten(payload):
    """Turn the nested JSON (cameras[], servers[]) into one flat CSV row."""
    row = {}

    def walk(obj, prefix=""):
        if isinstance(obj, dict):
            for k, v in obj.items():
                walk(v, f"{prefix}{k}.")
        elif isinstance(obj, list):
            if obj and all(isinstance(x, str) and x.startswith("data:image") for x in obj):
                row[prefix[:-1]] = f"{len(obj)} photo(s)"
                return
            # repeated groups -> joined string with " | " separators
            parts = []
            for item in obj:
                if isinstance(item, dict):
                    bits = [
                        f"{k}={v}"
                        for k, v in item.items()
                        if v not in ("", None, [], {}) and not isinstance(v, (dict, list))
                    ]
                    parts.append("; ".join(bits))
                else:
                    parts.append(str(item))
            row[prefix[:-1]] = " | ".join(parts)
        else:
            if isinstance(obj, bool):
                obj = "Yes" if obj else "No"
            row[prefix[:-1]] = obj

    walk(payload)
    return row


# --------------------------------------------------------------------------- #
# Routes
# --------------------------------------------------------------------------- #
@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(STATIC_DIR, filename)


@app.route("/api/health")
def health():
    """Used by the front end to detect whether the survey server is present.
    On GitHub Pages this route does not exist, and the form automatically
    switches to on-device storage mode."""
    return jsonify({"ok": True, "mode": "server"})


@app.route("/api/responses", methods=["GET"])
def list_responses():
    with db() as conn:
        rows = conn.execute(
            "SELECT id, ref, company, site, payload, created_at FROM responses ORDER BY id DESC"
        ).fetchall()
    out = []
    for r in rows:
        try:
            payload = json.loads(r["payload"])
        except Exception:
            payload = {}
        out.append(
            {
                "id": r["id"],
                "ref": r["ref"],
                "company": r["company"],
                "site": r["site"],
                "created_at": r["created_at"],
                "payload": payload,
            }
        )
    return jsonify(out)


@app.route("/api/responses", methods=["POST"])
def save_response():
    payload = request.get_json(silent=True) or {}
    if not payload:
        return jsonify({"error": "Empty payload"}), 400

    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ref = payload.get("meta", {}).get("ref") or make_ref()
    resp = payload.get("respondent", {}) or {}
    company = str(resp.get("company_name", ""))[:200]
    site = str(resp.get("plant_location", ""))[:200]

    with db() as conn:
        exists = conn.execute(
            "SELECT id FROM responses WHERE ref = ?", (ref,)
        ).fetchone()
        if exists:
            conn.execute(
                "UPDATE responses SET company=?, site=?, payload=?, updated_at=? WHERE ref=?",
                (company, site, json.dumps(payload), now, ref),
            )
            action = "updated"
        else:
            conn.execute(
                "INSERT INTO responses (ref, company, site, payload, created_at, updated_at) "
                "VALUES (?,?,?,?,?,?)",
                (ref, company, site, json.dumps(payload), now, now),
            )
            action = "created"

    return jsonify({"ok": True, "action": action, "ref": ref})


@app.route("/api/responses/<int:rid>", methods=["DELETE"])
def delete_response(rid):
    with db() as conn:
        conn.execute("DELETE FROM responses WHERE id = ?", (rid,))
    return jsonify({"ok": True})


@app.route("/api/export.csv")
def export_csv():
    with db() as conn:
        rows = conn.execute(
            "SELECT ref, company, site, payload, created_at FROM responses ORDER BY id"
        ).fetchall()

    flat_rows = []
    for r in rows:
        try:
            payload = json.loads(r["payload"])
        except Exception:
            payload = {}
        flat = flatten(payload)
        flat["_reference_id"] = r["ref"]
        flat["_submitted_at"] = r["created_at"]
        flat_rows.append(flat)

    # stable, readable column order
    headers = ["_reference_id", "_submitted_at"]
    seen = set(headers)
    for fr in flat_rows:
        for k in fr:
            if k not in seen:
                seen.add(k)
                headers.append(k)

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=headers, extrasaction="ignore")
    writer.writeheader()
    for fr in flat_rows:
        writer.writerow(fr)

    stamp = datetime.now().strftime("%Y%m%d-%H%M")
    return (
        buf.getvalue(),
        200,
        {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": f'attachment; filename="ppe-survey-export-{stamp}.csv"',
        },
    )


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
