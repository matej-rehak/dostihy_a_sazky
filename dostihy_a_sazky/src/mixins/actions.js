'use strict';

const BOARD = require('../data/boardData');
const { ACTION_DELAY_MS, JAIL_FINE, roll, fmt } = require('../constants');

const MOVE_CARD_TYPES = new Set([
  'move_to', 'move_forward', 'move_backward',
  'move_nearest', 'move_nearest_backward', 'move_backward_to',
]);

module.exports = {

  handleRespond(socket, data) {
    const pid = socket.playerId;
    if (!this.pendingAction || this.pendingAction.targetId !== pid) return;
    const { decision, spaceId, tokenType } = data || {};
    const actionData = this.pendingAction.data || {};
    const action = this.pendingAction.type;
    this.pendingAction = null;

    switch (action) {
      case 'debt_manage':  return this._handleDebtManage(pid, decision, spaceId);
      case 'buy_offer':    return this._handleBuyOffer(pid, decision, spaceId);
      case 'buyout_offer': return this._handleBuyoutOffer(pid, decision, actionData);
      case 'card_ack':     return this._handleCardAck(pid, actionData);
      case 'jail_choice':  return this._handleJailChoice(pid, decision);
      case 'token_manage': return this._handleTokenManage(pid, decision, spaceId, tokenType);
      case 'trade_offer':  return this._handleTradeOffer(pid, decision, actionData);
    }
  },

  _handleDebtManage(pid, decision, spaceId) {
    if (decision === 'sell_property') {
      this._sellProperty(pid, spaceId);
      const p = this.players.get(pid);
      if (p.balance < 0) {
        this.pendingAction = { type: 'debt_manage', targetId: pid };
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
        this.pendingAction = { type: 'wait_roll', targetId: pid };
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
      this.pendingAction = { type: 'wait_roll', targetId: pid };
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

  _handleTradeOffer(pid, decision, actionData) {
    const { fromId, offer, request, fromContext } = actionData;
    const initiator = this.players.get(fromId);
    const target    = this.players.get(pid);

    if (decision === 'accept' && initiator && target) {
      if (target.balance < request.money) {
        this._addLog(`❌ Obchod zrušen — ${target.name} nemá dostatek peněz (potřeba ${fmt(request.money)} Kč, má ${fmt(target.balance)} Kč)`);
        decision = 'decline';
      } else if (initiator.balance < offer.money) {
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
      target.balance    -= request.money;
      target.balance    += offer.money;
      this._checkBankrupt(fromId);
      this._checkBankrupt(pid);
      this._addLog(`🤝 ${initiator.name} a ${target.name} uzavřeli obchod!`);
    } else {
      this._addLog(`❌ ${target?.name ?? '?'} odmítl(a) nabídku od ${initiator?.name ?? '?'}`);
    }

    if (fromContext === 'debt_manage') {
      // Obchod byl zahájen z dluhové situace — _scheduleAction automaticky
      // vrátí do debt_manage pokud dluh trvá, nebo obnoví hru pokud je krytý
      const fn = this._resumeFn;
      this._resumeFn = null;
      this._scheduleAction(ACTION_DELAY_MS, fn);
    } else {
      // Vrátit wait_roll původnímu hráči (obchod netrhá tah)
      this._scheduleAction(ACTION_DELAY_MS, () => {
        if (this.players.get(fromId) && !this.players.get(fromId).bankrupt) {
          this.pendingAction = { type: 'wait_roll', targetId: fromId };
          this._broadcast();
        } else {
          this._advanceTurn();
        }
      });
    }
  },
};
