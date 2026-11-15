import { makeEl, fmt, uiIcon } from '../utils.js';
import { state } from '../state.js';
import { socket } from '../socket.js';

// ─── Sázka na vlastní hod ─────────────────────────────────────────────────────
// Tlačítko „Sázka na hod" v panelu „Váš tah" otevře modální okno: hráč vybere
// číslo a vklad a tlačítkem „Hodit kostkou" rovnou hodí — sázka jde spolu
// s hodem (`game:roll` s `{ bet }`). Zavřením okna se sázka zahodí; běžný hod
// (tlačítko v panelu, klik na kostku) je vždy bez sázky.
// Server sázku ověří znovu (src/mixins/diceBet.js).

/** Nejmenší vklad a krok vkladu — zrcadlo DICE_BET_MIN_STAKE ze src/constants.js. */
export const DICE_BET_MIN_STAKE = 100;

let pickedNumber = null;
let stake = 500;

const el = id => document.getElementById(id);

/** Nejvyšší vklad, na který hráč teď má (limit z nastavení a jeho hotovost). */
export function maxStake(gameState, me) {
  const limit = gameState?.config?.diceBetMaxStake ?? 5000;
  const cash = Math.max(0, Math.floor((me?.balance ?? 0) / DICE_BET_MIN_STAKE) * DICE_BET_MIN_STAKE);
  return Math.min(limit, cash);
}

/** Smí hráč teď sázet? Jen před běžným hodem na svém tahu a se zapnutým pravidlem. */
export function canBetNow(gameState) {
  const pa = gameState?.pendingAction;
  return !!gameState?.config?.diceBetEnabled && pa?.type === 'wait_roll' && pa.targetId === state.myId;
}

const me = gameState => gameState?.players?.find(p => p.id === state.myId);

export function openDiceBet(gameState) {
  pickedNumber = null;
  el('dicebet-overlay')?.classList.remove('hidden');
  const closeBtn = el('dicebet-close-btn');
  if (closeBtn) closeBtn.onclick = closeDiceBet;
  renderDiceBet(gameState);
}

export function closeDiceBet() {
  pickedNumber = null;
  el('dicebet-overlay')?.classList.add('hidden');
}

/** Volá se při každém stavu hry: otevřené okno obnoví, nebo ho zavře. */
export function syncDiceBet(gameState) {
  const overlay = el('dicebet-overlay');
  if (!overlay || overlay.classList.contains('hidden')) return;
  if (!canBetNow(gameState)) { closeDiceBet(); return; }
  renderDiceBet(gameState);
}

function renderDiceBet(gameState) {
  const content = el('dicebet-content');
  if (!content) return;
  const cfg = gameState.config || {};
  const mult = cfg.diceBetMultiplier ?? 5;
  const max = maxStake(gameState, me(gameState));
  const rerender = () => renderDiceBet(gameState);
  content.innerHTML = '';

  const intro = makeEl('div', 'dice-bet-intro');
  intro.appendChild(makeEl('div', 'dice-bet-mult', `Trefa = ${mult}× vklad`));
  intro.appendChild(makeEl('div', 'dim', `Tipni číslo, které ti padne. Když se trefíš, dostaneš ${mult}× vklad, jinak o vklad přijdeš.`));
  content.appendChild(intro);

  if (max < DICE_BET_MIN_STAKE) {
    content.appendChild(makeEl('div', 'trade-empty-msg', `Na sázku potřebuješ aspoň ${fmt(DICE_BET_MIN_STAKE)} Kč.`));
    content.appendChild(footer(gameState, null));
    return;
  }

  content.appendChild(makeEl('div', 'dice-bet-label', 'Na jaké číslo sázíš?'));
  const numbers = makeEl('div', 'dice-bet-numbers');
  for (let n = 1; n <= 6; n++) {
    const btn = makeEl('button', `dice-bet-num${pickedNumber === n ? ' selected' : ''}`, String(n));
    btn.type = 'button';
    btn.setAttribute('aria-pressed', String(pickedNumber === n));
    btn.onclick = () => { pickedNumber = pickedNumber === n ? null : n; rerender(); };
    numbers.appendChild(btn);
  }
  content.appendChild(numbers);

  stake = Math.max(DICE_BET_MIN_STAKE, Math.min(stake, max));
  content.appendChild(makeEl('div', 'dice-bet-label', 'Kolik vsadíš?'));
  const row = makeEl('div', 'dice-bet-stake');
  const input = document.createElement('input');
  input.type = 'number';
  input.className = 'text-input';
  input.min = String(DICE_BET_MIN_STAKE);
  input.max = String(max);
  input.step = String(DICE_BET_MIN_STAKE);
  input.value = String(stake);
  input.addEventListener('change', () => {
    const v = Math.round((Number(input.value) || 0) / DICE_BET_MIN_STAKE) * DICE_BET_MIN_STAKE;
    stake = Math.max(DICE_BET_MIN_STAKE, Math.min(max, v));
    rerender();
  });
  row.appendChild(input);
  row.appendChild(makeEl('span', 'dim', 'Kč'));
  // Rychlé volby vkladu
  const quick = [...new Set([500, 1000, 2000, max].filter(v => v >= DICE_BET_MIN_STAKE && v <= max))];
  quick.forEach(v => {
    const chip = makeEl('button', `dice-bet-chip${v === stake ? ' selected' : ''}`, v === max ? 'MAX' : fmt(v));
    chip.type = 'button';
    chip.onclick = () => { stake = v; rerender(); };
    row.appendChild(chip);
  });
  content.appendChild(row);
  content.appendChild(makeEl('div', 'dim dice-bet-limit', `Nejvyšší vklad: ${fmt(max)} Kč`));

  const summary = makeEl('div', `dice-bet-summary${pickedNumber == null ? '' : ' ready'}`);
  summary.textContent = pickedNumber == null
    ? 'Vyber číslo, na které sázíš.'
    : `Vsadíš ${fmt(stake)} Kč na ${pickedNumber}. Padne-li ${pickedNumber}, dostaneš ${fmt(stake * mult)} Kč.`;
  content.appendChild(summary);

  content.appendChild(footer(gameState, pickedNumber == null ? null : { number: pickedNumber, stake }));
}

function footer(gameState, bet) {
  const f = makeEl('div', 'dice-bet-footer');
  const cancel = makeEl('button', 'btn btn-outline', 'Zrušit');
  cancel.onclick = closeDiceBet;
  f.appendChild(cancel);

  const roll = makeEl('button', 'btn btn-gold btn-lg');
  roll.prepend(uiIcon('kostka', true));
  roll.appendChild(document.createTextNode('Hodit kostkou'));
  roll.disabled = !bet;
  roll.onclick = () => {
    if (!bet || !canBetNow(gameState)) return;
    socket.emit('game:roll', { bet });
    closeDiceBet();
  };
  f.appendChild(roll);
  return f;
}
