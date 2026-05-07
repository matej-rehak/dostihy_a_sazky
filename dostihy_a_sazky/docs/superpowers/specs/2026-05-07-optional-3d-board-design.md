# Optional 3D Board Design

## Context

The project is a browser multiplayer version of Dostihy a sazky with a Node.js, Express, Socket.IO, and JWT backend. The current frontend is plain HTML, CSS, and browser JavaScript with no build step. The existing 2D board, right-side action panel, modal flows, Socket.IO events, and game rules must remain stable.

The first 3D version will be an optional visual mode, not a replacement for the current 2D board. Players can switch between 2D and 3D at any time.

## Goals

- Add a playable optional 3D board view for the main game screen.
- Preserve the existing backend rules, Socket.IO contracts, and game-state shape.
- Keep the current 2D board as the default fallback.
- Match the current 2D visual language: group colors, cream board spaces, dark frame, gold accents, and the existing game UI mood.
- Keep the first version focused on functional parity with the 2D board rather than a full 3D racetrack environment.

## Non-Goals

- Do not rewrite game rules, price logic, rent logic, cards, trades, or socket APIs.
- Do not replace the right-side game panel, action controls, log, trade modal, debt modal, or card modal.
- Do not introduce a bundler for this feature.
- Do not ship GLB horse, stable, or racetrack environment assets in the first version.
- Do not make 3D mandatory for users on slower devices.

## User Experience

The game view will expose a compact `2D / 3D` toggle in or near `#board-wrap`. The current 2D board remains the default unless the player has previously selected 3D. The selected board mode is stored in `localStorage`.

In 2D mode, the current DOM board behaves as it does today. In 3D mode, a Three.js canvas replaces the visible board area while the rest of the page remains unchanged. The right-side panel continues to show players, actions, and the log. Existing modals and overlays continue to appear above either board mode.

The 3D camera uses a controlled isometric view. Users may rotate and zoom within a limited range, but the camera should not allow disorienting free-flight movement. A player can return to 2D immediately if 3D performance or clarity is poor.

## Visual Direction

The 3D view should feel like the same board lifted into space. It should not introduce a separate art direction.

The first version will use:

- Cream or parchment-like board tiles close to the existing 2D board surfaces.
- The same horse group colors from `src/data/boardData.js`.
- Existing player colors for pawns.
- Dark outer framing and gold highlights consistent with the current UI.
- Low, clean geometry: a flat board base, slightly raised spaces, simple 3D pawns, and small upgrade markers.
- A center area with the Dostihy a sazky identity and deck zones.

Later asset work can add optimized GLB props such as horses, stable details, grandstands, or decorative racetrack scenery after the 3D MVP is stable.

## Architecture

The feature is frontend-only for the first version.

Recommended files:

- `public/js/ui/board3dLayout.mjs`: pure geometry helpers for board space positions, side detection, rotations, and pawn offsets.
- `public/js/ui/board3d.js`: Three.js scene lifecycle, rendering, camera, board mesh creation, pawn updates, ownership markers, token markers, and click handling.
- `public/css/27-board-3d.css`: board-mode toggle, canvas container, loading/error states, and responsive sizing.
- `public/partials/game.html`: add the board mode toggle and a 3D canvas container inside the board area.
- `public/js/main.js` and existing UI modules: initialize and update the 3D board after partials load and game state changes.

Three.js should be added as an npm dependency and imported from the installed package in browser-compatible module form. The project should keep its no-bundler development flow.

## Data Flow

The 3D board consumes the same board data and game state used by the 2D board.

On initial game load:

1. The standard partial-loading flow creates the board container.
2. The 2D board is built as it is today.
3. The 3D board module initializes lazily when 3D mode is selected or when restoring a saved 3D preference.

On game-state updates:

1. Existing state listeners continue to update the 2D board.
2. If the 3D board is initialized, it receives the same game state.
3. It updates current-turn highlighting, ownership markers, token markers, field 20 mode, and player pawns.

Click behavior in 3D must preserve the existing airport target selection behavior. Clicking a selectable 3D space emits the same `game:respond` payload as the 2D board.

## Error Handling And Fallback

If Three.js fails to load, WebGL is unavailable, or scene initialization throws, the UI should keep the 2D board visible and show a small non-blocking message that 3D mode is unavailable.

The 3D module should avoid breaking the main game screen if it cannot render. Failures in 3D should not block dice rolling, buying, trades, cards, turn changes, or reconnect behavior.

## Testing And Verification

Automated tests should cover the pure layout helpers:

- Corner positions map to the four board corners.
- Edge spaces map clockwise around the board.
- Space side detection is stable.
- Pawn offsets are stable for multiple players on one space.

Targeted syntax checks should cover new browser modules where practical. Manual visual verification should run through:

- Open a local game at `http://localhost:3001`.
- Start or join a game.
- Switch from 2D to 3D and back.
- Confirm the 3D colors match the 2D board closely.
- Confirm pawns, ownership, tokens, current turn, and field 20 mode update.
- Confirm airport target selection works from 3D.
- Confirm existing action panels and modals still work.

## Implementation Phasing

Phase 1 creates the geometry helpers, 3D container, toggle, Three.js initialization, static board meshes, and fallback handling.

Phase 2 connects live game-state updates: pawns, ownership, tokens, current turn, field 20 mode, and airport click selection.

Phase 3 adds polish: camera constraints, resize handling, visual color tuning against the 2D board, and performance cleanup.

Phase 4 is optional later asset work: GLB props, optimized materials, and richer board-center or racetrack scenery.

## Acceptance Criteria

- The current 2D board remains available and functional.
- A player can switch to 3D mode without changing rooms or restarting the game.
- 3D mode renders all 40 board spaces with colors consistent with the 2D version.
- 3D mode shows player pawns on the correct spaces.
- 3D mode reflects ownership and upgrade tokens.
- 3D mode does not change backend game behavior or Socket.IO contracts.
- Existing right-side UI and modals remain usable in both board modes.
- If 3D cannot initialize, the game continues in 2D.
