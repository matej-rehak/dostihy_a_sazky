import { makeEl, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { updateDice } from '../animations/dice.js';
import { audioManager } from '../audio.js';

let timerIntervalId = null;
let lastTickSecond = 0;

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
  const startAt = Number(gameState.gameStartTime);
  if (gameState.phase !== 'playing') {
    if (dom.gameTimer) dom.gameTimer.classList.add('hidden');
    return;
  }

  if (dom.gameTimer) dom.gameTimer.classList.remove('hidden');

  const render = () => {
    let timerText = "00:00";
    if (Number.isFinite(endsAt) && endsAt > 0) {
      const remaining = endsAt - Date.now();
      timerText = formatRemaining(Math.max(0, remaining));
    } else if (Number.isFinite(startAt) && startAt > 0) {
      const elapsed = Date.now() - startAt;
      timerText = formatRemaining(elapsed);
    }
    
    if (dom.timerValue) dom.timerValue.textContent = timerText;
    if (dom.bcRound) dom.bcRound.textContent = `Kolo ${gameState.round}`;
    
    // Turn Timer
    if (dom.bcTurn) {
      const curr = gameState.players.find(p => p.id === gameState.currentTurnId);
      if (curr) {
        let text = `${curr.name} je na řadě`;
        if (gameState.turnTimerEndsAt && gameState.phase === 'playing') {
          const remaining = Math.max(0, gameState.turnTimerEndsAt - Date.now());
          if (remaining > 0 && remaining <= 10_000) {
            text += ` (⏳ ${Math.ceil(remaining / 1000)}s)`;
            const secLeft = Math.ceil(remaining / 1000);
            if (secLeft !== lastTickSecond && gameState.pendingAction?.type !== 'selecting_starter') {
              lastTickSecond = secLeft;
              audioManager.play('click', secLeft <= 3 ? 0.9 : 0.5);
            }
          } else {
            lastTickSecond = 0;
          }
        } else {
          lastTickSecond = 0;
        }
        dom.bcTurn.textContent = text;
        dom.bcTurn.style.color = safeColor(curr.color);
        dom.bcTurn.style.textShadow = `0 0 10px ${safeColor(curr.color)}`;
      } else {
        dom.bcTurn.textContent = 'Čeká se...';
        dom.bcTurn.style.color = 'inherit';
        dom.bcTurn.style.textShadow = 'none';
      }
    }
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
  if (!dom.bcTurn || !dom.bcRound) return;
  updateCenterTimer(gameState);
  updateDice(gameState.lastDice);
}
