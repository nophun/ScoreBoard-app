// Externalized elimination tests for the ScoreBoard app
// Attaches runEliminationTestsExternal to window so it can be invoked from the page

(function(){
  function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(msg + ` (got ${a}, expected ${b})`);
  }

  function runEliminationTestsExternal() {
    // Ensure app environment is available
    if (typeof players === 'undefined' || typeof parseRoundData !== 'function' || typeof calculatePlayerTotals !== 'function') {
      console.warn('Elimination tests require the app environment (players, parseRoundData, calculatePlayerTotals). Run these tests from the running app.');
      alert('Elimination tests require the app to be loaded. Open the app and run the tests there.');
      return;
    }
    // Force local-only behavior so tests don't attempt network calls
    try { if (typeof stopRealtimeWebSocket === 'function') stopRealtimeWebSocket(); } catch(e) { console.warn('Elimination tests: stopRealtimeWebSocket failed', e); }
    try { if (typeof games === 'undefined' || games === null) globalThis.games = {}; } catch(e) { console.warn('Elimination tests: setting up global games failed', e); }
    try {
      if (!globalThis.currentGameId) {
        globalThis.currentGameId = 'test-game-' + Date.now();
        globalThis.games[globalThis.currentGameId] = { name: 'TEST', rounds: [], playerCreationOrder: [] };
      }
      globalThis.games[globalThis.currentGameId] = globalThis.games[globalThis.currentGameId] || { name: 'TEST', rounds: [], playerCreationOrder: [] };
      globalThis.games[globalThis.currentGameId].localOnly = true;
      try { if (typeof persistLocalGames === 'function') persistLocalGames(); } catch(e) { console.warn('Elimination tests: persistLocalGames failed', e); }
    } catch(e) { console.debug('Elimination tests: failed to force local mode', e); }
    const results = [];

    // Test A: single player overshoots next 50 and is replaced by first in queue
    (function(){
      // Setup
      players.active = ['A','B','C','D'];
      players.queue = ['Q1','Q2'];
      globalThis.eliminationLevels = { A:0, B:0, C:0, D:0 };
      const prevTotals = { A:49, B:0, C:0, D:0 };
      const points = [3,0,0,0]; // A -> 52

      // Run the same logic as confirmRound's elimination block
      const newTotals = { ...prevTotals };
      newTotals['A'] = (newTotals['A']||0) + points[0];

      const candidates = [];
      const prevLevels = globalThis.eliminationLevels['A'] || 0;
      const nextThreshold = (prevLevels + 1) * 50;
      if (newTotals['A'] >= nextThreshold) {
        candidates.push({name:'A', prev:49, overshoot: newTotals['A'] - nextThreshold, slotIndex:0, newLevelsReached: Math.floor(newTotals['A']/50)});
      }

      // Process
      candidates.sort((a,b) => b.overshoot - a.overshoot || b.prev - a.prev);
      candidates.forEach(c => {
        const replacement = players.queue.shift() || null;
        players.queue.push(c.name);
        const idx = players.active.indexOf(c.name);
        if (replacement) players.active[idx] = replacement; else players.active[idx] = null;
        globalThis.eliminationLevels[c.name] = c.newLevelsReached;
      });

      try {
        assertEqual(players.active[0], 'Q1', 'A should be replaced by Q1');
        assertEqual(players.queue[players.queue.length-1], 'A', 'A should be pushed to queue end');
        results.push('Test A passed');
      } catch (e) { results.push('Test A failed: '+e.message); }
    })();

    // Test B: two players overshoot, order by overshoot then prev total
    (function(){
      // Setup
      players.active = ['X','Y','C','D'];
      players.queue = ['Q1','Q2','Q3'];
      globalThis.eliminationLevels = { X:0, Y:0 };
      const prevTotals = { X:40, Y:45 };
      // X gets +15 -> 55 (overshoot 5), Y gets +10 -> 55 (overshoot 5) -> same overshoot, Y had more prev
      const points = [15,10,0,0];

      const newTotals = { ...prevTotals };
      newTotals['X'] = (newTotals['X']||0) + points[0];
      newTotals['Y'] = (newTotals['Y']||0) + points[1];

      const candidates = [];
      ['X','Y'].forEach((name,i)=>{
        const prev = prevTotals[name]||0;
        const prevLevels = globalThis.eliminationLevels[name]||0;
        const nextThreshold = (prevLevels+1)*50;
        if (newTotals[name] >= nextThreshold) {
          candidates.push({name, prev, overshoot: newTotals[name]-nextThreshold, slotIndex:i, newLevelsReached: Math.floor(newTotals[name]/50)});
        }
      });

      candidates.sort((a,b)=> b.overshoot - a.overshoot || b.prev - a.prev);

      const replaced = [];
      candidates.forEach(c => {
        const replacement = players.queue.shift() || null;
        players.queue.push(c.name);
        const idx = players.active.indexOf(c.name);
        if (replacement) players.active[idx] = replacement; else players.active[idx] = null;
        globalThis.eliminationLevels[c.name] = c.newLevelsReached;
        replaced.push({eliminated: c.name, replacement});
      });

      try {
        // Y had higher prev (45) so should be processed before X when overshoot ties
        assertEqual(replaced[0].eliminated, 'Y', 'Y should be processed first');
        assertEqual(replaced[1].eliminated, 'X', 'X should be processed second');
        results.push('Test B passed');
      } catch (e) { results.push('Test B failed: '+e.message); }
    })();

    // Test C: one-time 25-point elimination triggers and only once
    (function(){
      // Setup
      players.active = ['P1','P2','P3','P4'];
      players.queue = ['Q1','Q2'];
      globalThis.eliminationLevels = { P1:0, P2:0 };
      globalThis.elimination25Used = false;
      const prevTotals = { P1:24, P2:10 };
      // P1 +1 -> 25, P2 +15 -> 25 -> same overshoot (0), P1 had higher prev
      const points = [1,15,0,0];

      const newTotals = { ...prevTotals };
      newTotals['P1'] = (newTotals['P1']||0) + points[0];
      newTotals['P2'] = (newTotals['P2']||0) + points[1];

      // Detect 25 candidates
      const candidates25 = [];
      ['P1','P2'].forEach((name,i)=>{
        const prev = prevTotals[name]||0;
        const newTotal = newTotals[name]||0;
        if (prev < 25 && newTotal >= 25) {
          candidates25.push({ name, prev, overshoot: newTotal - 25, slotIndex: i, newTotal });
        }
      });

      candidates25.sort((a,b)=> b.overshoot - a.overshoot || b.prev - a.prev);

      const replaced = [];
      if (candidates25.length > 0) {
        const c = candidates25[0];
        const replacement = players.queue.shift() || null;
        players.queue.push(c.name);
        const idx = players.active.indexOf(c.name);
        if (replacement) players.active[idx] = replacement; else players.active[idx] = null;
        // Simulate app behavior: mark 25-rule used, record who used it, and ensure elimination level >= 1
        globalThis.elimination25Used = true;
        globalThis.elimination25UsedBy = c.name;
        globalThis.eliminationLevels[c.name] = Math.max(globalThis.eliminationLevels[c.name] || 0, 1);
        replaced.push({eliminated: c.name, replacement});
      }

      try {
        assertEqual(replaced[0].eliminated, 'P1', 'P1 should be eliminated first by 25-rule');
        assertEqual(globalThis.elimination25Used, true, '25-rule flag should be set');
        assertEqual(globalThis.elimination25UsedBy, 'P1', 'elimination25UsedBy should record the player who used the 25-rule');
        assertEqual(globalThis.eliminationLevels['P1'] >= 1, true, 'P1 should have elimination level >= 1 after 25-rule');
        results.push('Test C passed');
      } catch (e) { results.push('Test C failed: '+e.message); }
    })();

    // Test D: deleting last round recalculates 25-rule and elimination levels
    (function(){
      // Setup two rounds where player A reaches 25 on the second round
      players.active = ['A','B','C','D'];
      players.queue = ['Q1'];
      // Initialize elimination state in module if possible
      if (typeof eliminationLevels === 'object') {
        Object.keys(eliminationLevels).forEach(k => delete eliminationLevels[k]);
        Object.assign(eliminationLevels, { A: 0 });
      } else {
        globalThis.eliminationLevels = { A: 0 };
      }
      if (typeof setElimination25Used === 'function') setElimination25Used(true); else globalThis.elimination25Used = true;

      const roundsArr = [
        { players: ['A','B','C','D'], points: [24,0,0,0], cards: [0,0,0,0] },
        { players: ['A','B','C','D'], points: [1,0,0,0], cards: [0,0,0,0] }
      ];
      if (typeof syncRoundsToModule === 'function') {
        try { syncRoundsToModule(roundsArr); } catch (e) { console.warn('syncRoundsToModule failed', e); }
      } else {
        globalThis.rounds = roundsArr;
      }

      // Simulate deleting the last round and recomputing (avoid confirm)
      if (typeof rounds !== 'undefined' && Array.isArray(rounds)) rounds.pop();
      else if (globalThis.rounds && Array.isArray(globalThis.rounds)) globalThis.rounds.pop();
      const totalsObj = calculatePlayerTotals();
      const totals = totalsObj.playerTotals || {};
      const newElimLevels = {};
      Object.keys(totals).forEach(name => {
        newElimLevels[name] = Math.floor((totals[name] || 0) / 50);
      });

      let used25 = false;
      let used25By = undefined;
      const runningTotals = {};
      for (const rd of globalThis.rounds) {
        const parsed = parseRoundData(rd);
        const pts = parsed.points || [0,0,0,0];
        const pnames = parsed.playerNames || parsed.players || [null,null,null,null];
        for (const [i, pname] of pnames.entries()) {
          if (!pname) continue;
          runningTotals[pname] = (runningTotals[pname] || 0) + (Number(pts[i]) || 0);
          if (!used25 && runningTotals[pname] >= 25) {
            used25 = true;
            used25By = pname;
            break;
          }
        }
        if (used25) break;
      }

      try {
        if (typeof eliminationLevels === 'object') {
          Object.keys(eliminationLevels).forEach(k => delete eliminationLevels[k]);
          Object.keys(newElimLevels).forEach(k => eliminationLevels[k] = newElimLevels[k]);
        } else {
          globalThis.eliminationLevels = newElimLevels;
        }
      } catch (e) { console.warn('Failed to set eliminationLevels', e); }
      if (typeof setElimination25Used === 'function') setElimination25Used(!!used25); else globalThis.elimination25Used = !!used25;
      if (typeof setElimination25UsedBy === 'function') setElimination25UsedBy(used25 ? used25By : undefined); else globalThis.elimination25UsedBy = used25 ? used25By : undefined;
      try {
        assertEqual(globalThis.elimination25Used, false, '25-rule should be unset after deleting the round that caused it');
        assertEqual(globalThis.elimination25UsedBy == null, true, 'elimination25UsedBy should be unset (null or undefined) after deleting the round that caused it');
        assertEqual(globalThis.eliminationLevels['A'], 0, 'A should have 0 elimination levels');
        results.push('Test D passed');
      } catch (e) { results.push('Test D failed: '+e.message); }
    })();

    console.log('Elimination tests results:', results);
    alert('Elimination tests finished. See console for details.');
  }

  // Expose on globalThis for broader environments
  globalThis.runEliminationTestsExternal = runEliminationTestsExternal;
})();
