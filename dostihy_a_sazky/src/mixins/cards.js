'use strict';

const BOARD = require('../data/boardData');
const { BOARD_SIZE, fmt } = require('../constants');

module.exports = {

  _applyCard(pid, card) {
    const player = this.players.get(pid);

    switch (card.type) {
      case 'gain':
        player.balance += card.amount;
        break;

      case 'pay':
        player.balance -= card.amount;
        this._checkBankrupt(pid);
        break;

      case 'collect_from_all':
        this.players.forEach((p, id) => {
          if (id !== pid && !p.bankrupt) {
            p.balance -= card.amount;
            player.balance += card.amount;
            this._checkBankrupt(id);
          }
        });
        break;

      case 'pay_to_all':
        this.players.forEach((p, id) => {
          if (id !== pid && !p.bankrupt) {
            player.balance -= card.amount;
            p.balance += card.amount;
          }
        });
        this._checkBankrupt(pid);
        break;

      case 'go_to_jail':
        this._sendToJail(pid);
        break;

      case 'skip_turn':
        player.skipTurns += card.turns;
        break;

      case 'jail_free_card':
        player.jailFreeCards++;
        break;

      case 'gain_per_property':
        player.balance += player.properties.length * card.amount;
        break;

      case 'pay_per_token_custom': {
        let total = 0;
        player.properties.forEach(id => {
          const t = this.tokens[id];
          if (!t) return;
          total += t.big ? card.big : t.small * card.small;
        });
        player.balance -= total;
        this._addLog(`🏘️ ${player.name} platí celkem ${fmt(total)} Kč za své žetony.`);
        this._checkBankrupt(pid);
        break;
      }

      case 'move_to': {
        const oldPos = player.position;
        player.position = card.space;
        player.moveDirection = 1;
        if (card.passStart && card.space !== 0 && player.position <= oldPos && oldPos !== 0) {
          player.balance += this.config.startBonus;
          this._addLog(`${player.name} prošel(a) START — +${fmt(this.config.startBonus)} Kč`);
        }
        if (card.passStart && card.space === 0) {
          player.balance += this.config.startBonus;
          this._addLog(`${player.name} přistál(a) na START — +${fmt(this.config.startBonus)} Kč`);
        }
        break;
      }

      case 'move_forward': {
        const np = (player.position + card.steps) % BOARD_SIZE;
        if (np < player.position) { player.balance += this.config.startBonus; }
        player.position = np;
        player.moveDirection = 1;
        break;
      }

      case 'move_backward':
        player.position = (player.position - card.steps + BOARD_SIZE) % BOARD_SIZE;
        player.moveDirection = -1;
        break;

      case 'move_nearest': {
        const oldPos = player.position;
        let found = -1;
        for (let i = 1; i < BOARD_SIZE; i++) {
          const idx = (player.position + i) % BOARD_SIZE;
          const s = BOARD[idx];
          if (card.serviceType && s.serviceType === card.serviceType) { found = idx; break; }
          if (card.category === 'type' && s.type === card.value) { found = idx; break; }
        }
        if (found !== -1) {
          player.position = found;
          player.moveDirection = 1;
          if (card.passStart && player.position < oldPos) {
            player.balance += this.config.startBonus;
            this._addLog(`${player.name} prošel(a) START — +${fmt(this.config.startBonus)} Kč`);
          }
        }
        break;
      }

      case 'move_nearest_backward': {
        let found = -1;
        for (let i = 1; i < BOARD_SIZE; i++) {
          const idx = (player.position - i + BOARD_SIZE) % BOARD_SIZE;
          const s = BOARD[idx];
          if (card.serviceType && s.serviceType === card.serviceType) { found = idx; break; }
          if (card.category === 'type' && s.type === card.value) { found = idx; break; }
        }
        if (found !== -1) {
          const oldPos = player.position;
          player.position = found;
          player.moveDirection = -1;
          if (card.passStart && player.position > oldPos) {
            player.balance += this.config.startBonus;
            this._addLog(`${player.name} prošel(a) START (pozpátku) — +${fmt(this.config.startBonus)} Kč`);
          }
        }
        break;
      }

      case 'move_backward_to': {
        const oldPos = player.position;
        player.position = card.space;
        player.moveDirection = -1;
        if (card.bonus) player.balance += card.bonus;
        if (card.passStart && player.position > oldPos) {
          player.balance += this.config.startBonus;
          this._addLog(`${player.name} prošel(a) START (pozpátku) — +${fmt(this.config.startBonus)} Kč`);
        }
        break;
      }
    }
  },
};
