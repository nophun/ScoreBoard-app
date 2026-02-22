const API_BASE = 'https://big2.duckdns.org:58162/api/games';

let games = [];
let selectedId = null;

async function fetchGames() {
  const el = document.getElementById('gamesList');
  el.textContent = 'Loading...';
  try {
    const res = await fetch(API_BASE);
    if (!res.ok) {
      throw new Error(res.statusText);
    }
    games = await res.json();
    renderGames();
  } catch(err) {
    el.textContent = 'Error fetching games: ' + err.message;
  }
}

function renderGames() {
  const el = document.getElementById('gamesList');
  const filter = document.getElementById('filter')?.value || '';
  if (!Array.isArray(games)) {
    el.textContent = 'Received unexpected data format (expected array)';
    return;
  }
  el.innerHTML = '';
  const list = games.filter(g=>JSON.stringify(g).toLowerCase().includes(filter.toLowerCase()));
  if (list.length === 0) {
    el.textContent = 'No games found'; return;
  }
  for (const g of list) {
    const id = (typeof g === 'string') ? g : (g.id ?? g._id ?? g.gameId ?? '');
    const displayName = (typeof g === 'string') ? g : (g.name ?? g.data?.name ?? id ?? JSON.stringify(g).slice(0,40));
    const div = document.createElement('div');
    div.className = 'game-item'+(String(id) === String(selectedId) ? ' selected' : '');
    div.innerHTML = `<div style="font-size:13px;word-break:break-all">${escapeHtml(String(displayName))}</div>`;
    div.onclick = ()=>{ selectGame(id); };
    el.appendChild(div);
  }
}

async function selectGame(id) {
  selectedId = id;
  const nodes = document.querySelectorAll('.game-item');
  nodes.forEach(n=>n.classList.remove('selected'));
  // mark selected visually by matching text
  for (const n of nodes) {
    if (n.textContent.trim() === String(id)) {
      n.classList.add('selected');
    }
  }

  document.getElementById('gameMeta').textContent = 'Loading game ' + id + ' ...';
  document.getElementById('tableWrap').innerHTML = '';
  document.getElementById('rawContent').textContent = '';
  document.getElementById('rawJson').style.display = 'none';

  try {
    const res = await fetch(`${API_BASE}/${encodeURIComponent(id)}`);
    if (!res.ok) {
      throw new Error(res.statusText);
    }
    const payload = await res.json();
    const gameName = payload?.name ?? payload?.data?.name ?? id;
    document.getElementById('gameMeta').textContent = `${escapeHtml(String(gameName))} — loaded.`;
    const data = payload?.data ?? payload;
    renderRoundData(data);
    document.getElementById('rawContent').textContent = JSON.stringify(payload, null, 2);
    document.getElementById('rawJson').style.display = 'block';
  } catch(err) {
    document.getElementById('gameMeta').textContent = 'Error: ' + err.message;
  }
}

// Format timestamp as DD.MM.YYYY HH:mm:ss — module scope helper
function fmtTime(val) {
  if (!val && val !== 0) {
    return '';
  }
  let d = null;
  if (typeof val === 'number') {
    if (val > 1e12) {
      d = new Date(val);
    } else if (val > 1e9) {
      d = new Date(val*1000);
    } else {
      d = new Date(val);
    }
  } else if (typeof val === 'string') {
    const n = Number(val);
    if (Number.isNaN(n)) {
      d = new Date(val);
    } else {
      d = new Date(n);
    }
  } else if (val instanceof Date) {
    d = val;
  }
  if (!d || Number.isNaN(d.getTime())) {
    return String(val);
  }
  const pad = n => String(n).padStart(2,'0');
  const day = pad(d.getDate());
  const month = pad(d.getMonth()+1);
  const year = d.getFullYear();
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());
  return `${day}.${month}.${year} ${hours}:${minutes}:${seconds}`;
}

// Extract player name/score for a given round and seat index.
function getPlayerInfo(round, idx) {
  if (!round) {
    return {name: `Player ${idx}`, score: ''};
  }
  const nameKeys = [`player${idx}Name`,`player${idx}name`,`p${idx}Name`,`p${idx}name`, `player${idx}`];
  const scoreKeys = [`player${idx}Score`,`player${idx}score`,`p${idx}Score`,`p${idx}score`,`score${idx}`];

  for (const k of nameKeys) {
    if (Object.hasOwn(round,k)) {
      const n = round[k];
      const s = round[scoreKeys[0]];
      return {name: n || `Player ${idx}`, score: s ?? ''};
    }
  }
  for (const k of nameKeys) {
    const lk = k.toLowerCase();
    if (Object.hasOwn(round, lk)) {
      const n = round[lk];
      const s = round[scoreKeys[0]];
      return {name: n || `Player ${idx}`, score: s ?? ''};
    }
  }

  if (Array.isArray(round.players) && round.players.length>=idx) {
    const p = round.players[idx-1];
    if (typeof p === 'string') {
      return {name: p, score: ''};
    }
    if (p && typeof p === 'object') {
      return {name: p.name || p.displayName || p.username || `Player ${idx}`, score: (p.score === undefined ? '' : p.score)};
    }
  }

  if (Array.isArray(round.playerNames) && round.playerNames.length>=idx) {
    return {name: round.playerNames[idx-1] || `Player ${idx}`, score: (Array.isArray(round.playerScores) ? round.playerScores[idx-1] || '' : '')};
  }

  if (Array.isArray(round.names) && round.names.length>=idx) {
    return {name: round.names[idx-1] || `Player ${idx}`, score: (Array.isArray(round.scores) ? round.scores[idx-1] || '' : '')};
  }

  if (Object.hasOwn(round, String(idx-1))) {
    const v = round[String(idx-1)];
    if (typeof v === 'string') {
      return {name: v, score: ''};
    }
    if (v && typeof v === 'object') {
      return {name: v.name || `Player ${idx}`, score: (v.score === undefined ? '' : v.score)};
    }
  }

  return {name: `Player ${idx}`, score: ''};
}

function renderRoundData(data) {
  const wrap = document.getElementById('tableWrap');
  wrap.innerHTML = '';
  // Try common property names for rounds
  let rounds = null;
  if (Array.isArray(data)) {
    rounds = data;
  } else if (data.rounds && Array.isArray(data.rounds)) {
    rounds = data.rounds;
  } else if (data.round && Array.isArray(data.round)) {
    rounds = data.round;
  } else if (data.history && Array.isArray(data.history)) {
    rounds = data.history;
  } else if (data.roundData && Array.isArray(data.roundData)) {
    rounds = data.roundData;
  } else {
    // search nested arrays
    for (const k of Object.keys(data || {})) {
      if (Array.isArray(data[k])) {
        rounds = data[k];
        break;
      }
    }
  }

  if (!rounds) {
    wrap.innerHTML = '<div>No rounds array detected — showing top-level keys and raw JSON below.</div>';
    return;
  }

  if (rounds.length === 0) {
    wrap.innerHTML = '<div>No rounds in this game</div>';
    return;
  }
  // Build table with specific columns: time, player1..player4 (cards1..cards4)
  const t = document.createElement('table');
  const thead = document.createElement('thead');
  const tbody = document.createElement('tbody');

  // Header: fixed seat columns; cells will show per-round "Name = Score"
  const trh = document.createElement('tr');
  const cols = ['Round nr.','time','Seat 1','Seat 2','Seat 3','Seat 4'];
  for (const c of cols) {
    const th = document.createElement('th');
    th.textContent = c;
    trh.appendChild(th);
  }
  thead.appendChild(trh);

  function getPlayerValue(r, idx) {
    // try many common patterns: cards1, player1, p1, cards[0], players[0]
    if (!r) {
      return '';
    }
    const keys = [
      `cards${idx}`,
      `player${idx}`,
      `p${idx}`
    ];
    for (const k of keys) {
      if (Object.hasOwn(r,k)) {
        return r[k]; }
      }
    if (Array.isArray(r.cards) && r.cards.length>=idx) {
      return r.cards[idx-1];
    }
    if (Array.isArray(r.players) && r.players.length>=idx) {
      return r.players[idx-1];
    }
    if (Array.isArray(r.playersInfo) && r.playersInfo.length>=idx) {
      return r.playersInfo[idx-1];
    }
    // fallback: try numeric indexed props '0','1' etc
    if (Object.hasOwn(r, String(idx-1))) {
      return r[String(idx-1)];
    }
    return '';
  }

  for (let ri = 0; ri < rounds.length; ri++) {
    const r = rounds[ri];
    const tr = document.createElement('tr');
    // round number
    const tdRound = document.createElement('td'); tdRound.textContent = String(ri+1);
    tr.appendChild(tdRound);
    // time: try common keys
    const ts = r && (r.timestamp || r.time || r.ts || r.t || r.date);
    const tdTime = document.createElement('td'); tdTime.textContent = fmtTime(ts);
    tr.appendChild(tdTime);

    for (let i = 1; i <= 4; i++) {
      const td = document.createElement('td');
      const info = getPlayerInfo(r, i);
      const name = info.name || `Player ${i}`;
      const score = (info.score === undefined || info.score === '') ? '' : String(info.score);

      // get cards for this player in this round
      const cardsVal = getPlayerValue(r, i);
      let cardsStr = '';
      if (Array.isArray(cardsVal)) {
        cardsStr = cardsVal.join(', ');
      } else if (typeof cardsVal === 'object' && cardsVal !== null) {
        cardsStr = JSON.stringify(cardsVal);
      } else {
        cardsStr = (cardsVal === undefined || cardsVal === null) ? '' : String(cardsVal);
      }

      td.textContent = score? `${name} = ${score}` : name;
      if (cardsStr) td.textContent += ` — ${cardsStr}`;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  t.appendChild(thead); t.appendChild(tbody);
  wrap.appendChild(t);
}

function escapeHtml(s) {
  return s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
}

// auto-fetch on load
window.addEventListener('load', ()=>{ fetchGames(); });
