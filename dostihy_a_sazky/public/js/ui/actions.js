import { makeEl, fmt, safeColor } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { showCardOverlay, hideCardOverlay } from '../animations/cards.js';
import { runStarterAnimation } from '../animations/starter.js';
import { audioManager } from '../audio.js';
import { actionBtn, buildWaitEl } from './actionsHelpers.js';
import { tradeDraft, setTradeDraft, renderTradeBuild, renderTradeOffer } from './actionsTrade.js';

/** Spustí trade builder pro daného hráče — lze volat z jiných modulů (players.js) */
export function startTradeWith(targetId, gameState, me) {
  setTradeDraft({ targetId, offer: { horses: [], money: 0 }, request: { horses: [], money: 0 }, context: 'wait_roll' });
  updateActionPanel(gameState);
}

// ─── Hlavní funkce ────────────────────────────────────────────────────────────

export function updateActionPanel(gameState) {
  const pa = gameState.pendingAction;

  if (!pa || pa.type !== 'card_ack') hideCardOverlay();

  if (!pa || pa.type !== 'wait_roll' || pa.targetId !== state.myId) setTradeDraft(null);

  if (!pa) {
    if (dom.actionTitle) dom.actionTitle.textContent = 'Akce';
    if (dom.actionContent) {
      dom.actionContent.innerHTML = '';
      const p = makeEl('p', 'dim');
      p.style.cssText = 'text-align:center;padding:20px 0';
      p.textContent = '⏳ Zpracovávám...';
      dom.actionContent.appendChild(p);
    }
    return;
  }

  const isTargeted   = pa.targetId === state.myId;
  const targetPlayer = gameState.players.find(p => p.id === pa.targetId);
  const me           = gameState.players.find(p => p.id === state.myId);

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
    case 'wait_roll':    renderWaitRoll(isTargeted, targetPlayer, gameState, me); break;
    case 'service_roll': renderServiceRoll(isTargeted, targetPlayer, pa); break;
    case 'buy_offer':    renderBuyOffer(isTargeted, targetPlayer, pa, me); break;
    case 'buyout_offer': renderBuyoutOffer(isTargeted, targetPlayer, pa); break;
    case 'debt_manage':  renderDebtManage(isTargeted, targetPlayer, gameState, me); break;
    case 'card_ack':     renderCardAck(isTargeted, targetPlayer, pa); break;
    case 'jail_choice':  renderJailChoice(isTargeted, targetPlayer); break;
    case 'token_manage': renderTokenManage(isTargeted, targetPlayer, pa, gameState, me); break;
    case 'trade_offer':  renderTradeOffer(isTargeted, targetPlayer, pa, gameState); break;
    case 'game_over':    renderGameOver(pa.winner, pa.reason); break;
    default:
      dom.actionContent.innerHTML = '';
      dom.actionContent.appendChild(makeEl('p', 'dim', '...'));
  }
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
  const card     = makeEl('div', 'buy-card');

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
  const cost  = pa.data.buyoutCost;
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
  dom.actionTitle.textContent = 'Dluh! Prodejte majetek';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'řeší své dluhy...'));
    return;
  }

  if (tradeDraft?.context === 'debt_manage') {
    renderTradeBuild(gameState, me, () => {
      const self = gameState.players.find(p => p.id === state.myId);
      renderDebtManage(true, self, gameState, me);
    });
    return;
  }

  const warn = makeEl('div', 'jail-display');
  warn.style.cssText = 'border-color:var(--red);padding:10px;margin-bottom:10px;border:1px solid var(--red)';
  warn.textContent = `⚠️ Jste v mínusu: ${fmt(me.balance)} Kč! Musíte prodat majetek nebo zkrachovat.`;
  dom.actionContent.appendChild(warn);

  const list = makeEl('div', 'token-list');
  list.style.marginTop = '10px';

  if (me.properties?.length) {
    me.properties.forEach(sid => {
      const sp  = state.boardData[sid];
      const tok = gameState.tokens[sid];
      let val   = Math.floor(sp.price / 2);
      if (tok) {
        if (tok.big)        val += Math.floor(sp.bigTokenCost / 2) + Math.floor(sp.tokenCost / 2) * 4;
        else if (tok.small) val += Math.floor(sp.tokenCost / 2) * tok.small;
      }

      const item    = makeEl('div', 'token-item');
      const nameDiv = makeEl('div', 'tok-name', `${sp.name} (+ ${fmt(val)} Kč)`);
      nameDiv.style.cssText = `border-left:3px solid ${safeColor(sp.groupColor, '#5b8dee')};padding-left:6px`;
      const btnsDiv = makeEl('div', 'tok-btns');
      btnsDiv.appendChild(actionBtn('Prodat', 'btn btn-xs btn-outline', () =>
        socket.emit('game:respond', { decision: 'sell_property', spaceId: sid })
      ));
      item.appendChild(nameDiv);
      item.appendChild(btnsDiv);
      list.appendChild(item);
    });
  } else {
    list.appendChild(makeEl('p', 'dim', 'Žádný majetek k prodeji.'));
  }
  dom.actionContent.appendChild(list);

  const others = gameState.players.filter(p => p.id !== state.myId && !p.bankrupt);
  if (others.length > 0) {
    const negotiateBtn = actionBtn('🤝 Vyjednat obchod', 'btn-outline', () => {
      setTradeDraft({ targetId: others[0].id, offer: { horses: [], money: 0 }, request: { horses: [], money: 0 }, context: 'debt_manage' });
      renderDebtManage(isTargeted, targetPlayer, gameState, me);
    });
    negotiateBtn.style.cssText = 'margin-top:10px;width:100%';
    dom.actionContent.appendChild(negotiateBtn);
  }

  const bankruptBtn = actionBtn('Vyhlásit bankrot 💀', 'btn-red', () =>
    socket.emit('game:respond', { decision: 'declare_bankrupt' })
  );
  bankruptBtn.style.cssText = 'margin-top:6px;width:100%';
  dom.actionContent.appendChild(bankruptBtn);
}

function renderCardAck(isTargeted, targetPlayer, pa) {
  const { card, label } = pa.data;
  dom.actionTitle.textContent = 'Tažená karta';
  dom.actionContent.innerHTML = '';

  const cardDiv = makeEl('div', 'card-display');
  cardDiv.appendChild(makeEl('div', 'card-header', label));
  if (card.amount) {
    const isPay  = card.type === 'pay' || card.type === 'pay_to_all';
    const impact = makeEl('div', `card-impact ${isPay ? 'neg' : 'pos'}`);
    impact.textContent = (isPay ? '-' : '+') + fmt(card.amount) + ' Kč';
    cardDiv.appendChild(impact);
  }
  cardDiv.appendChild(makeEl('div', 'card-text', card.text));
  dom.actionContent.appendChild(cardDiv);

  if (isTargeted) {
    dom.actionContent.appendChild(
      actionBtn('Rozumím', 'btn-gold btn-lg', () => socket.emit('game:respond', { decision: 'ok' }))
    );
  } else {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'čte kartu...'));
  }

  showCardOverlay(label, card.text, isTargeted, () => socket.emit('game:respond', { decision: 'ok' }));
}

function renderJailChoice(isTargeted, targetPlayer) {
  dom.actionTitle.textContent = 'Distanc 🔒';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'je v Distancu...'));
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
  const list     = makeEl('div', 'token-list');
  const eligible = pa.data.eligible || [];

  if (!eligible.length) {
    list.appendChild(makeEl('p', 'dim', 'Nelze přidat žetony (nedostatek peněz nebo žetonů).'));
  } else {
    eligible.forEach(sid => {
      const sp   = state.boardData[sid];
      const tok  = gameState.tokens[sid] || { small: 0, big: false };
      const canS = !tok.big && tok.small < 4  && (me?.balance ?? 0) >= sp.tokenCost;
      const canB = !tok.big && tok.small >= 4 && (me?.balance ?? 0) >= sp.bigTokenCost;

      const item    = makeEl('div', 'token-item');
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
