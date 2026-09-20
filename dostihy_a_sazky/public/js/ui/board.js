import { makeEl, fmt, safeColor, hexToRgb } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { showTip, moveTip } from './tooltip.js';
import { showSpaceInspect } from './spaceInspect.js';
import { ownershipsChanged, tokensChanged } from './renderGate.mjs';

// Odkazy na prvky políček, postavené jednou při stavbě plánu. Dřív se při
// každém `game:state` pětkrát skenoval celý dokument přes querySelectorAll
// a pak ještě čtyřicetkrát volalo getElementById — a stavy chodí až 20×/s.
let cells = null;

// Poslední vykreslený stav, aby se přeskočila práce, když se nic nezměnilo.
let prevOwn = null;
let prevTok = null;
let prevTurnSpace = null;
let prevAirportSelect = false;

function getCells() {
  if (cells) return cells;
  cells = [];
  dom.board?.querySelectorAll('.space').forEach(el => {
    const id = Number(el.dataset.id);
    if (!Number.isFinite(id)) return;
    cells[id] = {
      id,
      el,
      overlay: el.querySelector('.own-overlay'),
      dots: el.querySelector('.token-dots'),
    };
  });
  return cells;
}

/** Zahodí cache prvků — volá se, když se plán staví znovu. */
export function resetBoardCache() {
  cells = null;
  prevOwn = null;
  prevTok = null;
  prevTurnSpace = null;
  prevAirportSelect = false;
}


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

const CORNER_ICONS = { 0: '🚩', 10: '🔒', 20: '🅿️', 30: '💉' };
const TYPE_ICONS   = { finance: '💱', nahoda: '❓', tax: '🩺', go_to_jail: '🚔', free_parking: '🅿️', service: '👤', start: '🚩' };
const SERVICE_ICONS = {
  trener: '👤',
  preprava: '🚚',
  staje: '🐴',
};

// ─── Build ────────────────────────────────────────────────────────────────────

export function buildBoard(board) {
  resetBoardCache();
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

    const tokenDots = makeEl('div', 'token-dots');
    tokenDots.id = `td-${space.id}`;
    el.appendChild(tokenDots);

    const pawns = makeEl('div', 'space-pawns');
    pawns.id = `pw-${space.id}`;
    el.appendChild(pawns);

    dom.board.appendChild(el);
  });

  attachBoardListeners(board);
}

// Jeden posluchač na celý plán místo čtyř na každé ze čtyřiceti políček.
// Dřív jich viselo 160, z toho 40 na mousemove.
//
// Hlídá se element, ne příznak: při stavbě plánu nad stejným elementem se
// posluchače nesmí zdvojit, při výměně elementu se musí nasadit znovu.
let listenersBoard = null;
let boardSpaces = null;

function attachBoardListeners(board) {
  boardSpaces = board;

  const boardEl = dom.board;
  if (!boardEl || listenersBoard === boardEl) return;
  listenersBoard = boardEl;

  const spaceFrom = ev => {
    const el = ev.target.closest?.('.space');
    if (!el || !boardEl.contains(el)) return null;
    return boardSpaces?.[Number(el.dataset.id)] ?? null;
  };

  boardEl.addEventListener('mouseover', ev => {
    const space = spaceFrom(ev);
    // mouseover bublá, mouseenter ne — hlídáme, že kurzor přišel zvenčí políčka.
    if (!space) return;
    if (ev.relatedTarget && ev.target.closest('.space')?.contains(ev.relatedTarget)) return;
    showTip(space, state.gameState, ev);
  });

  boardEl.addEventListener('mousemove', ev => {
    if (spaceFrom(ev)) moveTip(ev);
  });

  boardEl.addEventListener('mouseout', ev => {
    const el = ev.target.closest?.('.space');
    if (!el) return;
    if (ev.relatedTarget && el.contains(ev.relatedTarget)) return;
    dom.tooltip?.classList.add('hidden');
  });

  boardEl.addEventListener('click', ev => {
    const space = spaceFrom(ev);
    if (!space) return;
    const gs = state.gameState;
    const pa = gs?.pendingAction;

    // Pokud probíhá výběr cíle letiště, kliknutí slouží k letu
    if (pa && pa.type === 'airport_select_target' && pa.targetId === state.myId) {
      const me = gs.players?.find(p => p.id === state.myId);
      if (!me || me.position === space.id) return;
      socket.emit('game:respond', { decision: 'fly', spaceId: space.id });
    } else {
      // Jinak zobrazíme detail karty (pouze pro koně a služby)
      if (space.type === 'horse' || space.type === 'service') {
        showSpaceInspect(space, gs);
      }
    }
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

export function updateBoard(gameState) {
  const cells = getCells();

  if (prevTurnSpace !== null) cells[prevTurnSpace]?.el.classList.remove('current-turn');
  const currentPlayer = gameState.players.find(p => p.id === gameState.currentTurnId);
  prevTurnSpace = currentPlayer ? currentPlayer.position : null;
  if (prevTurnSpace !== null) cells[prevTurnSpace]?.el.classList.add('current-turn');

  const ownerships = gameState.ownerships || {};
  if (ownershipsChanged(prevOwn, ownerships)) {
    prevOwn = { ...ownerships };
    const byId = new Map(gameState.players.map(p => [p.id, p]));

    for (const cell of cells) {
      if (!cell) continue;
      const owner = byId.get(ownerships[cell.id]);
      if (!owner) {
        cell.overlay.classList.add('hidden');
        cell.el.classList.remove('is-owned');
        continue;
      }
      const color = safeColor(owner.color);
      const { r, g, b } = hexToRgb(color);

      // Vlastnictví nese celé políčko: závoj v barvě majitele a vnitřní rám.
      // Rám musí být plnou silou, proto rgba pozadí místo opacity na elementu —
      // opacity by ztlumila i rám. Sílu rámu řeší CSS přes --own-ring, aby si
      // ji mohl mobilní layout ztenčit; inline by ji přebít nešlo.
      cell.overlay.style.setProperty('--own-color', color);
      cell.overlay.style.background = `rgba(${r}, ${g}, ${b}, 0.3)`;
      cell.overlay.classList.remove('hidden');
      cell.el.classList.add('is-owned');
    }
  }

  const tokens = gameState.tokens || {};
  if (tokensChanged(prevTok, tokens)) {
    prevTok = {};
    for (const [spaceId, tok] of Object.entries(tokens)) {
      prevTok[spaceId] = { small: tok.small, big: tok.big };
    }

    for (const cell of cells) {
      if (!cell) continue;
      const tok = tokens[cell.id];
      if (!tok) {
        if (cell.dots.firstChild) cell.dots.replaceChildren();
        continue;
      }
      const frag = document.createDocumentFragment();
      if (tok.big) {
        frag.appendChild(makeEl('div', 'dot-big'));
      } else {
        for (let i = 0; i < tok.small; i++) frag.appendChild(makeEl('div', 'dot-small'));
      }
      cell.dots.replaceChildren(frag);
    }
  }

  const field20Mode = gameState.config?.field20Mode ?? 'parking';
  const field20El = dom.board?.querySelector(`.space[data-id="20"]`);
  if (field20El) {
    const iconEl = field20El.querySelector('.corner-icon');
    const nameEl = field20El.querySelector('.corner-name');
    if (iconEl) iconEl.textContent = field20Mode === 'airport' ? '✈️' : '🅿️';
    if (nameEl) nameEl.textContent = field20Mode === 'airport' ? 'Letiště' : 'Parkoviště';
  }

  const pa = gameState.pendingAction;
  const inAirportSelect = pa?.type === 'airport_select_target' && pa?.targetId === state.myId;
  const me = gameState.players?.find(p => p.id === state.myId);
  const myPos = me?.position;

  // Výběr cíle letiště je vzácný stav. Bez téhle brány se čtyřicet políček
  // přebarvovalo při každém stavu, i když žádný výběr neběžel.
  if (inAirportSelect || prevAirportSelect) {
    prevAirportSelect = inAirportSelect;
    for (const cell of cells) {
      if (!cell) continue;
      cell.el.classList.toggle('airport-selectable', inAirportSelect);
      cell.el.classList.toggle('is-self', inAirportSelect && cell.id === myPos);
    }
  }
}

