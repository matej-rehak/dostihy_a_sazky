import { safeColor } from '../utils.js';
import { spawnFloatingText } from './particles.js';
import { isEffectEnabled } from '../settings.js';

// ─── 3D karta overlay ─────────────────────────────────────────────────────────

// Délka prolnutí overlaye. Musí odpovídat `transition: opacity` na
// .card-3d-overlay — o ni se opírá čekání při zavírání karty.
const FADE_MS = 200;

let hideTimer = null;

// Počká na doběhnutí konkrétní CSS transition, s časovým fallbackem.
function onTransitionEnd(el, propertyName, timeoutMs, done) {
  let finished = false;
  const finish = evt => {
    if (finished) return;
    if (evt && evt.propertyName !== propertyName) return;
    finished = true;
    el.removeEventListener('transitionend', finish);
    clearTimeout(timer);
    done();
  };
  const timer = setTimeout(finish, timeoutMs + 60);
  el.addEventListener('transitionend', finish);
}

export function showCardOverlay(label, text, isTargeted, onConfirm) {
  const overlay  = document.getElementById('card-3d-overlay');
  const cardEl   = document.getElementById('card-3d');
  const titleEl  = document.getElementById('card-3d-title');
  const textEl   = document.getElementById('card-3d-text');
  const btn      = document.getElementById('card-3d-btn');
  if (!overlay || !cardEl) return;

  // Zruš rozplánované skrytí předchozí karty, jinak by schovalo tuhle.
  if (hideTimer) {
    clearTimeout(hideTimer);
    hideTimer = null;
  }

  overlay.classList.remove('hidden');
  if (titleEl) titleEl.textContent = label;
  if (textEl)  textEl.textContent  = text;
  if (btn) btn.classList.toggle('hidden', !isTargeted);

  // Vypnutá otočka: karta se ukáže rovnou lícem, prolnutí overlaye zůstává.
  const flip = isEffectEnabled('cardFlip');
  cardEl.classList.toggle('no-flip', !flip);

  // Dva snímky: první nechá prohlížeč aplikovat výchozí stav, druhý spustí přechod.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      cardEl.classList.add('flipped');
    });
  });

  if (isTargeted && btn) {
    btn.onclick = () => {
      cardEl.classList.remove('flipped');
      overlay.classList.remove('is-open');
      // Odchod řídí prolnutí overlaye, ne otočka karty — ta už je pod ním neviditelná.
      onTransitionEnd(overlay, 'opacity', FADE_MS, () => {
        overlay.classList.add('hidden');
        onConfirm();
      });
    };
  }
}

export function hideCardOverlay() {
  const overlay = document.getElementById('card-3d-overlay');
  const cardEl  = document.getElementById('card-3d');
  if (!overlay) return;
  if (overlay.classList.contains('hidden')) return;

  overlay.classList.remove('is-open');
  hideTimer = setTimeout(() => {
    hideTimer = null;
    overlay.classList.add('hidden');
    cardEl?.classList.remove('flipped');   // reset stavu — bez toho se další karta neotočí
  }, FADE_MS);
}

// ─── Nákupní a token animace ──────────────────────────────────────────────────

export function playBuyAnimation(spaceId, owner) {
  const color = safeColor(owner.color);
  spawnFloatingText(spaceId, 'VLASTNÍK!', color);
  const spaceEl = document.querySelector(`#board .space[data-id="${spaceId}"]`);
  if (spaceEl) {
    spaceEl.classList.add('flash-buy');
    spaceEl.style.boxShadow = `inset 0 0 40px ${color}`;
    setTimeout(() => { spaceEl.classList.remove('flash-buy'); spaceEl.style.boxShadow = ''; }, 1000);
  }
}

export function playTokenAnimation(spaceId, isBig) {
  spawnFloatingText(spaceId, isBig ? '👑 HLAVNÍ DOSTIH' : '➕ ŽETON', 'var(--gold)');
}
