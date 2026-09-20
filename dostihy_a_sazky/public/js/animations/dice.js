import {
  SPIN_MS,
  LAND_MS,
  SIX_ANIM_MS,
  shouldStartRollAnimation,
  shouldTriggerSixAnimation,
  shouldClearRollVisuals,
} from './diceAnimationGate.mjs';
import { isEffectEnabled } from '../settings.js';

let prevDiceId = null;

// Pořadí právě běžícího hodu. Po šestce se hází znovu, takže odložená práce
// předchozího hodu se musí poznat a vzdát se — proto si každá zapamatuje
// svoje `seq` a před sáhnutím na DOM ho porovná s tímhle.
let currentSeq = 0;

// Odložená práce aktuálního hodu, aby ji nový hod uměl zrušit.
let pending = { timer: null, fallback: null, cleanup: null, onLanded: null, burst: null };

const ROT_MAP = { 1: [0, 0], 2: [90, 0], 3: [0, -90], 4: [0, 90], 5: [-90, 0], 6: [0, -180] };

/** Zruší vše, co po sobě nechal předchozí hod, a uklidí jeho vizuál. */
function cancelPending(diceEl) {
  clearTimeout(pending.timer);
  clearTimeout(pending.fallback);
  clearTimeout(pending.cleanup);
  if (pending.onLanded && diceEl) {
    diceEl.removeEventListener('transitionend', pending.onLanded);
  }
  pending.burst?.remove();
  diceEl?.classList.remove('dice-six-hit');
  document.getElementById('dice-scene')?.classList.remove('dice-six-hit');
  pending = { timer: null, fallback: null, cleanup: null, onLanded: null, burst: null };
}

function triggerSixAnimation(diceEl, seq) {
  const scene = document.getElementById('dice-scene');
  if (!scene) return;

  // Pulz je na kostce (světlo), poskočení na scéně (transform) — kdyby scale
  // seděl na kostce, přebil by její inline rotaci a hodnota by zmizela.
  diceEl.classList.remove('dice-six-hit');
  scene.classList.remove('dice-six-hit');
  void diceEl.offsetWidth;
  diceEl.classList.add('dice-six-hit');
  scene.classList.add('dice-six-hit');

  const burst = document.createElement('div');
  burst.className = 'dice-six-burst';
  for (let i = 0; i < 10; i++) {
    const spark = document.createElement('span');
    spark.className = 'dice-six-spark';
    spark.style.setProperty('--a', `${i * 36}deg`);
    burst.appendChild(spark);
  }
  scene.appendChild(burst);
  pending.burst = burst;

  pending.cleanup = setTimeout(() => {
    burst.remove();
    // Úklid staršího hodu nesmí shodit pulz toho aktuálního.
    if (shouldClearRollVisuals(seq, currentSeq)) {
      diceEl.classList.remove('dice-six-hit');
      scene.classList.remove('dice-six-hit');
      pending.burst = null;
    }
  }, SIX_ANIM_MS);
}

export function updateDice(lastDice) {
  if (!shouldStartRollAnimation(lastDice, prevDiceId)) return;
  prevDiceId = lastDice.id;

  const diceEl = document.getElementById('dice-3d');
  if (!diceEl) return;

  cancelPending(diceEl);
  const seq = ++currentSeq;

  diceEl.classList.add('rolling');
  diceEl.style.transition = 'none';

  pending.timer = setTimeout(() => {
    if (!shouldClearRollVisuals(seq, currentSeq)) return;

    diceEl.classList.remove('rolling');
    const [rx, ry] = ROT_MAP[lastDice.value] ?? [0, 0];
    const fRx = rx + (Math.random() * 20 - 10);
    const fRy = ry + (Math.random() * 20 - 10);
    diceEl.style.transform = `rotateX(${fRx - 360}deg) rotateY(${fRy - 360}deg)`;
    void diceEl.offsetWidth;
    diceEl.style.transition = `transform ${LAND_MS}ms cubic-bezier(0.175, 0.885, 0.32, 1.275)`;
    diceEl.style.transform = `rotateX(${fRx}deg) rotateY(${fRy}deg)`;

    if (lastDice.value !== 6) return;

    let done = false;
    const onLanded = evt => {
      if (done) return;
      if (evt && evt.propertyName !== 'transform') return;
      done = true;
      diceEl.removeEventListener('transitionend', onLanded);
      clearTimeout(pending.fallback);
      pending.fallback = null;
      pending.onLanded = null;
      // Mezitím mohl začít další hod — pak oslava nepatří jemu.
      if (shouldTriggerSixAnimation(lastDice.value, seq, currentSeq) && isEffectEnabled('sixSparks')) {
        triggerSixAnimation(diceEl, seq);
      }
    };
    pending.onLanded = onLanded;
    diceEl.addEventListener('transitionend', onLanded);
    pending.fallback = setTimeout(() => onLanded(), LAND_MS + 100);
  }, SPIN_MS);
}
