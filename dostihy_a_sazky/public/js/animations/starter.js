import { makeEl, safeColor } from '../utils.js';
import { state } from '../state.js';

export function runStarterAnimation(winnerId, players) {
  const overlay  = document.getElementById('starter-overlay');
  const flicker  = document.getElementById('starter-flicker');
  const winnerEl = document.getElementById('starter-winner');
  if (!overlay || !flicker || !winnerEl) return;

  overlay.classList.remove('hidden');
  winnerEl.classList.add('hidden');
  flicker.classList.remove('hidden');

  let count = 0;
  const max = 30;
  const interval = setInterval(() => {
    const p = players[Math.floor(Math.random() * players.length)];
    flicker.innerHTML = '';
    const item = makeEl('div', 'flicker-item');
    item.style.color = safeColor(p.color);
    item.textContent = p.name;
    flicker.appendChild(item);

    count++;
    if (count >= max) {
      clearInterval(interval);
      const winner = players.find(pl => pl.id === winnerId);
      flicker.classList.add('hidden');
      winnerEl.classList.remove('hidden');
      winnerEl.textContent = `🏁 ${winner?.name ?? '?'} ZAČÍNÁ!`;
      winnerEl.style.color = safeColor(winner?.color ?? '#fff');
      winnerEl.classList.add('winning-gold');
      setTimeout(() => overlay.classList.add('hidden'), 2000);
    }
  }, 100);
}
