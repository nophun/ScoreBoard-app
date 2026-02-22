// Rewritten integration tests for core flows: confirmRound, deleteLastRound, createNewGameWithPlayers
// Designed to run from the loaded app. Exposes `runIntegrationTestsExternal` on globalThis.

(function(){
  function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(msg + ` (got ${a}, expected ${b})`);
  }

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function ensureAppReady(timeout = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (typeof confirmRound === 'function' && typeof deleteLastRound === 'function' && typeof createNewGameWithPlayers === 'function') return true;
      await sleep(50);
    }
    return false;
  }

  async function runIntegrationTestsExternal() {
    const ok = await ensureAppReady();
    if (!ok) {
      console.warn('Integration tests: app functions not present; load the app before running tests.');
      alert('Integration tests require the app to be loaded. Open the app and run the tests there.');
      return;
    }

    // Force local-only mode for tests
    try { if (typeof stopRealtimeWebSocket === 'function') stopRealtimeWebSocket(); } catch(e) { console.warn('stopRealtimeWebSocket failed', e); }
    try { if (typeof setServerAvailable === 'function') setServerAvailable(false); else { globalThis.serverAvailable = false; if (typeof updateConnectionIndicator === 'function') updateConnectionIndicator(); } } catch(e) { console.warn('setServerAvailable failed', e); }
    globalThis.games = globalThis.games || {};
    // Ensure shared runtime refs are exposed and will be mutated in-place by tests
    if (!globalThis.players || !globalThis.rounds || !globalThis.eliminationLevels) {
      console.warn('Integration tests: required runtime refs missing (players, rounds, eliminationLevels)');
      alert('Integration tests require the app to be loaded and expose runtime refs.');
      return;
    }
    // If no current game exists, create a temporary placeholder (mark so we can avoid mutating user's game)
    let _createdPlaceholderGame = false;
    if (!globalThis.currentGameId) {
      globalThis.currentGameId = 'test-game-' + Date.now();
      globalThis.games[globalThis.currentGameId] = { name: 'TEST', rounds: [], playerCreationOrder: [] };
      _createdPlaceholderGame = true;
    }
    globalThis.games[globalThis.currentGameId] = globalThis.games[globalThis.currentGameId] || { name: 'TEST', rounds: [], playerCreationOrder: [] };
    // Only mark the placeholder as local-only; do not alter an existing active game
    if (_createdPlaceholderGame) {
      globalThis.games[globalThis.currentGameId].localOnly = true;
      try { if (typeof persistLocalGames === 'function') persistLocalGames(); } catch(e) { console.warn('persistLocalGames failed', e); }
    }

    const results = [];
    // Track any games created by tests so we can remove them on cleanup
    const _createdGames = [];

    // Create a dedicated temporary local-only game for these tests so we don't
    // mutate or persist the user's real games. Restore currentGameId afterwards.
    const prevCurrentGameId = globalThis.currentGameId;
    // Snapshot the previous game object so we can fully restore it after tests
    let _prevGameSnapshot;
    try {
      if (prevCurrentGameId && globalThis.games?.[prevCurrentGameId]) {
        _prevGameSnapshot = structuredClone(globalThis.games[prevCurrentGameId]);
      }
    } catch (e) { console.warn('Failed to snapshot previous game', e); }
    const tempGameId = 'test-temp-' + Date.now();
    globalThis.games[tempGameId] = { name: 'INTEGRATION-TEST-' + Date.now(), rounds: [], playerCreationOrder: [], createdAt: Date.now(), localOnly: true };
    try { globalThis.games_metadata = globalThis.games_metadata || {}; globalThis.games_metadata[tempGameId] = { roundsLoaded: true, roundCount: 0 }; } catch (e) { console.warn('Failed to set games_metadata in test', e); }
    globalThis.currentGameId = tempGameId;
    // If the app exposes a setter to update the module-scoped currentGameId, call it
    try { if (typeof setCurrentGameId === 'function') setCurrentGameId(tempGameId); } catch (e) { console.warn('setCurrentGameId failed', e); }
    // Track the temp game so cleanup routine removes it along with other created games
    try { _createdGames.push(tempGameId); } catch (e) { console.warn('Failed to record tempGameId for cleanup', e); }
    // Ensure the temp game has its own players snapshot so tests don't mutate the user's active game
    try {
      globalThis.games[tempGameId].players = { active: [null, null, null, null], queue: [] };
    } catch (e) { console.warn('Failed to initialize temp game players', e); }
    try { if (typeof loadCurrentGame === 'function') loadCurrentGame(); } catch(e) { console.warn('loadCurrentGame failed', e); }
    try { if (typeof persistLocalGames === 'function') persistLocalGames(); } catch(e) { console.warn('persistLocalGames failed', e); }
    
    const t = globalThis.games[tempGameId];
    // Test A: confirmRound replacement
    async function runTestA() {
      try {
        // Set players on the temporary test game and reload it so module-scoped code updates
        t.players = { active: ['A','B','C','D'], queue: ['Q1','Q2'] };
        try { if (typeof loadCurrentGame === 'function') loadCurrentGame(); } catch(e) { console.warn('loadCurrentGame failed', e); }

        t.eliminationLevels = t.eliminationLevels || {};
        Object.keys(t.eliminationLevels).forEach(k => delete t.eliminationLevels[k]);
        Object.assign(t.eliminationLevels, { A:0, B:0, C:0, D:0 });

        // Use confirmRound to create an initial seeded round (valid input requires exactly one winner)
        try {
          globalThis.rounds.length = 0;
          // First round: give A substantial points (12 cards -> 36 points), others small, one winner (player 4)
          const p1 = document.getElementById('p1Score');
          const p2 = document.getElementById('p2Score');
          const p3 = document.getElementById('p3Score');
          const p4 = document.getElementById('p4Score');
          if (!p1 || !p2 || !p3 || !p4) throw new Error('modal inputs missing');
          p1.value = '12'; p2.value = '1'; p3.value = '1'; p4.value = '0';
          try { updatePointsDisplay(); } catch(e) { console.warn('updatePointsDisplay failed', e); }
          try { const r1 = confirmRound(); if (r1 && typeof r1.then === 'function') await r1; } catch(e) { console.warn('confirmRound failed', e); }

          // Now perform the round that should trigger replacement: give A 8 cards -> 16 points added
          p1.value = '8'; p2.value = '13'; p3.value = '1'; p4.value = '0';
          try { updatePointsDisplay(); } catch(e) { console.warn('updatePointsDisplay failed', e); }
          try { const r2 = confirmRound(); if (r2 && typeof r2.then === 'function') await r2; } catch(e) { console.warn('confirmRound failed', e); }
        } catch (e) {
          console.warn('Failed to run confirmRound seeding flow', e);
        }
        await sleep(20);
        try {
          assertEqual(t.players.active[0], 'Q1', 'A should be replaced by Q1');
          assertEqual(t.players.active[1], 'Q2', 'B should be replaced by Q2');
          assertEqual(t.players.queue[t.players.queue.length-2], 'A', 'A should be pushed to queue end');
          assertEqual(t.players.queue[t.players.queue.length-1], 'B', 'B should be pushed to queue end');
          assertEqual(t.eliminationLevels['A'], 1, 'A should have reached 1 elimination level');
          assertEqual(t.eliminationLevels['B'], 1, 'B should have reached 1 elimination level');
          assertEqual(t.elimination25UsedBy, 'A', '25-rule should be used by A');
          results.push('confirmRound replacement passed');
        } catch (e) { results.push('confirmRound replacement failed: '+e.message); }
      } catch (err) { results.push('confirmRound flow error: '+err.message); }
    }

    // Test B: deleteLastRound recompute
    async function runTestB() {
      try {
        // Use the temp game's players and rounds so we don't affect the user's active game
        try {
          const t = globalThis.games[tempGameId];
          t.players = { active: ['A','B','C','D'], queue: [] };
          try { if (typeof loadCurrentGame === 'function') loadCurrentGame(); } catch(e) { console.warn('loadCurrentGame failed', e); }
          const cards1 = [9,0,0,0]; // 9 cards -> 18 points
          const cards2 = [7,0,0,0]; // 7 cards -> 7 points (cumulative 25)
          const pts1 = (typeof calculatePoints === 'function') ? cards1.map(c => calculatePoints(Number(c) || 0)) : [18,0,0,0];
          const pts2 = (typeof calculatePoints === 'function') ? cards2.map(c => calculatePoints(Number(c) || 0)) : [7,0,0,0];
          const roundsArr = [
            { players:['A','B','C','D'], points: pts1, cards: cards1 },
            { players:['A','B','C','D'], points: pts2, cards: cards2 }
          ];
          try { syncRoundsToModule(roundsArr); } catch (e) { console.warn('syncRoundsToModule failed', e); }
          if (typeof setElimination25UsedBy === 'function') setElimination25UsedBy('A'); else { globalThis.elimination25UsedBy = 'A'; t.elimination25UsedBy = 'A'; }
        } catch(e) {
          console.warn('Failed to prepare rounds for deleteLastRound test', e);
        }

        // stub confirm to bypass prompt
        const origConfirm = globalThis.confirm; globalThis.confirm = () => true;

        try {
          const res = deleteLastRound();
          if (res && typeof res.then === 'function') await res;
        } catch(e) { console.warn('Failed to prepare rounds for deleteLastRound test', e); }
        await sleep(20);

        try {
          assertEqual(!!(t.elimination25UsedBy || globalThis.elimination25UsedBy), false, '25-rule should be unset after deleting causing round');
          results.push('deleteLastRound recompute passed');
        } catch (e) { results.push('deleteLastRound recompute failed: '+e.message); }

        globalThis.confirm = origConfirm;
      } catch (err) { results.push('deleteLastRound flow error: '+err.message); }
    }

    // Test C: createNewGameWithPlayers
    async function runTestC() {
      try {
        // Prepare DOM inputs
        const nameEl = document.getElementById('newGameNameInput');
        if (!nameEl) throw new Error('newGameNameInput missing');
        nameEl.value = 'TEST-GAME-' + Date.now();

        const container = document.getElementById('playersContainer');
        if (!container) throw new Error('playersContainer missing');
        container.innerHTML = '';
        ['P1','P2','P3','P4'].forEach(n => {
          const row = document.createElement('div'); row.className = 'player-input-row';
          const input = document.createElement('input'); input.className = 'form-input player-name-input'; input.value = n;
          row.appendChild(input); container.appendChild(row);
        });

        // Ensure tests run in local-only mode and create the game locally
        try { globalThis.serverAvailable = false; } catch(e) { console.warn('Failed to set serverAvailable false', e); }
        try { if (!globalThis.games) globalThis.games = {}; } catch(e) { console.warn('Failed to ensure globalThis.games exists', e); }

        // Call creator and allow it to settle
        try {
          const res = createNewGameWithPlayers();
          if (res && typeof res.then === 'function') await res;
        } catch(e) { console.warn('createNewGameWithPlayers: creation call failed', e); }
        await sleep(20);

        // Force the newly created/current game to be local and persist if possible
        try {
          // Locate the newly created game by name (avoid relying on currentGameId binding)
          const createdName = nameEl.value;
          let gId = Object.keys(globalThis.games).find(id => globalThis.games[id] && globalThis.games[id].name === createdName);
          // Fallback: if not found, choose the most recently created game
          if (!gId) {
            const ids = Object.keys(globalThis.games || {});
            gId = ids.at(-1);
          }
          const g = globalThis.games[gId];
          if (!g) throw new Error('new game not created');
          g.localOnly = true;
          // record for cleanup
          _createdGames.push(gId);
          if (typeof persistLocalGames === 'function') persistLocalGames();
          if (!Array.isArray(g.playerCreationOrder) || g.playerCreationOrder.length < 4) throw new Error('playerCreationOrder missing');
          results.push('createNewGameWithPlayers passed (created locally)');
        } catch (err) {
          results.push('createNewGameWithPlayers failed: '+err.message);
        }
      } catch (err) { results.push('createNewGameWithPlayers failed: '+err.message); }
    }

    // Run tests sequentially:
    try { await runTestA(); } catch (e) { console.warn('runTestA failed', e); }
    try { await runTestB(); } catch (e) { console.warn('runTestB failed', e); }
    try { await runTestC(); } catch (e) { console.warn('runTestC failed', e); }

    // Wait briefly for all tests to finish
    await sleep(150);

    // Cleanup: remove temporary test game and restore previous currentGameId and game object
    // Remove any games created by the tests (e.g., TEST-GAME)
    try {
      _createdGames.forEach(id => {
        try { if (globalThis.games?.[id]) delete globalThis.games[id]; } catch (e) { console.warn('Failed to remove created game', id, e); }
      });
    } catch (e) { console.warn('Failed to remove created games', e); }
    try {
      // If we created a placeholder game at startup, remove it now so no TEST-GAME remains
      if (_createdPlaceholderGame) {
        try {
          if (prevCurrentGameId && globalThis.games?.[prevCurrentGameId]) {
            delete globalThis.games[prevCurrentGameId];
          }
        } catch (e) { console.warn('Failed to remove placeholder test game', e); }
        globalThis.currentGameId = null;
      } else if (prevCurrentGameId) {
        // Restore the previous game object (including localOnly flag) if we snapshot it
        if (_prevGameSnapshot) {
          try { globalThis.games[prevCurrentGameId] = _prevGameSnapshot; } catch (e) { console.warn('Failed to restore previous game snapshot', e); }
        }
        globalThis.currentGameId = prevCurrentGameId;
      } else {
        globalThis.currentGameId = null;
      }
      if (typeof loadCurrentGame === 'function') loadCurrentGame();
      if (typeof persistLocalGames === 'function') persistLocalGames();
    } catch (e) { console.warn('Failed to restore previous game', e); }
    console.log('Integration tests results:', results);
    alert('Integration tests finished. See console for details.');
    return results;
  }

  globalThis.runIntegrationTestsExternal = runIntegrationTestsExternal;
})();
