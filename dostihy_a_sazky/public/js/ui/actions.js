import { makeEl, fmt, safeColor, uiIcon, imgIcon, setIconText } from '../utils.js';
import { dom } from '../dom.js';
import { state } from '../state.js';
import { socket } from '../socket.js';
import { showCardOverlay, hideCardOverlay } from '../animations/cards.js';
import { showRouletteOverlay, hideRouletteOverlay } from '../animations/roulette.js';
import { isEffectEnabled } from '../settings.js';
import { runStarterAnimation, stopStarterAnimation } from '../animations/starter.js';
import { audioManager } from '../audio.js';
import { actionBtn, iconBtn, buildWaitEl } from './actionsHelpers.js';
import { tradeDraft, setTradeDraft, renderTradeBuild, renderTradeOffer, renderIncomingTradeOffer } from './actionsTrade.js';
import { renderDebtModal } from './actionsDebt.js';
import { openBankSale, syncBankSale } from './actionsBankSale.js';
import { openDiceBet, syncDiceBet } from './diceBet.js';
import { horsePortrait } from '../horsePortraits.js';
import { priced } from './inflation.mjs';
import { playConfetti } from '../animations/confetti.js';
import { stableConfettiColors } from '../animations/confettiGate.mjs';
import { stableName } from './stableNames.mjs';
import { decisionTimerBar } from './decisionTimer.js';
import { previewText } from './rollPreview.mjs';

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
  syncRouletteOverlay(gameState);
  // Otevřené okno prodeje bance: obnovit po prodeji, nebo zavřít, když tah pokročil.
  syncBankSale(gameState);
  syncDiceBet(gameState);

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
      setIconText(p, 'cekani', 'Zpracovávám...');
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
    // Zrušit i běžící losování — jinak by doběhlo do skrytého overlaye a
    // další `selecting_starter` by nad ním rozjel druhé.
    stopStarterAnimation();
    document.getElementById('starter-overlay')?.classList.add('hidden');
  }

  if (pa.type !== 'insufficient_funds' && pa.type !== 'airport_choice' && pa.type !== 'airport_select_target' && pa.type !== 'roulette_choice') {
    state.lastInsufficientFundsKey = null;
  }

  if (!dom.actionTitle || !dom.actionContent) return;

  switch (pa.type) {
    case 'wait_roll': renderWaitRoll(isTargeted, targetPlayer, gameState, me); break;
    case 'service_roll': renderServiceRoll(isTargeted, targetPlayer, pa); break;
    case 'insufficient_funds': renderInsufficientFunds(isTargeted, targetPlayer, pa); break;
    case 'buy_offer': renderBuyOffer(isTargeted, targetPlayer, pa, me, gameState); break;
    case 'buyout_offer': renderBuyoutOffer(isTargeted, targetPlayer, pa); break;
    case 'reroll_offer': renderRerollOffer(isTargeted, targetPlayer, pa); break;
    case 'debt_manage': renderDebtManage(isTargeted, targetPlayer, gameState, me); break;
    case 'card_ack': renderCardAck(isTargeted, targetPlayer, pa); break;
    case 'jail_choice': renderJailChoice(isTargeted, targetPlayer, gameState, me); break;
    case 'token_manage': renderTokenManage(isTargeted, targetPlayer, pa, gameState, me); break;
    case 'trade_offer': renderTradeOffer(isTargeted, targetPlayer, pa, gameState); break;
    case 'airport_choice': renderAirportChoice(isTargeted, targetPlayer, pa, me); break;
    case 'airport_select_target': renderAirportSelectTarget(isTargeted, targetPlayer, pa, gameState, me); break;
    case 'roulette_choice': renderRouletteChoice(isTargeted, targetPlayer, pa, me); break;
    case 'roulette_ack': renderRouletteAck(isTargeted, targetPlayer, pa); break;
    case 'roulette_pick_player': renderRoulettePickPlayer(isTargeted, targetPlayer, pa, gameState); break;
    case 'roulette_pick_horse': renderRoulettePickHorse(isTargeted, targetPlayer, pa); break;
    case 'roulette_give_horse': renderRouletteGiveHorse(isTargeted, targetPlayer, pa, gameState); break;
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

  const btn = makeEl('button', 'btn btn-gold trade-offers-btn');
  setIconText(btn, 'nabidka', `Obchodní nabídky (${myOffers.length})`);
  btn.style.marginTop = '8px';
  btn.style.width = '100%';
  btn.onclick = () => renderIncomingTradeOffer(myOffers[0], gameState);
  dom.actionContent.appendChild(btn);
}

// ─── Rendery jednotlivých akcí ────────────────────────────────────────────────

function renderInsufficientFunds(isTargeted, targetPlayer, pa) {
  const space = state.boardData[pa.data.spaceId];
  const shortage = pa.data.shortage ?? Math.max(0, (pa.data.price ?? 0) - (pa.data.balance ?? 0));
  const kind = pa.data.kind ?? 'property';
  const subject = kind === 'token'
    ? (pa.data.tokenType === 'big' ? `hlavní dostih na ${space?.name ?? 'stáji'}` : `žeton na ${space?.name ?? 'stáji'}`)
    : `${space?.name ?? 'toto pole'}`;

  dom.actionTitle.textContent = isTargeted ? 'Nedostatek pen\u011bz' : '\u010cek\u00e1 se...';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, `nemá dost peněz na ${kind === 'token' ? subject : `koupi ${subject}`}...`));
    return;
  }

  const key = `${pa.type}:${kind}:${pa.targetId}:${pa.data.spaceId}:${pa.data.price}:${pa.data.balance}`;
  if (state.lastInsufficientFundsKey !== key) {
    state.lastInsufficientFundsKey = key;
    showBrokeOverlay(kind === 'token' ? subject : (space?.name ?? 'Toto pole'), shortage);
  }

  const info = makeEl('div', 'jail-display');
  info.style.cssText = 'border-color:var(--red);padding:10px;margin-bottom:10px;border:1px solid var(--red)';
  const debtIcon = makeEl('div', 'jail-icon');
  debtIcon.appendChild(uiIcon('dluh'));
  info.appendChild(debtIcon);
  const text = makeEl('p', 'jail-text');
  text.appendChild(document.createTextNode(kind === 'token'
    ? `Na ${subject} nemáš dost peněz.`
    : `Na koupi ${subject} nemáš dost peněz.`
  ));
  text.appendChild(document.createElement('br'));
  text.appendChild(document.createTextNode('Chyb\u00ed: '));
  const amount = makeEl('strong', '', `${fmt(shortage)} Kč`);
  amount.style.color = 'var(--red)';
  text.appendChild(amount);
  info.appendChild(text);
  dom.actionContent.appendChild(info);
}
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
    dom.actionContent.appendChild(iconBtn('kostka', 'Hodit kostkou', 'btn-gold btn-lg', () => socket.emit('game:roll')));

    // (Tlačítko pro příchozí nabídky obchodu je univerzálně přidáno v appendUniversalOffersButton)

    const others = gameState.players.filter(p => p.id !== state.myId && !p.bankrupt);
    if (others.length > 0) {
      const tradeBtn = iconBtn('obchod', 'Navrhnout obchod', 'btn-outline', () => {
        setTradeDraft({ targetId: others[0].id, offer: { horses: [], money: 0 }, request: { horses: [], money: 0 }, context: 'wait_roll' });
        renderWaitRoll(isTargeted, targetPlayer, gameState, me);
      });
      tradeBtn.style.marginTop = '6px';
      dom.actionContent.appendChild(tradeBtn);
    }
    appendBankSaleButton(me, gameState);

    // Sázka na hod — poslední tlačítko; okno s volbou sázky má vlastní hod.
    if (gameState.config?.diceBetEnabled) {
      const betBtn = iconBtn('kostka', 'Sázka na hod', 'btn-outline', () => openDiceBet(gameState), { opensDialog: true });
      betBtn.style.marginTop = '6px';
      dom.actionContent.appendChild(betBtn);
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
    const svcSpace = state.boardData?.[pa.data.spaceId];
    info.textContent = `Musíte hodit kostkou pro určení poplatku! Pole: ${svcSpace?.name ?? '?'}`;
    if (svcSpace?.serviceType) info.prepend(imgIcon(`img/${svcSpace.serviceType}.png`, true));
    dom.actionContent.appendChild(info);
    dom.actionContent.appendChild(iconBtn('kostka', 'Hodit pro poplatek', 'btn-gold btn-lg', () => socket.emit('game:roll')));
  } else {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'hází kostkou pro určení poplatku...'));
  }
}

function renderBuyOffer(isTargeted, targetPlayer, pa, me, gameState) {
  const space = state.boardData[pa.data.spaceId];
  dom.actionTitle.textContent = 'Nabídka koupě';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, `zvažuje koupi ${space.name}`));
    return;
  }

  // Cena po inflaci; přednostní právo z Rulety ji půlí — stejně jako
  // EconomyMixin._effectiveBuyPrice na serveru.
  const fullPrice = priced(gameState, space.price);
  const price = me?.halfPriceNext ? Math.floor(fullPrice / 2) : fullPrice;
  const balAfter = (me?.balance ?? 0) - price;
  const card = makeEl('div', 'buy-card');

  const strip = makeEl('div', 'buy-strip');
  strip.style.background = safeColor(space.groupColor ?? '#5b8dee', '#5b8dee');
  card.appendChild(strip);

  const body = makeEl('div', 'buy-body');

  // Portrét jako čtvercový výřez hlavy vedle jména a ceny. Kůň stojí na
  // obrázku vpravo a hlava je vysoká — v širokém pruhu byla vidět jen půlka.
  const top = makeEl('div', 'buy-top');
  const portrait = horsePortrait(space.id);
  if (portrait) {
    const frame = makeEl('div', 'buy-portrait-frame');
    const img = makeEl('img', 'buy-portrait');
    img.src = portrait;
    img.alt = space.name;
    frame.appendChild(img);
    top.appendChild(frame);
  }
  const title = makeEl('div', 'buy-title');
  title.appendChild(makeEl('div', 'buy-name', space.name));
  title.appendChild(makeEl('div', 'buy-price', price === fullPrice
    ? `Cena: ${fmt(price)} Kč`
    : `Cena: ${fmt(price)} Kč (přednostní právo, jinak ${fmt(fullPrice)} Kč)`));
  top.appendChild(title);
  body.appendChild(top);

  const rents = space.rents || [];
  if (rents.length) {
    const table = makeEl('div', 'rent-table');
    [[0, 'Základní'], [1, '1 žeton'], [5, 'Velký dostih']].forEach(([i, lbl]) => {
      const row = makeEl('div', 'rent-row');
      row.appendChild(makeEl('span', '', lbl + ':'));
      row.appendChild(makeEl('span', 'rent-val', `${fmt(priced(gameState, rents[i]))} Kč`));
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

  const timer = decisionTimerBar(pa);
  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'zvažuje odkup cizí stáje...'));
    if (timer) dom.actionContent.appendChild(timer);
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
  if (timer) dom.actionContent.appendChild(timer);
}

/** Karta „Opakovaný hod": po hodu krátké okno — nechat hod, nebo hodit znovu. */
function renderRerollOffer(isTargeted, targetPlayer, pa) {
  const dice = pa.data?.dice;
  dom.actionTitle.replaceChildren(uiIcon('kostka', true), 'Opakovaný hod');
  dom.actionContent.innerHTML = '';
  const timer = decisionTimerBar(pa);

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, `hodil(a) ${dice} — zvažuje kartu „Opakovaný hod"...`));
    if (timer) dom.actionContent.appendChild(timer);
    return;
  }

  const info = makeEl('div', 'jail-display');
  info.style.cssText = 'border-color:var(--gold);padding:10px;margin-bottom:10px;border:1px solid var(--gold)';
  info.appendChild(document.createTextNode('Hodil(a) jsi '));
  const diceEl = makeEl('strong', '', String(dice));
  diceEl.style.color = 'var(--gold)';
  info.appendChild(diceEl);
  info.appendChild(document.createTextNode('. Chceš kartou „Opakovaný hod" hodit znovu? Platí nový hod.'));
  // Kam by hod vedl — stejné pole je zvýrazněné na plánu (board.js)
  const where = previewText(pa.data?.preview, state.gameState, state.boardData, state.myId);
  if (where) {
    const whereEl = makeEl('div', 'reroll-preview-text', where);
    info.appendChild(whereEl);
  }
  dom.actionContent.appendChild(info);

  const btns = makeEl('div', 'action-buttons row');
  btns.appendChild(iconBtn('otocit', 'Hodit znovu', 'btn-gold', () => socket.emit('game:respond', { decision: 'reroll' })));
  btns.appendChild(actionBtn(`Nechat ${dice}`, 'btn-outline', () => socket.emit('game:respond', { decision: 'keep' })));
  dom.actionContent.appendChild(btns);
  if (timer) dom.actionContent.appendChild(timer);
}


function renderDebtManage(isTargeted, targetPlayer, gameState, me) {
  dom.actionTitle.textContent = isTargeted ? 'Bankrot!' : 'Dluhy...';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'řeší své dluhy...'));
    dom.debtOverlay.classList.add('hidden');

    if (targetPlayer && !targetPlayer.bankrupt) {
      const tradeBtn = iconBtn('obchod', 'Nabídnout obchod', 'btn-outline', () => startTradeWith(targetPlayer.id, gameState, me), { opensDialog: true });
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
  setIconText(info, 'varovani', `Máte dluh ${fmt(me.balance)} Kč. Otevřeno okno pro prodej majetku.`);
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
  setIconText(dom.actionTitle, 'zamek', 'Distanc');
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
  const jailIcon = makeEl('div', 'jail-icon');
  jailIcon.appendChild(uiIcon('zamek'));
  jailDiv.appendChild(jailIcon);

  const txt = makeEl('p', 'jail-text');
  txt.appendChild(document.createTextNode('Jste v Distancu!'));
  txt.appendChild(document.createElement('br'));
  txt.appendChild(document.createTextNode('Zbývá: '));
  txt.appendChild(makeEl('strong', '', String(jt)));
  txt.appendChild(document.createTextNode(` ${jt === 1 ? 'kolo' : 'kola'}`));
  txt.appendChild(document.createElement('br'));
  txt.appendChild(document.createTextNode('Šestkou se dostaneš ven.'));
  jailDiv.appendChild(txt);
  dom.actionContent.appendChild(jailDiv);

  // Stejné tlačítko jako u běžného hodu (renderWaitRoll)
  dom.actionContent.appendChild(iconBtn('kostka', 'Hodit kostkou', 'btn-gold btn-lg', () =>
    socket.emit('game:respond', { decision: 'roll_jail' })
  ));

  if (targetPlayer?.jailFreeCards > 0) {
    const jailCardBtn = iconBtn('odemceno', 'Použít kartu "Zrušen distanc"', 'btn-outline', () => {
      audioManager.play('card');
      socket.emit('game:respond', { decision: 'use_jail_card' });
    });
    jailCardBtn.style.marginTop = '6px';
    dom.actionContent.appendChild(jailCardBtn);
  }
  const others = gameState.players.filter(p => p.id !== state.myId && !p.bankrupt);
  if (others.length > 0) {
    const tradeBtn = iconBtn('obchod', 'Navrhnout obchod', 'btn-outline', () => {
      setTradeDraft({ targetId: others[0].id, offer: { horses: [], money: 0 }, request: { horses: [], money: 0 }, context: 'jail_choice' });
      renderJailChoice(true, targetPlayer, gameState, me);
    });
    tradeBtn.style.marginTop = '6px';
    dom.actionContent.appendChild(tradeBtn);
  }
  appendBankSaleButton(me, gameState);
}

/** „Prodat bance" — jen když má hráč co prodat. */
function appendBankSaleButton(me, gameState) {
  if (!me?.properties?.length) return;
  const btn = iconBtn('koruna', 'Prodat bance', 'btn-outline', () => openBankSale(gameState), { opensDialog: true });
  btn.style.marginTop = '6px';
  dom.actionContent.appendChild(btn);
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
      const smallCost = priced(gameState, sp.tokenCost);
      const bigCost = priced(gameState, sp.bigTokenCost);
      const canS = !tok.big && tok.small < 4 && (me?.balance ?? 0) >= smallCost;
      const canB = !tok.big && tok.small >= 4 && (me?.balance ?? 0) >= bigCost;

      const item = makeEl('div', 'token-item');
      const nameDiv = makeEl('div', 'tok-name', `${sp.name} — ${tok.small}× `);
      if (tok.big) nameDiv.appendChild(uiIcon('pohar', true));
      nameDiv.style.cssText = `border-left:3px solid ${safeColor(sp.groupColor)};padding-left:6px`;
      item.appendChild(nameDiv);

      const btnsDiv = makeEl('div', 'tok-btns');
      if (canS) btnsDiv.appendChild(actionBtn(`+Žeton (${fmt(smallCost)} Kč)`, 'btn btn-xs btn-outline', () =>
        socket.emit('game:respond', { decision: 'add_token', spaceId: sid, tokenType: 'small' })
      ));
      if (canB) btnsDiv.appendChild(actionBtn(`+Hlavní (${fmt(bigCost)} Kč)`, 'btn btn-xs btn-gold', () =>
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
  if (isTargeted) dom.actionTitle.replaceChildren(imgIcon('img/letiste.png', true), 'Leti\u0161t\u011b');
  else dom.actionTitle.textContent = '\u010cek\u00e1 se...';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'rozhoduje se na leti\u0161ti...'));
    return;
  }

  const fee = pa.data?.fee ?? 0;
  const hasMoney = (me?.balance ?? 0) >= fee;
  const shortage = Math.max(0, fee - (me?.balance ?? 0));

  const info = makeEl('div', 'jail-display');
  info.style.cssText = 'border-color:var(--gold);padding:10px;margin-bottom:10px;border:1px solid var(--gold)';
  // Jeden odstavec — .jail-display skládá děti pod sebe
  const text = makeEl('p');
  text.appendChild(document.createTextNode('Stojíš na letišti. Můžeš letět na libovolné pole za poplatek '));
  text.appendChild(makeEl('strong', '', `${fmt(fee)} Kč`));
  text.appendChild(document.createTextNode(', nebo hodit kostkou jako obvykle.'));
  info.appendChild(text);
  if (!hasMoney) {
    const warn = makeEl('span', '', `Nemáš dost peněz na let. Chybí ${fmt(shortage)} Kč.`);
    warn.style.color = 'var(--red)';
    info.appendChild(warn);
  }
  dom.actionContent.appendChild(info);

  if (!hasMoney) {
    const key = `airport:${state.myId}:${fee}:${me?.balance ?? 0}`;
    if (state.lastInsufficientFundsKey !== key) {
      state.lastInsufficientFundsKey = key;
      showBrokeOverlay('Leti\u0161t\u011b', shortage);
    }
  }

  const btns = makeEl('div', 'action-buttons');
  btns.appendChild(iconBtn('kostka', 'Hodit kostkou', 'btn-gold btn-lg', () =>
    socket.emit('game:respond', { decision: 'roll' })
  ));

  const flyBtn = actionBtn(`Letět (${fmt(fee)} Kč)`, hasMoney ? 'btn-gold btn-lg' : 'btn-outline btn-lg', () => {
    if (!hasMoney) return;
    socket.emit('game:respond', { decision: 'fly' });
  });
  flyBtn.prepend(imgIcon('img/letiste.png', true));
  if (!hasMoney) {
    flyBtn.disabled = true;
    flyBtn.title = 'Nem\u00e1\u0161 dostatek pen\u011bz';
  }
  btns.appendChild(flyBtn);
  dom.actionContent.appendChild(btns);
}

// Ruleta na začátku tahu po zastavení na poli 30: zatočit, nebo hodit kostkou
// (jako volba u Letiště). Poplatek může být i 0.
function renderRouletteChoice(isTargeted, targetPlayer, pa, me) {
  dom.actionTitle.replaceChildren(imgIcon('img/ruleta.png', true), 'Ruleta');
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'rozhoduje se, jestli zatočí Ruletou...'));
    return;
  }

  const fee = pa.data?.fee ?? 0;
  const hasMoney = (me?.balance ?? 0) >= fee;
  const shortage = Math.max(0, fee - (me?.balance ?? 0));

  const info = makeEl('div', 'jail-display');
  info.style.cssText = 'border-color:var(--gold);padding:10px;margin-bottom:10px;border:1px solid var(--gold)';
  // Jeden odstavec — .jail-display skládá děti pod sebe
  const text = makeEl('p');
  if (fee > 0) {
    text.appendChild(document.createTextNode('Minule jsi zastavil(a) na Ruletě. Zatočení stojí '));
    text.appendChild(makeEl('strong', '', `${fmt(fee)} Kč`));
    text.appendChild(document.createTextNode(', nebo můžeš hodit kostkou jako obvykle.'));
  } else {
    text.appendChild(document.createTextNode('Minule jsi zastavil(a) na Ruletě. Můžeš zdarma zatočit, nebo hodit kostkou jako obvykle.'));
  }
  info.appendChild(text);
  if (!hasMoney) {
    const warn = makeEl('span');
    setIconText(warn, 'varovani', `Nemáš dost peněz. Chybí ${fmt(shortage)} Kč.`);
    warn.style.color = 'var(--red)';
    info.appendChild(warn);
  }
  dom.actionContent.appendChild(info);

  const btns = makeEl('div', 'action-buttons');
  btns.appendChild(iconBtn('kostka', 'Hodit kostkou', 'btn-gold btn-lg', () =>
    socket.emit('game:respond', { decision: 'skip' })
  ));
  const spinLabel = fee > 0 ? `Zatočit (${fmt(fee)} Kč)` : 'Zatočit zdarma';
  const spinBtn = actionBtn(spinLabel, hasMoney ? 'btn-gold btn-lg' : 'btn-outline btn-lg', () => {
    if (!hasMoney) return;
    socket.emit('game:respond', { decision: 'spin' });
  });
  spinBtn.prepend(imgIcon('img/ruleta.png', true));
  if (!hasMoney) {
    spinBtn.disabled = true;
    spinBtn.title = 'Nemáš dostatek peněz';
  }
  btns.appendChild(spinBtn);
  dom.actionContent.appendChild(btns);
}
function renderAirportSelectTarget(isTargeted, targetPlayer, pa, gameState, me) {
  if (isTargeted) dom.actionTitle.replaceChildren(imgIcon('img/letiste.png', true), 'Vyber cíl letu');
  else dom.actionTitle.textContent = 'Čeká se...';
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(buildWaitEl(targetPlayer, 'vybírá cíl letu...'));
    return;
  }

  const fee = pa.data?.fee ?? 0;
  const hasMoney = (me?.balance ?? 0) >= fee;

  const info = makeEl('div', 'jail-display');
  info.style.cssText = 'border-color:var(--gold);padding:10px;margin-bottom:10px;border:1px solid var(--gold)';
  const planeIcon = makeEl('div', 'jail-icon');
  planeIcon.appendChild(imgIcon('img/letiste.png'));
  info.appendChild(planeIcon);
  const txt = makeEl('p', 'jail-text');
  txt.appendChild(document.createTextNode('Klikni na pole na herním plánu, kam chceš letět.'));
  txt.appendChild(document.createElement('br'));
  txt.appendChild(document.createTextNode('Poplatek: '));
  txt.appendChild(makeEl('strong', '', `${fmt(fee)} Kč`));
  if (!hasMoney) {
    txt.appendChild(document.createElement('br'));
    const warn = makeEl('span');
    setIconText(warn, 'varovani', 'Nemáš dost peněz!');
    warn.style.color = 'var(--red)';
    txt.appendChild(warn);
  }
  info.appendChild(txt);
  dom.actionContent.appendChild(info);

  const cancelBtn = iconBtn('zavrit', 'Zrušit (raději hodím kostkou)', 'btn-outline', () =>
    socket.emit('game:respond', { decision: 'cancel' })
  );
  dom.actionContent.appendChild(cancelBtn);
}

/**
 * Otevře / zavře kolo Rulety podle stavu. Volá ho i processState v main.js
 * HNED při příchodu stavu — panel akcí čeká na doběhnutí figurky, kolo ne:
 * bot potvrzuje za pevnou dobu od zatočení a každé zdržení by mu ukrojilo
 * z točení. Opakované zavolání se stejným `spinId` je no-op (spinPlan).
 */
export function syncRouletteOverlay(gameState) {
  const pa = gameState?.pendingAction;
  if (!pa || pa.type !== 'roulette_ack') { hideRouletteOverlay(); return; }
  // Kolo vidí všichni — i ten, kdo zrovna není na tahu. Tlačítko má jen
  // hráč, kterého se výsledek týká. Seznam výsečí přišel v `game:init`.
  const targetPlayer = gameState.players.find(p => p.id === pa.targetId);
  showRouletteOverlay(pa.data.result, state.rouletteOutcomes || [], pa.targetId === state.myId, () => {
    socket.emit('game:respond', { decision: 'ack' });
  }, targetPlayer?.name);
}

function renderRouletteAck(isTargeted, targetPlayer, pa) {
  dom.actionTitle.replaceChildren(imgIcon('img/ruleta.png', true), 'Ruleta');

  dom.actionContent.innerHTML = '';
  dom.actionContent.appendChild(
    makeEl('p', 'dim', isTargeted
      ? 'Ruleta se točí…'
      : `${targetPlayer?.name ?? 'Hráč'} točí Ruletou…`)
  );
}

function renderRoulettePickPlayer(isTargeted, targetPlayer, pa, gameState) {
  dom.actionTitle.replaceChildren(imgIcon('img/ruleta.png', true), 'Ruleta');
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(
      makeEl('p', 'dim', `${targetPlayer?.name ?? 'Hráč'} vybírá cíl…`)
    );
    return;
  }

  dom.actionContent.appendChild(makeEl('p', '', 'Koho udáš?'));

  pa.data.candidates.forEach(id => {
    const target = gameState.players?.find(p => p.id === id);
    if (!target) return;
    const btn = actionBtn(target.name, 'btn-outline', () => {
      socket.emit('game:respond', { decision: id });
    });
    btn.style.borderColor = safeColor(target.color);
    dom.actionContent.appendChild(btn);
  });
}

function renderRoulettePickHorse(isTargeted, targetPlayer, pa) {
  dom.actionTitle.replaceChildren(imgIcon('img/ruleta.png', true), 'Ruleta');
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(
      makeEl('p', 'dim', `${targetPlayer?.name ?? 'Hráč'} si vybírá koně…`)
    );
    return;
  }

  dom.actionContent.appendChild(makeEl('p', '', 'Kam položíš žeton zdarma?'));

  pa.data.options.forEach(({ spaceId }) => {
    const space = state.boardData?.[spaceId];
    dom.actionContent.appendChild(
      actionBtn(space?.name ?? `Pole ${spaceId}`, 'btn-gold', () => {
        socket.emit('game:respond', { decision: spaceId });
      })
    );
  });
}

/**
 * „Daruješ koně" — dva kroky v jednom panelu: nejdřív kůň, pak obdarovaný.
 * Odmítnout nejde (špatná výseč); server by neplatnou volbu stejně nahradil.
 */
let giftHorse = null;

function renderRouletteGiveHorse(isTargeted, targetPlayer, pa, gameState) {
  dom.actionTitle.replaceChildren(imgIcon('img/ruleta.png', true), 'Ruleta');
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    giftHorse = null;
    dom.actionContent.appendChild(
      makeEl('p', 'dim', `${targetPlayer?.name ?? 'Hráč'} vybírá, kterého koně daruje…`)
    );
    return;
  }

  const options = pa.data.options || [];
  if (!options.includes(giftHorse)) giftHorse = null;

  if (giftHorse === null) {
    dom.actionContent.appendChild(makeEl('p', '', 'Kterého koně daruješ?'));
    options.forEach(spaceId => {
      const space = state.boardData?.[spaceId];
      const btn = actionBtn(space?.name ?? `Pole ${spaceId}`, 'btn-outline', () => {
        giftHorse = spaceId;
        renderRouletteGiveHorse(isTargeted, targetPlayer, pa, gameState);
      });
      if (space?.groupColor) btn.style.borderLeft = `4px solid ${safeColor(space.groupColor)}`;
      dom.actionContent.appendChild(btn);
    });
    return;
  }

  const horseName = state.boardData?.[giftHorse]?.name ?? `Pole ${giftHorse}`;
  dom.actionContent.appendChild(makeEl('p', '', `Komu daruješ ${horseName}?`));
  (pa.data.candidates || []).forEach(id => {
    const target = gameState.players?.find(p => p.id === id);
    if (!target) return;
    const btn = actionBtn(target.name, 'btn-outline', () => {
      const spaceId = giftHorse;
      giftHorse = null;
      socket.emit('game:respond', { decision: id, spaceId });
    });
    btn.style.borderColor = safeColor(target.color);
    dom.actionContent.appendChild(btn);
  });
  dom.actionContent.appendChild(
    actionBtn('Zpět na výběr koně', 'btn-outline', () => {
      giftHorse = null;
      renderRouletteGiveHorse(isTargeted, targetPlayer, pa, gameState);
    })
  );
}

function showBrokeOverlay(propertyName, shortage) {
  if (!isEffectEnabled('celebrationOverlays')) return;
  const existing = document.getElementById('broke-overlay');
  if (existing) existing.remove();

  const overlay = makeEl('div', 'broke-overlay');
  overlay.id = 'broke-overlay';

  const card = makeEl('div', 'broke-card');
  const brokeIcon = makeEl('div', 'broke-icon');
  brokeIcon.appendChild(uiIcon('dluh'));
  card.appendChild(brokeIcon);
  card.appendChild(makeEl('div', 'broke-title', 'Nedostatek peněz na:'));
  card.appendChild(makeEl('div', 'broke-property', propertyName));
  card.appendChild(makeEl('div', 'broke-amount', `Chybí ${fmt(shortage)} Kč`));
  overlay.appendChild(card);

  const dismiss = () => overlay.remove();
  overlay.addEventListener('click', dismiss);
  document.body.appendChild(overlay);
  setTimeout(dismiss, 3000);
}

function renderGameOver(winner, reason) {
  setIconText(dom.actionTitle, 'pohar', 'Konec hry');
  dom.actionContent.innerHTML = '';

  const goDiv = makeEl('div', 'gameover-display');
  const trophy = makeEl('div', 'gameover-trophy');
  trophy.appendChild(uiIcon('pohar'));
  goDiv.appendChild(trophy);
  if (reason === 'time_limit') {
    goDiv.appendChild(makeEl('p', 'dim', 'Hra skončila po vypršení časového limitu.'));
  }
  goDiv.appendChild(makeEl('div', 'gameover-title', winner ? `${winner.name} vyhrál(a)!` : 'Konec hry!'));
  if (winner) goDiv.appendChild(makeEl('div', 'gameover-balance', `Celkový majetek: ${fmt(winner.totalAssets ?? winner.balance)} Kč`));

  const replayBtn = makeEl('button', 'btn btn-gold btn-lg', 'Hrát znovu');
  replayBtn.addEventListener('click', () => window.__resetLocalState?.());
  goDiv.appendChild(replayBtn);
  dom.actionContent.appendChild(goDiv);
}

export function showStableOverlay(playerName, group, groupColor) {
  if (!isEffectEnabled('celebrationOverlays')) return;
  playConfetti(stableConfettiColors(groupColor));
  const existing = document.getElementById('stable-overlay');
  if (existing) existing.remove();

  const overlay = makeEl('div', 'broke-overlay');
  overlay.id = 'stable-overlay';
  overlay.style.zIndex = '12000';

  const card = makeEl('div', 'broke-card');
  card.style.borderTop = `4px solid ${groupColor || 'var(--gold)'}`;

  const logo = makeEl('div', 'broke-icon');
  logo.appendChild(imgIcon('img/logo.png'));
  card.appendChild(logo);
  card.appendChild(makeEl('div', 'broke-title', 'Stáj zkompletována!'));

  const textEl = makeEl('div', 'broke-property', playerName);
  textEl.style.color = groupColor || 'var(--gold)';
  textEl.style.fontSize = '24px';
  card.appendChild(textEl);

  card.appendChild(makeEl('div', 'broke-amount', `Získal(a) celou: ${stableName(group)}`));

  overlay.appendChild(card);

  const dismiss = () => overlay.remove();
  overlay.addEventListener('click', dismiss);
  document.body.appendChild(overlay);
  setTimeout(dismiss, 2000);
}
