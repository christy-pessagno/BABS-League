// Round-robin scheduler, carried over unchanged from BABS-Robin.
// Teams are numbered 0..n-1; buildSchedule(n, courts) returns
// [{ round, court, a, b }] with every pair playing exactly once.

// ---- Round-robin scheduler (circle method) ----
function generateRounds(n) {
  var t = [];
  for (var k = 0; k < n; k++) t.push(k);
  if (n % 2 === 1) t.push(-1);  // phantom team => its opponent rests
  var m = t.length, half = m / 2, numRounds = m - 1;
  var arr = t.slice(), rounds = [];
  for (var r = 0; r < numRounds; r++) {
    var pairs = [];
    for (var j = 0; j < half; j++) {
      var x = arr[j], y = arr[m - 1 - j];
      if (x !== -1 && y !== -1) pairs.push([x, y]);
    }
    rounds.push(pairs);
    arr = [arr[0]].concat([arr[m - 1]]).concat(arr.slice(1, m - 1)); // rotate, keep arr[0] fixed
  }
  return rounds;
}

// Pack the round-robin games onto the available courts. Each round fills
// every court it can, pulling forward the earliest remaining game whose
// teams are both free, so no court sits empty while games are left.
// Returns a list of rounds, each a list of [teamA, teamB] games.
function packInOrder(n, c) {
  var queue = [].concat.apply([], generateRounds(n)), rounds = [];
  while (queue.length) {
    var busy = {}, games = [], later = [];
    queue.forEach(function (p) {
      if (games.length < c && !busy[p[0]] && !busy[p[1]]) {
        busy[p[0]] = busy[p[1]] = 1;
        games.push(p);
      } else {
        later.push(p);
      }
    });
    rounds.push(games);
    queue = later;
  }
  return rounds;
}

// Small seeded random generator, so a given team/court count always gets
// the same schedule on every device.
function seededRandom(seed) {
  return function () {
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One attempt at a schedule that spreads rest out: each round picks games
// for the teams that have waited longest (and have the most games left),
// avoiding teams that just played.
function packSpread(n, c, rand) {
  var perRound = Math.min(c, Math.floor(n / 2));
  var remaining = [].concat.apply([], generateRounds(n));
  var left = [], resting = [], playing = [];
  for (var t = 0; t < n; t++) { left.push(n - 1); resting.push(0); playing.push(0); }
  var wRest = 1 + rand() * 2, wPlay = 1 + rand() * 2, wLeft = rand() * 3, noise = rand() * 1.5;
  function urgency(t) {
    var avgLeft = (remaining.length * 2) / n || 1;
    return wRest * resting[t] - wPlay * playing[t] + wLeft * left[t] / avgLeft;
  }
  var rounds = [];
  while (remaining.length) {
    var busy = {}, games = [];
    while (games.length < perRound) {
      var bestI = -1, bestScore = -Infinity;
      remaining.forEach(function (p, i) {
        if (busy[p[0]] || busy[p[1]]) return;
        var score = urgency(p[0]) + urgency(p[1]) + rand() * noise;
        if (score > bestScore) { bestScore = score; bestI = i; }
      });
      if (bestI === -1) break;
      var p = remaining.splice(bestI, 1)[0];
      busy[p[0]] = busy[p[1]] = 1;
      left[p[0]]--; left[p[1]]--;
      games.push(p);
    }
    rounds.push(games);
    for (t = 0; t < n; t++) {
      if (busy[t]) { playing[t]++; resting[t] = 0; } else { resting[t]++; playing[t] = 0; }
    }
  }
  return rounds;
}

// Lower is better: fewest rounds first, then the longest time any team sits
// out in a row, then how many repeat sit-outs there are, then long runs of
// games in a row. Each round is a bitmask of the teams playing in it. Time
// after a team's final game doesn't count.
function scheduleCost(masks, n) {
  var maxRest = 0, restSq = 0, playSq = 0, R = masks.length;
  for (var t = 0; t < n; t++) {
    var bit = 1 << t, last = -1, r;
    for (r = R - 1; r >= 0; r--) if (masks[r] & bit) { last = r; break; }
    var rest = 0, play = 0;
    for (r = 0; r <= last; r++) {
      if (masks[r] & bit) {
        if (rest > 1) restSq += (rest - 1) * (rest - 1);
        rest = 0; play++;
      } else {
        if (play > 1) playSq += (play - 1) * (play - 1);
        play = 0; rest++;
        if (rest > maxRest) maxRest = rest;
      }
    }
    if (play > 1) playSq += (play - 1) * (play - 1);
  }
  return R * 1e9 + maxRest * 1e6 + restSq * 20 + playSq;
}

// Put every full round first and any short rounds at the very end (fuller
// ones first), then swap full rounds around while that spreads rest out
// more. Swapping whole rounds can never double-book a team. Having fewer
// short rounds outranks everything except the total number of rounds.
// Returns { rounds, cost }.
function arrange(rounds, n, perRound, budget) {
  var full = rounds.filter(function (g) { return g.length === perRound; });
  var short = rounds.filter(function (g) { return g.length !== perRound; })
    .sort(function (x, y) { return y.length - x.length; });
  var order = full.concat(short);
  var masks = order.map(function (games) {
    var m = 0;
    games.forEach(function (p) { m |= (1 << p[0]) | (1 << p[1]); });
    return m;
  });
  var shortPenalty = short.length * 1e8;
  var best = scheduleCost(masks, n) + shortPenalty, F = full.length, improved = true;
  function swap(i, j) {
    var x = masks[i]; masks[i] = masks[j]; masks[j] = x;
    var y = order[i]; order[i] = order[j]; order[j] = y;
  }
  while (improved && budget > 0) {
    improved = false;
    for (var i = 0; i < F && budget > 0; i++) {
      for (var j = i + 1; j < F && budget > 0; j++, budget--) {
        swap(i, j);
        var cost = scheduleCost(masks, n) + shortPenalty;
        if (cost < best) { best = cost; improved = true; } else swap(i, j);
      }
    }
  }
  return { rounds: order, cost: best };
}

// Try many spread-out schedules plus the simple in-order one, polish the
// most promising few by reordering rounds, and keep the best.
var scheduleCache = {};
function buildSchedule(n, c) {
  var cacheKey = n + "x" + c;
  if (!scheduleCache[cacheKey]) scheduleCache[cacheKey] = searchSchedule(n, c);
  return scheduleCache[cacheKey];
}
function searchSchedule(n, c) {
  var perRound = Math.min(c, Math.floor(n / 2));
  var rand = seededRandom(n * 97 + c);
  var candidates = [arrange(packInOrder(n, c), n, perRound, 0)];
  for (var i = 0; i < 300; i++) candidates.push(arrange(packSpread(n, c, rand), n, perRound, 0));
  candidates.sort(function (x, y) { return x.cost - y.cost; });
  var R = candidates[0].rounds.length;
  var budget = Math.max(200, Math.floor(2e6 / (R * n)));
  var best = null;
  candidates.slice(0, 3).forEach(function (cand) {
    var polished = arrange(cand.rounds, n, perRound, budget);
    if (!best || polished.cost < best.cost) best = polished;
  });
  var sched = [];
  best.rounds.forEach(function (games, r) {
    games.forEach(function (p, ci) { sched.push({ round: r + 1, court: ci + 1, a: p[0], b: p[1] }); });
  });
  return sched;
}

export function pairKey(a, b) { return Math.min(a, b) + "-" + Math.max(a, b); }

export { buildSchedule };
