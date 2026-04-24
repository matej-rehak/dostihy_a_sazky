import { makeEl, safeColor } from '../utils.js';
import { audioManager } from '../audio.js';

export function actionBtn(label, cls, onClick) {
  const btn = makeEl('button', `btn ${cls}`, label);
  btn.addEventListener('click', () => {
    audioManager.play('click');
    btn.disabled = true;
    onClick();
  });
  return btn;
}

export function buildWaitEl(player, msg) {
  const wrap = makeEl('div', 'action-waiting');
  wrap.appendChild(makeEl('div', 'waiting-icon', '⏳'));
  const p = makeEl('p');
  p.appendChild(document.createTextNode('Čeká se na '));
  const nameSpan = makeEl('strong', '', player?.name ?? '?');
  nameSpan.style.color = safeColor(player?.color ?? '#fff');
  p.appendChild(nameSpan);
  p.appendChild(document.createElement('br'));
  p.appendChild(makeEl('span', 'dim', msg));
  wrap.appendChild(p);
  return wrap;
}
