# Yves Mayol Music Library

A small local web app for managing a personal music collection. The interface is plain HTML/CSS/JavaScript; the server uses Python's standard library and persists records in SQLite.

## Run locally

1. Open a terminal in this folder.
2. Run `python app.py` (Windows users can also run `py app.py`).
3. Visit <http://127.0.0.1:8000>.

Keep the server running while using the app. Do not open the HTML file directly; database requests require the local server. The first run creates `music_library.db` in this folder and inserts the three example tracks. The database file remains here and keeps edits after the server restarts. Back up the database by copying that file while the server is stopped.

## Features

- Create, view, edit, and delete tracks through a SQLite-backed JSON API.
- Search by title, artist, or album; sort by title, artist, year, or insertion order.
- Optional 30-second audio preview from a direct HTTP(S) audio URL.
- Required title and artist validation, with release-year and preview-URL checks.

## API

- `GET /api/songs`
- `POST /api/songs`
- `PUT /api/songs/{id}`
- `DELETE /api/songs/{id}`
- `GET /api/health`

This starter server binds to `127.0.0.1` and is intended for personal local use, not public internet deployment. It does not include user accounts or multi-user access controls.
