import { makeEl, safeColor, uiIcon } from '../utils.js';
import { audioManager } from '../audio.js';

/**
 * Tlačítko akce. Po kliknutí se vypne, aby hráč neposlal akci serveru
 * dvakrát — znovu ho „oživí" až překreslení panelu z nového stavu hry.
 *
 * Tlačítko, které jen otevírá okno na klientovi (prodej bance, sázka na hod),
 * žádný nový stav nevyvolá — panel by se nepřekreslil a tlačítko by po
 * zavření okna zůstalo mrtvé. Takové předej `{ opensDialog: true }`.
 */
export function actionBtn(label, cls, onClick, { opensDialog = false } = {}) {
  const btn = makeEl('button', `btn ${cls}`, label);
  btn.addEventListener('click', () => {
    audioManager.play('click');
    if (!opensDialog) btn.disabled = true;
    onClick();
  });
  return btn;
}

/** actionBtn s obrázkovou ikonkou UI (public/img/ui/{icon}.png) před textem. */
export function iconBtn(icon, label, cls, onClick, options) {
  const btn = actionBtn(label, cls, onClick, options);
  btn.prepend(uiIcon(icon, true));
  return btn;
}

export function buildWaitEl(player, msg) {
  const wrap = makeEl('div', 'action-waiting');
  const icon = makeEl('div', 'waiting-icon');
  icon.appendChild(uiIcon('cekani'));
  wrap.appendChild(icon);
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
