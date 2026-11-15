// Banner „Toto kolo stojíš" — ukáže se jen hráči, kterého server právě
// přeskočil (zdržení z karty / doping). Texty: ui/playerStatusView.mjs.

import { makeEl } from '../utils.js';
import { audioManager } from '../audio.js';
import { skipBanner } from './playerStatusView.mjs';

const SHOW_MS = 2500;

let lastShownId = null;
let hideTimer = null;

export function updateSkipBanner(gameState, myId) {
  const b = skipBanner(gameState, myId, lastShownId);
  if (!b) return;
  lastShownId = b.id;
  show(b);
  audioManager.play('skip_turn');
}

export function resetSkipBanner() {
  lastShownId = null;
  hide();
}

function show(b) {
  hide();
  const overlay = makeEl('div', `skip-banner-overlay st-${b.kind}`);
  overlay.id = 'skip-banner';
  overlay.setAttribute('role', 'status');
  overlay.setAttribute('aria-live', 'assertive');

  const card = makeEl('div', 'skip-banner');
  card.appendChild(makeEl('div', 'skip-banner-icon', b.icon));
  card.appendChild(makeEl('div', 'skip-banner-title', b.title));
  card.appendChild(makeEl('div', 'skip-banner-text', b.text));
  const bar = makeEl('div', 'skip-banner-bar');
  const fill = makeEl('span');
  fill.style.animationDuration = `${SHOW_MS}ms`;
  bar.appendChild(fill);
  card.appendChild(bar);
  overlay.appendChild(card);

  overlay.addEventListener('click', hide);
  document.body.appendChild(overlay);
  hideTimer = setTimeout(hide, SHOW_MS);
}

function hide() {
  clearTimeout(hideTimer);
  hideTimer = null;
  document.getElementById('skip-banner')?.remove();
}
