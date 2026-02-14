# ScoreBoard-app

This repository includes a small Express backend (Node.js + SQLite) and a single-file frontend (`index.html`). The server stores game objects in a SQLite database located at `data/games.db` and serves the frontend as static files.

Contents
- `server.js` - Express server and REST API
- `index.html` - frontend (now server-aware, supports offline/local fallback)
- `data/` - holds the SQLite database after first run

Quick start (development)

1. Install dependencies and start:

```bash
cd "e:\GIT-personal\ScoreBoard-app"
npm install
npm start
```

2. Open the app in a browser at `http://localhost:3000` (or replace `localhost` with the host IP on your LAN).

Frontend configuration
- If you open `index.html` directly via `file://` you can point it to a remote API with `?api=http://HOST:PORT`.
- To skip the initial server health ping (useful when running file:// or when you expect the server to be offline) add `?skipServer=1` to the URL or set `globalThis.SKIP_SERVER_PING = true` before loading the page.

Service installation (Linux / systemd)

Example `systemd` unit to run the server on boot (create `/etc/systemd/system/scoreboard.service`):

```ini
[Unit]
Description=ScoreBoard-app (Node)
After=network.target

[Service]
WorkingDirectory=/path/to/ScoreBoard-app
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
User=pi

[Install]
WantedBy=multi-user.target
```

Commands to enable and start on a Debian/Raspbian system (run as root or with sudo):

```bash
cp /path/to/repo/scoreboard.service /etc/systemd/system/scoreboard.service
systemctl daemon-reload
systemctl enable scoreboard.service
systemctl start scoreboard.service
systemctl status scoreboard.service
```

Replace `/path/to/ScoreBoard-app` and `User` as appropriate for your system.

API (detailed)

All API endpoints are prefixed with `/api` and the server enables CORS. The server also exposes a health endpoint.

- `GET /health`
	- Quick health check. Returns `200` with `{ status: 'ok' }`.

- `GET /api/games`
	- Returns a list of games. By default this endpoint returns metadata-only list entries to save bandwidth (no full `rounds` arrays).
	- Query: `?includeRounds=true` — returns full game objects including `data.rounds`.
	- Metadata-only response entries look like: `{ id, name, createdAt, roundCount, playerCreationOrder, localOnly }`.

- `GET /api/games/:id`
	- Returns the full game record as: `{ id, name, data, createdAt }` or `404` if not found.

- `POST /api/games`
	- Create or replace a game. Body: `{ id?, name?, data? }` (JSON). If `id` is omitted the server will generate one.
	- Response: `201 Created` with the created game `{ id, name, data, createdAt }`.

- `PUT /api/games/:id`
	- Update/replace a game's `data`. The server merges incoming `data` with existing record and preserves the existing `rounds` array unless the incoming `data` contains a `rounds` array explicitly.
	- This prevents accidental loss of server-stored rounds when clients push metadata-only updates.
	- Response: `200` with the merged record `{ id, name, data, createdAt }`.

- `DELETE /api/games/:id`
	- Deletes the game with the given id. Response: `204 No Content` on success, `404` if not found.

- `POST /api/games/:id/rounds`
	- Append a single round to the game's `data.rounds` array. Body: `{ round }` (JSON). Returns `201` with `{ round }`.

Server storage notes
- Games are stored as JSON in the `data` column of a SQLite `games` table (`data/games.db`).
- When clients create a game they should avoid sending client-only flags such as `localOnly` — the frontend avoids sending `localOnly` when syncing.

Frontend-server sync behavior (summary)
- The frontend now prefers the server when available but supports a local-only mode:
	- Rounds are appended using `POST /api/games/:id/rounds` (preferred) so clients don't overwrite the full rounds array.
	- Metadata-only updates (players, flags) are sent using `PUT /api/games/:id` and the server merges to preserve rounds.
	- `GET /api/games` returns metadata-only entries by default; the frontend fetches a full game on demand.

Troubleshooting
- If the browser console shows `GET /health net::ERR_CONNECTION_REFUSED` the server is not running at `API_BASE`. Use `?skipServer=1` when opening locally to suppress the initial ping.
- If port `3000` is already in use, set `PORT` environment variable when starting the server:

```bash
PORT=4000 npm start
```

License & notes
- This project is a small personal tool; adapt and secure the CORS and deployment settings before exposing to the public internet.

---

If you'd like, I can also add a small `systemd` install script, a `package.json` `service` script, or a bulk-sync button in the frontend. Let me know which next step you prefer.