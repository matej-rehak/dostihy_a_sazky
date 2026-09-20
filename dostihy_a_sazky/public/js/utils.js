import { isEffectEnabled } from './settings.js';
export const fmt = n => Number(n).toLocaleString('cs-CZ');

export const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');

export const isSafeColor = v =>
  typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim());

export const safeColor = (v, fallback = '#888888') =>
  isSafeColor(v) ? v.trim() : fallback;

export { prefersReducedMotion } from './reducedMotion.mjs';

export function getEl(id) {
  const el = document.getElementById(id);
  if (!el) console.warn(`[client] Element #${id} nenalezen`);
  return el;
}

export function makeEl(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
let _toastTimer;
export function showToast(msg, err = false) {
  const t = document.getElementById('toast');
  if (!t) return;
  // Chybové hlášky projdou vždy — bez nich by hra mlčky ignorovala kliknutí.
  // Vypínatelné jsou jen ty informativní.
  if (!err && !isEffectEnabled('toasts')) return;
  t.textContent = msg;
  t.className = `toast${err ? ' err' : ''}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

// ─── Pomocné funkce pro 3D stínování figurek a prvků ──────────────────────────
export function hexToRgb(hex) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 128, g: 128, b: 128 };
}

export function rgbToHex(r, g, b) {
  return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

export function adjustColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const adjust = (val) => Math.max(0, Math.min(255, Math.round(val + (percent * 255))));
  return rgbToHex(adjust(r), adjust(g), adjust(b));
}

export const lightenColor = (hex, amount) => adjustColor(hex, amount);
export const darkenColor = (hex, amount) => adjustColor(hex, -amount);
