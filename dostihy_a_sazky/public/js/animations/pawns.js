import { makeEl, safeColor, lightenColor, darkenColor, prefersReducedMotion } from '../utils.js';
import { state } from '../state.js';
import { dom } from '../dom.js';
import { audioManager } from '../audio.js';
import {
  getPawnStepDelay,
  hasPendingPawnAnimation,
  isPawnTeleportMove,
  getPawnDistance,
  nextPawnSpace,
  rectOffsetWithin,
  getPawnArcLift,
} from './pawnAnimationGate.mjs';
import { isEffectEnabled } from '../settings.js';

const PAWN_W = 48;
const PAWN_H = 80;

// Figurky, které právě letí ve vrstvě nad plánem. Ve svém políčku se pro ně
// drží prázdné místo (visibility), aby šlo změřit, kam mají doletět.
const flying = new Set();

// ─── Kreslení figurky ─────────────────────────────────────────────────────────

// Kresba se pro každou barvu udělá jednou a pak už jen kopíruje. Dřív se
// překreslovalo pět gradientů na hráče a krok — u tahu přes půl plánu to byly
// desítky zbytečných překreslení.
const spriteCache = new Map();

function getPawnSprite(color) {
  const cached = spriteCache.get(color);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = PAWN_W;
  canvas.height = PAWN_H;
  draw3DPawn(canvas.getContext('2d'), color);
  spriteCache.set(color, canvas);
  return canvas;
}

function makePawnCanvas(color) {
  const canvas = document.createElement('canvas');
  canvas.width = PAWN_W;
  canvas.height = PAWN_H;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.getContext('2d').drawImage(getPawnSprite(color), 0, 0);
  return canvas;
}

function draw3DPawn(ctx, color) {
  const W = PAWN_W;
  const H = PAWN_H;
  ctx.clearRect(0, 0, W, H);

  const light = lightenColor(color, 0.45);
  const mid = color;
  const dark = darkenColor(color, 0.35);
  const deepDark = darkenColor(color, 0.6);

  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1.5;

  // 1. Podstava (Base) - 3D zaoblená elipsa s lineárním přechodem zleva-doprava
  const baseGrad = ctx.createLinearGradient(8, 64, 40, 72);
  baseGrad.addColorStop(0, light);
  baseGrad.addColorStop(0.3, mid);
  baseGrad.addColorStop(0.8, dark);
  baseGrad.addColorStop(1, deepDark);

  ctx.fillStyle = baseGrad;
  ctx.beginPath();
  ctx.ellipse(24, 68, 17, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 2. Tělo (Body) - kónický tvar
  ctx.beginPath();
  ctx.moveTo(9, 68);
  ctx.quadraticCurveTo(24, 70, 39, 68);
  ctx.lineTo(31, 33);
  ctx.quadraticCurveTo(24, 35, 17, 33);
  ctx.closePath();

  const bodyGrad = ctx.createLinearGradient(9, 0, 39, 0);
  bodyGrad.addColorStop(0, light);
  bodyGrad.addColorStop(0.25, mid);
  bodyGrad.addColorStop(0.75, dark);
  bodyGrad.addColorStop(1, deepDark);

  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.stroke();

  // 3. Krček (Neck) - malý prstenec
  const neckGrad = ctx.createLinearGradient(16, 0, 32, 0);
  neckGrad.addColorStop(0, light);
  neckGrad.addColorStop(0.5, mid);
  neckGrad.addColorStop(1, dark);

  ctx.fillStyle = neckGrad;
  ctx.beginPath();
  ctx.ellipse(24, 33, 7.5, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 4. Hlava (Head) - 3D koule s leskem zleva-nahoře
  const headGrad = ctx.createRadialGradient(20, 14, 1.5, 24, 19, 11);
  headGrad.addColorStop(0, '#ffffff'); // Lesklý bílý odlesk
  headGrad.addColorStop(0.2, lightenColor(color, 0.5));
  headGrad.addColorStop(0.5, mid);
  headGrad.addColorStop(0.85, dark);
  headGrad.addColorStop(1, deepDark);

  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.arc(24, 19, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// ─── Vykreslení figurek do políček ────────────────────────────────────────────

export function renderPawns(gameState) {
  document.querySelectorAll('.space-pawns').forEach(el => { el.innerHTML = ''; });

  gameState.players.forEach(p => {
    if (p.bankrupt) return;
    const pos = state.clientVisualPos[p.id] !== undefined ? state.clientVisualPos[p.id] : p.position;
    const pawnsEl = document.getElementById(`pw-${pos}`);
    if (!pawnsEl) return;

    const pawn = makeEl('div', `pawn${p.id === gameState.currentTurnId ? ' is-active' : ''}`);
    pawn.title = p.name;
    pawn.dataset.playerId = p.id;
    pawn.appendChild(makePawnCanvas(safeColor(p.color)));

    // Letící figurka drží své místo, ale kreslí se ve vrstvě nad plánem.
    if (flying.has(p.id)) pawn.style.visibility = 'hidden';

    pawnsEl.appendChild(pawn);
  });
}

// ─── Vrstva pro let figurky ───────────────────────────────────────────────────

/**
 * Políčka mají `overflow: hidden`, takže skok uvnitř nich se ořízne a figurka
 * se navíc kreslí pod sousedními políčky. Let proto probíhá v samostatné
 * vrstvě nad celým plánem.
 */
function getPawnLayer() {
  const wrap = document.getElementById('board-wrap');
  if (!wrap) return null;
  let layer = document.getElementById('pawn-fx');
  if (!layer) {
    layer = makeEl('div', 'pawn-fx');
    layer.id = 'pawn-fx';
    wrap.appendChild(layer);
  }
  return layer;
}

function spawnGhost(layer, player) {
  const ghost = makeEl('div', 'pawn-ghost');
  ghost.dataset.playerId = player.id;
  ghost.appendChild(makePawnCanvas(safeColor(player.color)));
  layer.appendChild(ghost);
  return ghost;
}

function pawnSlotRect(spaceId, playerId) {
  const spaceEl = dom.board?.querySelector(`.space[data-id="${spaceId}"]`);
  const pawnEl = spaceEl?.querySelector(`.pawn[data-player-id="${playerId}"]`);
  return pawnEl?.getBoundingClientRect() ?? null;
}

/** Přeletí figurku z místa `fromRect` na aktuální slot v `toRect`. */
function flyStep(ghost, layerRect, fromRect, toRect, stepDelay) {
  const to = rectOffsetWithin(toRect, layerRect);
  ghost.style.left = `${to.left}px`;
  ghost.style.top = `${to.top}px`;
  ghost.style.width = `${toRect.width}px`;
  ghost.style.height = `${toRect.height}px`;

  const dx = fromRect.left - toRect.left;
  const dy = fromRect.top - toRect.top;
  const lift = prefersReducedMotion() ? 0 : getPawnArcLift(stepDelay);
  const pop = lift > 0 ? 1.12 : 1;

  ghost.animate(
    [
      { transform: `translate(${dx}px, ${dy}px) scale(1)` },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(${pop})`, offset: 0.5 },
      { transform: 'translate(0, 0) scale(1)' },
    ],
    { duration: stepDelay, easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)', fill: 'both' }
  );
}

function clearFlight(ghosts) {
  ghosts.forEach(g => g.remove());
  flying.clear();
}

// ─── Teleport (Distanc) ───────────────────────────────────────────────────────

function animateTeleportMove(gameState, move, onDone) {
  const player = gameState.players.find(p => isPawnTeleportMove(p, state.clientVisualPos, move));
  if (!player || state.prevPawnMoveId === move.id) return false;

  state.prevPawnMoveId = move.id;
  state.isAnimatingPawn = true;

  const fromPawn = dom.board
    ?.querySelector(`.space[data-id="${move.from}"] .pawn[data-player-id="${player.id}"]`);
  fromPawn?.classList.add('pawn-teleport-out');
  audioManager.play('jail');

  setTimeout(() => {
    state.clientVisualPos[player.id] = player.position;
    renderPawns(gameState);
    const toSpace = dom.board?.querySelector(`.space[data-id="${move.to}"]`);
    const toPawn = toSpace?.querySelector(`.pawn[data-player-id="${player.id}"]`);
    toPawn?.classList.add('pawn-teleport-in');
    toSpace?.classList.add('jail-shake');

    setTimeout(() => {
      toSpace?.classList.remove('jail-shake');
      state.isAnimatingPawn = false;
      renderPawns(gameState);
      if (typeof onDone === 'function') onDone();
    }, 520);
  }, 360);

  return true;
}

// ─── Chůze po plánu ───────────────────────────────────────────────────────────

/** Hráči, kteří ještě nedošli tam, kde je má server. */
function movingPlayers(gameState) {
  return gameState.players.filter(
    p => !p.bankrupt && state.clientVisualPos[p.id] !== p.position
  );
}

export function animatePawnsIfNeeded(gameState, onDone = null) {
  const move = gameState.lastPawnMove || null;
  if (!state.isAnimatingPawn && move?.type === 'teleport' && animateTeleportMove(gameState, move, onDone)) {
    return true;
  }

  const needsAnim = hasPendingPawnAnimation(gameState.players, state.clientVisualPos, move);

  if (!needsAnim || state.isAnimatingPawn) {
    if (!state.isAnimatingPawn) renderPawns(gameState);
    return state.isAnimatingPawn;
  }

  // Vypnutý pohyb figurky: přeskočíme rovnou na cílová pole.
  if (!isEffectEnabled('pawnAnimation')) {
    movingPlayers(gameState).forEach(p => { state.clientVisualPos[p.id] = p.position; });
    renderPawns(gameState);
    if (typeof onDone === 'function') onDone();
    return false;
  }

  state.isAnimatingPawn = true;

  const longestDistance = movingPlayers(gameState).reduce(
    (max, p) => Math.max(max, getPawnDistance(state.clientVisualPos[p.id], p.position, p.moveDirection)),
    0
  );
  const stepDelay = getPawnStepDelay(longestDistance);

  const layer = getPawnLayer();
  const ghosts = new Map();

  // Figurky se na dobu letu schovají ve svých políčkách a překreslí se ve
  // vrstvě — jinak by je ořízlo `overflow: hidden` políčka. Bez vrstvy se
  // nesmí schovat, jinak by po dobu chůze nebyly vidět vůbec.
  if (layer) {
    movingPlayers(gameState).forEach(p => {
      flying.add(p.id);
      ghosts.set(p.id, spawnGhost(layer, p));
    });
  }
  renderPawns(gameState);

  const finish = () => {
    clearFlight([...ghosts.values()]);
    state.isAnimatingPawn = false;
    renderPawns(gameState);
    if (typeof onDone === 'function') onDone();
  };

  const step = () => {
    const layerRect = layer?.getBoundingClientRect() ?? null;
    const moving = movingPlayers(gameState);
    if (moving.length === 0) { finish(); return; }

    // 1. Odkud se odráží
    const fromRects = new Map();
    moving.forEach(p => {
      const rect = pawnSlotRect(state.clientVisualPos[p.id], p.id);
      if (rect) fromRects.set(p.id, rect);
    });

    // 2. Posun o jedno pole
    moving.forEach(p => {
      state.clientVisualPos[p.id] = nextPawnSpace(state.clientVisualPos[p.id], p.moveDirection);
      const spaceEl = dom.board?.querySelector(`.space[data-id="${state.clientVisualPos[p.id]}"]`);
      if (spaceEl) {
        audioManager.play('step');
        spaceEl.classList.add('space-bump');
        setTimeout(() => spaceEl.classList.remove('space-bump'), 150);
      }
    });

    // 3. Přepočet slotů v políčkách (letící figurky zůstávají skryté)
    renderPawns(gameState);

    // 4. Let ve vrstvě nad plánem
    if (layerRect) {
      moving.forEach(p => {
        const ghost = ghosts.get(p.id);
        const fromRect = fromRects.get(p.id);
        const toRect = pawnSlotRect(state.clientVisualPos[p.id], p.id);
        if (ghost && fromRect && toRect) {
          flyStep(ghost, layerRect, fromRect, toRect, stepDelay);
        }
      });
    }

    if (movingPlayers(gameState).length > 0) setTimeout(step, stepDelay);
    else setTimeout(finish, stepDelay);
  };

  step();
  return true;
}
