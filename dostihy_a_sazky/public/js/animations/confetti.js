import { prefersReducedMotion } from '../utils.js';
import {
  CONFETTI_MS, makeConfetti, stepConfetti, confettiOpacity,
} from './confettiGate.mjs';

// Jeden canvas přes celou obrazovku. Když přijde další výstřel ještě během
// letu (dvě stáje za sebou), papírky se přidají do téže smyčky.
let canvas = null;
let pieces = [];
let startedAt = 0;
let lastTs = 0;
let rafId = null;

function stop() {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  pieces = [];
  canvas?.remove();
  canvas = null;
}

function frame(ts) {
  if (!canvas) return;
  const elapsed = ts - startedAt;
  if (elapsed >= CONFETTI_MS) { stop(); return; }

  // Po skrytí záložky může přijít obří skok — fyzika by papírky odstřelila.
  const dt = Math.min(0.05, (ts - lastTs) / 1000);
  lastTs = ts;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.globalAlpha = confettiOpacity(elapsed);

  for (const p of pieces) {
    stepConfetti(p, dt);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    // Stlačení podle rotace dělá z plochého papírku „mávající" lísteček.
    ctx.scale(1, Math.abs(Math.cos(p.wobble)) * 0.8 + 0.2);
    ctx.fillStyle = p.color;
    if (p.round) {
      ctx.beginPath();
      ctx.arc(0, 0, p.h / 2 + 1, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    }
    ctx.restore();
  }
  rafId = requestAnimationFrame(frame);
}

/**
 * Vystřelí konfety přes celou obrazovku. Nad okny hry, ale kliknutí
 * propouští — nic neblokuje.
 *
 * @param {string[]} colors paleta papírků
 */
export function playConfetti(colors) {
  if (prefersReducedMotion()) return;

  const width = window.innerWidth;
  const height = window.innerHeight;
  const now = performance.now();

  if (!canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas = document.createElement('canvas');
    canvas.className = 'confetti-canvas';
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    document.body.appendChild(canvas);
    lastTs = now;
    rafId = requestAnimationFrame(frame);
  }
  startedAt = now;
  pieces = pieces.concat(makeConfetti({ width, height, colors }));
}
