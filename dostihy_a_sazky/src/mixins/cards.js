'use strict';

const BOARD = require('../data/boardData');
const { BOARD_SIZE, fmt } = require('../constants');

// Tón karty v přehledu balíčku: příjem / platba či trest / pohyb po plánu.
const CARD_TONE = {
  gain: 'good', collect_from_all: 'good', jail_free_card: 'good', reroll_card: 'good',
  pay: 'bad', pay_per_token_custom: 'bad', go_to_jail: 'bad', skip_turn: 'bad',
};

module.exports = {

  /**
   * Karta tak, jak ji hráč uvidí: platby po inflaci, {startBonus} z nastavení
   * a {space:N} jako název pole podle režimu (Parkoviště / Letiště…).
   * Používá ji tažení karty i přehled balíčků — texty tak nemůžou rozjet.
   */
  _cardView(rawCard) {
    const card = this._inflateCard({ ...rawCard });
    if (card.text) {
      card.text = card.text
        .replace(/{startBonus}/g, fmt(this.config.startBonus))
        .replace(/{space:(\d+)}/g, (_, id) => this._spaceName(Number(id)));
    }
    return card;
  },

  /**
   * Přehled balíčku pro detail pole Finance / Náhoda: každý text jednou
   * s počtem kusů, tónem a příznakem, že kartu zrovna drží hráč.
   */
  _deckOverview(deck) {
    const byText = new Map();
    for (const raw of deck.original) {
      const { text } = this._cardView(raw);
      const entry = byText.get(text);
      if (entry) { entry.count++; continue; }
      byText.set(text, { text, type: raw.type, count: 1, tone: CARD_TONE[raw.type] || 'neutral', held: deck.held.has(raw) });
    }
    return [...byText.values()];
  },

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
        // Jen zdržení — na rozdíl od Dopingu (skipTurns) žetony dál platí.
        player.waitTurns = (player.waitTurns || 0) + card.turns;
        break;

      case 'jail_free_card':
        player.jailFreeCards++;
        break;

      case 'reroll_card':
        player.rerollCards = (player.rerollCards || 0) + 1;
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
        const matches = (idx) => {
          const s = BOARD[idx];
          if (card.serviceType && s.serviceType === card.serviceType) return true;
          if (card.category === 'type' && s.type === card.value) return true;
          return false;
        };
        let foundFwd = -1, distFwd = BOARD_SIZE;
        let foundBwd = -1, distBwd = BOARD_SIZE;
        for (let i = 1; i < BOARD_SIZE; i++) {
          if (foundFwd === -1) {
            const idx = (player.position + i) % BOARD_SIZE;
            if (matches(idx)) { foundFwd = idx; distFwd = i; }
          }
          if (foundBwd === -1) {
            const idx = (player.position - i + BOARD_SIZE) % BOARD_SIZE;
            if (matches(idx)) { foundBwd = idx; distBwd = i; }
          }
          if (foundFwd !== -1 && foundBwd !== -1) break;
        }
        let chosen = -1, direction = 1;
        if (foundFwd !== -1 && (foundBwd === -1 || distFwd <= distBwd)) {
          chosen = foundFwd; direction = 1;
        } else if (foundBwd !== -1) {
          chosen = foundBwd; direction = -1;
        }
        if (chosen !== -1) {
          player.position = chosen;
          player.moveDirection = direction;
          if (card.passStart && direction === 1 && chosen < oldPos) {
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
        if (card.bonus) {
          const bonusAmt = (card.bonus === 'startBonus') ? this.config.startBonus : card.bonus;
          player.balance += bonusAmt;
        }
        if (card.passStart && player.position > oldPos) {
          player.balance += this.config.startBonus;
          this._addLog(`${player.name} prošel(a) START (pozpátku) — +${fmt(this.config.startBonus)} Kč`);
        }
        break;
      }
    }
  },
};
