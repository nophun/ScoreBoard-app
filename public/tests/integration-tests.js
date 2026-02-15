// Integration tests for core flows: confirmRound, deleteLastRound, createNewGameWithPlayers
// Exposes runIntegrationTestsExternal on globalThis

/* global players, rounds, eliminationLevels, elimination25Used, games, currentGameId */

(function(){
  function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(msg + ` (got ${a}, expected ${b})`);
  }

  function snapshotAppState() {
    const snap = {};
    const _clone = (obj) => (typeof structuredClone === 'function') ? structuredClone(obj) : JSON.parse(JSON.stringify(obj));
    snap.players = (typeof players === 'undefined') ? undefined : _clone(players);
    snap.rounds = (typeof rounds === 'undefined') ? undefined : _clone(rounds);
    snap.eliminationLevels = (typeof eliminationLevels === 'undefined') ? undefined : _clone(eliminationLevels);
    snap.elimination25Used = (typeof elimination25Used === 'undefined') ? undefined : elimination25Used;
    snap.games = (typeof games === 'undefined') ? undefined : _clone(games);
    snap.currentGameId = (typeof currentGameId === 'undefined') ? undefined : currentGameId;

    return () => {
      try { if (typeof players === 'undefined') globalThis.players = snap.players; else players = snap.players; } catch(e) { globalThis.players = snap.players; }
      try { if (typeof rounds === 'undefined') globalThis.rounds = snap.rounds; else rounds = snap.rounds; } catch(e) { globalThis.rounds = snap.rounds; }
      try { if (typeof eliminationLevels === 'undefined') globalThis.eliminationLevels = snap.eliminationLevels; else eliminationLevels = snap.eliminationLevels; } catch(e) { globalThis.eliminationLevels = snap.eliminationLevels; }
      try { if (typeof elimination25Used === 'undefined') globalThis.elimination25Used = snap.elimination25Used; else elimination25Used = snap.elimination25Used; } catch(e) { globalThis.elimination25Used = snap.elimination25Used; }
      try { if (typeof games === 'undefined') globalThis.games = snap.games; else games = snap.games; } catch(e) { globalThis.games = snap.games; }
      try { if (typeof currentGameId === 'undefined') globalThis.currentGameId = snap.currentGameId; else currentGameId = snap.currentGameId; } catch(e) { globalThis.currentGameId = snap.currentGameId; }

      // Also restore persistent storage and refresh UI so Games Management reflects the restored state
      try {
        if (typeof localStorage !== 'undefined') {
          try { localStorage.setItem('cardgame-games', JSON.stringify(snap.games || {})); } catch(e) {}
          if (typeof snap.currentGameId !== 'undefined' && snap.currentGameId !== null) {
            try { localStorage.setItem('cardgame-current-game', snap.currentGameId); } catch(e) {}
          } else {
            try { localStorage.removeItem('cardgame-current-game'); } catch(e) {}
          }
        }
      } catch(e) {}

      try { if (typeof loadCurrentGame === 'function') loadCurrentGame(); } catch(e) {}
      try { if (typeof renderGameList === 'function') renderGameList(); } catch(e) {}
    };
  }

  function runIntegrationTestsExternal() {
    // Ensure integration targets are present in the app
    if (typeof confirmRound !== 'function' || typeof deleteLastRound !== 'function' || typeof createNewGameWithPlayers !== 'function') {
      console.warn('Integration tests require interactive app functions (confirmRound, deleteLastRound, createNewGameWithPlayers). Run from the running app.');
      alert('Integration tests require the app to be loaded. Open the app and run the tests there.');
      return;
    }
    const results = [];

    // Test 1: confirmRound replacement flow
    (function(){
      const restore = snapshotAppState();
      try {
        // Setup players + queue so replacement will occur
        players = { active: ['A','B','C','D'], queue: ['Q1','Q2'] };
        eliminationLevels = { A:0, B:0, C:0, D:0 };
        // Ensure previous totals cause A to cross threshold when adding this round (e.g., prev 49 + 3 -> 52)
        rounds = [ { players: ['A','B','C','D'], points: [49,0,0,0], cards: [0,0,0,0] } ];

        // Prepare modal inputs used by confirmRound
        const p1 = document.getElementById('p1Score');
        const p2 = document.getElementById('p2Score');
        const p3 = document.getElementById('p3Score');
        const p4 = document.getElementById('p4Score');
        if (!p1 || !p2 || !p3 || !p4) throw new Error('modal inputs missing');
        // Ensure exactly one winner (one zero). Put winner at seat 4.
        p1.value = '3'; p2.value = '1'; p3.value = '1'; p4.value = '0';
        updatePointsDisplay();

        // Call confirmRound (it will push round and perform replacements)
        confirmRound();

        // Assertions
        try {
          assertEqual(players.active[0], 'Q1', 'A should be replaced by Q1');
          assertEqual(players.queue[players.queue.length-1], 'A', 'A should be pushed to queue end');
          results.push('confirmRound replacement passed');
        } catch (e) { results.push('confirmRound replacement failed: '+e.message); }
      } catch (err) {
        results.push('confirmRound flow error: '+err.message);
      } finally { restore(); }
    })();

    // Test 2: deleteLastRound recomputes 25-flag and elimination levels
    (function(){
      const restore = snapshotAppState();
      try {
        // Setup rounds such that the second round causes 25-rule
        rounds = [
          { players:['A','B','C','D'], points:[24,0,0,0], cards:[0,0,0,0] },
          { players:['A','B','C','D'], points:[1,0,0,0], cards:[0,0,0,0] }
        ];
        elimination25Used = true;

        // Stub confirm to bypass prompt
        const origConfirm = globalThis.confirm; globalThis.confirm = () => true;

        deleteLastRound();

        try {
          assertEqual(elimination25Used, false, '25-rule should be unset after deleting causing round');
          results.push('deleteLastRound recompute passed');
        } catch (e) { results.push('deleteLastRound recompute failed: '+e.message); }

        globalThis.confirm = origConfirm;
      } catch (err) {
        results.push('deleteLastRound flow error: '+err.message);
      } finally { restore(); }
    })();

    // Test 3: createNewGameWithPlayers creates a game and persists playerCreationOrder
    (function(){
        const restore = snapshotAppState();
      try {
        // Ensure DOM inputs exist
        const nameEl = document.getElementById('newGameNameInput');
        if (!nameEl) throw new Error('newGameNameInput missing');
        nameEl.value = 'TEST-GAME-' + Date.now();

        // Prepare playersContainer with 4 inputs
        const container = document.getElementById('playersContainer');
        if (!container) throw new Error('playersContainer missing');
        container.innerHTML = '';
        ['P1','P2','P3','P4'].forEach(n => {
          const row = document.createElement('div'); row.className = 'player-input-row';
          const input = document.createElement('input'); input.className = 'form-input player-name-input'; input.value = n;
          row.appendChild(input); container.appendChild(row);
        });

        // Ensure games object exists
        if (typeof games === 'undefined' || games === null) games = {};
        // Call creator
        createNewGameWithPlayers();

        // Check new game exists and has playerCreationOrder
        const g = games[currentGameId];
        if (!g) throw new Error('new game not created');
        if (!Array.isArray(g.playerCreationOrder) || g.playerCreationOrder.length < 4) throw new Error('playerCreationOrder missing');
        results.push('createNewGameWithPlayers passed');
      } catch (err) {
        results.push('createNewGameWithPlayers failed: '+err.message);
      } finally { restore(); }
    })();

    console.log('Integration tests results:', results);
    alert('Integration tests finished. See console for details.');
  }

  globalThis.runIntegrationTestsExternal = runIntegrationTestsExternal;
})();