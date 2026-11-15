import { fmt } from '../utils.js';
import { spawnFloatingText, spawnFloatingTextAt } from './particles.js';

const BONUS_COLOR = 'var(--green)';

function bonusText(gameState) {
  const bonus = Number(gameState?.config?.startBonus ?? 4000);
  return `+${fmt(bonus)} Kč`;
}

/**
 * Figurka projela STARTem (2D plán): nad STARTem vyletí zelený bonus
 * s ikonkou a políčko krátce zazáří zlatým kruhem.
 */
export function playStartPass2d(gameState) {
  spawnFloatingText(0, bonusText(gameState), BONUS_COLOR, 'img/start.png');
  const start = document.querySelector('#board .space[data-id="0"]');
  if (!start) return;
  start.classList.remove('start-pass');
  void start.offsetWidth;            // restart animace při dvou průjezdech za sebou
  start.classList.add('start-pass');
  setTimeout(() => start.classList.remove('start-pass'), 1200);
}

/** Totéž pro 3D plán — bonus vyletí z bodu, kde je START na obrazovce. */
export function playStartPass3d(gameState, screenPoint) {
  if (!screenPoint) return;
  spawnFloatingTextAt(screenPoint.x, screenPoint.y, bonusText(gameState), BONUS_COLOR, 'img/start.png');
}
