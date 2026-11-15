import { makeEl, prefersReducedMotion, uiIcon, imgIcon } from '../utils.js';
import { isEffectEnabled } from '../settings.js';
import { state } from '../state.js';

const MAX_PARTICLES = 30;

export function generateParticles() {
  const container = document.getElementById('particles-container');
  if (!container) return;
  if (state.particleIntervalId) clearInterval(state.particleIntervalId);

  // Redukovaný pohyb nebo vypnuté v nastavení: částice vůbec negenerujeme.
  if (prefersReducedMotion() || !isEffectEnabled('particles')) {
    state.particleIntervalId = null;
    return;
  }

  let activeParticles = 0;

  state.particleIntervalId = setInterval(() => {
    if (document.hidden || activeParticles >= MAX_PARTICLES) return;
    activeParticles++;
    const p = makeEl('div', 'particle');
    const size = Math.random() * 4 + 2;
    p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%`;
    container.appendChild(p);
    setTimeout(() => { if (p.parentNode) p.remove(); activeParticles--; }, 3000);
  }, 250);
}

// icon: volitelná ikonka před textem
export function spawnFloatingText(spaceId, text, color, icon = null) {
  const space = document.querySelector(`#board .space[data-id="${spaceId}"]`);
  if (!space) return;
  const rect = space.getBoundingClientRect();
  spawnFloatingTextAt(rect.left + rect.width / 2, rect.top + rect.height / 2, text, color, icon);
}

/** Plovoucí text na bodu obrazovky (3D plán nemá políčka v DOM). */
export function spawnFloatingTextAt(x, y, text, color, icon = null) {
  const el = makeEl('div', 'floating-text', text);
  // icon: jméno ikonky UI (img/ui/) nebo cesta k obrázku (obsahuje '/')
  if (icon) el.prepend(icon.includes('/') ? imgIcon(icon, true) : uiIcon(icon, true));
  el.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 1200);
}
