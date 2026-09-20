import { makeEl, safeColor, prefersReducedMotion } from '../utils.js';
import { audioManager } from '../audio.js';
import { isEffectEnabled } from '../settings.js';
import {
  TICK_MS,
  TICK_COUNT,
  ticksElapsed,
  isStarterFinished,
  nextFlickerIndex,
} from './starterAnimationGate.mjs';

// Běžící losování. Drží se na úrovni modulu, aby šlo zvenčí zastavit —
// `state.isStarterAnimating` se resetuje i při reconnectu, a bez zrušení
// běhu se rozjelo druhé losování přes první.
let running = null;

/** Zastaví běžící losování a uklidí po něm. */
export function stopStarterAnimation() {
  if (!running) return;
  cancelAnimationFrame(running.frame);
  running = null;
}

export function runStarterAnimation(winnerId, players) {
  const overlay  = document.getElementById('starter-overlay');
  const flicker  = document.getElementById('starter-flicker');
  const winnerEl = document.getElementById('starter-winner');
  if (!overlay || !flicker || !winnerEl) return;

  stopStarterAnimation();

  overlay.classList.remove('hidden');
  winnerEl.classList.add('hidden');
  winnerEl.classList.remove('winning-gold');
  flicker.classList.remove('hidden');

  // Jeden element na celé losování — mění se jen text a barva. Dřív se každý
  // tik zahodil a znovu vytvořil nadpis o velikosti 80 px.
  flicker.innerHTML = '';
  const item = makeEl('div', 'flicker-item');
  flicker.appendChild(item);

  const showPlayer = index => {
    const p = players[index];
    if (!p) return;
    item.textContent = p.name;
    item.style.color = safeColor(p.color);
  };

  let index = 0;
  showPlayer(index);

  const finish = () => {
    running = null;
    audioManager.play('bell', 1.0);

    const winner = players.find(pl => pl.id === winnerId);
    flicker.classList.add('hidden');
    winnerEl.textContent = `🏁 ${winner?.name ?? '?'} ZAČÍNÁ!`;
    winnerEl.style.color = safeColor(winner?.color ?? '#fff');
    winnerEl.classList.remove('hidden');
    winnerEl.classList.add('winning-gold');
    setTimeout(() => overlay.classList.add('hidden'), 2000);
  };

  // Redukovaný pohyb nebo vypnuté losování: protáčet 30 jmen je blikání bez
  // informační hodnoty. Výherce se ukáže rovnou — sdělení zůstane.
  if (prefersReducedMotion() || !isEffectEnabled('starterDraw')) {
    running = null;
    finish();
    return;
  }

  const start = performance.now();
  let shownTicks = 0;

  const frame = now => {
    if (!running) return;

    const ticks = ticksElapsed(now - start, TICK_MS);

    // Zdržený snímek mohl přeskočit víc tiků najednou — dožene se, ale
    // vykreslí se jen poslední stav, ne každý přeskočený mezikrok.
    if (ticks > shownTicks) {
      const steps = ticks - shownTicks;
      for (let i = 0; i < steps; i++) index = nextFlickerIndex(index, players.length);
      shownTicks = ticks;
      showPlayer(index);
      audioManager.play('click', 0.5);
    }

    if (isStarterFinished(shownTicks, TICK_COUNT)) { finish(); return; }
    running.frame = requestAnimationFrame(frame);
  };

  running = { frame: requestAnimationFrame(frame) };
}
