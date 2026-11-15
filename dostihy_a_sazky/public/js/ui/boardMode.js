// Proxy module — routes buildBoard / updateBoard / animatePawnsIfNeeded
// to either the 2D CSS board or the Three.js 3D board based on current mode.
// board3d.js (a s ním Three.js) se načítá až při prvním přepnutí do 3D —
// kdyby se knihovna nenačetla, 2D hra běží dál beze změny.
import { buildBoard as buildBoard2d, updateBoard as updateBoard2d } from './board.js';
import { animatePawnsIfNeeded as animatePawns2d }                   from '../animations/pawns.js';
import { showToast }                                                from '../utils.js';

let mode           = '2d';
let board3d        = null;   // modul board3d.js po načtení
let board3dBuilt   = false;
let lastBoardData  = null;
let lastGameState  = null;

const is3d = () => mode === '3d' && board3dBuilt;

export function buildBoard(boardData) {
  lastBoardData = boardData;
  buildBoard2d(boardData);
}

export function updateBoard(gameState) {
  lastGameState = gameState;
  if (is3d()) board3d.updateBoard3d(gameState);
  else        updateBoard2d(gameState);
}

export function animatePawnsIfNeeded(gameState, onDone) {
  if (is3d()) return board3d.animatePawns3d(gameState, onDone);
  return animatePawns2d(gameState, onDone);
}

function applyModeUi() {
  document.getElementById('board')?.classList.toggle('hidden', mode === '3d');
  document.getElementById('board-3d-canvas')?.classList.toggle('hidden', mode !== '3d');
  const btn = document.getElementById('view-mode-btn');
  if (btn) btn.textContent = mode === '3d' ? '2D' : '3D';
}

export async function toggleMode() {
  if (mode === '3d') {
    mode = '2d';
    board3d?.pauseBoard3d();
    applyModeUi();
    if (lastGameState) updateBoard2d(lastGameState);
    return;
  }

  const canvas = document.getElementById('board-3d-canvas');
  if (!canvas || !lastBoardData) return;

  if (!board3d) {
    try {
      board3d = await import('./board3d.js');
    } catch (err) {
      console.error('[boardMode] 3D se nepodařilo načíst:', err);
      showToast('3D pohled se nepodařilo načíst.', true);
      return;
    }
  }

  mode = '3d';
  applyModeUi();
  if (!board3dBuilt) {
    // rAF ensures canvas has layout dimensions before WebGL initialises
    await new Promise(requestAnimationFrame);
    board3d.buildBoard3d(lastBoardData, canvas);
    board3dBuilt = true;
  } else {
    board3d.resumeBoard3d();
  }
  // instant: hod, který proběhl ve 2D, se ve 3D nemá přehrát znovu
  if (lastGameState) board3d.updateBoard3d(lastGameState, { instant: true });
}

// Na mobilu je jen 2D — tlačítko 3D skrývá CSS. Kdyby se okno zúžilo
// (otočení tabletu), zatímco běží 3D, vrátíme se do 2D.
const mobileQuery = window.matchMedia?.('(max-width: 768px)');
mobileQuery?.addEventListener?.('change', e => {
  if (e.matches && mode === '3d') toggleMode();
});

export function resetBoardMode() {
  if (board3dBuilt) { board3d.destroyBoard3d(); board3dBuilt = false; }
  mode          = '2d';
  lastBoardData = null;
  lastGameState = null;
  applyModeUi();
}
