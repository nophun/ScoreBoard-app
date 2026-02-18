const express = require('express');
const path = require('node:path');
const Database = require('better-sqlite3');

const app = express();
// Enable CORS so remote frontends can call the API (adjust in production)
const cors = require('cors');
app.use(cors());
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static frontend files from the `public/` folder at project root
app.use(express.static(path.join(__dirname, '..', 'public')));

// Ensure data directory exists
const dbPath = path.join(__dirname, 'data', 'games.db');
const fs = require('node:fs');
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);

// Create games table to store entire game objects as JSON
db.prepare(`CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  name TEXT,
  data TEXT,
  created_at INTEGER
)`).run();

app.get('/api/games', (req, res) => {
  try {
    const includeRounds = String(req.query.includeRounds || '').toLowerCase() === 'true';
    const rows = db.prepare('SELECT id, name, data, created_at, rowid FROM games ORDER BY created_at DESC').all();
    const list = rows.map(r => {
      const parsed = JSON.parse(r.data || '{}');
      const createdAt = parsed.createdAt;
      if (includeRounds) return { id: r.id, name: r.name, data: parsed || {}, createdAt };
      // Return metadata-only to save bandwidth
      return {
        id: r.id,
        name: r.name,
        createdAt,
        roundCount: Array.isArray(parsed.rounds) ? parsed.rounds.length : 0,
        playerCreationOrder: parsed.playerCreationOrder || (parsed.players ? [...(parsed.players.active||[]), ...(parsed.players.queue||[])] : [])
      };
    });
    res.json(list);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load games' });
  }
});

app.get('/api/games/:id', (req, res) => {
  try {
    const row = db.prepare('SELECT id, name, data, created_at FROM games WHERE id = ?').get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Not found' });
    const parsed = JSON.parse(row.data || '{}');
    res.json({ id: row.id, data: parsed });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load game' });
  }
});

app.post('/api/games', (req, res) => {
  try {
    const payload = req.body || {};
    const id = payload.id || 'game-' + Date.now();
    const name = payload.name || ('Game ' + Date.now());
    const parsedData = payload.data || {};
    // Prefer client-supplied createdAt inside game data; fall back to now
    const createdAt = parsedData.createdAt || Date.now();
    const data = JSON.stringify(parsedData);

    db.prepare('INSERT OR REPLACE INTO games(id,name,data,created_at) VALUES(?,?,?,?)')
      .run(id, name, data, createdAt);

    res.status(201).json({ id, name, data: parsedData });
    try { if (typeof broadcast === 'function') broadcast({ type: 'games-updated' }); } catch (e) { console.warn('broadcast failed in POST /api/games', e); }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create game' });
  }
});

app.put('/api/games/:id', (req, res) => {
  try {
    const id = req.params.id;
    const payload = req.body || {};
    const name = payload.name || payload.data?.name || ('Game ' + Date.now());
    // Load existing record to preserve rounds and other server-side state
    const row = db.prepare('SELECT data, created_at FROM games WHERE id = ?').get(id);
    const existing = row ? JSON.parse(row.data || '{}') : {};
    const existingCreated = row ? row.created_at : Date.now();

    // Merge incoming data with existing; do not let an update without `rounds`
    // remove existing rounds. Incoming fields override existing ones except `rounds`.
    const incoming = payload.data || {};
    const merged = { ...existing, ...incoming };
    merged.rounds = Array.isArray(incoming.rounds) ? incoming.rounds : (existing.rounds || []);

    // Prefer createdAt embedded in game data; otherwise preserve existing DB value
    const createdAt = merged.createdAt || existingCreated || Date.now();

    const data = JSON.stringify(merged);
    db.prepare('INSERT OR REPLACE INTO games(id,name,data,created_at) VALUES(?,?,?,?)')
      .run(id, name, data, createdAt);

    res.json({ id, name, data: merged });
    try { if (typeof broadcast === 'function') broadcast({ type: 'game-updated', id }); } catch (e) { console.warn('broadcast failed in PUT /api/games/:id', e); }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update game' });
  }
});

app.delete('/api/games/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
    res.status(204).end();
    try { if (typeof broadcast === 'function') broadcast({ type: 'games-updated' }); } catch (e) { console.warn('broadcast failed in DELETE /api/games/:id', e); }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete game' });
  }
});

// Append a round to a game's rounds array
app.post('/api/games/:id/rounds', (req, res) => {
  try {
    const id = req.params.id;
    const round = req.body.round;
    if (!round) return res.status(400).json({ error: 'Missing round body' });

    const row = db.prepare('SELECT data FROM games WHERE id = ?').get(id);
    if (!row) return res.status(404).json({ error: 'Game not found' });

    const data = JSON.parse(row.data || '{}');
    data.rounds = data.rounds || [];
    data.rounds.push(round);

    db.prepare('UPDATE games SET data = ? WHERE id = ?').run(JSON.stringify(data), id);
    res.status(201).json({ round });
    try { if (typeof broadcast === 'function') broadcast({ type: 'game-updated', id }); } catch (e) { console.warn('broadcast failed in POST /api/games/:id/rounds', e); }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to append round' });
  }
});

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Create HTTP server and attach WebSocket server for realtime notifications
const http = require('node:http');
const WebSocket = require('ws');
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, path: '/ws' });

function broadcast(msg) {
  try {
    const s = JSON.stringify(msg);
    wss.clients.forEach(c => {
      if (c.readyState === WebSocket.OPEN) c.send(s);
    });
  } catch (e) { console.warn('broadcast failed', e); }
}

wss.on('connection', (socket) => {
  try { socket.send(JSON.stringify({ type: 'connected' })); } catch (e) { console.warn('ws: failed to send connected message to socket', e); }
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log(`Serving static files from ${path.join(__dirname, '..', 'public')}`);
});

// SPA fallback: return index.html for unknown non-API routes so client-side routing works
app.get('*', (req, res) => {
  // If request looks like an API or websocket health check, let it 404 here
  if (req.path.startsWith('/api') || req.path.startsWith('/ws') || req.path === '/health') {
    return res.status(404).end();
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});
