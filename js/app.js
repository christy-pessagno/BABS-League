import { buildSchedule, pairKey } from "./scheduler.js";
import { standings, scoreOf } from "./standings.js";
import { getState, update, subscribe, newId } from "./store.js";

var MIN_COURTS = 1, MAX_COURTS = 8;

// Screen-only state (not saved).
var ui = { tab: null, viewSet: null, selected: null };

// ---- Helpers ----
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}
function today() {
  var d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function niceDate(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function name(id) {
  var p = getState().players[id];
  return p ? p.name : "?";
}
function byName(ids) {
  return ids.slice().sort(function (a, b) { return name(a).localeCompare(name(b)); });
}
function teamLabel(team) { return team.map(name).join(" & "); }

function session() { return getState().session; }
function viewedSetIndex() {
  var s = session();
  if (!s || !s.sets.length) return null;
  if (ui.viewSet === null || ui.viewSet >= s.sets.length) return s.sets.length - 1;
  return ui.viewSet;
}
function viewedSet() {
  var i = viewedSetIndex();
  return i === null ? null : session().sets[i];
}
// Courts that can actually be used. A solo team borrows a partner who is
// sitting out, so every game still needs 4 people and someone must be free:
// with T teams (2T - 1 players) at most floor((2T - 1) / 4) games fit at once.
function usableCourts(teams, courts) {
  var solo = teams.some(function (t) { return t.length === 1; });
  if (!solo) return courts;
  return Math.max(1, Math.min(courts, Math.floor((teams.length * 2 - 1) / 4)));
}
function scheduleFor(set) { return buildSchedule(set.teams.length, usableCourts(set.teams, set.courts)); }

// Players checked in but not yet on a team in the draft.
function unpaired(s) {
  var used = {};
  s.draft.teams.forEach(function (t) { t.forEach(function (id) { used[id] = 1; }); });
  return byName(s.attendees.filter(function (id) { return !used[id]; }));
}

var ICON = {
  check: "<svg width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='#D8E000' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6 9 17l-5-5'/></svg>",
  tick: "<svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='#fff' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6 9 17l-5-5'/></svg>",
  trophy: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='#1F6B44' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9H4.5a2.5 2.5 0 0 1 0-5H6'/><path d='M18 9h1.5a2.5 2.5 0 0 0 0-5H18'/><path d='M4 22h16'/><path d='M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22'/><path d='M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22'/><path d='M18 2H6v7a6 6 0 0 0 12 0V2Z'/></svg>",
  reset: "<svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'/><path d='M3 3v5h5'/></svg>"
};

function stepper(kind, value, min, max) {
  return "<div class='stepper'>" +
    "<button data-step='" + kind + "' data-dir='-1' " + (value <= min ? "disabled" : "") + ">&minus;</button>" +
    "<span class='val'>" + value + "</span>" +
    "<button data-step='" + kind + "' data-dir='1' " + (value >= max ? "disabled" : "") + ">+</button>" +
  "</div>";
}

// ---- Set progress (carried over from BABS-Robin) ----
function playedCount(set, sched) {
  var n = 0;
  sched.forEach(function (g) { if (set.results[pairKey(g.a, g.b)] !== undefined) n++; });
  return n;
}
function progressText(set) {
  var sched = scheduleFor(set);
  return playedCount(set, sched) + "/" + sched.length + " played";
}
// The round in play is the earliest one with a game still missing a winner.
function currentRound(set) {
  var sched = scheduleFor(set);
  for (var i = 0; i < sched.length; i++) {
    if (set.results[pairKey(sched[i].a, sched[i].b)] === undefined) return sched[i].round;
  }
  return null;
}
function roundState(set, round) {
  var cur = currentRound(set);
  if (cur === null || round < cur) return "done";
  return round === cur ? "current" : "";
}
function refreshRoundStates(set) {
  document.querySelectorAll("section.round").forEach(function (s) {
    var state = roundState(set, parseInt(s.getAttribute("data-round"), 10));
    s.classList.toggle("current", state === "current");
    s.classList.toggle("done", state === "done");
  });
}

function teamButtonsHtml(set, a, b) {
  var w = set.results[pairKey(a, b)];
  var hasW = w !== undefined;
  function btn(team) {
    var cls = w === team ? "winner" : (hasW ? "loser" : "");
    var solo = set.teams[team].length === 1 ? "<span class='solo-tag'>solo</span>" : "";
    return "<button class='team-btn " + cls + "' data-a='" + a + "' data-b='" + b + "' data-team='" + team + "'>" +
             (w === team ? ICON.check : "") + "<span>" + esc(teamLabel(set.teams[team])) + solo + "</span></button>";
  }
  return btn(a) + "<div class='vs'>vs</div>" + btn(b);
}
function scoreInput(set, g, team) {
  var s = set.scores[pairKey(g.a, g.b)] || {};
  return "<input type='text' inputmode='numeric' pattern='[0-9]*' maxlength='2' placeholder='Score' " +
         "aria-label='" + esc(teamLabel(set.teams[team])) + " score' data-a='" + g.a + "' data-b='" + g.b + "' data-score='" + team + "' " +
         "value='" + (typeof s[team] === "number" ? s[team] : "") + "' />";
}

// For a game with a solo team: pick their partner from players resting that round.
function fillInHtml(set, sched, g) {
  var soloTeam = set.teams[g.a].length === 1 ? g.a : (set.teams[g.b].length === 1 ? g.b : -1);
  if (soloTeam === -1) return "";
  var playing = {};
  sched.forEach(function (x) { if (x.round === g.round) { playing[x.a] = 1; playing[x.b] = 1; } });
  var resting = [];
  set.teams.forEach(function (t, i) { if (!playing[i]) resting = resting.concat(t); });
  var key = pairKey(g.a, g.b), picked = set.fillIns[key];
  if (picked && resting.indexOf(picked) === -1) resting.push(picked);
  var opts = "<option value=''>Pick a partner</option>" + byName(resting).map(function (id) {
    return "<option value='" + id + "'" + (id === picked ? " selected" : "") + ">" + esc(name(id)) + "</option>";
  }).join("");
  return "<div class='fill-row'><span>" + esc(name(set.teams[soloTeam][0])) + "&rsquo;s partner</span>" +
         "<select class='fill' data-fill='" + key + "'>" + opts + "</select></div>";
}

// ---- Screens ----
function sessionPane() {
  var st = getState(), s = st.session, html = "<div class='pane'>";
  if (!s) {
    var count = Object.keys(st.players).length;
    html += "<div class='card'><h3>Today&rsquo;s session</h3>" +
            "<p class='hint'>Check in who&rsquo;s here, make teams, then start Set 1." +
            (count ? " " + count + " players on the roster." : "") + "</p>" +
            "<button class='btn' data-action='start-session'>Start a session</button></div>";
    return html + "</div>";
  }

  // Check-in
  var here = {};
  s.attendees.forEach(function (id) { here[id] = 1; });
  html += "<div class='card'><h3>Check-in &middot; " + esc(niceDate(s.date)) + "</h3>" +
          "<p class='hint'>" + s.attendees.length + " here. Tap a name to check them in or out.</p><div class='roster'>";
  byName(Object.keys(st.players)).forEach(function (id) {
    html += "<button class='check " + (here[id] ? "on" : "") + "' data-check='" + id + "'>" +
            "<span class='box'>" + (here[id] ? ICON.tick : "") + "</span>" + esc(name(id)) + "</button>";
  });
  html += "</div><div class='add-row'><input id='new-player' maxlength='24' placeholder='Add a player' autocomplete='off' />" +
          "<button data-action='add-player'>Add</button></div></div>";

  if (s.draft) {
    var number = s.sets.length + 1, free = unpaired(s), d = s.draft;
    var hasSolo = d.teams.some(function (t) { return t.length === 1; });
    var players = d.teams.reduce(function (n, t) { return n + t.length; }, 0);
    var enough = hasSolo ? d.teams.length >= 3 : d.teams.length >= 2;
    var ready = free.length === 0 && enough;
    var canSolo = ui.selected && !hasSolo && free.length % 2 === 1;
    var usable = usableCourts(d.teams, d.courts);
    html += "<div class='card'><h3>Set " + number + " teams</h3>" +
            "<p class='hint'>Tap two players to pair them. With an odd number, tap one and choose Solo.</p>";
    if (free.length) {
      html += "<div class='chips'>" + free.map(function (id) {
        return "<button class='chip " + (ui.selected === id ? "sel" : "") + "' data-chip='" + id + "'>" + esc(name(id)) + "</button>";
      }).join("") + "</div>";
      html += "<div class='btn-row'>" +
              "<button class='btn ghost' data-action='shuffle'>Shuffle the rest</button>" +
              (canSolo ? "<button class='btn ghost' data-action='solo'>Make " + esc(name(ui.selected)) + " solo</button>" : "") +
              "</div>";
    }
    if (d.teams.length) {
      html += "<div class='team-list'>" + d.teams.map(function (t, i) {
        return "<div class='team-row'><span>" + esc(teamLabel(t)) + (t.length === 1 ? "<span class='solo-tag'>solo</span>" : "") +
               "</span><button class='x' data-unpair='" + i + "' aria-label='Split team'>&times;</button></div>";
      }).join("") + "</div>";
    }
    html += "<div class='setup-row'><span class='rlabel'>Courts</span>" + stepper("courts", d.courts, MIN_COURTS, MAX_COURTS) + "</div>";
    if (free.length === 0 && !enough) {
      html += "<p class='note'>Doubles needs at least " + (hasSolo ? "5 players when one is solo" : "2 teams") + ".</p>";
    } else if (hasSolo && usable < d.courts) {
      html += "<p class='note'>With a solo player borrowing a partner, " + players + " players can fill " + usable +
              " court" + (usable === 1 ? "" : "s") + " at a time.</p>";
    }
    html += "<button class='btn' data-action='start-set' " + (ready ? "" : "disabled") + ">Start Set " + number + "</button>";
    if (s.sets.length) html += "<button class='btn ghost' data-action='cancel-draft'>Cancel</button>";
    html += "</div>";
  } else {
    var last = s.sets[s.sets.length - 1];
    html += "<div class='card'><h3>Set " + last.number + " in play</h3>" +
            "<p class='hint'>" + esc(progressText(last)) + ". When you&rsquo;re ready, set up the next set with new partners.</p>" +
            "<button class='btn' data-action='next-set'>Set up Set " + (last.number + 1) + "</button></div>";
  }

  if (s.sets.length) {
    html += "<button class='btn ghost' data-action='end-session' data-label='End session'>End session</button>";
  }
  return html + "</div>";
}

function setChips() {
  var s = session();
  if (s.sets.length < 2) return "";
  var cur = viewedSetIndex();
  return "<div class='set-chips'>" + s.sets.map(function (set, i) {
    return "<button class='set-chip " + (i === cur ? "active" : "") + "' data-set='" + i + "'>Set " + set.number + "</button>";
  }).join("") + "</div>";
}

function schedulePane() {
  var set = viewedSet();
  if (!set) return "<div class='pane'><p class='empty'>No set started yet. Check players in and make teams on the Session tab.</p></div>";
  var sched = scheduleFor(set), html = "<div class='pane'>" + setChips();
  var rounds = [];
  sched.forEach(function (g) { if (rounds.indexOf(g.round) === -1) rounds.push(g.round); });
  rounds.forEach(function (round) {
    var playing = {};
    sched.forEach(function (g) { if (g.round === round) { playing[g.a] = 1; playing[g.b] = 1; } });
    var resting = [];
    set.teams.forEach(function (t, i) { if (!playing[i]) resting.push(teamLabel(t)); });
    html += "<section class='round " + roundState(set, round) + "' data-round='" + round + "'><div class='round-head'>" +
            "<h2>Round " + round + "<span class='now'>Now playing</span></h2>";
    if (resting.length) html += "<span class='bye'>Resting: " + esc(resting.join(", ")) + "</span>";
    html += "</div>";
    sched.forEach(function (g) {
      if (g.round !== round) return;
      html += "<div class='match'><div class='court'>Court " + g.court + "</div>";
      html +=   "<div class='vs-grid' data-key='" + pairKey(g.a, g.b) + "'>" + teamButtonsHtml(set, g.a, g.b) + "</div>";
      html +=   "<div class='score-row'>" + scoreInput(set, g, g.a) + "<span class='dash'>&ndash;</span>" + scoreInput(set, g, g.b) + "</div>";
      html +=   fillInHtml(set, sched, g);
      html += "</div>";
    });
    html += "</section>";
  });
  html += "<button class='reset' data-action='reset-set' data-label='Reset Set " + set.number + " scores'>" +
          ICON.reset + " Reset Set " + set.number + " scores</button>";
  return html + "</div>";
}

function standingsPane() {
  var set = viewedSet();
  if (!set) return "<div class='pane'><p class='empty'>Standings appear once a set starts.</p></div>";
  var sched = scheduleFor(set);
  var rows = standings(set.teams.length, sched, set.results, set.scores);
  var html = "<div class='pane'>" + setChips() + "<div class='table'>";
  html += "<div class='trow thead'><span>#</span><span>Team</span>" +
          "<span style='text-align:center'>Won</span><span style='text-align:center'>Lost</span>" +
          "<span style='text-align:center'>+/&minus;</span></div>";
  var anyTied = false;
  rows.forEach(function (r) {
    var top = r.rank === 1 && r.played > 0 && r.wins > 0;
    if (r.tied) anyTied = true;
    var diff = r.scored === 0 ? "&ndash;" : (r.diff > 0 ? "+" + r.diff : (r.diff < 0 ? "&minus;" + (-r.diff) : "0"));
    html += "<div class='trow " + (top ? "top" : "") + "'>" +
              "<span class='rank'>" + (r.tied ? "T" : "") + r.rank + "</span>" +
              "<span class='tname'>" + esc(teamLabel(set.teams[r.idx])) +
                (set.teams[r.idx].length === 1 ? "<span class='solo-tag'>solo</span>" : "") + (top ? ICON.trophy : "") + "</span>" +
              "<span class='twin'>" + r.wins + "</span>" +
              "<span class='tloss'>" + r.losses + "</span>" +
              "<span class='tdiff'>" + diff + "</span></div>";
  });
  html += "</div>";
  var left = sched.length - playedCount(set, sched);
  html += "<p class='note'>" + (left === 0 ? "All games played &mdash; final standings for Set " + set.number + "."
          : left + " game" + (left === 1 ? "" : "s") + " left to play.") + "</p>";
  html += "<p class='note'>Ties go to head-to-head, then point difference (+/&minus;) from games with a score entered." +
          (anyTied ? " T = still tied." : "") + "</p>";
  return html + "</div>";
}

function statsPane() {
  var history = getState().history;
  var html = "<div class='pane'><div class='card'><h3>Stats</h3>" +
             "<p class='hint'>Player and partnership stats are coming in a later stage. Ended sessions are saved below.</p></div>";
  if (history.length) {
    html += "<div class='card'><h3>Past sessions</h3><div class='team-list'>" + history.slice().reverse().map(function (s) {
      return "<div class='team-row'><span>" + esc(niceDate(s.date)) + "</span><span class='hint' style='margin:0'>" +
             s.attendees.length + " players &middot; " + s.sets.length + " set" + (s.sets.length === 1 ? "" : "s") + "</span></div>";
    }).join("") + "</div></div>";
  }
  return html + "</div>";
}

function render() {
  var s = session(), set = viewedSet();
  if (!ui.tab) ui.tab = s && s.sets.length ? "schedule" : "session";
  var html = "<header><div class='head-row'><h1>BABS League</h1>" +
             (set && (ui.tab === "schedule" || ui.tab === "standings") ? "<span class='progress'>" + esc(progressText(set)) + "</span>" : "") +
             "</div><div class='subtitle'>" +
             (s ? esc(niceDate(s.date)) + " &middot; " + s.attendees.length + " here" + (set ? " &middot; Set " + set.number : "")
                : "No session in progress") + "</div><div class='tabs'>";
  [["session", "Session"], ["schedule", "Schedule"], ["standings", "Standings"], ["stats", "Stats"]].forEach(function (t) {
    html += "<button class='tab " + (ui.tab === t[0] ? "active" : "") + "' data-tab='" + t[0] + "'>" + t[1] + "</button>";
  });
  html += "</div></header><main>";
  if (ui.tab === "session") html += sessionPane();
  else if (ui.tab === "schedule") html += schedulePane();
  else if (ui.tab === "standings") html += standingsPane();
  else html += statsPane();
  html += "</main>";
  document.getElementById("app").innerHTML = html;
}

// ---- Actions ----
// Two-tap confirm in the page itself: the first tap arms the button for a
// few seconds, the second runs the action.
function confirmTap(btn, armedLabel, run) {
  if (btn.classList.contains("armed")) { run(); return; }
  var original = btn.innerHTML;
  btn.classList.add("armed");
  btn.innerHTML = armedLabel;
  setTimeout(function () {
    if (!btn.isConnected) return;
    btn.classList.remove("armed");
    btn.innerHTML = original;
  }, 4000);
}

function addPlayer() {
  var input = document.getElementById("new-player");
  var value = input ? input.value.trim() : "";
  if (!value) return;
  var id = newId();
  update(function (st) {
    st.players[id] = { id: id, name: value };
    if (st.session) st.session.attendees.push(id);
  });
  var again = document.getElementById("new-player");
  if (again) again.focus();
}

function shuffle(list) {
  for (var i = list.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var t = list[i]; list[i] = list[j]; list[j] = t;
  }
  return list;
}

var app = document.getElementById("app");

app.addEventListener("click", function (e) {
  var el = e.target.closest("button");
  if (!el) return;
  var s = session();

  if (el.dataset.tab) { ui.tab = el.dataset.tab; render(); window.scrollTo(0, 0); return; }
  if (el.dataset.set !== undefined) { ui.viewSet = parseInt(el.dataset.set, 10); render(); return; }

  if (el.dataset.check) {
    var pid = el.dataset.check;
    update(function (st) {
      var ss = st.session, i = ss.attendees.indexOf(pid);
      if (i === -1) { ss.attendees.push(pid); return; }
      ss.attendees.splice(i, 1);
      if (ss.draft) ss.draft.teams = ss.draft.teams.filter(function (t) { return t.indexOf(pid) === -1; });
    });
    if (ui.selected === pid) { ui.selected = null; render(); }
    return;
  }

  if (el.dataset.chip) {
    var id = el.dataset.chip;
    if (ui.selected === null) { ui.selected = id; render(); return; }
    if (ui.selected === id) { ui.selected = null; render(); return; }
    var first = ui.selected;
    ui.selected = null;
    update(function (st) { st.session.draft.teams.push([first, id]); });
    return;
  }

  if (el.dataset.unpair !== undefined) {
    var idx = parseInt(el.dataset.unpair, 10);
    update(function (st) { st.session.draft.teams.splice(idx, 1); });
    return;
  }

  if (el.dataset.step === "courts") {
    var dir = parseInt(el.dataset.dir, 10);
    update(function (st) {
      var d = st.session.draft;
      d.courts = Math.max(MIN_COURTS, Math.min(MAX_COURTS, d.courts + dir));
    });
    return;
  }

  // Tapping a team records (or clears) the win. A typed score that disagrees
  // with the tapped winner is cleared.
  if (el.dataset.team !== undefined) {
    var a = parseInt(el.dataset.a, 10), b = parseInt(el.dataset.b, 10), team = parseInt(el.dataset.team, 10);
    var key = pairKey(a, b), setIdx = viewedSetIndex();
    update(function (st) {
      var set = st.session.sets[setIdx], other = team === a ? b : a, sc = scoreOf(set.scores, a, b);
      if (set.results[key] === team) { delete set.results[key]; delete set.scores[key]; }
      else {
        set.results[key] = team;
        if (sc && sc[team] <= sc[other]) delete set.scores[key];
      }
    });
    return;
  }

  switch (el.dataset.action) {
    case "start-session":
      update(function (st) {
        st.session = { id: newId(), date: today(), attendees: [], draft: { teams: [], courts: 2 }, sets: [] };
      });
      break;
    case "add-player":
      addPlayer();
      break;
    case "shuffle":
      update(function (st) {
        var free = shuffle(unpaired(st.session));
        // An odd player out becomes the solo team (only one per set).
        if (free.length % 2 === 1) st.session.draft.teams.push([free.pop()]);
        while (free.length >= 2) st.session.draft.teams.push([free.pop(), free.pop()]);
      });
      ui.selected = null;
      break;
    case "solo":
      var soloId = ui.selected;
      ui.selected = null;
      update(function (st) { st.session.draft.teams.push([soloId]); });
      break;
    case "start-set":
      update(function (st) {
        var ss = st.session;
        ss.sets.push({ number: ss.sets.length + 1, courts: ss.draft.courts, teams: ss.draft.teams,
                       results: {}, scores: {}, fillIns: {} });
        ss.draft = null;
      }, true);
      ui.viewSet = null; ui.tab = "schedule";
      render(); window.scrollTo(0, 0);
      break;
    case "next-set":
      update(function (st) {
        var ss = st.session;
        ss.draft = { teams: [], courts: ss.sets[ss.sets.length - 1].courts };
      });
      break;
    case "cancel-draft":
      update(function (st) { st.session.draft = null; });
      break;
    case "end-session":
      confirmTap(el, "Tap again to end and save the session", function () {
        update(function (st) {
          var ss = st.session;
          ss.draft = null;
          st.history.push(ss);
          st.session = null;
        }, true);
        ui.tab = "session"; ui.viewSet = null;
        render();
      });
      break;
    case "reset-set":
      var resetIdx = viewedSetIndex();
      confirmTap(el, ICON.reset + " Tap again to clear this set&rsquo;s scores", function () {
        update(function (st) {
          var set = st.session.sets[resetIdx];
          set.results = {}; set.scores = {}; set.fillIns = {};
        });
      });
      break;
  }
});

// Typing a score updates the winner as soon as both scores differ. Only
// that game's buttons are redrawn, so the score boxes keep focus.
app.addEventListener("input", function (e) {
  var inp = e.target;
  if (!inp.dataset || inp.dataset.score === undefined) return;
  var a = parseInt(inp.dataset.a, 10), b = parseInt(inp.dataset.b, 10), team = parseInt(inp.dataset.score, 10);
  var key = pairKey(a, b), setIdx = viewedSetIndex();
  var v = inp.value.replace(/\D/g, "").slice(0, 2);
  if (v !== inp.value) inp.value = v;
  update(function (st) {
    var set = st.session.sets[setIdx];
    var sc = set.scores[key] || (set.scores[key] = {});
    if (v === "") delete sc[team]; else sc[team] = parseInt(v, 10);
    if (!Object.keys(sc).length) delete set.scores[key];
    var full = scoreOf(set.scores, a, b);
    if (full && full[a] !== full[b]) set.results[key] = full[a] > full[b] ? a : b;
  }, true);
  var set = viewedSet();
  app.querySelector(".vs-grid[data-key='" + key + "']").innerHTML = teamButtonsHtml(set, a, b);
  app.querySelector(".progress").textContent = progressText(set);
  refreshRoundStates(set);
});

app.addEventListener("change", function (e) {
  var sel = e.target;
  if (!sel.dataset || !sel.dataset.fill) return;
  var key = sel.dataset.fill, setIdx = viewedSetIndex(), value = sel.value;
  update(function (st) {
    var set = st.session.sets[setIdx];
    if (value) set.fillIns[key] = value; else delete set.fillIns[key];
  }, true);
});

app.addEventListener("keydown", function (e) {
  if (e.target.id === "new-player" && e.key === "Enter") addPlayer();
});

subscribe(render);
render();

// On opening mid-set, jump to the round in play (just below the sticky
// header). Waits for the page to finish loading so fonts and the browser's
// own scroll restore don't move it afterwards.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";
window.addEventListener("load", function () {
  var set = viewedSet();
  if (ui.tab !== "schedule" || !set) return;
  var round = currentRound(set);
  if (round === null || round <= 1) return;
  var section = document.querySelector("section.round[data-round='" + round + "']");
  var header = document.querySelector("header");
  window.scrollTo(0, section.getBoundingClientRect().top + window.scrollY - header.offsetHeight - 12);
});
