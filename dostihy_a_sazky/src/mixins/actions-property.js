'use strict';

const BOARD = require('../data/boardData');
const { ACTION_DELAY_MS, fmt } = require('../constants');

module.exports = {

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

      // Po prodeji posledního majetku může `_checkBankrupt` hráče vyřadit.
      // Bankrotáři se už `debt_manage` otevírat nesmí — nikdo by na něj
      // neodpověděl a hra by zamrzla. Pokračuje se jako po vyhlášení bankrotu.
      const p = this.players.get(pid);
      if (p.balance < 0 && !p.bankrupt) {
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

  /**
   * Dobrovolný prodej bance za polovinu ceny (jako při dluhu):
   *  • `bank_sell_property` — kůň nebo služba i se všemi žetony,
   *  • `bank_sell_token` — jeden žeton (hlavní dostih se rozloží na 4 malé).
   * Prodejní ceny inflace neovlivňuje.
   */
  _handleBankSale(pid, decision, spaceId) {
    const sid = Number(spaceId);
    const player = this.players.get(pid);
    if (!player || this.ownerships[sid] !== pid) return;

    if (decision === 'bank_sell_property') {
      this._sellProperty(pid, sid);
    } else if (decision === 'bank_sell_token') {
      if (!this.tokens[sid]) return;
      this._removeToken(pid, sid);
    }
    this._broadcast();
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
    this._checkStableCompletion(pid, spaceId);
    // Žetony nelze koupit okamžitě po odkupu — až po příštím zastavení
    this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
  },

};
