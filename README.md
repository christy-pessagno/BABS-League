# BABS League

The next version of the BABS pickleball round robin app, with players, sessions and stats. The current app, [BABS-Robin](https://github.com/christy-pessagno/BABS-Robin), stays in use until this one is ready.

## How a session works

1. **Session tab:** start today's session and check in who's here. Add new players at the bottom of the list.
2. **Make teams:** tap two players to pair them, or tap **Shuffle the rest**. With an odd number of players, one becomes a solo team and borrows a resting player as a partner for each game. Borrowed games don't count in the borrowed player's stats.
3. **Schedule and Standings:** these work like BABS-Robin. Tap the winner, and optionally type the score.
4. **Set 2 and later:** tap **Set up Set 2** on the Session tab to make new teams. Earlier sets stay viewable.
5. **End session:** saves it to the history on the Stats tab.

## Build stages

1. **Done:** roster, check-in, team builder, sets with schedule and standings. Data is saved in this browser only.
2. **Next:** move the data to Firebase so several phones can record at once and everyone sees live results. Recording will need a league code.
3. **After that:** player, partnership and session stats, plus CSV export.

## Code layout

- `index.html`: the page shell.
- `css/styles.css`: styles, based on BABS-Robin.
- `js/scheduler.js`: the rest-balancing round robin scheduler, unchanged from BABS-Robin.
- `js/standings.js`: standings and tiebreakers (wins, fewest losses, head-to-head, point difference).
- `js/store.js`: data storage. Stage 2 swaps this to Firebase.
- `js/app.js`: the screens.

To run it locally, serve the folder (for example `python3 -m http.server`) and open it in a browser. It can't be opened as a plain file because it uses JavaScript modules.
