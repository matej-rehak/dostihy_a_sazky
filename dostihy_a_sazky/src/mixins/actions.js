'use strict';

const BOARD = require('../data/boardData');
const { ACTION_DELAY_MS, JAIL_FINE, BOARD_SIZE, roll, fmt } = require('../constants');

const MOVE_CARD_TYPES = new Set([
  'move_to', 'move_forward', 'move_backward',
  'move_nearest', 'move_nearest_backward', 'move_backward_to',
]);

module.exports = {

  handleRespond(socket, data) {
    if (this.phase !== 'playing') return;
    const pid = socket.playerId;

    const { decision, spaceId, tokenType, offer: clientOffer, request: clientRequest, tradeOfferId } = data || {};

    // Odpovědi na obchodní nabídky ve frontě (tradeOffers) jsou nezávislé na pendingAction —
    // reaguje na ně cíl nabídky, který typicky NENÍ hráč na tahu. Routujeme dřív, než se aplikuje
    // guard pendingAction.targetId !== pid, jinak by se odpověď nepatřičně tiše zahodila
    // (klasický flow i debt_manage / jail_choice).
    if (tradeOfferId) {
      return this._handleTradeResponse(pid, decision, tradeOfferId, clientOffer, clientRequest);
    }

    if (!this.pendingAction) return;

    // Pro trade_offer s targetId=null (veřejná nabídka) může odpovědět kdokoli kromě iniciátora
    if (this.pendingAction.type === 'trade_offer' && this.pendingAction.targetId === null) {
      if (this.pendingAction.data.fromId === pid) return;
    } else if (this.pendingAction.targetId !== pid) {
      return;
    }

    const actionData = this.pendingAction.data || {};
    const action = this.pendingAction.type;

    this._setPendingAction(null);

    switch (action) {
      case 'debt_manage': return this._handleDebtManage(pid, decision, spaceId, data);
      case 'buy_offer': return this._handleBuyOffer(pid, decision, spaceId);
      case 'buyout_offer': return this._handleBuyoutOffer(pid, decision, actionData);
      case 'card_ack': return this._handleCardAck(pid, actionData);
      case 'jail_choice': return this._handleJailChoice(pid, decision);
      case 'token_manage': return this._handleTokenManage(pid, decision, spaceId, tokenType);
      case 'trade_offer': return this._handleTradeOffer(pid, decision, actionData, clientOffer, clientRequest);
      case 'airport_choice': return this._handleAirportChoice(pid, decision);
      case 'airport_select_target': return this._handleAirportSelectTarget(pid, decision, spaceId);
    }
  },

  _handleTradeResponse(pid, decision, tradeOfferId, clientOffer, clientRequest) {
    const offerIdx = this.tradeOffers.findIndex(o => o.id === tradeOfferId);
    if (offerIdx === -1) return;
    const offerData = this.tradeOffers[offerIdx];

    // Iniciátor nesmí odpovídat na vlastní nabídku (zabrání samo-akceptaci protinabídky)
    if (offerData.fromId === pid) return;

    // Cílená nabídka: jen určený příjemce; veřejná nabídka (targetId === null): kdokoli kromě iniciátora
    if (offerData.targetId !== null && offerData.targetId !== pid) return;

    // Use existing _handleTradeOffer logic but with cleanup
    this._handleTradeOffer(pid, decision, offerData, clientOffer, clientRequest);

    // Remove the offer from queue after processing
    this.tradeOffers = this.tradeOffers.filter(o => o.id !== tradeOfferId);

    this._broadcast();
  },

  _handleDebtManage(pid, decision, spaceId, data) {
    if (decision === 'sell_property' || decision === 'sell_batch' || decision === 'sell_token') {
      if (decision === 'sell_batch' && Array.isArray(data?.spaceIds)) {
        this._sellMultipleProperties(pid, data.spaceIds);
      } else if (decision === 'sell_token') {
        this._removeToken(pid, spaceId);
      } else {
        this._sellProperty(pid, spaceId);
      }

      this._checkBankrupt(pid);

      const p = this.players.get(pid);
      if (p.balance < 0) {
        this._setPendingAction({ type: 'debt_manage', targetId: pid });
        this._broadcast();
      } else {
        const fn = this._resumeFn;
        this._resumeFn = null;
        this._scheduleAction(ACTION_DELAY_MS / 2, fn);
      }
    } else if (decision === 'declare_bankrupt') {
      this._declareBankrupt(pid);
      const fn = this._resumeFn;
      this._resumeFn = null;
      this._scheduleAction(ACTION_DELAY_MS / 2, fn);
    }
  },

  _handleBuyOffer(pid, decision, spaceId) {
    if (decision === 'buy') {
      this._buyProperty(pid, spaceId);
      // Žetony nelze koupit okamžitě po koupi — až po příštím zastavení
      this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
    } else {
      this._addLog(`${this.players.get(pid).name} odmítl(a) koupit ${BOARD[spaceId].name}`);
      this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
    }
  },

  _handleBuyoutOffer(pid, decision, actionData) {
    if (decision !== 'buy') {
      return this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
    }
    const { buyoutCost, spaceId } = actionData;
    const space = BOARD[spaceId];
    const oldOwner = this.players.get(this.ownerships[spaceId]);
    const p = this.players.get(pid);

    p.balance -= buyoutCost;
    if (oldOwner) {
      oldOwner.balance += buyoutCost;
      oldOwner.properties = oldOwner.properties.filter(id => id !== spaceId);
      this._addLog(`👿 ${p.name} nepřátelsky odkoupil(a) ${space.name} od ${oldOwner.name} za ${fmt(buyoutCost)} Kč!`);
    } else {
      this._addLog(`🏠 ${p.name} odkoupil(a) ${space.name} za ${fmt(buyoutCost)} Kč`);
    }
    this.ownerships[spaceId] = pid;
    p.properties.push(spaceId);
    delete this.tokens[spaceId];
    this._cancelStaleTradeOffers([spaceId]);
    // Žetony nelze koupit okamžitě po odkupu — až po příštím zastavení
    this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
  },

  _handleCardAck(pid, actionData) {
    const { card } = actionData;
    this._applyCard(pid, card);
    this._scheduleAction(ACTION_DELAY_MS, () => {
      const p = this.players.get(pid);
      if (p.inJail || p.bankrupt) { this._advanceTurn(); return; }
      if (MOVE_CARD_TYPES.has(card.type)) {
        this._evaluateSpace(pid);
      } else {
        this._offerTokensOrEnd(pid);
      }
    });
  },

  _handleJailChoice(pid, decision) {
    const player = this.players.get(pid);
    if (decision === 'roll_jail') {
      const dice = roll();
      this.lastDice = { value: dice, id: Math.random() };
      this._addLog(`🎲 ${player.name} (v Distancu) hodil(a) ${dice}`);
      if (dice === 6) {
        player.inJail = false;
        player.jailTurns = 0;
        player.rollAccumulator = 0;
        this._addLog(`🔓 ${player.name} hodil(a) šestku — opouští Distanc a hází ještě jednou!`);
        this._setPendingAction({ type: 'wait_roll', targetId: pid });
        this._broadcast();
      } else {
        player.jailTurns--;
        this._addLog(`${player.name} zůstává v Distancu (${player.jailTurns} kol zbývá)`);
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
      }
    } else if (decision === 'use_jail_card' && player.jailFreeCards > 0) {
      player.jailFreeCards--;
      player.inJail = false;
      player.jailTurns = 0;
      this._addLog(`${player.name} použil(a) kartu "Zrušen distanc" a opouští vězení!`);
      this._setPendingAction({ type: 'wait_roll', targetId: pid });
      this._broadcast();
    }
  },

  _handleTokenManage(pid, decision, spaceId, tokenType) {
    if (decision === 'add_token') {
      this._addToken(pid, spaceId, tokenType);
      const tok = this.tokens[spaceId];
      // Po přidání 4. malého žetonu konec tahu — velký dostih je na příštím zastavení
      if (tokenType === 'small' && tok && tok.small >= 4) {
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
      } else {
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
      }
    } else {
      this._advanceTurn();
    }
  },

  _handleTradeOffer(pid, decision, actionData, clientOffer, clientRequest) {
    const { fromId, offer, request, fromContext } = actionData;
    const turnPlayerId = actionData.turnPlayerId || fromId;
    const initiator = this.players.get(fromId);
    const target = this.players.get(pid);

    if (decision === 'counter' && clientOffer && clientRequest) {
      const cOfferHorses   = Array.isArray(clientOffer.horses)   ? clientOffer.horses.map(Number)   : [];
      const cRequestHorses = Array.isArray(clientRequest.horses) ? clientRequest.horses.map(Number) : [];
      const cOfferMoney    = Math.max(0, Number(clientOffer.money)   || 0);
      const cRequestMoney  = Math.max(0, Number(clientRequest.money) || 0);

      let valid = true;
      for (const sid of cOfferHorses) {
        if (this.ownerships[sid] !== pid) { valid = false; break; }
      }
      if (valid) {
        for (const sid of cRequestHorses) {
          if (this.ownerships[sid] !== fromId) { valid = false; break; }
        }
      }
      if (valid && cOfferMoney > 0 && target && target.balance < cOfferMoney) valid = false;

      if (valid) {
        this._addLog(`🔄 ${target?.name ?? '?'} posílá protinabídku hráči ${initiator?.name ?? '?'}...`);
        const counterOfferId = 'trade_' + Math.random().toString(36).substr(2, 9);
        const newOffer = {
          id: counterOfferId,
          fromId: pid,
          targetId: fromId,
          fromContext,
          turnPlayerId,
          offer:   { horses: cOfferHorses,   money: cOfferMoney   },
          request: { horses: cRequestHorses, money: cRequestMoney },
          timestamp: Date.now()
        };
        // Odstraníme starší nabídku mezi stejnými hráči
        this.tradeOffers = this.tradeOffers.filter(o => !(o.fromId === pid && o.targetId === fromId));
        this.tradeOffers.push(newOffer);
        this._broadcast();
        return;
      }
      decision = 'decline';
    }

    if (decision === 'accept' && initiator && target) {
      if (request.money > 0 && target.balance < request.money) {
        this._addLog(`❌ Obchod zrušen — ${target.name} nemá dostatek peněz (potřeba ${fmt(request.money)} Kč, má ${fmt(target.balance)} Kč)`);
        decision = 'decline';
      } else if (fromContext !== 'debt_manage' && offer.money > 0 && initiator.balance < offer.money) {
        this._addLog(`❌ Obchod zrušen — ${initiator.name} nemá dostatek peněz (potřeba ${fmt(offer.money)} Kč, má ${fmt(initiator.balance)} Kč)`);
        decision = 'decline';
      }
    }

    if (decision === 'accept' && initiator && target) {
      // Koně: initiator → target
      offer.horses.forEach(sid => {
        this.ownerships[sid] = pid;
        initiator.properties = initiator.properties.filter(id => id !== sid);
        if (!target.properties.includes(sid)) target.properties.push(sid);
      });
      // Koně: target → initiator
      request.horses.forEach(sid => {
        this.ownerships[sid] = fromId;
        target.properties = target.properties.filter(id => id !== sid);
        if (!initiator.properties.includes(sid)) initiator.properties.push(sid);
      });
      // Peníze
      initiator.balance -= offer.money;
      initiator.balance += request.money;
      target.balance -= request.money;
      target.balance += offer.money;
      this._checkBankrupt(fromId);
      this._checkBankrupt(pid);
      this._addLog(`🤝 ${initiator.name} a ${target.name} uzavřeli obchod!`);
      const allTradedHorses = [...offer.horses, ...request.horses];
      if (allTradedHorses.length > 0) {
        this._cancelStaleTradeOffers(allTradedHorses);
      }
    } else {
      this._addLog(`❌ ${target?.name ?? '?'} odmítl(a) nabídku od ${initiator?.name ?? '?'}`);
    }

    if (fromContext === 'debt_manage') {
      // Obchod byl zahájen z dluhové situace
      const fn = this._resumeFn;
      this._resumeFn = null;
      this._scheduleAction(ACTION_DELAY_MS, fn);
    } else {
      // Frontovaný systém nabídek pendingAction iniciátora nekonzumuje, takže když se
      // hra mezitím posunula (např. do debt_manage po hodu kostkou), nepřepisujeme stav
      // stale fromContextem — jinak by hráč po vyřešení dluhu znovu hodil kostkou.
      const turnPlayer = this.players.get(turnPlayerId);
      if (!turnPlayer || turnPlayer.bankrupt) {
        if (this.pendingAction) this._broadcast();
        else this._advanceTurn();
      } else if (this.pendingAction) {
        this._broadcast();
      } else {
        this._scheduleAction(ACTION_DELAY_MS, () => {
          if (this.pendingAction) { this._broadcast(); return; }
          const tp = this.players.get(turnPlayerId);
          if (!tp || tp.bankrupt) { this._advanceTurn(); return; }
          const resumeType = fromContext === 'jail_choice' ? 'jail_choice' : 'wait_roll';
          this._setPendingAction({ type: resumeType, targetId: turnPlayerId });
          this._broadcast();
        });
      }
    }
  },

  _handleAirportChoice(pid, decision) {
    const player = this.players.get(pid);
    if (!player) return;
    if (decision === 'fly') {
      this._setPendingAction({
        type: 'airport_select_target',
        targetId: pid,
        data: { fee: this.config.airportFee },
      });
      this._broadcast();
    } else {
      player.canFly = false;
      this._setPendingAction({ type: 'wait_roll', targetId: pid });
      this._broadcast();
    }
  },

  _handleAirportSelectTarget(pid, decision, spaceId) {
    const player = this.players.get(pid);
    if (!player) return;
    const fee = this.config.airportFee;

    if (decision === 'cancel') {
      this._setPendingAction({
        type: 'airport_choice',
        targetId: pid,
        data: { fee },
      });
      this._broadcast();
      return;
    }

    const target = Number(spaceId);

    if (!Number.isInteger(target) || target < 0 || target >= BOARD_SIZE || target === player.position) {
      this._setPendingAction({
        type: 'airport_select_target',
        targetId: pid,
        data: { fee },
      });
      this._broadcast();
      return;
    }

    if (player.balance < fee) {
      this._addLog(`✈️ ${player.name} nemá dostatek na let (${fmt(fee)} Kč) — letiště ruší.`);
      player.canFly = false;
      this._setPendingAction({ type: 'wait_roll', targetId: pid });
      this._broadcast();
      return;
    }

    player.balance -= fee;
    player.canFly = false;
    player.moveDirection = 1;
    this._addLog(`✈️ ${player.name} odlétá z letiště na ${BOARD[target].name} (poplatek ${fmt(fee)} Kč)`);

    const steps = (target - player.position + BOARD_SIZE) % BOARD_SIZE;
    this._setPendingAction(null);
    this._scheduleAction(ACTION_DELAY_MS, () => this._movePlayer(pid, steps));
  },

  _handleTurnTimeout() {
    if (this.phase !== 'playing' || !this.pendingAction) return;
    const { type, targetId, data } = this.pendingAction;
    const player = this.players.get(targetId);
    if (!player) return;

    this._addLog(`⏳ ${player.name} nestihl(a) odehrát v časovém limitu!`);

    switch (type) {
      case 'wait_roll':
      case 'service_roll':
        this.handleRoll({ playerId: targetId, emit: () => { } });
        break;
      case 'buy_offer':
        this._handleBuyOffer(targetId, 'decline', data?.spaceId);
        break;
      case 'buyout_offer':
        this._handleBuyoutOffer(targetId, 'decline', data);
        break;
      case 'card_ack':
        this._handleCardAck(targetId, data);
        break;
      case 'jail_choice':
        this._handleJailChoice(targetId, 'roll_jail');
        break;
      case 'token_manage':
        this._handleTokenManage(targetId, 'end_turn', data?.spaceId, null);
        break;
      case 'trade_offer':
        this._handleTradeOffer(targetId, 'decline', data);
        break;
      case 'selecting_starter':
        this._setPendingAction(null);
        this._startTurn();
        break;
      case 'airport_choice':
        this._handleAirportChoice(targetId, 'roll');
        break;
      case 'airport_select_target': {
        const p = this.players.get(targetId);
        if (p) p.canFly = false;
        this._setPendingAction({ type: 'wait_roll', targetId });
        this._broadcast();
        break;
      }
    }
  }
};
