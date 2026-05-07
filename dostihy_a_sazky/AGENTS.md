# Project Instructions For Codex

This file is the short, always-read context for this repository. Prefer it over long historical notes when starting work.

## Project

- Digital multiplayer version of the Czech board game Dostihy a sazky.
- Backend: Node.js, Express, Socket.IO, JWT.
- Frontend: vanilla HTML, CSS, and browser JavaScript. There is no build step.
- Default local URL: `http://localhost:3001`.

## Commands

- Install dependencies: `npm install`
- Start server: `npm start`
- Development server: `npm run dev`
- Test suite: `npm test`
- Useful targeted checks:
  - `node --check server.js`
  - `node --check src\mixins\actions-trade.js`
  - `node --test tests\trade-debt-resume.test.js`

## Architecture Map

- `server.js`: Express static server, Socket.IO event wiring, rooms, reconnect grace, rate limits.
- `src/GameEngine.js`: game engine shell composed from mixins with `Object.assign`.
- `src/mixins/`: gameplay domains. Add backend game logic to the closest existing mixin.
- `src/data/boardData.js`: all board spaces and economic data.
- `src/Cards.js`: Finance and Nahoda card decks.
- `src/auth.js`: JWT player identity.
- `public/index.html`: page shell only.
- `public/partials/`: injected HTML views.
- `public/js/main.js`: client bootstrap, partial loading, socket listeners, view switching.
- `public/js/ui/`: feature-specific UI renderers and controls.
- `public/js/animations/`: pawn, dice, card, particle, and starter animations.
- `public/css/`: split CSS files imported by `public/style.css`.
- `tests/`: Node test runner tests.

## Important Invariants

- Keep Socket.IO event contracts backward-compatible unless the user explicitly asks for an API change.
- Players are persisted by `playerId`; live player maps are commonly keyed by socket id. Reconnect code bridges this.
- `GameEngine` behavior belongs in mixins, not in a large rewrite of the class shell.
- Frontend DOM elements from partials exist only after `loadPartials()` finishes.
- `public/js/dom.js` uses lazy getters, so access DOM through the existing helpers where possible.
- Debug-only behavior must stay gated behind development mode and/or `?debug`.
- Do not change game rules, prices, rent math, card behavior, or socket APIs without calling it out clearly.

## Current Notes

- Reconnect grace is currently `RECONNECT_GRACE_MS = 120_000` in `server.js`.
- `npm test` uses Node's built-in test runner.
- Some older markdown/source text has mojibake artifacts. When editing code, preserve existing behavior and avoid broad encoding churn unless the task is specifically about text cleanup.
- The worktree may contain user changes. Do not revert unrelated edits.

## Development Style

- Use CommonJS on the backend.
- Use plain browser scripts on the frontend; do not introduce a bundler for small changes.
- Prefer existing helpers and modules over new abstractions.
- Add focused tests for backend rules and regressions.
- For frontend/UI changes, run the local server and visually check the relevant flow when feasible.

