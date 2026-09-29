"""Local web server and SQLite API for the music library."""

from __future__ import annotations

import json
import sqlite3
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent
DATABASE = ROOT / "music_library.db"
HOST = "127.0.0.1"
PORT = 8000

SEED_SONGS = [
    ("Cutting My Fingers Off", "Turnover", "Peripheral Vision", 2015, "3:24", ""),
    ("It's Not Living (If It's Not With You)", "The 1975", "A Brief Inquiry into Online Relationships", 2018, "4:08", ""),
    ("iPod Touch", "Ninajirachi", "I Love My Computer", 2025, "3:16", ""),
]


def connect_database() -> sqlite3.Connection:
    connection = sqlite3.connect(DATABASE)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def initialize_database() -> None:
    with connect_database() as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS songs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                artist TEXT NOT NULL,
                album TEXT NOT NULL DEFAULT '',
                year INTEGER,
                length TEXT NOT NULL DEFAULT '',
                audio_url TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )"""
        )
        count = connection.execute("SELECT COUNT(*) FROM songs").fetchone()[0]
        if count == 0:
            connection.executemany(
                "INSERT INTO songs (title, artist, album, year, length, audio_url) VALUES (?, ?, ?, ?, ?, ?)",
                SEED_SONGS,
            )


def serialize_song(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "artist": row["artist"],
        "album": row["album"],
        "year": row["year"],
        "length": row["length"],
        "audioUrl": row["audio_url"],
    }


class MusicLibraryHandler(BaseHTTPRequestHandler):
    server_version = "MusicLibrary/1.0"

    def send_json(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def read_json(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length) or b"{}")
        except (ValueError, json.JSONDecodeError) as error:
            raise ValueError("Request body must be valid JSON.") from error
        if not isinstance(payload, dict):
            raise ValueError("Request body must be a JSON object.")
        return payload

    @staticmethod
    def validate_song(data: dict) -> dict:
        title = str(data.get("title", "")).strip()
        artist = str(data.get("artist", "")).strip()
        if not title or not artist:
            raise ValueError("Song title and artist are required.")
        year_value = str(data.get("year", "")).strip()
        if year_value and (not year_value.isdigit() or not 1000 <= int(year_value) <= 9999):
            raise ValueError("Enter a valid four-digit release year.")
        audio_url = str(data.get("audioUrl", "")).strip()
        if audio_url and not audio_url.lower().startswith(("http://", "https://")):
            raise ValueError("Preview links must start with http:// or https://.")
        return {
            "title": title,
            "artist": artist,
            "album": str(data.get("album", "")).strip(),
            "year": int(year_value) if year_value else None,
            "length": str(data.get("length", "")).strip(),
            "audio_url": audio_url,
        }

    def do_GET(self) -> None:
        path = urlparse(self.path).path
        if path == "/api/songs":
            with connect_database() as connection:
                rows = connection.execute("SELECT * FROM songs ORDER BY id").fetchall()
            self.send_json(200, [serialize_song(row) for row in rows])
            return
        if path == "/api/health":
            self.send_json(200, {"status": "ok", "database": DATABASE.name})
            return

        requested = "Index.html" if path in ("/", "/index.html") else path.lstrip("/")
        allowed_files = {"Index.html", "music-taste.html", "about.html", "style.css", "script.js"}
        if requested not in allowed_files:
            self.send_error(404, "Not found")
            return
        file_path = ROOT / requested
        content_type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
        }.get(file_path.suffix, "application/octet-stream")
        body = file_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if urlparse(self.path).path != "/api/songs":
            self.send_json(404, {"error": "Endpoint not found."})
            return
        try:
            song = self.validate_song(self.read_json())
        except ValueError as error:
            self.send_json(400, {"error": str(error)})
            return
        with connect_database() as connection:
            cursor = connection.execute(
                "INSERT INTO songs (title, artist, album, year, length, audio_url) VALUES (:title, :artist, :album, :year, :length, :audio_url)",
                song,
            )
            row = connection.execute("SELECT * FROM songs WHERE id = ?", (cursor.lastrowid,)).fetchone()
        self.send_json(201, serialize_song(row))

    def do_PUT(self) -> None:
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "songs"]:
            self.send_json(404, {"error": "Endpoint not found."})
            return
        try:
            song_id = int(parts[2])
            song = self.validate_song(self.read_json())
        except (ValueError, TypeError) as error:
            self.send_json(400, {"error": str(error) or "Invalid song ID."})
            return
        with connect_database() as connection:
            cursor = connection.execute(
                "UPDATE songs SET title=:title, artist=:artist, album=:album, year=:year, length=:length, audio_url=:audio_url WHERE id=:id",
                {**song, "id": song_id},
            )
            row = connection.execute("SELECT * FROM songs WHERE id = ?", (song_id,)).fetchone()
        if not cursor.rowcount or row is None:
            self.send_json(404, {"error": "Song not found."})
            return
        self.send_json(200, serialize_song(row))

    def do_DELETE(self) -> None:
        parts = urlparse(self.path).path.strip("/").split("/")
        if len(parts) != 3 or parts[:2] != ["api", "songs"]:
            self.send_json(404, {"error": "Endpoint not found."})
            return
        try:
            song_id = int(parts[2])
        except ValueError:
            self.send_json(400, {"error": "Invalid song ID."})
            return
        with connect_database() as connection:
            cursor = connection.execute("DELETE FROM songs WHERE id = ?", (song_id,))
        if cursor.rowcount == 0:
            self.send_json(404, {"error": "Song not found."})
            return
        self.send_json(200, {"deleted": True})

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.log_date_time_string()} - {format % args}")


if __name__ == "__main__":
    initialize_database()
    print(f"Music library ready at http://{HOST}:{PORT}")
    print(f"SQLite database: {DATABASE}")
    ThreadingHTTPServer((HOST, PORT), MusicLibraryHandler).serve_forever()
