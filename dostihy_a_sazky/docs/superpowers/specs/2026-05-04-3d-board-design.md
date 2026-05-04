# 3D Board View Design

Date: 2026-05-04
Project: Dostihy a sazky

## Goal

Add a switchable 3D board view to the existing browser game. The current 2D board remains the default reliable view, while the 3D board provides a more immersive visual mode for the same multiplayer game state.

This is not a rewrite of the game. The server rules, Socket.IO event contract, player actions, cards, trades, debt handling, and right-side UI panels stay in place.

## Scope

In scope:

- Add a `2D / 3D` board view toggle on the game screen.
- Render a Three.js 3D board for the existing 40 board spaces.
- Show player pawns on their current spaces.
- Show ownership markers and token markers in 3D.
- Keep the existing right panel for players, actions, and log.
- Preserve the current 2D board behavior.
- Support the existing airport target selection click behavior from the 3D board.

Out of scope for the first implementation:

- Full 3D rewrite of cards, modals, trades, or action panels.
- Physics-based dice rolling.
- Custom 3D models or external art assets.
- Server-side gameplay changes.

## User Experience

The game screen keeps its current layout: board on the left, player/action/log panel on the right. A compact segmented control near the board lets the player switch between 2D and 3D.

When `2D` is active, the existing CSS grid board is shown exactly as it works today. When `3D` is active, the CSS grid board is hidden and a canvas-based 3D board appears in the same area. The right panel remains visible in both modes.

The 3D board should feel practical first: readable spaces, obvious player positions, and stable interaction. It should not make common game actions harder to complete.

## Architecture

The 3D board is a client-only renderer over the same state used by the current 2D board.

Existing state sources:

- `state.boardData` provides the 40 board spaces.
- `state.gameState.players` provides player positions and colors.
- `state.gameState.ownerships` provides property ownership.
- `state.gameState.tokens` provides upgrade/token markers.
- `state.gameState.pendingAction` controls special click modes such as airport target selection.

New client pieces:

- `public/js/ui/board3d.js`: owns Three.js scene creation, object layout, rendering, resize handling, updates, and disposal.
- `public/js/state.js`: stores the current board view mode, defaulting to `2d`.
- `public/partials/game.html`: adds the view toggle and 3D board container.
- `public/style.css`: styles the toggle and keeps the 3D canvas responsive.
- `public/js/main.js` and existing board update flow: initialize the 3D board when board data is available and call its update function when game state changes.

No gameplay rules move into the 3D renderer. The renderer may emit the same existing `game:respond` event for airport target selection, but it does not decide rules.

## 3D Scene Design

The scene uses a simple, readable tabletop style:

- A square board ring with 40 raised tiles.
- Corner tiles larger than normal tiles.
- Horse spaces use the existing `groupColor` as a colored top stripe or inset.
- Service and special spaces use neutral colors with simple visual symbols where feasible.
- Player pawns are small colored cylinders or rounded markers placed above each space.
- Ownership is shown with a small colored vertical marker or tile accent.
- Tokens are shown as small stacked dots or chips on owned spaces.

The camera starts in an angled overhead view. The initial version can use a fixed camera with limited pointer controls if practical, but the board must remain readable on desktop and usable on smaller screens.

## Interaction

The `2D / 3D` toggle changes only the view mode. It does not reset the game, reconnect the socket, or change room state.

Clicking a 3D tile should support the existing airport selection flow:

- If `pendingAction.type` is `airport_select_target` and the action targets the current player, clicking a different space emits `game:respond` with `{ decision: 'fly', spaceId }`.
- Outside that flow, clicks can highlight a space locally or do nothing.

Tooltips are optional for the first implementation. If included, they should reuse existing board space data and not duplicate rule logic.

## Error Handling

If Three.js fails to load or WebGL is unavailable, the UI should fall back to the 2D board and avoid breaking the game screen.

If the 3D board has not initialized yet, state updates should be safely ignored until initialization completes.

Resize events should not create duplicate renderers or leak canvases.

## Testing And Verification

Automated checks:

- Run `npm test`.
- Add focused tests only if shared logic is extracted for 3D board layout or mode switching.

Manual/browser checks:

- Start the app with `npm start`.
- Open `http://localhost:3001`.
- Verify the 2D board still renders.
- Switch to 3D and confirm the canvas is nonblank.
- Confirm player pawns appear on expected spaces after game state updates.
- Confirm switching back to 2D restores the existing board.
- Confirm airport target selection still works from 3D when that pending action is active.

## Acceptance Criteria

- The player can switch between `2D` and `3D` board views during a game.
- The 3D board renders all 40 spaces from existing board data.
- 3D pawns, ownership markers, and token markers update from game state.
- Existing 2D board behavior and right-side UI remain intact.
- No server gameplay rules or socket contracts are changed.
- The app passes the existing test suite.
