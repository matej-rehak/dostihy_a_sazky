'use strict';

const BOARD = require('../data/boardData');
const { BOARD_SIZE, ACTION_DELAY_MS, fmt } = require('../constants');

module.exports = {

  _movePlayer(pid, steps) {
    if (this.phase !== 'playing') return;
    const player = this.players.get(pid);
    const oldPos = player.position;
    const newPos = (oldPos + steps) % BOARD_SIZE;
    const crossed = (oldPos + steps) >= BOARD_SIZE;

    player.position = newPos;

    if (crossed && newPos !== 0) {
      player.balance += this.config.startBonus;
      this._addLog(`${player.name} prošel(a) START — +${fmt(this.config.startBonus)} Kč`);
    }
    if (newPos === 0) {
      player.balance += this.config.startBonus;
      this._addLog(`${player.name} přistál(a) na START — +${fmt(this.config.startBonus)} Kč`);
    }

    this._addLog(`➡️ ${player.name} přesunul(a) se na ${BOARD[newPos].name}`);
    this._scheduleAction(ACTION_DELAY_MS, () => this._evaluateSpace(pid));
  },

  _evaluateSpace(pid) {
    if (this.phase !== 'playing') return;
    const player = this.players.get(pid);
    if (!player || player.bankrupt) { this._advanceTurn(); return; }
    const space = BOARD[player.position];

    switch (space.type) {
      case 'start':
      case 'free_parking':
        this._addLog(`${player.name} odpočívá na poli ${space.name}`);
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
        break;

      case 'tax':
        player.balance -= space.amount;
        this._addLog(`🧾 ${player.name} platí za ${space.name} ${fmt(space.amount)} Kč`);
        this._checkBankrupt(pid);
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
        break;

      case 'jail':
      case 'go_to_jail':
        this._sendToJail(pid);
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
        break;

      case 'skip_turn':
        player.skipTurns = space.turns;
        this._addLog(`🚫 ${player.name} zastavil(a) na poli ${space.name} — vynechává příští tah.`);
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
        break;

      case 'finance':
      case 'nahoda': {
        const card = space.type === 'finance' ? this.financeCards.draw() : this.nahodaCards.draw();
        const label = space.type === 'finance' ? 'Finance' : 'Náhoda';
        this._addLog(`🃏 ${player.name} táhne kartu ${label}: "${card.text}"`);
        this._setPendingAction({ type: 'card_ack', targetId: pid, data: { card, label, spaceId: space.id } });
        this._broadcast();
        break;
      }

      case 'horse':
      case 'service': {
        const owner = this.ownerships[space.id];
        if (!owner) {
          if (player.balance >= space.price) {
            this._setPendingAction({ type: 'buy_offer', targetId: pid, data: { spaceId: space.id } });
            this._broadcast();
          } else {
            this._addLog(`${player.name} nemá dostatek prostředků ke koupi ${space.name} (${fmt(space.price)} Kč)`);
            this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
          }
        } else if (owner === pid) {
          this._addLog(`${player.name} stojí na vlastním ${space.name}`);
          this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
        } else {
          if (space.serviceType === 'preprava' || space.serviceType === 'staje') {
            this._addLog(`🕒 ${player.name} musí hodit pro určení poplatku (${space.name})`);
            this._setPendingAction({ type: 'service_roll', targetId: pid, data: { spaceId: space.id } });
            this._broadcast();
          } else {
            const rent = this._calcRent(space.id, this.lastDice?.value || 1);
            const ownerPlayer = this.players.get(owner);
            this._addLog(`💸 ${player.name} platí nájem ${fmt(rent)} Kč → ${ownerPlayer.name} (${space.name})`);
            this._transfer(pid, owner, rent);

            if (this.config.buyoutMultiplier > 0 && space.type === 'horse') {
              const buyoutCost = space.price * this.config.buyoutMultiplier;
              this._scheduleAction(ACTION_DELAY_MS, () => this._offerBuyoutOrEnd(pid, space.id, buyoutCost));
            } else {
              this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
            }
          }
        }
        break;
      }
    }
  },
};
