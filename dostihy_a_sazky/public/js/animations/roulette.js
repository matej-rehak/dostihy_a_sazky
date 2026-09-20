import { isEffectEnabled } from '../settings.js';
import { prefersReducedMotion } from '../utils.js';
import { SPIN_MS, segmentAngle, targetRotation } from './rouletteAnimationGate.mjs';

// Délka prolnutí overlaye. Musí odpovídat `transition: opacity 200ms` na
// .roulette-overlay v public/style.css — o ni se opírá zavírací prodleva
// po potvrzení výsledku.
const FADE_MS = 200;

let hideTimer = null;

// Každé zatočení má na serveru vlastní `spinId`. Po reconnectu dorazí stejný
// `roulette_ack` znovu — bez téhle paměti by se kolo roztočilo podruhé.
let lastSpinId = null;

/**
 * Sestaví výplň kola ze dvou tokenových barev. Devět barevných výsečí by
 * rozbilo paletu hry, takže se jen střídají dvě plochy a semantiku nese
 * až jméno výsledku pod kolem.
 */
function paintWheel(wheelEl, count) {
  const step = segmentAngle(count);
  const stops = [];
  for (let i = 0; i < count; i++) {
    const color = i % 2 === 0 ? 'var(--bg-card2)' : 'var(--bg-card)';
    stops.push(`${color} ${i * step}deg ${(i + 1) * step}deg`);
  }
  wheelEl.style.background = `conic-gradient(${stops.join(', ')})`;
}

export function showRouletteOverlay(result, outcomes, isTargeted, onConfirm) {
  const overlay = document.getElementById('roulette-overlay');
  const wheel   = document.getElementById('roulette-wheel');
  const iconEl  = document.getElementById('roulette-result-icon');
  const nameEl  = document.getElementById('roulette-result-name');
  const textEl  = document.getElementById('roulette-result-text');
  const btn     = document.getElementById('roulette-btn');
  if (!overlay || !wheel) return;

  // Už jsme tenhle výsledek animovali → ukaž rovnou dojeté kolo.
  const alreadySeen = lastSpinId === result.spinId;
  lastSpinId = result.spinId;

  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

  // Pozici výseče určuje server (`result.index`) — klient ji nedohledává.
  // Když seznam výsečí ještě nedorazil, kolo se vykreslí prázdné; výsledek
  // se čte z `result`, takže hra funguje i tak.
  const count = outcomes.length || 9;
  const index = Number.isInteger(result.index) ? result.index : 0;
  const spin = isEffectEnabled('rouletteSpin') && !prefersReducedMotion() && !alreadySeen;

  overlay.classList.remove('hidden');
  paintWheel(wheel, count);
  wheel.classList.toggle('no-spin', !spin);

  // Výsledek je hned k dispozici; jen ho při točení odhalíme až po dojetí.
  const reveal = () => {
    if (iconEl) iconEl.textContent = result.icon;
    if (nameEl) nameEl.textContent = result.name;
    if (textEl) textEl.textContent = result.text;
    if (btn) btn.classList.toggle('hidden', !isTargeted);
  };

  if (iconEl) iconEl.textContent = '';
  if (nameEl) nameEl.textContent = '';
  if (textEl) textEl.textContent = '';
  if (btn) btn.classList.add('hidden');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      wheel.style.transform = `rotate(${targetRotation(index, count)}deg)`;
    });
  });

  if (spin) {
    hideTimer = setTimeout(reveal, SPIN_MS);
  } else {
    reveal();
  }

  if (isTargeted && btn) {
    btn.onclick = () => {
      overlay.classList.remove('is-open');
      setTimeout(() => {
        overlay.classList.add('hidden');
        // Rotaci vynuluj bez přechodu, jinak se příští kolo rozjede pozpátku.
        wheel.classList.add('no-spin');
        wheel.style.transform = 'rotate(0deg)';
        onConfirm();
      }, FADE_MS);
    };
  }
}

export function hideRouletteOverlay() {
  const overlay = document.getElementById('roulette-overlay');
  if (overlay) overlay.classList.add('hidden');
}

/**
 * Vynuluje paměť odanimovaných zatočení — volá se při návratu do lobby.
 * Zruší i rozplánované odhalení výsledku: bez toho by hráč, který odejde
 * uprostřed točení (3,2s okno), dostal `reveal()` o pár sekund později do
 * DOM patřícího už jiné obrazovce.
 */
export function resetRouletteCache() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  lastSpinId = null;
}
