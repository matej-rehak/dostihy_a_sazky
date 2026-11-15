import { makeEl, fmt, safeColor, hexToRgb } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { showTip, moveTip } from './tooltip.js';
import { showSpaceInspect } from './spaceInspect.js';
import { ownershipsChanged, tokensChanged } from './renderGate.mjs';
import { cornerArt } from './cornerArt.mjs';
import { previewSpaceId } from './rollPreview.mjs';
import { tileAmount, tileSuffix, tileShowsRent } from './rentView.mjs';
import { inflationRaised } from '../animations/inflationTickGate.mjs';
import { stateInflationFactor } from './inflation.mjs';
import { tickNumber } from '../animations/inflationTick.js';

// Odkazy na prvky políček, postavené jednou při stavbě plánu. Dřív se při
// každém `game:state` pětkrát skenoval celý dokument přes querySelectorAll
// a pak ještě čtyřicetkrát volalo getElementById — a stavy chodí až 20×/s.
let cells = null;

// Poslední vykreslený stav, aby se přeskočila práce, když se nic nezměnilo.
let prevOwn = null;
let prevTok = null;
let prevTurnSpace = null;
let prevPreviewSpace = null;
let prevAirportSelect = false;

// Inflace: poslední známá úroveň a běžící „počítadla" cen (spaceId → zrušení).
let prevInflation = null;
const priceTicks = new Map();

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
      price: el.querySelector('.space-price'),
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
  prevPreviewSpace = null;
  prevAirportSelect = false;
  prevInflation = null;
  priceTicks.forEach(cancel => cancel());
  priceTicks.clear();
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

// Obrázkové ikony mají přednost před emoji z TYPE_ICONS.
const TYPE_IMAGES  = { finance: 'img/finance.png', nahoda: 'img/nahoda.png', tax: 'img/veterinar.png' };
const TYPE_ICONS   = { finance: '💱', nahoda: '❓', tax: '🩺', go_to_jail: '🚔', free_parking: '🅿️', service: '👤', start: '🚩' };
const SERVICE_IMAGES = { trener: 'img/trener.png', preprava: 'img/preprava.png', staje: 'img/staje.png' };
const SERVICE_ICONS = {
  trener: '👤',
  preprava: '🚚',
  staje: '🐴',
};

// Ikonka rohu: obrázek, pokud existuje, jinak emoji. Vrací element, který se vkládá na začátek rohu.
function makeCornerIcon(art) {
  return art.img ? makeIconImg(art.img) : makeEl('div', 'corner-icon', art.icon);
}

// Pole 20 a 30 mění podobu podle režimu; překreslí se jen při změně
function syncCorner(el, art) {
  if (el.dataset.art === art.name) return;
  el.dataset.art = art.name;
  el.querySelector('.space-icon-img, .corner-icon')?.replaceWith(makeCornerIcon(art));
  const nameEl = el.querySelector('.corner-name');
  if (nameEl) nameEl.textContent = art.name;
}

// Žeton dostihu na políčku koně (public/img/{name}.png)
function makeTokenImg(name, cls) {
  const img = makeEl('img', cls);
  img.src = `img/${name}.png`;
  img.alt = '';
  img.draggable = false;
  return img;
}

function makeIconImg(src) {
  const img = makeEl('img', 'space-icon-img');
  img.src = src;
  img.alt = '';
  img.draggable = false;
  return img;
}

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
      const art = cornerArt(space.id);
      el.dataset.art = art.name;
      el.appendChild(makeCornerIcon(art));
      el.appendChild(makeEl('div', 'corner-name', space.id === 0 ? space.name : art.name));
      if (space.id === 10) el.appendChild(makeEl('div', 'corner-sub', ''));
    } else {
      const inner = makeEl('div', 'space-inner');
      const icon  = space.type === 'service'
        ? (SERVICE_ICONS[space.serviceType] ?? TYPE_ICONS.service)
        : (TYPE_ICONS[space.type] ?? '');
      const iconSrc = space.type === 'service'
        ? SERVICE_IMAGES[space.serviceType]
        : TYPE_IMAGES[space.type];
      if (iconSrc) inner.appendChild(makeIconImg(iconSrc));
      else if (icon) inner.appendChild(makeEl('div', 'space-icon', icon));
      // Dlouhé názvy („Veterinární vyšetření", „Portlancl") dostanou na mobilu
      // menší písmo, aby se nelámaly uprostřed slova.
      const longName = space.name.length >= 12 || space.name.split(' ').some(w => w.length >= 8);
      inner.appendChild(makeEl('div', longName ? 'space-name space-name-long' : 'space-name', space.name));
      const amount = space.price || space.amount;   // amount = poplatek Veterináře
      if (amount) inner.appendChild(makeEl('div', 'space-price', `${fmt(amount)} Kč`));
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

/** Zařízení bez myši (telefon, tablet) — hover tam nedává smysl. */
const isTouchOnly = () => window.matchMedia?.('(hover: none)').matches === true;
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
    // Na dotykovém displeji by tooltip vyskočil po ťuknutí spolu s detailem
    // políčka — detail stačí.
    if (isTouchOnly()) return;
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
    // Balíček uprostřed plánu ukáže stejný přehled karet jako pole Finance / Náhoda
    const deck = ev.target.closest?.('.bc-deck');
    if (deck) {
      const type = deck.classList.contains('finance') ? 'finance' : 'nahoda';
      const deckSpace = boardSpaces?.find(s => s.type === type);
      if (deckSpace) showSpaceInspect(deckSpace, state.gameState);
      return;
    }

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
      // Jinak detail pole: koně, služby a balíčky karet (co v nich je)
      if (['horse', 'service', 'finance', 'nahoda'].includes(space.type)) {
        showSpaceInspect(space, gs);
      }
    }
  });
}

// ─── Update ───────────────────────────────────────────────────────────────────

function setCellPrice(cell, amount, suffix, inflating) {
  const el = cell.price;
  const shown = Number(el.dataset.amount);
  // už ukazuje (nebo k tomu počítá)
  if (shown === amount && el.dataset.suffix === suffix) return;
  priceTicks.get(cell.id)?.();
  priceTicks.delete(cell.id);
  el.dataset.amount = String(amount);
  el.dataset.suffix = suffix;

  if (!inflating || !Number.isFinite(shown)) {
    el.classList.remove('price-inflating');
    el.textContent = `${fmt(amount)}${suffix}`;
    return;
  }
  el.classList.add('price-inflating');
  priceTicks.set(cell.id, tickNumber(shown, amount, v => { el.textContent = `${fmt(v)}${suffix}`; }, {
    onDone: () => { priceTicks.delete(cell.id); el.classList.remove('price-inflating'); },
  }));
}

export function updateBoard(gameState) {
  const cells = getCells();

  if (prevTurnSpace !== null) cells[prevTurnSpace]?.el.classList.remove('current-turn');
  const currentPlayer = gameState.players.find(p => p.id === gameState.currentTurnId);
  prevTurnSpace = currentPlayer ? currentPlayer.position : null;
  if (prevTurnSpace !== null) cells[prevTurnSpace]?.el.classList.add('current-turn');

  // Karta „Opakovaný hod": pole, kam by hráč s aktuálním hodem došel
  if (prevPreviewSpace !== null) cells[prevPreviewSpace]?.el.classList.remove('roll-preview');
  prevPreviewSpace = previewSpaceId(gameState.pendingAction);
  if (prevPreviewSpace !== null) cells[prevPreviewSpace]?.el.classList.add('roll-preview');

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
        frag.appendChild(makeTokenImg('hlavni-dostih', 'tok-big'));
      } else {
        for (let i = 0; i < tok.small; i++) frag.appendChild(makeTokenImg('dostih', 'tok-small'));
      }
      cell.dots.replaceChildren(frag);
    }
  }

  // Koupený kůň i služba ukazují místo nákupní ceny aktuální nájem (u Přepravy
  // a Stájí násobek hodu), Veterinář svůj poplatek. Vše po inflaci z Rulety — stejně jako to, co
  // server strhne (rentView.mjs tileAmount).
  // Když právě padla Inflace, ceny se neprohodí naráz, ale protočí se jako
  // počítadlo (inflationTick.js) — hráč vidí, že všechno zdražilo.
  const board = state.boardData;
  const factor = stateInflationFactor(gameState);
  const inflating = inflationRaised(prevInflation, factor);
  prevInflation = factor;
  if (board) {
    for (const cell of cells) {
      if (!cell?.price) continue;
      const amount = tileAmount(board, gameState, cell.id);
      if (amount === null) continue;
      cell.price.classList.toggle('is-rent', tileShowsRent(board, gameState, cell.id));
      setCellPrice(cell, amount, tileSuffix(board, gameState, cell.id), inflating);
    }
  }

  for (const id of [20, 30]) {
    const el = dom.board?.querySelector(`.space[data-id="${id}"]`);
    if (el) syncCorner(el, cornerArt(id, gameState.config));
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

