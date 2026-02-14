const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');

const app = express();
// Enable CORS so remote frontends can call the API (adjust in production)
const cors = require('cors');
app.use(cors());
const PORT = process.env.PORT || 3000;

app.use(express.json());
// Serve static frontend files from project root
app.use(express.static(path.join(__dirname)));

// Ensure data directory exists
const dbPath = path.join(__dirname, 'data', 'games.db');
const fs = require('fs');
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

function getAllGames() {
  const rows = db.prepare('SELECT id, name, data, created_at FROM games ORDER BY created_at DESC').all();
  return rows.map(r => ({ id: r.id, name: r.name, data: JSON.parse(r.data || '{}'), createdAt: r.created_at }));
}

app.get('/api/games', (req, res) => {
  try {
    const includeRounds = String(req.query.includeRounds || '').toLowerCase() === 'true';
    const rows = db.prepare('SELECT id, name, data, created_at, rowid FROM games ORDER BY created_at DESC').all();
    const list = rows.map(r => {
      const parsed = JSON.parse(r.data || '{}');
      if (includeRounds) return { id: r.id, name: r.name, data: parsed || {}, createdAt: r.created_at };
      // Return metadata-only to save bandwidth
      return {
        id: r.id,
        name: r.name,
        createdAt: r.created_at,
        roundCount: Array.isArray(parsed.rounds) ? parsed.rounds.length : 0,
        playerCreationOrder: parsed.playerCreationOrder || (parsed.players ? [...(parsed.players.active||[]), ...(parsed.players.queue||[])] : []),
        localOnly: !!parsed.localOnly
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
    res.json({ id: row.id, name: row.name, data: JSON.parse(row.data || '{}'), createdAt: row.created_at });
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
    const data = JSON.stringify(payload.data || {});
    const createdAt = Date.now();

    db.prepare('INSERT OR REPLACE INTO games(id,name,data,created_at) VALUES(?,?,?,?)')
      .run(id, name, data, createdAt);

    res.status(201).json({ id, name, data: JSON.parse(data), createdAt });
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

    const data = JSON.stringify(merged);
    const createdAt = payload.createdAt || existingCreated || Date.now();

    db.prepare('INSERT OR REPLACE INTO games(id,name,data,created_at) VALUES(?,?,?,?)')
      .run(id, name, data, createdAt);

    res.json({ id, name, data: JSON.parse(data), createdAt });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update game' });
  }
});

app.delete('/api/games/:id', (req, res) => {
  try {
    db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
    res.status(204).end();
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to append round' });
  }
});

// Basic health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
