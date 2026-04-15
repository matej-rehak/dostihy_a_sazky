export const fmt = n => Number(n).toLocaleString('cs-CZ');

export const esc = s => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#x27;').replace(/\//g, '&#x2F;');

export const isSafeColor = v =>
  typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v.trim());

export const safeColor = (v, fallback = '#888888') =>
  isSafeColor(v) ? v.trim() : fallback;

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
  t.textContent = msg;
  t.className = `toast${err ? ' err' : ''}`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}
