// Set standings, carried over from BABS-Robin. Teams are numbered 0..n-1.
// Ranked by wins, then fewest losses, then head-to-head among tied teams
// (re-applied to any smaller group still tied), then point difference from
// games that have a score. Teams still level share a rank.

import { pairKey } from "./scheduler.js";

// Both teams' points for a game, or null if the score isn't fully entered.
export function scoreOf(scores, a, b) {
  var s = scores[pairKey(a, b)];
  if (!s || typeof s[a] !== "number" || typeof s[b] !== "number") return null;
  var out = {}; out[a] = s[a]; out[b] = s[b];
  return out;
}

// Split rows into runs that share the same value of fn(row), best (highest) first.
function partition(rows, fn) {
  var sorted = rows.slice().sort(function (x, y) { return (fn(y) - fn(x)) || (x.idx - y.idx); });
  var out = [];
  sorted.forEach(function (r) {
    var last = out[out.length - 1];
    if (last && fn(last[0]) === fn(r)) last.push(r); else out.push([r]);
  });
  return out;
}

export function standings(teamCount, schedule, results, scores) {
  function breakTie(group) {
    if (group.length < 2) return [group];
    var inGroup = {};
    group.forEach(function (r) { inGroup[r.idx] = 1; });
    group.forEach(function (r) {
      r.h2h = 0;
      schedule.forEach(function (g) {
        var other = g.a === r.idx ? g.b : (g.b === r.idx ? g.a : -1);
        if (other !== -1 && inGroup[other] && results[pairKey(g.a, g.b)] === r.idx) r.h2h++;
      });
    });
    var byH2h = partition(group, function (r) { return r.h2h; });
    if (byH2h.length > 1) return [].concat.apply([], byH2h.map(breakTie));
    return partition(group, function (r) { return r.diff; });
  }

  var played = 0;
  var rows = [];
  for (var idx = 0; idx < teamCount; idx++) {
    var wins = 0, done = 0, diff = 0, scored = 0;
    schedule.forEach(function (g) {
      if (g.a === idx || g.b === idx) {
        var w = results[pairKey(g.a, g.b)];
        if (w !== undefined) { done++; if (w === idx) wins++; }
        var s = scoreOf(scores, g.a, g.b);
        if (s) { scored++; diff += s[idx] - s[idx === g.a ? g.b : g.a]; }
      }
    });
    played += done;
    rows.push({ idx: idx, wins: wins, played: done, losses: done - wins, diff: diff, scored: scored });
  }
  var byRecord = [];
  partition(rows, function (r) { return r.wins; }).forEach(function (sameWins) {
    byRecord = byRecord.concat(partition(sameWins, function (r) { return -r.losses; }));
  });
  var out = [], rank = 1;
  byRecord.forEach(function (group) {
    breakTie(group).forEach(function (tier) {
      tier.forEach(function (r) { r.rank = rank; r.tied = tier.length > 1; out.push(r); });
      rank += tier.length;
    });
  });
  // Before any game is played, just list teams in order rather than all tied.
  if (played === 0) out.forEach(function (r, i) { r.rank = i + 1; r.tied = false; });
  return out;
}
