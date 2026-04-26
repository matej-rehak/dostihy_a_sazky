import { makeEl, fmt, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { audioManager } from '../audio.js';
import { buildWaitEl } from './actionsHelpers.js';
import { showTip, moveTip } from './tooltip.js';

// ─── Trade draft stav ─────────────────────────────────────────────────────────
export let tradeDraft = null;

export function setTradeDraft(v) {
  tradeDraft = v;
}

function closeTradeModal() {
  dom.tradeOverlay.classList.add('hidden');
  setTradeDraft(null);
}

// ─── Trade: card builder ─────────────────────────────────────────────────────

function createTradeCard(sid, isSelected, onToggle, tokenData = null, options = {}) {
  const sp = state.boardData[sid];
  const card = makeEl('div', `trade-card ${isSelected ? 'selected' : ''} ${options.noCheck ? 'no-check' : ''}`);
  
  const strip = makeEl('div', 'trade-card-strip');
  strip.style.background = safeColor(sp.groupColor);
  card.appendChild(strip);
  
  const name = makeEl('div', 'trade-card-name', sp.name);
  card.appendChild(name);

  // Tokens indicator
  if (tokenData) {
    const tokensDiv = makeEl('div', 'trade-card-tokens');
    if (tokenData.big) {
      tokensDiv.appendChild(makeEl('div', 'trade-token-star', '★'));
    } else if (tokenData.small > 0) {
      for (let i = 0; i < tokenData.small; i++) {
        tokensDiv.appendChild(makeEl('div', 'trade-token-dot'));
      }
    }
    card.appendChild(tokensDiv);
  }
  
  // Info button for tooltip
  const infoBtn = makeEl('div', 'trade-info-btn', '?');
  infoBtn.addEventListener('mouseenter', (ev) => {
    ev.stopPropagation();
    const space = state.boardData[sid];
    if (space) showTip(space, state.gameState, ev);
  });
  infoBtn.addEventListener('mousemove', (ev) => {
    ev.stopPropagation();
    moveTip(ev);
  });
  infoBtn.addEventListener('mouseleave', (ev) => {
    ev.stopPropagation();
    dom.tooltip?.classList.add('hidden');
  });
  card.appendChild(infoBtn);
  
  const check = makeEl('div', 'trade-card-check', '✓');
  card.appendChild(check);
  
  card.addEventListener('click', () => {
    if (options.readonly) return;
    onToggle();
  });
  
  return card;
}

// ─── Trade: builder (sestavení nabídky) ───────────────────────────────────────

export function renderTradeBuild(gameState, me, onCancel, fixedTargetId = null, submitFn = null) {
  dom.tradeTitle.textContent = fixedTargetId ? '🔄 Protinabídka' : '🤝 Navrhnout obchod';
  dom.tradeContent.innerHTML = '';
  dom.tradeOverlay.classList.remove('hidden');

  // Close handler
  dom.tradeCloseBtn.onclick = () => {
    closeTradeModal();
    onCancel();
  };

  const others = gameState.players.filter(p => !p.bankrupt && p.id !== state.myId);
  if (!others.length) { closeTradeModal(); return; }

  // Target selection
  if (fixedTargetId) {
    tradeDraft.targetId = fixedTargetId;
  } else if (!tradeDraft.targetId || !others.find(p => p.id === tradeDraft.targetId)) {
    tradeDraft.targetId = others[0].id;
  }
  
  const isPublic = tradeDraft.targetId === 'public';
  const target = isPublic ? null : others.find(p => p.id === tradeDraft.targetId);

  // Columns container
  const cols = makeEl('div', 'trade-columns');

  // ── LEVÝ SLOUPCE: NABÍZÍM ────────────────────────────────────────────────
  const leftCol = makeEl('div', 'trade-col');
  leftCol.appendChild(makeEl('div', 'trade-col-title', '📤 Nabízím'));
  
  if (me?.properties?.length) {
    const myGrid = makeEl('div', 'trade-grid');
    me.properties.forEach(sid => {
      const selected = tradeDraft.offer.horses.includes(sid);
      myGrid.appendChild(createTradeCard(sid, selected, () => {
        tradeDraft.offer.horses = selected
          ? tradeDraft.offer.horses.filter(id => id !== sid)
          : [...tradeDraft.offer.horses, sid];
        renderTradeBuild(gameState, me, onCancel, fixedTargetId, submitFn);
      }, gameState.tokens[sid]));
    });
    leftCol.appendChild(myGrid);
  } else {
    leftCol.appendChild(makeEl('div', 'trade-empty-msg', 'Nevlastníte žádné koně.'));
  }

  const myMoneyBox = makeEl('div', 'trade-money-box');
  myMoneyBox.appendChild(makeEl('div', 'trade-money-label', 'Peníze:'));
  const mi1Wrap = makeEl('div', 'trade-money-input-wrap');
  const mi1 = document.createElement('input');
  const myBalance = Math.max(0, me?.balance ?? 0);
  mi1.type = 'number'; mi1.min = '0'; mi1.max = String(Math.min(999999, myBalance)); mi1.step = '500';
  mi1.value = tradeDraft.offer.money; mi1.className = 'text-input trade-money-input';
  mi1.addEventListener('input', () => {
    let val = Math.min(myBalance, Math.max(0, Number(mi1.value) || 0));
    if (val > 999999) val = 999999;
    tradeDraft.offer.money = val;
    mi1.value = val;
  });
  
  const maxBtn1 = makeEl('button', 'trade-max-btn', 'MAX');
  maxBtn1.onclick = () => {
    const val = Math.min(999999, myBalance);
    tradeDraft.offer.money = val;
    mi1.value = val;
  };
  
  mi1Wrap.appendChild(mi1);
  mi1Wrap.appendChild(maxBtn1);
  myMoneyBox.appendChild(mi1Wrap);
  leftCol.appendChild(myMoneyBox);
  
  cols.appendChild(leftCol);

  // ── PRAVÝ SLOUPCE: ŽÁDÁM ─────────────────────────────────────────────────
  const rightCol = makeEl('div', 'trade-col');
  
  // Header with target selector
  const rightTitle = makeEl('div', 'trade-col-title', `📥 Žádám od: `);
  if (!fixedTargetId) {
    const sel = document.createElement('select');
    
    others.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = p.id === tradeDraft.targetId;
      sel.appendChild(opt);
    });
    
    // Add Public option
    const pubOpt = document.createElement('option');
    pubOpt.value = 'public';
    pubOpt.textContent = '📢 Všech (Veřejná nabídka)';
    pubOpt.selected = isPublic;
    sel.appendChild(pubOpt);
    
    sel.addEventListener('change', () => {
      tradeDraft.targetId = sel.value;
      tradeDraft.request.horses = [];
      renderTradeBuild(gameState, me, onCancel, fixedTargetId, submitFn);
    });
    rightTitle.appendChild(sel);
  } else {
    rightTitle.appendChild(document.createTextNode(target?.name ?? '?'));
  }
  rightCol.appendChild(rightTitle);

  if (isPublic) {
    rightCol.appendChild(makeEl('div', 'trade-empty-msg', 'U veřejné nabídky můžete žádat pouze peníze.'));
  } else if (target?.properties?.length) {
    const targetGrid = makeEl('div', 'trade-grid');
    target.properties.forEach(sid => {
      const selected = tradeDraft.request.horses.includes(sid);
      targetGrid.appendChild(createTradeCard(sid, selected, () => {
        tradeDraft.request.horses = selected
          ? tradeDraft.request.horses.filter(id => id !== sid)
          : [...tradeDraft.request.horses, sid];
        renderTradeBuild(gameState, me, onCancel, fixedTargetId, submitFn);
      }, gameState.tokens[sid]));
    });
    rightCol.appendChild(targetGrid);
  } else {
    rightCol.appendChild(makeEl('div', 'trade-empty-msg', 'Hráč nevlastní žádné koně.'));
  }

  const targetMoneyBox = makeEl('div', 'trade-money-box');
  targetMoneyBox.appendChild(makeEl('div', 'trade-money-label', 'Peníze:'));
  const mi2Wrap = makeEl('div', 'trade-money-input-wrap');
  const mi2 = document.createElement('input');
  mi2.type = 'number'; mi2.min = '0'; mi2.step = '500';
  mi2.value = tradeDraft.request.money; mi2.className = 'text-input trade-money-input';
  mi2.addEventListener('input', () => { 
    let val = Math.max(0, Number(mi2.value) || 0);
    if (val > 999999) val = 999999;
    tradeDraft.request.money = val;
    mi2.value = val;
  });
  
  const maxBtn2 = makeEl('button', 'trade-max-btn', 'MAX');
  maxBtn2.onclick = () => {
    const targetBalance = Math.max(0, target?.balance ?? 0);
    const val = Math.min(999999, targetBalance);
    tradeDraft.request.money = val;
    mi2.value = val;
  };

  mi2Wrap.appendChild(mi2);
  mi2Wrap.appendChild(maxBtn2);
  targetMoneyBox.appendChild(mi2Wrap);
  rightCol.appendChild(targetMoneyBox);

  cols.appendChild(rightCol);
  dom.tradeContent.appendChild(cols);

  // Footer
  const footer = makeEl('div', 'trade-footer');
  
  const cancelBtn = makeEl('button', 'btn btn-outline', 'Zrušit');
  cancelBtn.onclick = () => {
    closeTradeModal();
    onCancel();
  };
  footer.appendChild(cancelBtn);

  const confirmBtn = makeEl('button', 'btn btn-green', 'Odeslat nabídku ✓');
  confirmBtn.onclick = () => {
    const payload = {
      offer:   { horses: [...tradeDraft.offer.horses],   money: tradeDraft.offer.money   },
      request: { horses: [...tradeDraft.request.horses], money: tradeDraft.request.money },
    };
    if (submitFn) {
      submitFn(payload);
    } else {
      socket.emit('game:trade_init', { targetId: tradeDraft.targetId, ...payload });
    }
    closeTradeModal();
  };
  footer.appendChild(confirmBtn);

  dom.tradeContent.appendChild(footer);
}

// ─── Trade: zobrazení nabídky (pro cílového hráče) ────────────────────────────

export function renderTradeOffer(isTargeted, targetPlayer, pa, gameState) {
  // If we are the target, show modal
  if (isTargeted) {
    dom.tradeTitle.textContent = '🤝 Nabídka obchodu';
    dom.tradeContent.innerHTML = '';
    dom.tradeOverlay.classList.remove('hidden');
    
    dom.tradeCloseBtn.onclick = () => {
      // Reject if closed? Usually better to have explicit buttons
    };

    const { fromId, offer, request } = pa.data;
    const initiator = gameState.players.find(p => p.id === fromId);

    const cols = makeEl('div', 'trade-columns');

    // Left: What they offer
    const leftCol = makeEl('div', 'trade-col');
    leftCol.appendChild(makeEl('div', 'trade-col-title', `📤 ${initiator?.name ?? '?'} nabízí:`));
    
    if (offer.horses?.length) {
      const offGrid = makeEl('div', 'trade-grid');
      offer.horses.forEach(sid => {
        offGrid.appendChild(createTradeCard(sid, true, () => {}, gameState.tokens[sid], { noCheck: true, readonly: true }));
      });
      leftCol.appendChild(offGrid);
    } else if (!offer.money) {
      leftCol.appendChild(makeEl('div', 'trade-empty-msg', 'Nic'));
    } else {
      leftCol.appendChild(makeEl('div', 'flex-1', '')); // Spacer
    }

    if (offer.money > 0) {
      const mbox = makeEl('div', 'trade-money-box');
      mbox.style.borderColor = 'var(--green)';
      mbox.innerHTML = `<div class="trade-money-label">Přidá vám:</div><div style="font-family:var(--font-h);font-size:1.5rem;color:var(--green)">${fmt(offer.money)} Kč</div>`;
      leftCol.appendChild(mbox);
    }
    cols.appendChild(leftCol);

    // Right: What they want
    const rightCol = makeEl('div', 'trade-col');
    rightCol.appendChild(makeEl('div', 'trade-col-title', '📥 Na oplátku chce:'));
    
    if (request.horses?.length) {
      const reqGrid = makeEl('div', 'trade-grid');
      request.horses.forEach(sid => {
        reqGrid.appendChild(createTradeCard(sid, true, () => {}, gameState.tokens[sid], { noCheck: true, readonly: true }));
      });
      rightCol.appendChild(reqGrid);
    } else if (!request.money) {
      rightCol.appendChild(makeEl('div', 'trade-empty-msg', 'Nic'));
    } else {
      rightCol.appendChild(makeEl('div', 'flex-1', '')); // Spacer
    }

    if (request.money > 0) {
      const mbox = makeEl('div', 'trade-money-box');
      mbox.style.borderColor = 'var(--red)';
      mbox.innerHTML = `<div class="trade-money-label">Zaplatíte mu:</div><div style="font-family:var(--font-h);font-size:1.5rem;color:var(--red)">${fmt(request.money)} Kč</div>`;
      rightCol.appendChild(mbox);
    }
    cols.appendChild(rightCol);

    dom.tradeContent.appendChild(cols);

    // Footer
    const footer = makeEl('div', 'trade-footer');
    
    const rejectBtn = makeEl('button', 'btn btn-outline', '❌ Odmítnout');
    rejectBtn.onclick = () => {
      audioManager.play('trade_reject');
      socket.emit('game:respond', { decision: 'reject' });
      closeTradeModal();
    };
    footer.appendChild(rejectBtn);

    const counterBtn = makeEl('button', 'btn btn-outline', '🔄 Protinabídka');
    counterBtn.onclick = () => {
      const me = gameState.players.find(p => p.id === state.myId);
      setTradeDraft({
        targetId: fromId,
        offer:   { horses: [...(request.horses || [])], money: request.money || 0 },
        request: { horses: [...(offer.horses  || [])], money: offer.money  || 0 },
        context: 'counter',
      });
      renderCounterBuild(gameState, me, pa);
    };
    footer.appendChild(counterBtn);

    const acceptBtn = makeEl('button', 'btn btn-green', '✅ Přijmout');
    acceptBtn.onclick = () => {
      audioManager.play('trade_accept');
      socket.emit('game:respond', { decision: 'accept' });
      closeTradeModal();
    };
    footer.appendChild(acceptBtn);

    dom.tradeContent.appendChild(footer);

  } else {
    // Show wait message in sidebar
    dom.actionTitle.textContent = '🤝 Nabídka obchodu';
    dom.actionContent.innerHTML = '';
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'zvažuje obchod...'));
  }
}

function renderCounterBuild(gameState, me, pa) {
  const { fromId } = pa.data;
  const initiator = gameState.players.find(p => p.id === fromId);
  renderTradeBuild(
    gameState,
    me,
    () => renderTradeOffer(true, initiator, pa, gameState),
    fromId,
    ({ offer, request }) => {
      socket.emit('game:respond', { decision: 'counter', offer, request });
      setTradeDraft(null);
    }
  );
}
