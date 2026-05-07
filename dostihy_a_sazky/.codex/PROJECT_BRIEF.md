# Codex Project Brief

Last updated: 2026-05-07

## One-Screen Summary

This repository is a no-build-step multiplayer browser game for Dostihy a sazky. The server hosts static frontend files and coordinates game rooms through Socket.IO. The game engine is a CommonJS class whose behavior is composed from domain mixins.

## Runtime

- `npm start` runs `node server.js`.
- `npm run dev` runs `nodemon server.js`.
- Server port defaults to `3001`.
- `npm test` runs all tests through `node --test`.

## High-Signal File Paths

- `server.js`: app/server/socket room lifecycle.
- `src/GameEngine.js`: constructor state and mixin composition.
- `src/mixins/state.js`: broadcast/init/log/scheduling helpers.
- `src/mixins/lobby.js`: player lifecycle, ready state, config, game start.
- `src/mixins/turns.js`: turn start, dice roll, advancing turns, timer behavior.
- `src/mixins/movement.js`: movement and board-space evaluation.
- `src/mixins/actions*.js`: prompt responses, buying, selling, rent, debt, trade responses.
- `src/mixins/economy.js`: money transfer, assets, rent, bankruptcy.
- `src/mixins/tokens.js`: race tokens and eligible spaces.
- `src/mixins/trade.js`: trade initiation.
- `public/js/main.js`: client app bootstrap and socket event handlers.
- `public/js/ui/`: UI modules for board, players, actions, trade, debt, log, lobby.
- `public/css/`: split CSS modules loaded from `public/style.css`.

## Known Game Flow

1. Client loads `public/index.html`.
2. `public/js/main.js` fetches `public/partials/*.html` into `#app-root`.
3. Socket connects with an optional JWT token from local storage.
4. Server assigns or restores `playerId`.
5. Rooms are created/joined, then `GameEngine` sends `game:init`.
6. Most state changes broadcast `game:state`; interactive choices use `game:prompt`.

## Socket Event Surface

Client to server:

- `room:list`, `room:create`, `room:join`
- `game:join`, `game:ready`, `game:update_config`, `game:start`
- `game:change_color`, `game:change_name`
- `game:roll`, `game:respond`, `game:trade_init`
- `game:debug_set_state`, `game:leave`

Server to client:

- `room:list`, `room:created`
- `game:token`, `game:init`, `game:state`, `game:prompt`, `game:log`, `game:error`

## Testing Landmarks

- `tests/trade-debt-resume.test.js`: trade offers must not overwrite debt/card pending actions.
- `tests/double-six-jail.test.js`: dice/jail behavior.
- `tests/movement-insufficient-funds.test.js`: movement with insufficient funds.
- `tests/pawn-animation-gate.test.mjs` and `tests/pawn-teleport-gate.test.mjs`: frontend animation gates.
- `tests/board3d-layout.test.mjs`: board layout expectations.

## When Changing Code

- Backend rule changes usually need a focused Node test.
- UI changes should respect the partial-loading lifecycle and split CSS structure.
- Avoid broad refactors in `server.js` and `GameEngine.js`; narrow changes are easier to verify.
- Before finishing, report exactly which verification commands passed or why they were skipped.

