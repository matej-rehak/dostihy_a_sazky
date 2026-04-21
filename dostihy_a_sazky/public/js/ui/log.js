import { makeEl, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { updateDice } from '../animations/dice.js';

let timerIntervalId = null;

function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function updateCenterTimer(gameState) {
  if (!dom.bcRound) return;
  if (timerIntervalId) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  const endsAt = Number(gameState.timeLimitEndsAt);
  if (!Number.isFinite(endsAt) || endsAt <= 0 || gameState.phase !== 'playing') return;

  const render = () => {
    const remaining = endsAt - Date.now();
    const timerText = ` | ⏱ ${formatRemaining(remaining)}`;
    const baseRound = `Kolo ${gameState.round}`;
    dom.bcRound.textContent = remaining > 0 ? `${baseRound}${timerText}` : `${baseRound} | ⏱ 00:00`;
  };

  render();
  timerIntervalId = setInterval(render, 1000);
}

export function updateLog(gameState) {
  if (!dom.logList) return;
  dom.logList.innerHTML = '';
  (gameState.log || []).forEach(msg => {
    dom.logList.appendChild(makeEl('div', 'log-entry', msg));
  });
}

export function updateCenter(gameState) {
  if (dom.bcRound) dom.bcRound.textContent = `Kolo ${gameState.round}`;
  updateCenterTimer(gameState);

  updateDice(gameState.lastDice);

  const current = gameState.players.find(p => p.id === gameState.currentTurnId);
  if (current && dom.bcTurn) {
    dom.bcTurn.textContent = '';
    const span = makeEl('span', '', current.name);
    span.style.cssText = `color:${safeColor(current.color)};font-weight:700`;
    dom.bcTurn.appendChild(span);
  }

}
