import { makeEl, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { updateDice } from '../animations/dice.js';
import { audioManager } from '../audio.js';
import { logChanged } from './renderGate.mjs';

let timerIntervalId = null;
let lastTickSecond = 0;

// Poslední známý stav pro tikání časovače. Dřív se interval při každém
// `game:state` rušil a zakládal znovu — při hustém provozu se tak nikdy
// nestihl tiknout sám a odpočet se hýbal jen s příchodem stavu.
let timerState = null;

function formatRemaining(ms) {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function updateCenterTimer(gameState) {
  if (!dom.bcRound) return;

  timerState = gameState;

  if (gameState.phase !== 'playing') {
    if (timerIntervalId) {
      clearInterval(timerIntervalId);
      timerIntervalId = null;
    }
    if (dom.gameTimer) dom.gameTimer.classList.add('hidden');
    return;
  }

  if (dom.gameTimer) dom.gameTimer.classList.remove('hidden');

  const render = () => {
    const gameState = timerState;
    if (!gameState) return;
    const endsAt = Number(gameState.timeLimitEndsAt);
    const startAt = Number(gameState.gameStartTime);
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
  // Interval se zakládá jednou; další stavy jen vymění `timerState`.
  if (!timerIntervalId) timerIntervalId = setInterval(render, 1000);
}

let prevLog = null;

export function updateLog(gameState) {
  if (!dom.logList) return;

  const next = gameState.log || [];
  // Stavy chodí až 20×/s, ale log se mění jen občas. Bez téhle brány se
  // dvacet uzlů přestavovalo pokaždé.
  if (!logChanged(prevLog, next)) return;
  prevLog = next.slice();

  const frag = document.createDocumentFragment();
  next.forEach(msg => frag.appendChild(makeEl('div', 'log-entry', msg)));
  dom.logList.replaceChildren(frag);
}

/** Volá se při opuštění hry, aby další hra nezdědila cizí log. */
export function resetLogCache() {
  prevLog = null;
}

export function updateCenter(gameState) {
  if (!dom.bcTurn || !dom.bcRound) return;
  updateCenterTimer(gameState);
  updateDice(gameState.lastDice);
}
