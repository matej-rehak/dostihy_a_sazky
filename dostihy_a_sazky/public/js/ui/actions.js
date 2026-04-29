import { makeEl, fmt, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { showCardOverlay, hideCardOverlay } from '../animations/cards.js';
import { runStarterAnimation } from '../animations/starter.js';
import { audioManager } from '../audio.js';
import { actionBtn, buildWaitEl } from './actionsHelpers.js';
import { tradeDraft, setTradeDraft, renderTradeBuild, renderTradeOffer, renderIncomingTradeOffer } from './actionsTrade.js';
import { renderDebtModal } from './actionsDebt.js';

/** Spustí trade builder pro daného hráče — lze volat z jiných modulů (players.js) */
export function startTradeWith(targetId, gameState, me) {
  const pa = gameState?.pendingAction;

  // Pokud je protihráč v dluhu a já nejsem dlužník, jsem "spectator" dluhové situace.
  // updateActionPanel by zavolal renderDebtManage(isTargeted=false) a hned vrátil —
  // renderTradeBuild by se nikdy nezavolal. Proto modal otevřeme přímo.
  const isOpponentDebt = pa?.type === 'debt_manage' && pa?.targetId !== state.myId;

  const context = pa?.targetId === state.myId && (pa?.type === 'debt_manage' || pa?.type === 'jail_choice')
    ? pa.type
    : 'wait_roll';

  setTradeDraft({ targetId, offer: { horses: [], money: 0 }, request: { horses: [], money: 0 }, context });

  if (isOpponentDebt) {
    // Přímé otevření obchodního modalu bez průchodu přes action panel
    renderTradeBuild(gameState, me, () => {
      setTradeDraft(null);
      updateActionPanel(gameState);
    });
  } else {
    updateActionPanel(gameState);
  }
}

// ─── Hlavní funkce ────────────────────────────────────────────────────────────

export function updateActionPanel(gameState) {
  const pa = gameState.pendingAction;

  if (!pa || pa.type !== 'card_ack') hideCardOverlay();

  // Skrýt dluhový modal pokud akce už není debt_manage
  if (pa?.type !== 'debt_manage' && dom.debtOverlay) {
    dom.debtOverlay.classList.add('hidden');
  }

  // Skrýt obchodní modal pokud jsme zpět v debt_manage (obchod byl zpracován)
  // nebo pokud čekáme na odpověď protihráče na trade_offer a my nejsme cíl
  const tradeOverlayShouldClose =
    (pa?.type === 'debt_manage' && !tradeDraft) ||
    (pa?.type === 'trade_offer' && pa?.targetId !== state.myId && pa?.data?.fromId !== state.myId);
  if (tradeOverlayShouldClose && dom.tradeOverlay) {
    dom.tradeOverlay.classList.add('hidden');
  }

  const canKeepTradeDraft = pa
    && pa.targetId === state.myId
    && (pa.type === 'wait_roll' || pa.type === 'debt_manage' || pa.type === 'jail_choice');
  if (!canKeepTradeDraft) setTradeDraft(null);

  // --- Auto-open novou příchozí nabídku ---
  const myIncoming = gameState.tradeOffers?.filter(o => o.targetId === state.myId) || [];
  const incomingCount = myIncoming.length;
  if (incomingCount > (state.lastIncomingCount || 0) && !tradeDraft) {
    state.lastIncomingCount = incomingCount;
    // Přebít zobrazení a hned otevřít novou nabídku
    import('./actionsTrade.js').then(({ renderIncomingTradeOffer }) => {
      renderIncomingTradeOffer(myIncoming[myIncoming.length - 1], gameState);
    });
  }
  state.lastIncomingCount = incomingCount;
  // ----------------------------------------

  if (!pa) {
    if (dom.actionTitle) dom.actionTitle.textContent = 'Akce';
    if (dom.actionContent) {
      dom.actionContent.innerHTML = '';
      const p = makeEl('p', 'dim');
      p.style.cssText = 'text-align:center;padding:20px 0';
      p.textContent = '⏳ Zpracovávám...';
      dom.actionContent.appendChild(p);
    }
    appendUniversalOffersButton(gameState);
    return;
  }

  const me = gameState.players.find(p => p.id === state.myId);
  const isPublicTrade = pa.type === 'trade_offer' && pa.targetId === null;
  const isTargeted = isPublicTrade
    ? (pa.data.fromId !== state.myId)
    : (pa.targetId === state.myId);
  const targetPlayer = isPublicTrade ? null : gameState.players.find(p => p.id === pa.targetId);

  if (pa.type === 'selecting_starter') {
    if (!state.isStarterAnimating) {
      state.isStarterAnimating = true;
      runStarterAnimation(pa.data.starterId, gameState.players);
    }
  } else {
    state.isStarterAnimating = false;
    document.getElementById('starter-overlay')?.classList.add('hidden');
  }

  if (!dom.actionTitle || !dom.actionContent) return;

  switch (pa.type) {
    case 'wait_roll': renderWaitRoll(isTargeted, targetPlayer, gameState, me); break;
    case 'service_roll': renderServiceRoll(isTargeted, targetPlayer, pa); break;
    case 'buy_offer': renderBuyOffer(isTargeted, targetPlayer, pa, me); break;
    case 'buyout_offer': renderBuyoutOffer(isTargeted, targetPlayer, pa); break;
    case 'debt_manage': renderDebtManage(isTargeted, targetPlayer, gameState, me); break;
    case 'card_ack': renderCardAck(isTargeted, targetPlayer, pa); break;
    case 'jail_choice': renderJailChoice(isTargeted, targetPlayer, gameState, me); break;
    case 'token_manage': renderTokenManage(isTargeted, targetPlayer, pa, gameState, me); break;
    case 'trade_offer': renderTradeOffer(isTargeted, targetPlayer, pa, gameState); break;
    case 'airport_choice': renderAirportChoice(isTargeted, targetPlayer, pa, me); break;
    case 'airport_select_target': renderAirportSelectTarget(isTargeted, targetPlayer, pa, gameState, me); break;
    case 'game_over': renderGameOver(pa.winner, pa.reason); break;
    default:
      dom.actionContent.innerHTML = '';
      dom.actionContent.appendChild(makeEl('p', 'dim', '...'));
  }

  // Univerzální entry-point pro obchodní nabídky — dostupný v libovolném stavu akčního panelu,
  // aby hráč po zavření trade modalu (přes X) měl vždy cestu zpět k vyřízení nabídky/protinabídky.
  appendUniversalOffersButton(gameState);
}

function appendUniversalOffersButton(gameState) {
  if (!dom.actionContent) return;
  // Skip pokud je herní konec — duplicitní button by se míchal s game-over UI
  if (gameState?.pendingAction?.type === 'game_over') return;

  const myOffers = gameState.tradeOffers?.filter(o =>
    o.targetId === state.myId || o.fromId === state.myId || o.targetId === null
  ) || [];
  if (!myOffers.length) return;

  const btn = makeEl('button', 'btn btn-gold trade-offers-btn', `📩 Obchodní nabídky (${myOffers.length})`);
  btn.style.marginTop = '8px';
  btn.style.width = '100%';
  btn.onclick = () => renderIncomingTradeOffer(myOffers[0], gameState);
  dom.actionContent.appendChild(btn);
}

// ─── Rendery jednotlivých akcí ────────────────────────────────────────────────

function renderWaitRoll(isTargeted, targetPlayer, gameState, me) {
  dom.actionTitle.textContent = isTargeted ? 'Váš tah' : 'Čeká se...';
  dom.actionContent.innerHTML = '';
  if (isTargeted) {
    if (tradeDraft !== null) {
      renderTradeBuild(gameState, me, () => {
        const self = gameState.players.find(p => p.id === state.myId);
        renderWaitRoll(true, self, gameState, me);
      });
      return;
    }
    dom.actionContent.appendChild(makeEl('p', 'action-desc', `Jste na řadě, ${targetPlayer?.name ?? ''}!`));
    dom.actionContent.appendChild(actionBtn('🎲 Hodit kostkou', 'btn-gold btn-lg', () => socket.emit('game:roll')));

    // (Tlačítko pro příchozí nabídky obchodu je univerzálně přidáno v appendUniversalOffersButton)

    const others = gameState.players.filter(p => p.id !== state.myId && !p.bankrupt);
    if (others.length > 0) {
      const tradeBtn = actionBtn('🤝 Navrhnout obchod', 'btn-outline', () => {
        setTradeDraft({ targetId: others[0].id, offer: { horses: [], money: 0 }, request: { horses: [], money: 0 }, context: 'wait_roll' });
        renderWaitRoll(isTargeted, targetPlayer, gameState, me);
      });
      tradeBtn.style.marginTop = '6px';
      dom.actionContent.appendChild(tradeBtn);
    }
  } else {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'čeká na hod kostkou...'));
  }
}

function renderServiceRoll(isTargeted, targetPlayer, pa) {
  dom.actionTitle.textContent = isTargeted ? 'Poplatek za služby' : 'Čeká se...';
  dom.actionContent.innerHTML = '';
  if (isTargeted) {
    const info = makeEl('div', 'jail-display');
    info.style.cssText = 'border-color:var(--blue);padding:10px;margin-bottom:10px;border:1px solid var(--blue)';
    info.textContent = `🏠 Musíte hodit kostkou pro určení poplatku! Pole: ${state.boardData?.[pa.data.spaceId]?.name ?? '?'}`;
    dom.actionContent.appendChild(info);
    dom.actionContent.appendChild(actionBtn('🎲 Hodit pro poplatek', 'btn-gold btn-lg', () => socket.emit('game:roll')));
  } else {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'hází kostkou pro určení poplatku...'));
  }
}

function renderBuyOffer(isTargeted, targetPlayer, pa, me) {
  const space = state.boardData[pa.data.spaceId];
  dom.actionTitle.textContent = 'Nabídka koupě';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, `zvažuje koupi ${space.name}`));
    return;
  }

  const balAfter = (me?.balance ?? 0) - space.price;
  const card = makeEl('div', 'buy-card');

  const strip = makeEl('div', 'buy-strip');
  strip.style.background = safeColor(space.groupColor ?? '#5b8dee', '#5b8dee');
  card.appendChild(strip);

  const body = makeEl('div', 'buy-body');
  body.appendChild(makeEl('div', 'buy-name', space.name));
  body.appendChild(makeEl('div', 'buy-price', `Cena: ${fmt(space.price)} Kč`));

  const rents = space.rents || [];
  if (rents.length) {
    const table = makeEl('div', 'rent-table');
    [[0, 'Základní'], [1, '1 žeton'], [5, 'Velký dostih']].forEach(([i, lbl]) => {
      const row = makeEl('div', 'rent-row');
      row.appendChild(makeEl('span', '', lbl + ':'));
      row.appendChild(makeEl('span', 'rent-val', `${fmt(rents[i])} Kč`));
      table.appendChild(row);
    });
    body.appendChild(table);
  }

  const rest = makeEl('div', 'buy-rest');
  rest.appendChild(document.createTextNode('Zůstatek po koupi: '));
  const strong = makeEl('strong', '', `${fmt(balAfter)} Kč`);
  strong.style.color = balAfter < 0 ? 'var(--red)' : 'var(--green)';
  rest.appendChild(strong);
  body.appendChild(rest);

  if (balAfter < 0) showBrokeOverlay(space.name, Math.abs(balAfter));

  const btns = makeEl('div', 'action-buttons row');
  btns.style.marginTop = '6px';
  if (balAfter >= 0) {
    btns.appendChild(actionBtn('Koupit', 'btn-green', () =>
      socket.emit('game:respond', { decision: 'buy', spaceId: pa.data.spaceId })
    ));
  }
  btns.appendChild(actionBtn('Nechci koupit', 'btn-outline', () =>
    socket.emit('game:respond', { decision: 'pass', spaceId: pa.data.spaceId })
  ));
  body.appendChild(btns);
  card.appendChild(body);
  dom.actionContent.appendChild(card);
}

function renderBuyoutOffer(isTargeted, targetPlayer, pa) {
  const space = state.boardData[pa.data.spaceId];
  const cost = pa.data.buyoutCost;
  dom.actionTitle.textContent = 'Nepřátelský odkup';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'zvažuje odkup cizí stáje...'));
    return;
  }

  const info = makeEl('div', 'jail-display');
  info.style.cssText = 'border-color:var(--gold);padding:10px;margin-bottom:10px;border:1px solid var(--gold)';
  info.appendChild(document.createTextNode(`Chcete nuceně odkoupit stáj ${space.name}? Stojí to `));
  const priceSpan = makeEl('strong', '', `${fmt(cost)} Kč`);
  priceSpan.style.color = 'var(--gold)';
  info.appendChild(priceSpan);
  info.appendChild(document.createTextNode('.'));
  dom.actionContent.appendChild(info);

  const btns = makeEl('div', 'action-buttons row');
  btns.appendChild(actionBtn('Odkoupit', 'btn-gold', () => socket.emit('game:respond', { decision: 'buy' })));
  btns.appendChild(actionBtn('Ne, díky', 'btn-outline', () => socket.emit('game:respond', { decision: 'pass' })));
  dom.actionContent.appendChild(btns);
}


function renderDebtManage(isTargeted, targetPlayer, gameState, me) {
  dom.actionTitle.textContent = isTargeted ? 'Bankrot!' : 'Dluhy...';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'řeší své dluhy...'));
    dom.debtOverlay.classList.add('hidden');

    if (targetPlayer && !targetPlayer.bankrupt) {
      const tradeBtn = actionBtn(`🤝 Nabídnout obchod`, 'btn-outline', () => startTradeWith(targetPlayer.id, gameState, me));
      tradeBtn.style.marginTop = '10px';
      dom.actionContent.appendChild(tradeBtn);
    }
    return;
  }

  // If trade modal is active for debt_manage, sidebar should show wait
  if (tradeDraft?.context === 'debt_manage' && dom.tradeOverlay && !dom.tradeOverlay.classList.contains('hidden')) {
    dom.actionContent.appendChild(makeEl('p', 'dim', 'Probíhá vyjednávání v obchodě...'));
    return;
  }

  renderDebtModal(true, targetPlayer, gameState, me);

  // Sidebar backup
  const info = makeEl('div', 'jail-display');
  info.style.cssText = 'border-color:var(--red);padding:10px;border:1px solid var(--red)';
  info.textContent = `⚠️ Máte dluh ${fmt(me.balance)} Kč. Otevřeno okno pro prodej majetku.`;
  dom.actionContent.appendChild(info);
  
  // Idempotentní toggle — modal lze zavřít křížkem a znovu otevřít opakovaně, proto bez auto-disable.
  const reopenBtn = makeEl('button', 'btn btn-red btn-sm', 'Otevřít správu dluhu');
  reopenBtn.style.marginTop = '10px';
  reopenBtn.addEventListener('click', () => {
    audioManager.play('click');
    renderDebtModal(true, targetPlayer, gameState, me);
  });
  dom.actionContent.appendChild(reopenBtn);
}

function renderCardAck(isTargeted, targetPlayer, pa) {
  const { card, label } = pa.data;
  dom.actionTitle.textContent = 'Tažená karta';
  dom.actionContent.innerHTML = '';

  // We don't show the card details in the sidebar anymore since we have the 3D overlay
  // This avoids the "white field" description the user wants to remove.

  if (isTargeted) {
    dom.actionContent.appendChild(
      actionBtn('Rozumím', 'btn-gold btn-lg', () => socket.emit('game:respond', { decision: 'ok' }))
    );
  } else {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'čte kartu...'));
  }

  showCardOverlay(label, card.text, isTargeted, () => socket.emit('game:respond', { decision: 'ok' }));
}

function renderJailChoice(isTargeted, targetPlayer, gameState, me) {
  dom.actionTitle.textContent = 'Distanc 🔒';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'je v Distancu...'));
    return;
  }

  if (tradeDraft?.context === 'jail_choice') {
    renderTradeBuild(gameState, me, () => {
      const self = gameState.players.find(p => p.id === state.myId);
      renderJailChoice(true, self, gameState, me);
    });
    return;
  }

  const jt = targetPlayer?.jailTurns ?? 0;
  const jailDiv = makeEl('div', 'jail-display');
  jailDiv.appendChild(makeEl('div', 'jail-icon', '🔒'));

  const txt = makeEl('p', 'jail-text');
  txt.appendChild(document.createTextNode('Jste v Distancu!'));
  txt.appendChild(document.createElement('br'));
  txt.appendChild(document.createTextNode('Zbývá: '));
  txt.appendChild(makeEl('strong', '', String(jt)));
  txt.appendChild(document.createTextNode(` ${jt === 1 ? 'kolo' : 'kola'}`));
  jailDiv.appendChild(txt);

  const actBtns = makeEl('div', 'action-buttons');
  actBtns.appendChild(actionBtn('🎲 Hodit (6 = volno)', 'btn-outline', () => socket.emit('game:respond', { decision: 'roll_jail' })));
  jailDiv.appendChild(actBtns);

  if (targetPlayer?.jailFreeCards > 0) {
    jailDiv.appendChild(
      actionBtn('🔓 Použít kartu "Zrušen distanc"', 'btn-gold', () => {
        audioManager.play('card');
        socket.emit('game:respond', { decision: 'use_jail_card' });
      })
    );
  }
  const others = gameState.players.filter(p => p.id !== state.myId && !p.bankrupt);
  if (others.length > 0) {
    const tradeBtn = actionBtn('🤝  Navrhnout obchod', 'btn-outline', () => {
      setTradeDraft({ targetId: others[0].id, offer: { horses: [], money: 0 }, request: { horses: [], money: 0 }, context: 'jail_choice' });
      renderJailChoice(true, targetPlayer, gameState, me);
    });
    tradeBtn.style.cssText = 'margin-top:8px;width:100%';
    jailDiv.appendChild(tradeBtn);
  }
  dom.actionContent.appendChild(jailDiv);
}

function renderTokenManage(isTargeted, targetPlayer, pa, gameState, me) {
  dom.actionTitle.textContent = 'Přidat žetony';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'spravuje své stáje...'));
    return;
  }

  dom.actionContent.appendChild(makeEl('p', 'token-intro', 'Přidat žetony dostihů ke svým stájím?'));
  const list = makeEl('div', 'token-list');
  const eligible = pa.data.eligible || [];

  if (!eligible.length) {
    list.appendChild(makeEl('p', 'dim', 'Nelze přidat žetony (nedostatek peněz nebo žetonů).'));
  } else {
    eligible.forEach(sid => {
      const sp = state.boardData[sid];
      const tok = gameState.tokens[sid] || { small: 0, big: false };
      const canS = !tok.big && tok.small < 4 && (me?.balance ?? 0) >= sp.tokenCost;
      const canB = !tok.big && tok.small >= 4 && (me?.balance ?? 0) >= sp.bigTokenCost;

      const item = makeEl('div', 'token-item');
      const nameDiv = makeEl('div', 'tok-name', `${sp.name} — ${tok.small}× ${tok.big ? '🏆' : ''}`);
      nameDiv.style.cssText = `border-left:3px solid ${safeColor(sp.groupColor)};padding-left:6px`;
      item.appendChild(nameDiv);

      const btnsDiv = makeEl('div', 'tok-btns');
      if (canS) btnsDiv.appendChild(actionBtn(`+Žeton (${fmt(sp.tokenCost)} Kč)`, 'btn btn-xs btn-outline', () =>
        socket.emit('game:respond', { decision: 'add_token', spaceId: sid, tokenType: 'small' })
      ));
      if (canB) btnsDiv.appendChild(actionBtn(`+Hlavní (${fmt(sp.bigTokenCost)} Kč)`, 'btn btn-xs btn-gold', () =>
        socket.emit('game:respond', { decision: 'add_token', spaceId: sid, tokenType: 'big' })
      ));
      item.appendChild(btnsDiv);
      list.appendChild(item);
    });
  }
  dom.actionContent.appendChild(list);

  const endBtn = actionBtn('Ukončit tah →', 'btn-gold', () => socket.emit('game:respond', { decision: 'end_turn' }));
  endBtn.style.marginTop = '4px';
  dom.actionContent.appendChild(endBtn);
}

function renderAirportChoice(isTargeted, targetPlayer, pa, me) {
  dom.actionTitle.textContent = isTargeted ? 'Letiště ✈️' : 'Čeká se...';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'rozhoduje se na letišti...'));
    return;
  }

  const fee = pa.data?.fee ?? 0;
  const hasMoney = (me?.balance ?? 0) >= fee;

  const info = makeEl('div', 'jail-display');
  info.style.cssText = 'border-color:var(--gold);padding:10px;margin-bottom:10px;border:1px solid var(--gold)';
  info.appendChild(document.createTextNode('Stojíš na letišti. Můžeš letět na libovolné pole za poplatek '));
  info.appendChild(makeEl('strong', '', `${fmt(fee)} Kč`));
  info.appendChild(document.createTextNode(', nebo hodit kostkou jako obvykle.'));
  dom.actionContent.appendChild(info);

  const btns = makeEl('div', 'action-buttons');
  btns.appendChild(actionBtn('🎲 Hodit kostkou', 'btn-gold btn-lg', () =>
    socket.emit('game:respond', { decision: 'roll' })
  ));

  const flyBtn = actionBtn(`✈️ Letět (${fmt(fee)} Kč)`, hasMoney ? 'btn-gold btn-lg' : 'btn-outline btn-lg', () => {
    if (!hasMoney) return;
    socket.emit('game:respond', { decision: 'fly' });
  });
  if (!hasMoney) {
    flyBtn.disabled = true;
    flyBtn.title = 'Nemáš dostatek peněz';
  }
  btns.appendChild(flyBtn);
  dom.actionContent.appendChild(btns);
}

function renderAirportSelectTarget(isTargeted, targetPlayer, pa, gameState, me) {
  dom.actionTitle.textContent = isTargeted ? 'Vyber cíl letu ✈️' : 'Čeká se...';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'vybírá cíl letu...'));
    return;
  }

  const fee = pa.data?.fee ?? 0;
  const hasMoney = (me?.balance ?? 0) >= fee;

  const info = makeEl('div', 'jail-display');
  info.style.cssText = 'border-color:var(--gold);padding:10px;margin-bottom:10px;border:1px solid var(--gold)';
  info.appendChild(makeEl('div', 'jail-icon', '✈️'));
  const txt = makeEl('p', 'jail-text');
  txt.appendChild(document.createTextNode('Klikni na pole na herním plánu, kam chceš letět.'));
  txt.appendChild(document.createElement('br'));
  txt.appendChild(document.createTextNode('Poplatek: '));
  txt.appendChild(makeEl('strong', '', `${fmt(fee)} Kč`));
  if (!hasMoney) {
    txt.appendChild(document.createElement('br'));
    const warn = makeEl('span', '', '⚠️ Nemáš dost peněz!');
    warn.style.color = 'var(--red)';
    txt.appendChild(warn);
  }
  info.appendChild(txt);
  dom.actionContent.appendChild(info);

  const cancelBtn = actionBtn('✖ Zrušit (raději hodím kostkou)', 'btn-outline', () =>
    socket.emit('game:respond', { decision: 'cancel' })
  );
  dom.actionContent.appendChild(cancelBtn);
}

function showBrokeOverlay(propertyName, shortage) {
  const existing = document.getElementById('broke-overlay');
  if (existing) existing.remove();

  const overlay = makeEl('div', 'broke-overlay');
  overlay.id = 'broke-overlay';

  const card = makeEl('div', 'broke-card');
  card.appendChild(makeEl('div', 'broke-icon', '💸'));
  card.appendChild(makeEl('div', 'broke-title', 'Nedostatek peněz'));
  card.appendChild(makeEl('div', 'broke-property', propertyName));
  card.appendChild(makeEl('div', 'broke-amount', `Chybí ${fmt(shortage)} Kč`));
  overlay.appendChild(card);

  const dismiss = () => overlay.remove();
  overlay.addEventListener('click', dismiss);
  document.body.appendChild(overlay);
  setTimeout(dismiss, 3000);
}

function renderGameOver(winner, reason) {
  dom.actionTitle.textContent = '🏆 Konec hry';
  dom.actionContent.innerHTML = '';

  const goDiv = makeEl('div', 'gameover-display');
  goDiv.appendChild(makeEl('div', 'gameover-trophy', '🏆'));
  if (reason === 'time_limit') {
    goDiv.appendChild(makeEl('p', 'dim', 'Hra skončila po vypršení časového limitu.'));
  }
  goDiv.appendChild(makeEl('div', 'gameover-title', winner ? `${winner.name} vyhrál(a)!` : 'Konec hry!'));
  if (winner) goDiv.appendChild(makeEl('div', 'gameover-balance', `Výsledný zůstatek: ${fmt(winner.balance)} Kč`));

  const replayBtn = makeEl('button', 'btn btn-gold btn-lg', 'Hrát znovu');
  replayBtn.addEventListener('click', () => window.__resetLocalState?.());
  goDiv.appendChild(replayBtn);
  dom.actionContent.appendChild(goDiv);
}
