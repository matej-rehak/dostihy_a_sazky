'use strict';

const { ACTION_DELAY_MS } = require('../constants');

/**
 * Dobrovolný prodej bance — hráč na tahu může kdykoli před hodem prodat
 * koně, služby i žetony za polovinu ceny. Stejné chvíle, kdy smí navrhnout
 * obchod (čeká na hod / je v Distancu).
 */
const BANK_SALE_ACTIONS = new Set(['wait_roll', 'jail_choice']);
const BANK_SALE_DECISIONS = new Set(['bank_sell_property', 'bank_sell_token']);

const MOVE_CARD_TYPES = new Set([
  'move_to', 'move_forward', 'move_backward',
  'move_nearest', 'move_nearest_backward', 'move_backward_to',
]);

const ActionPropertyMixin = require('./actions-property');
const ActionTradeMixin    = require('./actions-trade');
const ActionSpecialMixin  = require('./actions-special');

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

    // Prodej bance tah neposouvá — hráč pak dál hází (nebo řeší Distanc),
    // proto se pendingAction nechává být.
    // Mimo začátek tahu se požadavek ignoruje — jinak by ho např. nabídka
    // koupě vyhodnotila jako „nekupovat" (každé jiné rozhodnutí než `buy`).
    if (BANK_SALE_DECISIONS.has(decision)) {
      if (BANK_SALE_ACTIONS.has(action)) return this._handleBankSale(pid, decision, spaceId);
      return;
    }

    // Výsledek Rulety se uplatní JEN na výslovné potvrzení. Jakákoli jiná
    // zpráva (dvojklik na „Zatočit", který dorazí až po roztočení) by jinak
    // efekt spustila uprostřed točení kola — peníze i figurka by se změnily
    // dřív, než hráč výsledek vůbec uvidí a potvrdí.
    if (action === 'roulette_ack' && decision !== 'ack') return;

    this._setPendingAction(null);

    switch (action) {
      case 'debt_manage': return this._handleDebtManage(pid, decision, spaceId, data);
      case 'buy_offer': return this._handleBuyOffer(pid, decision, spaceId);
      case 'buyout_offer': return this._handleBuyoutOffer(pid, decision, actionData);
      case 'reroll_offer': return this._handleRerollOffer(pid, decision, actionData);
      case 'card_ack': return this._handleCardAck(pid, actionData);
      case 'jail_choice': return this._handleJailChoice(pid, decision);
      case 'token_manage': return this._handleTokenManage(pid, decision, spaceId, tokenType);
      case 'trade_offer': return this._handleTradeOffer(pid, decision, actionData, clientOffer, clientRequest);
      case 'airport_choice': return this._handleAirportChoice(pid, decision);
      case 'airport_select_target': return this._handleAirportSelectTarget(pid, decision, spaceId);
      case 'roulette_choice': return this._handleRouletteChoice(pid, decision);
      case 'roulette_ack': return this._handleRouletteAck(pid, actionData);
      case 'roulette_pick_player': return this._handleRoulettePickPlayer(pid, decision, actionData);
      case 'roulette_pick_horse': return this._handleRoulettePickHorse(pid, decision, actionData);
      // `decision` = id obdarovaného, `spaceId` = darovaný kůň
      case 'roulette_give_horse': return this._handleRouletteGiveHorse(pid, spaceId, decision, actionData);
    }
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
      case 'reroll_offer':
        this._handleDecisionTimeout(this.pendingAction);
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
      // Prompty Rulety spotřebují `pendingAction` JEŠTĚ PŘED voláním
      // handleru — stejně jako to dělá `handleRespond`. Bez toho by kliknutí,
      // které dorazí v okně mezi vypršením limitu a dohráním handleru, prošlo
      // guardem v `handleRespond` a efekt by se aplikoval podruhé (sázka
      // stržená dvakrát, dva žetony zdarma) a navíc by druhý `_scheduleAction`
      // přepsal `this._timer` a hráč by tiše přišel o tah.
      case 'roulette_choice':
        this._setPendingAction(null);
        this._handleRouletteChoice(targetId, 'skip');
        break;
      case 'roulette_ack':
        this._setPendingAction(null);
        this._handleRouletteAck(targetId, data);
        break;
      case 'roulette_pick_player':
        this._setPendingAction(null);
        this._handleRoulettePickPlayer(targetId, data?.candidates?.[0], data);
        break;
      case 'roulette_pick_horse':
        this._setPendingAction(null);
        this._handleRoulettePickHorse(targetId, 'decline', data);
        break;
      case 'roulette_give_horse':
        // Neplatná volba se nahradí volbou bota — dar se vypršením neobejde.
        this._setPendingAction(null);
        this._handleRouletteGiveHorse(targetId, null, null, data);
        break;
    }
  },

  ...ActionPropertyMixin,
  ...ActionTradeMixin,
  ...ActionSpecialMixin,
};
