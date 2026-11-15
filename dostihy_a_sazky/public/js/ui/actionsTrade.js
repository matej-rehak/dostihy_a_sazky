import { makeEl, fmt, safeColor, setIconText } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { audioManager } from '../audio.js';
import { buildWaitEl } from './actionsHelpers.js';
import { showTip, moveTip } from './tooltip.js';
import { syncTradeDrafting } from './tradeNotice.js';

// Nadpis sloupce obchodu s ikonkou (nabizim / zadam)
function colTitle(icon, text) {
  const el = makeEl('div', 'trade-col-title');
  setIconText(el, icon, text);
  return el;
}

// ─── Trade draft stav ─────────────────────────────────────────────────────────
export let tradeDraft = null;

export function setTradeDraft(v) {
  tradeDraft = v;
  syncDrafting();
}

// ─── „Skládá nabídku" ─────────────────────────────────────────────────────────
// Ostatní hráči i cílový hráč vidí, že se vyjednává (ui/tradeNotice.js).
// Skládám, dokud je okno obchodu otevřené s rozpracovanou nabídkou. Okno se
// zavírá z mnoha míst, proto se hlídá přes změnu jeho třídy `hidden`.
export function syncDrafting() {
  const open = dom.tradeOverlay && !dom.tradeOverlay.classList.contains('hidden');
  syncTradeDrafting(open && tradeDraft ? tradeDraft.targetId : null);
}

let overlayWatched = null;
function watchTradeOverlay() {
  const overlay = dom.tradeOverlay;
  if (!overlay || overlayWatched === overlay) return;
  overlayWatched = overlay;
  new MutationObserver(syncDrafting).observe(overlay, { attributes: true, attributeFilter: ['class'] });
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

/**
 * Karta „Zrušen distanc" v obchodu — stejná kartička jako kůň, jen s obrázkem
 * Distancu místo barevného pruhu. Ve hře je jen jedna.
 */
function createJailTradeCard(isSelected, onToggle, options = {}) {
  const card = makeEl('div', `trade-card trade-card-jail ${isSelected ? 'selected' : ''} ${options.noCheck ? 'no-check' : ''}`);
  const img = document.createElement('img');
  img.className = 'trade-card-jail-img';
  img.src = 'img/distanc.png';
  img.alt = '';
  img.draggable = false;
  card.appendChild(img);
  card.appendChild(makeEl('div', 'trade-card-name', 'Zrušen distanc'));
  card.appendChild(makeEl('div', 'trade-card-check', '✓'));
  card.title = 'Karta „Zrušen distanc" — vysvobodí z Distancu';
  card.addEventListener('click', () => {
    if (options.readonly) return;
    onToggle();
  });
  return card;
}

/** Mřížka nabízených / žádaných věcí v náhledu nabídky (jen ke čtení). */
function readonlyGrid(side, gameState) {
  if (!side.horses?.length && !side.jailCard) return null;
  const grid = makeEl('div', 'trade-grid');
  if (side.jailCard) grid.appendChild(createJailTradeCard(true, () => {}, { noCheck: true, readonly: true }));
  (side.horses || []).forEach(sid => {
    grid.appendChild(createTradeCard(sid, true, () => {}, gameState.tokens[sid], { noCheck: true, readonly: true }));
  });
  return grid;
}

// ─── Trade: builder (sestavení nabídky) ───────────────────────────────────────

export function renderTradeBuild(gameState, me, onCancel, fixedTargetId = null, submitFn = null) {
  setIconText(dom.tradeTitle, 'obchod', fixedTargetId ? 'Protinabídka' : 'Navrhnout obchod');
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
  watchTradeOverlay();
  syncDrafting();

  // Columns container
  const cols = makeEl('div', 'trade-columns');

  // ── LEVÝ SLOUPCE: NABÍZÍM ────────────────────────────────────────────────
  const leftCol = makeEl('div', 'trade-col');
  leftCol.appendChild(colTitle('nabizim', 'Nabízím'));
  
  if (me?.properties?.length || me?.jailFreeCards > 0) {
    const myGrid = makeEl('div', 'trade-grid');
    if (me.jailFreeCards > 0) {
      myGrid.appendChild(createJailTradeCard(!!tradeDraft.offer.jailCard, () => {
        tradeDraft.offer.jailCard = !tradeDraft.offer.jailCard;
        renderTradeBuild(gameState, me, onCancel, fixedTargetId, submitFn);
      }));
    }
    (me.properties || []).forEach(sid => {
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
    leftCol.appendChild(makeEl('div', 'trade-empty-msg', 'Nemáte žádné koně ani karty.'));
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
  const rightTitle = colTitle('zadam', 'Žádám od: ');
  if (!fixedTargetId) {
    const sel = document.createElement('select');
    
    others.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      opt.selected = p.id === tradeDraft.targetId;
      sel.appendChild(opt);
    });
    
    sel.addEventListener('change', () => {
      tradeDraft.targetId = sel.value;
      tradeDraft.request.horses = [];
      tradeDraft.request.jailCard = false;
      renderTradeBuild(gameState, me, onCancel, fixedTargetId, submitFn);
    });
    rightTitle.appendChild(sel);
  } else {
    rightTitle.appendChild(document.createTextNode(target?.name ?? '?'));
  }
  rightCol.appendChild(rightTitle);

  if (target?.properties?.length || target?.jailFreeCards > 0) {
    const targetGrid = makeEl('div', 'trade-grid');
    if (target.jailFreeCards > 0) {
      targetGrid.appendChild(createJailTradeCard(!!tradeDraft.request.jailCard, () => {
        tradeDraft.request.jailCard = !tradeDraft.request.jailCard;
        renderTradeBuild(gameState, me, onCancel, fixedTargetId, submitFn);
      }));
    }
    (target.properties || []).forEach(sid => {
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
    rightCol.appendChild(makeEl('div', 'trade-empty-msg', 'Hráč nemá žádné koně ani karty.'));
  }

  const targetMoneyBox = makeEl('div', 'trade-money-box');
  targetMoneyBox.appendChild(makeEl('div', 'trade-money-label', 'Peníze:'));
  const mi2Wrap = makeEl('div', 'trade-money-input-wrap');
  const mi2 = document.createElement('input');
  const targetBalance = Math.max(0, target?.balance ?? 0);
  mi2.type = 'number'; mi2.min = '0'; mi2.max = String(Math.min(999999, targetBalance)); mi2.step = '500';
  mi2.value = tradeDraft.request.money; mi2.className = 'text-input trade-money-input';
  mi2.addEventListener('input', () => { 
    let val = Math.max(0, Math.min(targetBalance, Number(mi2.value) || 0));
    if (val > 999999) val = 999999;
    tradeDraft.request.money = val;
    mi2.value = val;
  });
  
  const maxBtn2 = makeEl('button', 'trade-max-btn', 'MAX');
  maxBtn2.onclick = () => {
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
      // Karta může být v konceptu vybraná, i když ji hráč mezitím použil —
      // posílá se jen, když ji strana pořád drží (server to stejně ověří).
      offer:   { horses: [...tradeDraft.offer.horses],   money: tradeDraft.offer.money,
                 jailCard: !!tradeDraft.offer.jailCard && me?.jailFreeCards > 0 },
      request: { horses: [...tradeDraft.request.horses], money: tradeDraft.request.money,
                 jailCard: !!tradeDraft.request.jailCard && target?.jailFreeCards > 0 },
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
    setIconText(dom.tradeTitle, 'obchod', 'Nabídka obchodu');
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
    leftCol.appendChild(colTitle('nabizim', `${initiator?.name ?? '?'} nabízí:`));
    
    const offGrid = readonlyGrid(offer, gameState);
    if (offGrid) {
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
    rightCol.appendChild(colTitle('zadam', 'Na oplátku chce:'));
    
    const reqGrid = readonlyGrid(request, gameState);
    if (reqGrid) {
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
    
    const rejectBtn = makeEl('button', 'btn btn-outline');
    setIconText(rejectBtn, 'zavrit', 'Odmítnout');
    rejectBtn.onclick = () => {
      audioManager.play('trade_reject');
      socket.emit('game:respond', { decision: 'reject' });
      closeTradeModal();
    };
    footer.appendChild(rejectBtn);

    const counterBtn = makeEl('button', 'btn btn-outline');
    setIconText(counterBtn, 'obchod', 'Protinabídka');
    counterBtn.onclick = () => {
      const me = gameState.players.find(p => p.id === state.myId);
      setTradeDraft({
        targetId: fromId,
        offer:   { horses: [...(request.horses || [])], money: request.money || 0, jailCard: !!request.jailCard },
        request: { horses: [...(offer.horses  || [])], money: offer.money  || 0, jailCard: !!offer.jailCard },
        context: 'counter',
      });
      renderCounterBuild(gameState, me, pa);
    };
    footer.appendChild(counterBtn);

    const acceptBtn = makeEl('button', 'btn btn-green');
    setIconText(acceptBtn, 'prijmout', 'Přijmout');
    acceptBtn.onclick = () => {
      audioManager.play('trade_accept');
      socket.emit('game:respond', { decision: 'accept' });
      closeTradeModal();
    };
    footer.appendChild(acceptBtn);

    dom.tradeContent.appendChild(footer);

  } else {
    // Čekáme na odpověď — zavřeme obchodní modal a ukažme sidebar
    if (dom.tradeOverlay) dom.tradeOverlay.classList.add('hidden');
    setIconText(dom.actionTitle, 'obchod', 'Nabídka obchodu');
    dom.actionContent.innerHTML = '';
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'zvažuje obchod...'));
  }
}

export function renderIncomingTradeOffer(offerData, gameState, onClose = null) {
  const me = gameState.players.find(p => p.id === state.myId);
  const myOffers = gameState.tradeOffers?.filter(o => o.targetId === state.myId || o.fromId === state.myId || o.targetId === null) || [];
  const currentIdx = myOffers.findIndex(o => o.id === offerData.id);
  const isOutgoing = offerData.fromId === state.myId;

  setIconText(dom.tradeTitle, 'obchod', `Nabídka obchodu (${currentIdx + 1}/${myOffers.length})`);
  dom.tradeContent.innerHTML = '';
  dom.tradeOverlay.classList.remove('hidden');

  // Nastav X tlačítko — pokud máme onClose callback (dluhový kontext), vrátí se zpět
  dom.tradeCloseBtn.onclick = () => {
    dom.tradeOverlay.classList.add('hidden');
    if (onClose) onClose();
  };

  const { fromId, offer, request } = offerData;
  const initiator = gameState.players.find(p => p.id === fromId);

  const cols = makeEl('div', 'trade-columns');

  // Left: What is offered
  const leftCol = makeEl('div', 'trade-col');
  const offerTitle = isOutgoing ? 'Vy nabízíte:' : `${initiator?.name ?? '?'} nabízí:`;
  leftCol.appendChild(colTitle('nabizim', offerTitle));
  
  const offGrid = readonlyGrid(offer, gameState);
  if (offGrid) {
    leftCol.appendChild(offGrid);
  } else if (!offer.money) {
    leftCol.appendChild(makeEl('div', 'trade-empty-msg', 'Nic'));
  }

  if (offer.money > 0) {
    const mbox = makeEl('div', 'trade-money-box');
    mbox.style.borderColor = 'var(--green)';
    mbox.innerHTML = `<div class="trade-money-label">Přidá vám:</div><div style="font-family:var(--font-h);font-size:1.5rem;color:var(--green)">${fmt(offer.money)} Kč</div>`;
    leftCol.appendChild(mbox);
  }
  cols.appendChild(leftCol);

  // Right: What is requested
  const rightCol = makeEl('div', 'trade-col');
  const reqTitle = isOutgoing ? 'Vy požadujete:' : 'Na oplátku chce:';
  rightCol.appendChild(colTitle('zadam', reqTitle));
  
  const reqGrid = readonlyGrid(request, gameState);
  if (reqGrid) {
    rightCol.appendChild(reqGrid);
  } else if (!request.money) {
    rightCol.appendChild(makeEl('div', 'trade-empty-msg', 'Nic'));
  }

  if (request.money > 0) {
    const mbox = makeEl('div', 'trade-money-box');
    mbox.style.borderColor = 'var(--red)';
    mbox.innerHTML = `<div class="trade-money-label">Zaplatíte mu:</div><div style="font-family:var(--font-h);font-size:1.5rem;color:var(--red)">${fmt(request.money)} Kč</div>`;
    rightCol.appendChild(mbox);
  }
  cols.appendChild(rightCol);

  dom.tradeContent.appendChild(cols);

  // Navigation
  if (myOffers.length > 1) {
    const nav = makeEl('div', 'trade-nav');
    nav.style.display = 'flex';
    nav.style.justifyContent = 'center';
    nav.style.gap = '20px';
    nav.style.margin = '20px 0';

    const prevBtn = makeEl('button', 'btn btn-outline', '← Předchozí');
    prevBtn.disabled = currentIdx === 0;
    prevBtn.onclick = () => renderIncomingTradeOffer(myOffers[currentIdx - 1], gameState, onClose);
    
    const nextBtn = makeEl('button', 'btn btn-outline', 'Další →');
    nextBtn.disabled = currentIdx === myOffers.length - 1;
    nextBtn.onclick = () => renderIncomingTradeOffer(myOffers[currentIdx + 1], gameState, onClose);

    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);
    dom.tradeContent.appendChild(nav);
  }

  // Footer
  const footer = makeEl('div', 'trade-footer');

  const handleNextOrClose = () => {
    const remainingOffers = myOffers.filter(o => o.id !== offerData.id);
    if (remainingOffers.length > 0) {
      const nextIdx = Math.min(currentIdx, remainingOffers.length - 1);
      // Wait slightly to let closeTradeModal finish hiding, then re-open
      setTimeout(() => renderIncomingTradeOffer(remainingOffers[nextIdx], gameState, onClose), 50);
    } else {
      if (onClose) onClose();
    }
  };

  if (isOutgoing) {
    const targetPlayer = gameState.players.find(p => p.id === offerData.targetId);
    footer.appendChild(makeEl('div', 'dim', `Čeká se na odpověď hráče ${targetPlayer?.name ?? '...'}...`));
  } else {
    const rejectBtn = makeEl('button', 'btn btn-outline');
    setIconText(rejectBtn, 'zavrit', 'Odmítnout');
    rejectBtn.onclick = () => {
      audioManager.play('trade_reject');
      socket.emit('game:respond', { decision: 'reject', tradeOfferId: offerData.id });
      closeTradeModal();
      handleNextOrClose();
    };
    footer.appendChild(rejectBtn);

    const counterBtn = makeEl('button', 'btn btn-outline');
    setIconText(counterBtn, 'obchod', 'Protinabídka');
    counterBtn.onclick = () => {
      setTradeDraft({
        targetId: fromId,
        offer:   { horses: [...(request.horses || [])], money: request.money || 0, jailCard: !!request.jailCard },
        request: { horses: [...(offer.horses  || [])], money: offer.money  || 0, jailCard: !!offer.jailCard },
        context: 'counter',
      });
      renderTradeBuild(gameState, me, () => renderIncomingTradeOffer(offerData, gameState, onClose), fromId, ({ offer, request }) => {
        socket.emit('game:respond', { decision: 'counter', tradeOfferId: offerData.id, offer, request });
        setTradeDraft(null);
        handleNextOrClose();
      });
    };
    footer.appendChild(counterBtn);

    const acceptBtn = makeEl('button', 'btn btn-green');
    setIconText(acceptBtn, 'prijmout', 'Přijmout');
    acceptBtn.onclick = () => {
      audioManager.play('trade_accept');
      socket.emit('game:respond', { decision: 'accept', tradeOfferId: offerData.id });
      closeTradeModal();
      handleNextOrClose();
    };
    footer.appendChild(acceptBtn);
  }

  dom.tradeContent.appendChild(footer);
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
