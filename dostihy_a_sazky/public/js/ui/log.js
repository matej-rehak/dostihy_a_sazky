import { makeEl, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { updateDice } from '../animations/dice.js';

export function updateLog(gameState) {
  if (!dom.logList) return;
  dom.logList.innerHTML = '';
  (gameState.log || []).forEach(msg => {
    dom.logList.appendChild(makeEl('div', 'log-entry', msg));
  });
}

export function updateCenter(gameState) {
  if (dom.bcRound) dom.bcRound.textContent = `Kolo ${gameState.round}`;

  updateDice(gameState.lastDice);

  const current = gameState.players.find(p => p.id === gameState.currentTurnId);
  if (current && dom.bcTurn) {
    dom.bcTurn.textContent = '';
    const span = makeEl('span', '', current.name);
    span.style.cssText = `color:${safeColor(current.color)};font-weight:700`;
    dom.bcTurn.appendChild(span);
  }

}
