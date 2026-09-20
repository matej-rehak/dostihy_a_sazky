// Proxy module — routes buildBoard / updateBoard / animatePawnsIfNeeded
// to either the 2D CSS board or the Three.js 3D board based on current mode.
import { buildBoard as buildBoard2d, updateBoard as updateBoard2d } from './board.js';
import { animatePawnsIfNeeded as animatePawns2d }                   from '../animations/pawns.js';
import { buildBoard3d, updateBoard3d, animatePawns3d, destroyBoard3d } from './board3d.js';

let mode         = '2d';
let board3dBuilt = false;
let lastBoardData  = null;
let lastGameState  = null;

export function buildBoard(boardData) {
  lastBoardData = boardData;
  buildBoard2d(boardData);
}

export function updateBoard(gameState) {
  lastGameState = gameState;
  if (mode === '2d') updateBoard2d(gameState);
  else               updateBoard3d(gameState);
}

export function animatePawnsIfNeeded(gameState, onDone) {
  if (mode === '2d') return animatePawns2d(gameState, onDone);
  return animatePawns3d(gameState, onDone);
}

export function toggleMode() {
  const boardEl = document.getElementById('board');
  const canvas  = document.getElementById('board-3d-canvas');
  const btn     = document.getElementById('view-mode-btn');

  if (mode === '2d') {
    mode = '3d';
    boardEl?.classList.add('hidden');
    canvas?.classList.remove('hidden');
    if (btn) btn.textContent = '2D';

    if (!board3dBuilt && lastBoardData && canvas) {
      // rAF ensures canvas has layout dimensions before WebGL initialises
      requestAnimationFrame(() => {
        buildBoard3d(lastBoardData, canvas);
        board3dBuilt = true;
        if (lastGameState) updateBoard3d(lastGameState);
      });
    } else if (board3dBuilt && lastGameState) {
      updateBoard3d(lastGameState);
    }
  } else {
    mode = '2d';
    canvas?.classList.add('hidden');
    boardEl?.classList.remove('hidden');
    if (btn) btn.textContent = '3D';
    if (lastGameState) updateBoard2d(lastGameState);
  }
}

export function resetBoardMode() {
  if (board3dBuilt) { destroyBoard3d(); board3dBuilt = false; }
  mode          = '2d';
  lastBoardData = null;
  lastGameState = null;
  document.getElementById('board-3d-canvas')?.classList.add('hidden');
  document.getElementById('board')?.classList.remove('hidden');
  const btn = document.getElementById('view-mode-btn');
  if (btn) btn.textContent = '3D';
}
