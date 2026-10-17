// App data and persistence.
//
// Stage 1 keeps everything in this browser's localStorage. Stage 2 replaces
// the load/save below with Firebase while keeping the same three functions
// (getState, update, subscribe), so the screens don't need to change.
//
// State shape:
//   players: { [playerId]: { id, name } }          the league roster
//   session: null | {
//     id, date,                                    "YYYY-MM-DD"
//     attendees: [playerId],                       checked in today
//     draft: null | { teams: [[playerId, playerId?]], courts },  next set being built
//     sets: [{ number, courts,
//              teams: [[playerId, playerId?]],     one id = solo team
//              results: { "a-b": winningTeamIndex },
//              scores:  { "a-b": { teamIndex: points } },
//              fillIns: { "a-b": playerId } }]     solo team's borrowed partner
//   }
//   history: [session]                             ended sessions

var KEY = "babs-league-v1";
var state = load();
var listeners = [];

function blank() { return { players: {}, session: null, history: [] }; }

function load() {
  try {
    var raw = localStorage.getItem(KEY);
    if (raw) {
      var d = JSON.parse(raw);
      if (d && typeof d.players === "object") return Object.assign(blank(), d);
    }
  } catch (e) {}
  return blank();
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
}

export function getState() { return state; }

// Apply a change, save it, and tell the screens to redraw. Pass quiet = true
// when the caller has already updated the screen itself (e.g. while typing a
// score, so the box keeps focus).
export function update(change, quiet) {
  change(state);
  save();
  if (!quiet) listeners.forEach(function (fn) { fn(state); });
}

export function subscribe(fn) { listeners.push(fn); }

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
