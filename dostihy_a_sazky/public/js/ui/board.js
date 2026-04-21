import { makeEl, fmt, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { showTip, moveTip } from './tooltip.js';

// ─── Pozice políček na CSS gridu ──────────────────────────────────────────────

function getGridPos(id) {
  if (id === 0)  return [11, 11];
  if (id === 10) return [11,  1];
  if (id === 20) return [ 1,  1];
  if (id === 30) return [ 1, 11];
  if (id >= 1  && id <=  9) return [11, 11 - id];
  if (id >= 11 && id <= 19) return [11 - (id - 10), 1];
  if (id >= 21 && id <= 29) return [1, id - 19];
  if (id >= 31 && id <= 39) return [id - 29, 11];
}

function getSide(id) {
  if ([0, 10, 20, 30].includes(id)) return 'corner';
  if (id >= 1  && id <=  9) return 'bottom';
  if (id >= 11 && id <= 19) return 'left';
  if (id >= 21 && id <= 29) return 'top';
  if (id >= 31 && id <= 39) return 'right';
}

const CORNER_ICONS = { 0: '🚩', 10: '✋', 20: '🅿️', 30: '🚫' };
const TYPE_ICONS   = { finance: '💱', nahoda: '❓', tax: '📉', go_to_jail: '🚔', free_parking: '🅿️', service: '👤', start: '🚩' };
const SERVICE_ICONS = {
  trener: '👤',
  preprava: '🚚',
  staje: '🐴',
};

// ─── Build ────────────────────────────────────────────────────────────────────

export function buildBoard(board) {
  board.forEach(space => {
    const [row, col] = getGridPos(space.id);
    const side = getSide(space.id);

    const el = makeEl('div', `space space-${space.type} side-${side}`);
    el.dataset.id = String(space.id);
    el.style.gridRow    = row;
    el.style.gridColumn = col;

    if (space.type === 'horse') {
      const stripe = makeEl('div', 'stripe');
      stripe.style.background = safeColor(space.groupColor);
      el.appendChild(stripe);
    } else if (space.type === 'service') {
      const stripe = makeEl('div', 'stripe');
      stripe.style.background = '#ffffffff';
      el.appendChild(stripe);
    }

    if (side === 'corner') {
      el.classList.add('space-corner');
      el.appendChild(makeEl('div', 'corner-icon', CORNER_ICONS[space.id] ?? '⬜'));
      el.appendChild(makeEl('div', 'corner-name', space.name));
      if (space.id === 10) el.appendChild(makeEl('div', 'corner-sub', ''));
    } else {
      const inner = makeEl('div', 'space-inner');
      const icon  = space.type === 'service'
        ? (SERVICE_ICONS[space.serviceType] ?? TYPE_ICONS.service)
        : (TYPE_ICONS[space.type] ?? '');
      if (icon) inner.appendChild(makeEl('div', 'space-icon', icon));
      inner.appendChild(makeEl('div', 'space-name', space.name));
      if (space.price) inner.appendChild(makeEl('div', 'space-price', `${fmt(space.price)} Kč`));
      el.appendChild(inner);
    }

    const ownOverlay = makeEl('div', 'own-overlay hidden');
    ownOverlay.id = `ov-${space.id}`;
    el.appendChild(ownOverlay);

    const ownBadge = makeEl('div', 'own-badge hidden');
    ownBadge.id = `ob-${space.id}`;
    el.appendChild(ownBadge);

    const tokenDots = makeEl('div', 'token-dots');
    tokenDots.id = `td-${space.id}`;
    el.appendChild(tokenDots);

    const pawns = makeEl('div', 'space-pawns');
    pawns.id = `pw-${space.id}`;
    el.appendChild(pawns);

    el.addEventListener('mouseenter', ev => showTip(space, state.gameState, ev));
    el.addEventListener('mousemove',  ev => moveTip(ev));
    el.addEventListener('mouseleave', () => dom.tooltip?.classList.add('hidden'));

    dom.board.appendChild(el);
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function updateBoard(gameState) {
  document.querySelectorAll('.space.current-turn').forEach(el => el.classList.remove('current-turn'));

  const currentPlayer = gameState.players.find(p => p.id === gameState.currentTurnId);
  if (currentPlayer) {
    const spaceEl = dom.board?.querySelector(`.space[data-id="${currentPlayer.position}"]`);
    if (spaceEl) spaceEl.classList.add('current-turn');
  }

  document.querySelectorAll('.own-badge, .own-overlay').forEach(el => el.classList.add('hidden'));
  Object.entries(gameState.ownerships || {}).forEach(([spaceId, playerId]) => {
    const ob    = document.getElementById(`ob-${spaceId}`);
    const ov    = document.getElementById(`ov-${spaceId}`);
    const owner = gameState.players.find(p => p.id === playerId);
    if (!ob || !ov || !owner) return;
    const color = safeColor(owner.color);
    ob.style.background = color;
    ob.classList.remove('hidden');
    ov.style.background = color;
    ov.classList.remove('hidden');
  });

  document.querySelectorAll('.token-dots').forEach(el => { el.innerHTML = ''; });
  Object.entries(gameState.tokens || {}).forEach(([spaceId, tok]) => {
    const el = document.getElementById(`td-${spaceId}`);
    if (!el) return;
    if (tok.big) {
      el.appendChild(makeEl('div', 'dot-big'));
    } else {
      for (let i = 0; i < tok.small; i++) el.appendChild(makeEl('div', 'dot-small'));
    }
  });
}
