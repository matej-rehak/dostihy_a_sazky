import { makeEl } from '../utils.js';
import { state } from '../state.js';

export function generateParticles() {
  const container = document.getElementById('particles-container');
  if (!container) return;
  if (state.particleIntervalId) clearInterval(state.particleIntervalId);

  state.particleIntervalId = setInterval(() => {
    if (document.hidden) return;
    const p = makeEl('div', 'particle');
    const size = Math.random() * 4 + 2;
    p.style.cssText = `width:${size}px;height:${size}px;left:${Math.random() * 100}%;top:${Math.random() * 100}%`;
    container.appendChild(p);
    setTimeout(() => { if (p.parentNode) p.remove(); }, 3000);
  }, 250);
}

export function spawnFloatingText(spaceId, text, color) {
  const space = document.querySelector(`#board .space[data-id="${spaceId}"]`);
  if (!space) return;
  const rect = space.getBoundingClientRect();
  const el = makeEl('div', 'floating-text', text);
  el.style.cssText = `left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px;color:${color}`;
  document.body.appendChild(el);
  setTimeout(() => { if (el.parentNode) el.remove(); }, 1200);
}
