import { makeEl, safeColor } from '../utils.js';
import { state } from '../state.js';
import { dom } from '../dom.js';
import { audioManager } from '../audio.js';
import { getPawnStepDelay, hasPendingPawnAnimation } from './pawnAnimationGate.mjs';

export function renderPawns(gameState) {
  document.querySelectorAll('.space-pawns').forEach(el => { el.innerHTML = ''; });

  gameState.players.forEach(p => {
    if (p.bankrupt) return;
    const pos = state.clientVisualPos[p.id] !== undefined ? state.clientVisualPos[p.id] : p.position;
    const pawnsEl = document.getElementById(`pw-${pos}`);
    if (!pawnsEl) return;

    const color = safeColor(p.color);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 100 150');
    svg.setAttribute('fill', color);
    svg.setAttribute('stroke', 'rgba(0,0,0,0.4)');
    svg.setAttribute('stroke-width', '4');
    svg.style.cssText = 'width:100%;height:100%';

    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '50'); circle.setAttribute('cy', '30'); circle.setAttribute('r', '25');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M30 60 L70 60 L80 140 L20 140 Z');

    const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
    ellipse.setAttribute('cx', '50'); ellipse.setAttribute('cy', '140');
    ellipse.setAttribute('rx', '35'); ellipse.setAttribute('ry', '10');

    svg.appendChild(circle);
    svg.appendChild(path);
    svg.appendChild(ellipse);

    const pawn = makeEl('div', `pawn${p.id === gameState.currentTurnId ? ' is-active' : ''}`);
    pawn.title = p.name;
    pawn.appendChild(svg);
    pawnsEl.appendChild(pawn);
  });
}

export function animatePawnsIfNeeded(gameState, onDone = null) {
  const needsAnim = hasPendingPawnAnimation(gameState.players, state.clientVisualPos);

  if (needsAnim && !state.isAnimatingPawn) {
    state.isAnimatingPawn = true;
    const longestDistance = gameState.players.reduce((max, p) => {
      if (p.bankrupt || state.clientVisualPos[p.id] === p.position) return max;
      const current = state.clientVisualPos[p.id];
      const forward = (p.position - current + 40) % 40;
      const backward = (current - p.position + 40) % 40;
      const distance = p.moveDirection === -1 ? backward : forward;
      return Math.max(max, distance);
    }, 0);
    const stepDelay = getPawnStepDelay(longestDistance);

    const step = () => {
      let stillNeeds = false;
      gameState.players.forEach(p => {
        if (p.bankrupt) return;
        if (state.clientVisualPos[p.id] !== p.position) {
          if (p.moveDirection === -1) {
            state.clientVisualPos[p.id] = (state.clientVisualPos[p.id] - 1 + 40) % 40;
          } else {
            state.clientVisualPos[p.id] = (state.clientVisualPos[p.id] + 1) % 40;
          }
          const spaceEl = dom.board?.querySelector(`.space[data-id="${state.clientVisualPos[p.id]}"]`);
          if (spaceEl) {
            audioManager.play('step');
            spaceEl.style.transform = 'translateY(-4px)';
            setTimeout(() => { if (spaceEl) spaceEl.style.transform = ''; }, 150);
          }
          if (state.clientVisualPos[p.id] !== p.position) stillNeeds = true;
        }
      });
      renderPawns(gameState);
      if (stillNeeds) setTimeout(step, stepDelay);
      else {
        state.isAnimatingPawn = false;
        renderPawns(gameState);
        if (typeof onDone === 'function') onDone();
      }
    };
    step();
    return true;
  } else if (!state.isAnimatingPawn) {
    renderPawns(gameState);
  }
  return state.isAnimatingPawn;
}
