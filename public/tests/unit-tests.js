// Unit test harness for pure functions in ScoreBoard
// Exposes runUnitTestsExternal on globalThis

(function(){
  function assertEqual(a, b, msg) {
    if (a !== b) throw new Error(msg + ` (got ${a}, expected ${b})`);
  }

  function assertDeepEqual(a, b, msg) {
    const sa = JSON.stringify(a);
    const sb = JSON.stringify(b);
    if (sa !== sb) throw new Error(msg + ` (got ${sa}, expected ${sb})`);
  }

  function runUnitTestsExternal() {
    // Ensure app functions are available
    if (typeof calculatePoints !== 'function' || typeof reverseCalculateCards !== 'function' || typeof parseRoundData !== 'function' || typeof computeTotals !== 'function' || typeof computeCumulativeSnapshots !== 'function') {
      console.warn('Unit tests require app utility functions to be present (calculatePoints, parseRoundData, etc.). Run from the app.');
      alert('Unit tests require the app to be loaded. Open the app and run the tests there.');
      return;
    }
    // Force local-only behavior so unit tests don't trigger network calls
    try { if (typeof stopRealtimeWebSocket === 'function') stopRealtimeWebSocket(); } catch(e) { console.warn('Unit tests: stopRealtimeWebSocket failed', e); }
    try { if (typeof games === 'undefined' || games === null) globalThis.games = {}; } catch(e) { console.warn('Unit tests: setting up global games failed', e); }
    try {
      if (!globalThis.currentGameId) {
        globalThis.currentGameId = 'test-game-' + Date.now();
        globalThis.games[globalThis.currentGameId] = { name: 'TEST', rounds: [], playerCreationOrder: [] };
      }
      globalThis.games[globalThis.currentGameId] = globalThis.games[globalThis.currentGameId] || { name: 'TEST', rounds: [], playerCreationOrder: [] };
      globalThis.games[globalThis.currentGameId].localOnly = true;
      try { if (typeof persistLocalGames === 'function') persistLocalGames(); } catch(e) { console.warn('Unit tests: persistLocalGames failed', e); }
    } catch(e) { console.debug('Unit tests: failed to force local mode', e); }
    const results = [];

    // Test calculatePoints
    (function(){
      try {
        assertEqual(calculatePoints(0), 0, 'calculatePoints 0');
        assertEqual(calculatePoints(5), 5, 'calculatePoints 5');
        assertEqual(calculatePoints(8), 16, 'calculatePoints 8');
        assertEqual(calculatePoints(11), 33, 'calculatePoints 11');
        assertEqual(calculatePoints(13), 52, 'calculatePoints 13');
        results.push('calculatePoints tests passed');
      } catch (e) { results.push('calculatePoints failed: '+e.message); }
    })();

    // Test reverseCalculateCards
    (function(){
      try {
        assertEqual(reverseCalculateCards(0), 0, 'reverse 0');
        assertEqual(reverseCalculateCards(16), 8, 'reverse 16->8');
        assertEqual(reverseCalculateCards(33), 11, 'reverse 33->11');
        assertEqual(reverseCalculateCards(52), 13, 'reverse 52->13');
        results.push('reverseCalculateCards tests passed');
      } catch (e) { results.push('reverseCalculateCards failed: '+e.message); }
    })();

    // Test parseRoundData (object with players/points/cards)
    (function(){
      try {
        const rd = { players: ['A','B','C','D'], points: [1,2,3,4], cards: [5,6,7,8] };
        const parsed = parseRoundData(rd);
        assertDeepEqual(parsed.playerNames, ['A','B','C','D'], 'parse playerNames');
        assertDeepEqual(parsed.points, [1,2,3,4], 'parse points');
        assertDeepEqual(parsed.cards, [5,6,7,8], 'parse cards');
        results.push('parseRoundData tests passed');
      } catch (e) { results.push('parseRoundData failed: '+e.message); }
    })();

    // Test computeTotals
    (function(){
      try {
        const roundsList = [
          { players: ['A','B',null,null], points: [5,10,null,null] },
          { players: ['A','B',null,null], points: [3,2,null,null] }
        ];
        const playersObj = { active: ['A','B',null,null], queue: [] };
        const { playerTotals, playerRounds, playerAverages } = computeTotals(roundsList, playersObj);
        assertEqual(playerTotals['A'], 8, 'total A');
        assertEqual(playerTotals['B'], 12, 'total B');
        assertEqual(playerRounds['A'], 2, 'rounds A');
        assertEqual(playerAverages['B'], 6, 'avg B');
        results.push('computeTotals tests passed');
      } catch (e) { results.push('computeTotals tests failed: '+e.message); }
    })();

    // Test computeCumulativeSnapshots
    (function(){
      try {
        const allPlayers = [{ name: 'A', isEmpty: false }, { name: 'B', isEmpty: false }];
        const roundsList = [
          { players: ['A','B'], points: [2,3] },
          { players: ['A','B'], points: [1,4] }
        ];
        const snaps = computeCumulativeSnapshots(allPlayers, roundsList);
        // after round1: A=2,B=3 ; after round2: A=3,B=7
        assertDeepEqual(snaps[0], { A:2, B:3 }, 'snapshot 1');
        assertDeepEqual(snaps[1], { A:3, B:7 }, 'snapshot 2');
        results.push('computeCumulativeSnapshots tests passed');
      } catch (e) { results.push('computeCumulativeSnapshots tests failed: '+e.message); }
    })();

    console.log('Unit tests results:', results);
    alert('Unit tests finished. See console for details.');
  }

  globalThis.runUnitTestsExternal = runUnitTestsExternal;
})();