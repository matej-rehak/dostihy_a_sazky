import { safeColor } from '../utils.js';
import { spawnFloatingText } from './particles.js';

// ─── 3D karta overlay ─────────────────────────────────────────────────────────

export function showCardOverlay(label, text, isTargeted, onConfirm) {
  const overlay  = document.getElementById('card-3d-overlay');
  const cardEl   = document.getElementById('card-3d');
  const titleEl  = document.getElementById('card-3d-title');
  const textEl   = document.getElementById('card-3d-text');
  const btn      = document.getElementById('card-3d-btn');
  if (!overlay || !cardEl) return;

  overlay.classList.remove('hidden');
  if (titleEl) titleEl.textContent = label;
  if (textEl)  textEl.textContent  = text;
  if (btn) btn.classList.toggle('hidden', !isTargeted);

  if (!cardEl.classList.contains('flipped')) {
    setTimeout(() => cardEl.classList.add('flipped'), 100);
  }

  if (isTargeted && btn) {
    btn.onclick = () => {
      cardEl.classList.remove('flipped');
      setTimeout(() => {
        overlay.classList.add('hidden');
        onConfirm();
      }, 400);
    };
  }
}

export function hideCardOverlay() {
  document.getElementById('card-3d-overlay')?.classList.add('hidden');
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
