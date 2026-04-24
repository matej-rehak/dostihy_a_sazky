import { makeEl, fmt, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { audioManager } from '../audio.js';
import { actionBtn, buildWaitEl } from './actionsHelpers.js';

// ─── Trade draft stav ─────────────────────────────────────────────────────────
// { targetId, offer: { horses: [], money: 0 }, request: { horses: [], money: 0 }, context }
export let tradeDraft = null;

export function setTradeDraft(v) {
  tradeDraft = v;
}

// ─── Trade: builder (sestavení nabídky) ───────────────────────────────────────

export function renderTradeBuild(gameState, me, onCancel) {
  dom.actionTitle.textContent = '🤝 Navrhnout obchod';
  dom.actionContent.innerHTML = '';

  const others = gameState.players.filter(p => !p.bankrupt && p.id !== state.myId);
  if (!others.length) { setTradeDraft(null); return; }

  if (!others.find(p => p.id === tradeDraft.targetId)) tradeDraft.targetId = others[0].id;
  const target = others.find(p => p.id === tradeDraft.targetId);

  if (others.length > 1) {
    const sel = makeEl('div', 'trade-target-sel');
    others.forEach(p => {
      const active = p.id === tradeDraft.targetId;
      const btn = makeEl('button', `btn btn-xs ${active ? '' : 'btn-outline'}`, p.name);
      btn.style.cssText = `border-color:${safeColor(p.color)};${active ? `background:${safeColor(p.color)};color:#fff` : ''}`;
      btn.addEventListener('click', () => {
        tradeDraft.targetId = p.id;
        tradeDraft.request.horses = [];
        renderTradeBuild(gameState, me, onCancel);
      });
      sel.appendChild(btn);
    });
    dom.actionContent.appendChild(sel);
  }

  // ── Nabízím ──────────────────────────────────────────────────────────────
  const offerSec = makeEl('div', 'trade-section');
  offerSec.appendChild(makeEl('div', 'trade-section-title', '📤 Nabízím'));
  if (me?.properties?.length) {
    me.properties.forEach(sid => {
      const sp      = state.boardData[sid];
      const checked = tradeDraft.offer.horses.includes(sid);
      const item    = makeEl('div', 'trade-horse-item');
      const cb      = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = checked;
      cb.addEventListener('change', () => {
        tradeDraft.offer.horses = cb.checked
          ? [...tradeDraft.offer.horses, sid]
          : tradeDraft.offer.horses.filter(id => id !== sid);
      });
      const lbl = makeEl('label', 'trade-horse-label');
      const dot = makeEl('span', 'trade-dot'); dot.style.background = safeColor(sp.groupColor);
      lbl.appendChild(dot);
      lbl.appendChild(document.createTextNode(sp.name));
      item.appendChild(cb); item.appendChild(lbl);
      offerSec.appendChild(item);
    });
  } else {
    offerSec.appendChild(makeEl('p', 'dim', 'Nevlastníte žádné koně.'));
  }
  const mr1 = makeEl('div', 'trade-money-row');
  mr1.appendChild(makeEl('span', '', 'Peníze: '));
  const mi1 = document.createElement('input');
  const myBalance = Math.max(0, me?.balance ?? 0);
  mi1.type = 'number'; mi1.min = '0'; mi1.max = String(myBalance); mi1.step = '500';
  mi1.value = tradeDraft.offer.money; mi1.className = 'text-input trade-money-input';
  mi1.addEventListener('input', () => {
    tradeDraft.offer.money = Math.min(myBalance, Math.max(0, Number(mi1.value) || 0));
    mi1.value = tradeDraft.offer.money;
  });
  mr1.appendChild(mi1); mr1.appendChild(makeEl('span', 'dim', ' Kč'));
  offerSec.appendChild(mr1);
  dom.actionContent.appendChild(offerSec);

  // ── Žádám ─────────────────────────────────────────────────────────────────
  const reqSec = makeEl('div', 'trade-section');
  reqSec.appendChild(makeEl('div', 'trade-section-title', `📥 Žádám od ${target?.name ?? '?'}`));
  if (target?.properties?.length) {
    target.properties.forEach(sid => {
      const sp      = state.boardData[sid];
      const checked = tradeDraft.request.horses.includes(sid);
      const item    = makeEl('div', 'trade-horse-item');
      const cb      = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = checked;
      cb.addEventListener('change', () => {
        tradeDraft.request.horses = cb.checked
          ? [...tradeDraft.request.horses, sid]
          : tradeDraft.request.horses.filter(id => id !== sid);
      });
      const lbl = makeEl('label', 'trade-horse-label');
      const dot = makeEl('span', 'trade-dot'); dot.style.background = safeColor(sp.groupColor);
      lbl.appendChild(dot);
      lbl.appendChild(document.createTextNode(sp.name));
      item.appendChild(cb); item.appendChild(lbl);
      reqSec.appendChild(item);
    });
  } else {
    reqSec.appendChild(makeEl('p', 'dim', 'Hráč nevlastní žádné koně.'));
  }
  const mr2 = makeEl('div', 'trade-money-row');
  mr2.appendChild(makeEl('span', '', 'Peníze: '));
  const mi2 = document.createElement('input');
  mi2.type = 'number'; mi2.min = '0'; mi2.step = '500';
  mi2.value = tradeDraft.request.money; mi2.className = 'text-input trade-money-input';
  mi2.addEventListener('input', () => { tradeDraft.request.money = Math.max(0, Number(mi2.value) || 0); });
  mr2.appendChild(mi2); mr2.appendChild(makeEl('span', 'dim', ' Kč'));
  reqSec.appendChild(mr2);
  dom.actionContent.appendChild(reqSec);

  const btns = makeEl('div', 'action-buttons row');
  btns.style.marginTop = '8px';
  btns.appendChild(actionBtn('Potvrdit obchod ✓', 'btn-green', () => {
    if (tradeDraft.offer.money > myBalance) {
      let errEl = dom.actionContent.querySelector('.trade-money-error');
      if (!errEl) {
        errEl = makeEl('p', 'trade-money-error');
        errEl.style.cssText = 'color:var(--red,#e55);margin:4px 0;font-size:0.9em';
        btns.parentNode.insertBefore(errEl, btns);
      }
      errEl.textContent = `Částka může být maximálně ${fmt(myBalance)} Kč`;
      mi1.focus();
      return;
    }
    socket.emit('game:trade_init', {
      targetId: tradeDraft.targetId,
      offer:   { horses: [...tradeDraft.offer.horses],   money: tradeDraft.offer.money   },
      request: { horses: [...tradeDraft.request.horses], money: tradeDraft.request.money },
    });
    setTradeDraft(null);
  }));
  btns.appendChild(actionBtn('Zrušit', 'btn-outline', () => {
    setTradeDraft(null);
    onCancel();
  }));
  dom.actionContent.appendChild(btns);
}

// ─── Trade: zobrazení nabídky (pro cílového hráče) ────────────────────────────

export function renderTradeOffer(isTargeted, targetPlayer, pa, gameState) {
  dom.actionTitle.textContent = '🤝 Nabídka obchodu';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'zvažuje obchod...'));
    return;
  }

  const { fromId, offer, request } = pa.data;
  const initiator = gameState.players.find(p => p.id === fromId);

  const recSec = makeEl('div', 'trade-section');
  recSec.appendChild(makeEl('div', 'trade-section-title', `📤 ${initiator?.name ?? '?'} nabízí:`));
  (offer.horses || []).forEach(sid => {
    const sp   = state.boardData[sid];
    const item = makeEl('div', 'trade-horse-item');
    const dot  = makeEl('span', 'trade-dot'); dot.style.background = safeColor(sp?.groupColor);
    item.appendChild(dot);
    item.appendChild(makeEl('span', '', sp?.name ?? sid));
    recSec.appendChild(item);
  });
  if (offer.money > 0) recSec.appendChild(makeEl('div', 'trade-money-display pos', `+${fmt(offer.money)} Kč`));
  if (!offer.horses?.length && !offer.money) recSec.appendChild(makeEl('p', 'dim', 'Nic'));
  dom.actionContent.appendChild(recSec);

  const paySec = makeEl('div', 'trade-section');
  paySec.appendChild(makeEl('div', 'trade-section-title', '📥 Na oplátku chce:'));
  (request.horses || []).forEach(sid => {
    const sp   = state.boardData[sid];
    const item = makeEl('div', 'trade-horse-item');
    const dot  = makeEl('span', 'trade-dot'); dot.style.background = safeColor(sp?.groupColor);
    item.appendChild(dot);
    item.appendChild(makeEl('span', '', sp?.name ?? sid));
    paySec.appendChild(item);
  });
  if (request.money > 0) paySec.appendChild(makeEl('div', 'trade-money-display neg', `-${fmt(request.money)} Kč`));
  if (!request.horses?.length && !request.money) paySec.appendChild(makeEl('p', 'dim', 'Nic'));
  dom.actionContent.appendChild(paySec);

  const btns = makeEl('div', 'action-buttons row');
  btns.style.marginTop = '8px';
  btns.appendChild(actionBtn('✅ Přijmout', 'btn-green', () => {
    audioManager.play('trade_accept');
    socket.emit('game:respond', { decision: 'accept' });
  }));
  btns.appendChild(actionBtn('❌ Odmítnout', 'btn-outline', () => {
    audioManager.play('trade_reject');
    socket.emit('game:respond', { decision: 'reject' });
  }));
  dom.actionContent.appendChild(btns);
}
