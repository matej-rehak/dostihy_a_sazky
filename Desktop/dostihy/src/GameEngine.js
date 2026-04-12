'use strict';

const BOARD = require('./data/boardData');
const { FinanceDeck, NahodaDeck } = require('./Cards');

const JAIL_SPACE = 10;
const JAIL_TURNS_MAX = 3;
const JAIL_FINE = 500;
const ACTION_DELAY_MS = 2000; // pause between auto-actions for animation

const PLAYER_COLORS = ['#e74c3c', '#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#f97316'];

function roll() { return Math.floor(Math.random() * 6) + 1; }
function fmt(n) { return Number(n).toLocaleString('cs-CZ'); }

class GameEngine {
  constructor(io, roomId) {
    this.io = io;
    this.roomId = roomId;
    this.phase = 'lobby';       // 'lobby' | 'playing' | 'ended'
    this.players = new Map();     // socketId → player object
    this.turnOrder = [];            // [socketId, ...]
    this.currentTurnIdx = 0;
    this.ownerships = {};            // { spaceId: socketId }
    this.tokens = {};            // { spaceId: { small:0-4, big:false } }
    this.pendingAction = null;
    this.lastDice = null;
    this.log = [];
    this.round = 1;
    this.financeCards = FinanceDeck();
    this.nahodaCards = NahodaDeck();
    this.config = { startBalance: 10000, startBonus: 4000, buyoutMultiplier: 0 };
    this._timer = null;
    this._resumeFn = null;
  }

  // ─── Lobby ────────────────────────────────────────────────────────────────

  addPlayer(socket, name, color) {
    if (this.phase !== 'lobby') {
      socket.emit('game:error', { message: 'Hra již probíhá.' });
      return;
    }
    if (this.players.size >= 6) {
      socket.emit('game:error', { message: 'Hra je plná (max 6 hráčů).' });
      return;
    }
    const isHost = this.players.size === 0;
    const usedColors = [...this.players.values()].map(p => p.color);
    const finalColor = color && !usedColors.includes(color)
      ? color
      : PLAYER_COLORS.find(c => !usedColors.includes(c)) || '#ffffff';

    const player = {
      id: socket.id, name, color: finalColor, isHost,
      position: 0, balance: this.config.startBalance,
      bankrupt: false, inJail: false, jailTurns: 0, skipTurns: 0,
      properties: [],
    };
    this.players.set(socket.id, player);
    this._addLog(`🐎 ${name} se připojil(a) k hře`);
    this._broadcast();
  }

  updateConfig(socket, config) {
    if (this.phase !== 'lobby') return;
    const player = this.players.get(socket.id);
    if (!player || !player.isHost) return;
    this.config = { ...this.config, ...config };
    this._broadcast();
  }

  removePlayer(socket) {
    const player = this.players.get(socket.id);
    if (!player) return;

    if (this.phase === 'playing') {
      this._addLog(`⚠️ ${player.name} se odpojil(a) — bankrot`);
      this._declareBankrupt(socket.id);
    } else {
      this.players.delete(socket.id);
      this._addLog(`${player.name} opustil(a) lobby`);

      // Hand over host rights if needed
      if (player.isHost && this.players.size > 0) {
        const nextId = this.players.keys().next().value;
        const nextPlayer = this.players.get(nextId);
        if (nextPlayer) {
          nextPlayer.isHost = true;
          this._addLog(`👑 ${nextPlayer.name} je nyní hostitelem`);
        }
      }
    }
    this._broadcast();
  }

  startGame(socket) {
    if (this.phase !== 'lobby') return;
    const host = this.players.get(socket.id);
    if (!host?.isHost) { socket.emit('game:error', { message: 'Hru může spustit pouze host.' }); return; }
    if (this.players.size < 2) { socket.emit('game:error', { message: 'Potřeba alespoň 2 hráče.' }); return; }

    this.phase = 'playing';
    this.players.forEach(p => p.balance = this.config.startBalance);
    this.turnOrder = [...this.players.keys()];
    this.currentTurnIdx = 0;
    this._addLog('🏁 Hra začala! Hodí se na pořadí...');
    this._broadcast();
    setTimeout(() => this._startTurn(), 800);
  }

  // ─── Turn ─────────────────────────────────────────────────────────────────

  _startTurn() {
    if (this.phase !== 'playing') return;
    const pid = this._currentPlayerId();
    const player = this.players.get(pid);
    if (!player || player.bankrupt) { this._advanceTurn(); return; }

    // Skip turns (card effect)
    if (player.skipTurns > 0) {
      player.skipTurns--;
      this._addLog(`${player.name} vynechává tah (nemocný kůň)`);
      this._scheduleAction(ACTION_DELAY_MS * 2, () => this._advanceTurn());
      return;
    }

    if (player.inJail) {
      if (player.jailTurns <= 0) {
        // Forced release
        player.inJail = false;
        this._addLog(`${player.name} je propuštěn(a) z Distancu`);
        this.pendingAction = { type: 'wait_roll', targetId: pid };
      } else {
        this.pendingAction = { type: 'jail_choice', targetId: pid };
      }
    } else {
      this.pendingAction = { type: 'wait_roll', targetId: pid };
    }
    this._broadcast();
  }

  handleRoll(socket) {
    const pid = socket.id;
    const player = this.players.get(pid);
    if (!player) return;
    if (this._currentPlayerId() !== pid) { socket.emit('game:error', { message: 'Nejsi na řadě.' }); return; }
    if (!this.pendingAction) { socket.emit('game:error', { message: 'Teď nelze hodit.' }); return; }

    if (this.pendingAction.type === 'wait_roll') {
      const dice = roll();
      this.lastDice = { value: dice, id: Math.random() };
      if (dice === 6) player.bonusTurn = true;

      this._addLog(`🎲 ${player.name} hodil(a) ${dice}`);
      this.pendingAction = null;
      this._scheduleAction(ACTION_DELAY_MS, () => this._movePlayer(pid, dice));
    } else if (this.pendingAction.type === 'service_roll') {
      const dice = roll();
      this.lastDice = { value: dice, id: Math.random() };
      const spaceId = this.pendingAction.data.spaceId;
      const space = BOARD[spaceId];
      const owner = this.ownerships[spaceId];
      const ownerPlayer = this.players.get(owner);
      
      this._addLog(`🎲 ${player.name} hází pro poplatek: ${dice}`);
      
      const rent = this._calcRent(spaceId, dice);
      this._addLog(`💸 ${player.name} platí poplatek ${fmt(rent)} Kč → ${ownerPlayer.name} (${space.name})`);
      
      this.pendingAction = null;
      this._transfer(pid, owner, rent);
      this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
    } else {
      socket.emit('game:error', { message: 'Teď nelze hodit.' });
    }
  }

  handleRespond(socket, data) {
    const pid = socket.id;
    if (!this.pendingAction || this.pendingAction.targetId !== pid) return;
    const { decision, spaceId, tokenType } = data || {};
    const actionData = this.pendingAction.data || {};
    const action = this.pendingAction.type;
    this.pendingAction = null;

    if (action === 'debt_manage') {
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
    } else if (action === 'buy_offer') {
      if (decision === 'buy') {
        this._buyProperty(pid, spaceId);
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
      } else {
        this._addLog(`${this.players.get(pid).name} odmítl(a) koupit ${BOARD[spaceId].name}`);
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
      }

    } else if (action === 'buyout_offer') {
      if (decision === 'buy') {
        const buyoutCost = actionData.buyoutCost;
        const spaceId = actionData.spaceId;
        const space = BOARD[spaceId];
        const oldOwnerId = this.ownerships[spaceId];
        const oldOwner = this.players.get(oldOwnerId);
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
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
      } else {
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
      }

    } else if (action === 'card_ack') {
      const card = actionData.card;
      this._applyCard(pid, card);

      this._scheduleAction(ACTION_DELAY_MS, () => {
        const p = this.players.get(pid);
        if (p.inJail || p.bankrupt) { this._advanceTurn(); return; }

        if (['move_to', 'move_forward', 'move_backward'].includes(card.type)) {
          this._evaluateSpace(pid);
        } else {
          this._offerTokensOrEnd(pid);
        }
      });

    } else if (action === 'jail_choice') {
      if (decision === 'pay_fine') {
        const p = this.players.get(pid);
        p.balance -= JAIL_FINE;
        p.inJail = false;
        p.jailTurns = 0;
        this._addLog(`${p.name} zaplatil(a) kauci ${fmt(JAIL_FINE)} Kč a opouští Distanc`);
        this.pendingAction = { type: 'wait_roll', targetId: pid };
        this._broadcast();
      } else if (decision === 'roll_jail') {
        const dice = roll();
        this.lastDice = { value: dice, id: Math.random() };
        const player = this.players.get(pid);
        this._addLog(`🎲 ${player.name} (v Distancu) hodil(a) ${dice}`);
        if (dice === 6) {
          player.inJail = false;
          player.jailTurns = 0;
          this._addLog(`🔓 ${player.name} hodil(a) šestku — volno!`);
          this._scheduleAction(ACTION_DELAY_MS, () => this._movePlayer(pid, dice));
        } else {
          player.jailTurns--;
          this._addLog(`${player.name} zůstává v Distancu (${player.jailTurns} kol zbývá)`);
          this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
        }
      }

    } else if (action === 'token_manage') {
      if (decision === 'add_token') {
        this._addToken(pid, spaceId, tokenType);
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
      } else {
        // end_turn
        this._advanceTurn();
      }
    }
  }

  // ─── Movement & Space Evaluation ──────────────────────────────────────────

  _movePlayer(pid, steps) {
    const player = this.players.get(pid);
    const oldPos = player.position;
    const newPos = (oldPos + steps) % 40;
    const crossed = (oldPos + steps) >= 40;

    player.position = newPos;

    if (crossed && newPos !== 0) {
      player.balance += this.config.startBonus;
      this._addLog(`${player.name} prošel(a) START — +${fmt(this.config.startBonus)} Kč`);
    }
    if (newPos === 0) {
      player.balance += this.config.startBonus;
      this._addLog(`${player.name} přistál(a) na START — +${fmt(this.config.startBonus)} Kč`);
    }

    const space = BOARD[newPos];
    this._addLog(`➡️ ${player.name} přesunul(a) se na ${space.name}`);
    this._scheduleAction(ACTION_DELAY_MS, () => this._evaluateSpace(pid));
  }

  _evaluateSpace(pid) {
    const player = this.players.get(pid);
    const space = BOARD[player.position];

    switch (space.type) {
      case 'start':
      case 'free_parking':
        this._addLog(`${player.name} odpočívá na poli ${space.name}`);
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
        break;

      case 'tax':
        player.balance -= space.amount;
        this._addLog(`${player.name} platí daň ${fmt(space.amount)} Kč`);
        this._checkBankrupt(pid);
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
        break;

      case 'jail':
        // Just visiting
        this._addLog(`${player.name} navštívil(a) Distanc (jen návštěva)`);
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
        break;

      case 'go_to_jail':
        this._sendToJail(pid);
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
        break;

      case 'finance':
      case 'nahoda': {
        const card = space.type === 'finance' ? this.financeCards.draw() : this.nahodaCards.draw();
        const label = space.type === 'finance' ? 'Finance' : 'Náhoda';
        this._addLog(`🃏 ${player.name} táhne kartu ${label}: "${card.text}"`);
        this.pendingAction = { type: 'card_ack', targetId: pid, data: { card, label, spaceId: space.id } };
        this._broadcast();
        break;
      }

      case 'horse':
      case 'service': {
        const owner = this.ownerships[space.id];
        if (!owner) {
          // Unowned — offer to buy
          this.pendingAction = { type: 'buy_offer', targetId: pid, data: { spaceId: space.id } };
          this._broadcast();
        } else if (owner === pid) {
          // Own property
          this._addLog(`${player.name} stojí na vlastním ${space.name}`);
          this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
        } else {
          // Pay rent
          if (space.serviceType === 'preprava' || space.serviceType === 'staje') {
            this._addLog(`🕒 ${player.name} musí hodit pro určení poplatku (${space.name})`);
            this.pendingAction = { type: 'service_roll', targetId: pid, data: { spaceId: space.id } };
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
  }

  _offerTokensOrEnd(pid) {
    const eligible = this._eligibleTokenSpaces(pid);
    if (eligible.length > 0) {
      this.pendingAction = { type: 'token_manage', targetId: pid, data: { eligible } };
      this._broadcast();
    } else {
      this._advanceTurn();
    }
  }

  _advanceTurn() {
    const active = this.turnOrder.filter(id => {
      const p = this.players.get(id);
      return p && !p.bankrupt;
    });
    if (active.length <= 1) { this._endGame(active[0]); return; }

    const pid = this._currentPlayerId();
    const player = this.players.get(pid);

    if (player && player.bonusTurn && !player.bankrupt && !player.inJail) {
      player.bonusTurn = false;
      this._addLog(`🎲 ${player.name} hodil(a) šestku a má právo hrát znovu!`);
      this.pendingAction = null;
      this._scheduleAction(600, () => this._startTurn());
      return;
    }

    let tries = 0;
    do {
      this.currentTurnIdx = (this.currentTurnIdx + 1) % this.turnOrder.length;
      tries++;
    } while (
      this.players.get(this.turnOrder[this.currentTurnIdx])?.bankrupt &&
      tries < this.turnOrder.length
    );

    this.pendingAction = null;
    if (this.currentTurnIdx === 0) this.round++;
    this._scheduleAction(600, () => this._startTurn());
  }

  // ─── Card Effects ─────────────────────────────────────────────────────────

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
      case 'move_to': {
        const oldPos = player.position;
        player.position = card.space;
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
        const np = (player.position + card.steps) % 40;
        if (np < player.position) { player.balance += this.config.startBonus; }
        player.position = np;
        break;
      }
      case 'move_backward':
        player.position = (player.position - card.steps + 40) % 40;
        break;
      case 'skip_turn':
        player.skipTurns += card.turns;
        break;
      case 'gain_per_property':
        player.balance += player.properties.length * card.amount;
        break;
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  _scheduleAction(delay, fn) {
    if (this.phase === 'ended') return;
    const debtor = [...this.players.values()].find(p => p.balance < 0 && !p.bankrupt);
    if (debtor) {
      const assets = this._calcAssetsValue(debtor.id);
      if (assets + debtor.balance >= 0) {
        this.pendingAction = { type: 'debt_manage', targetId: debtor.id };
        this._resumeFn = fn;
        this._broadcast();
        return;
      } else {
        this._declareBankrupt(debtor.id);
        return this._scheduleAction(delay, fn);
      }
    }
    this._broadcast();
    this._timer = setTimeout(fn, delay);
  }

  _calcAssetsValue(pid) {
    const p = this.players.get(pid);
    if (!p) return 0;
    return p.properties.reduce((sum, spId) => {
      const space = BOARD[spId];
      let val = Math.floor(space.price / 2);
      const tok = this.tokens[spId];
      if (tok) {
        if (tok.big) val += Math.floor(space.bigTokenCost / 2) + Math.floor(space.tokenCost / 2) * 4;
        else if (tok.small > 0) val += Math.floor(space.tokenCost / 2) * tok.small;
      }
      return sum + val;
    }, 0);
  }

  _sellProperty(pid, spaceId) {
    const p = this.players.get(pid);
    const space = BOARD[spaceId];
    if (this.ownerships[spaceId] !== pid) return;

    let addedValue = Math.floor(space.price / 2);
    const tok = this.tokens[spaceId];
    if (tok) {
      if (tok.big) addedValue += Math.floor(space.bigTokenCost / 2) + Math.floor(space.tokenCost / 2) * 4;
      else if (tok.small > 0) addedValue += Math.floor(space.tokenCost / 2) * tok.small;
      delete this.tokens[spaceId];
    }

    p.balance += addedValue;
    p.properties = p.properties.filter(id => id !== spaceId);
    delete this.ownerships[spaceId];
    this._addLog(`📉 ${p.name} prodal(a) ${space.name} za ${fmt(addedValue)} Kč`);
  }

  _offerBuyoutOrEnd(pid, spaceId, buyoutCost) {
    const player = this.players.get(pid);
    if (!player || player.bankrupt) return;

    // Pokud už majitel vlastní celou stáj (barvu), nelze odkupovat
    const space = BOARD[spaceId];
    const ownerId = this.ownerships[spaceId];
    const hasMonopoly = BOARD
      .filter(s => s.group === space.group)
      .every(s => this.ownerships[s.id] === ownerId);

    if (hasMonopoly) {
      return this._offerTokensOrEnd(pid);
    }

    if (player.balance >= buyoutCost) {
      this.pendingAction = { type: 'buyout_offer', targetId: pid, data: { spaceId, buyoutCost } };
      this._broadcast();
    } else {
      this._offerTokensOrEnd(pid);
    }
  }

  _calcRent(spaceId, dice) {
    const space = BOARD[spaceId];
    const owner = this.ownerships[spaceId];
    if (!owner) return 0;

    if (space.type === 'service') {
      const ownerPlayer = this.players.get(owner);
      if (space.serviceType === 'trener') {
        const count = ownerPlayer.properties.filter(
          sid => BOARD[sid].serviceType === 'trener'
        ).length;
        return count * 1000;
      }
      // preprava / staje
      const hasPreprava = ownerPlayer.properties.some(sid => BOARD[sid].serviceType === 'preprava');
      const hasStaje    = ownerPlayer.properties.some(sid => BOARD[sid].serviceType === 'staje');
      const multiplier = (hasPreprava && hasStaje) ? 200 : 80;
      return multiplier * dice;
    }

    // horse
    const tok = this.tokens[spaceId] || { small: 0, big: false };
    if (tok.big) return space.rents[5];
    if (tok.small > 0) return space.rents[tok.small];

    // base rent — doubled if owner has whole stáj
    const base = space.rents[0];
    const ownsGroup = BOARD
      .filter(s => s.group === space.group)
      .every(s => this.ownerships[s.id] === owner);
    return ownsGroup ? base * 2 : base;
  }

  _buyProperty(pid, spaceId) {
    const player = this.players.get(pid);
    const space = BOARD[spaceId];
    player.balance -= space.price;
    this.ownerships[spaceId] = pid;
    player.properties.push(spaceId);
    this._addLog(`🏠 ${player.name} koupil(a) ${space.name} za ${fmt(space.price)} Kč`);
    this._checkBankrupt(pid);
  }

  _addToken(pid, spaceId, tokenType) {
    const player = this.players.get(pid);
    const space = BOARD[spaceId];
    if (!this.tokens[spaceId]) this.tokens[spaceId] = { small: 0, big: false };
    const tok = this.tokens[spaceId];

    if (tokenType === 'big') {
      if (tok.big) return;
      player.balance -= space.bigTokenCost;
      tok.small = 0;
      tok.big = true;
      this._addLog(`🏆 ${player.name} přidal(a) Hlavní dostih na ${space.name}`);
    } else {
      if (tok.small >= 4 || tok.big) return;
      player.balance -= space.tokenCost;
      tok.small++;
      this._addLog(`🎽 ${player.name} přidal(a) žeton dostihů na ${space.name} (${tok.small}x)`);
    }
    this._checkBankrupt(pid);
  }

  _eligibleTokenSpaces(pid) {
    const player = this.players.get(pid);
    const spaceId = player.position;

    // Player must be standing on a property they own
    if (!player.properties.includes(spaceId)) return [];

    const space = BOARD[spaceId];
    if (space.type !== 'horse') return [];

    const tok = this.tokens[spaceId] || { small: 0, big: false };
    if (tok.big) return [];

    // Owns whole stáj?
    const ownsGroup = BOARD
      .filter(s => s.group === space.group)
      .every(s => this.ownerships[s.id] === pid);
    if (!ownsGroup) return [];

    // Has money?
    const cost = tok.small >= 4 ? space.bigTokenCost : space.tokenCost;
    if (player.balance < cost) return [];

    return [spaceId];
  }

  _transfer(fromId, toId, amount) {
    const from = this.players.get(fromId);
    const to = this.players.get(toId);
    if (!from || !to) return;
    from.balance -= amount;
    to.balance += amount;
    this._checkBankrupt(fromId);
  }

  _sendToJail(pid) {
    const player = this.players.get(pid);
    player.position = JAIL_SPACE;
    player.inJail = true;
    player.jailTurns = JAIL_TURNS_MAX;
    this._addLog(`🔒 ${player.name} jde do Distancu!`);
  }

  _checkBankrupt(pid) {
    const player = this.players.get(pid);
    if (player && player.balance < 0 && !player.bankrupt) {
      if (this._calcAssetsValue(pid) + player.balance < 0) {
        this._declareBankrupt(pid);
      }
    }
  }

  _declareBankrupt(pid) {
    const player = this.players.get(pid);
    if (!player || player.bankrupt) return;
    player.bankrupt = true;
    // Return all properties to bank
    player.properties.forEach(sid => {
      delete this.ownerships[sid];
      delete this.tokens[sid];
    });
    player.properties = [];
    this._addLog(`💀 ${player.name} je v bankrotu a vypadává ze hry!`);
    this._removeFromTurnOrder(pid);

    const active = this.turnOrder.filter(id => !this.players.get(id)?.bankrupt);
    if (active.length <= 1) this._endGame(active[0]);
  }

  _removeFromTurnOrder(pid) {
    const idx = this.turnOrder.indexOf(pid);
    if (idx !== -1) {
      this.turnOrder.splice(idx, 1);
      if (this.currentTurnIdx >= this.turnOrder.length) this.currentTurnIdx = 0;
    }
  }

  _endGame(winnerId) {
    this.phase = 'ended';
    const winner = winnerId ? this.players.get(winnerId) : null;
    this._addLog(winner
      ? `🏆 ${winner.name} vyhrál(a) hru s ${fmt(winner.balance)} Kč!`
      : '🏁 Hra skončila nerozhodně.'
    );
    this.pendingAction = { type: 'game_over', winner: winner ? { name: winner.name, balance: winner.balance } : null };
    this._broadcast();
  }

  _currentPlayerId() { return this.turnOrder[this.currentTurnIdx]; }

  _addLog(msg) {
    this.log.unshift(msg);
    if (this.log.length > 30) this.log.pop();
  }

  // ─── State Broadcast ──────────────────────────────────────────────────────

  _broadcast() {
    this.io.to(this.roomId).emit('game:state', this._buildState());
  }

  _buildState() {
    return {
      phase: this.phase,
      players: [...this.players.values()],
      turnOrder: this.turnOrder,
      currentTurnId: this._currentPlayerId(),
      ownerships: this.ownerships,
      tokens: this.tokens,
      pendingAction: this.pendingAction,
      lastDice: this.lastDice,
      log: this.log.slice(0, 20),
      round: this.round,
      config: this.config,
    };
  }

  /** Send board data + full state to a newly joined socket */
  sendInit(socket) {
    socket.emit('game:init', {
      roomId: this.roomId,
      board: BOARD,
      colors: PLAYER_COLORS,
      state: this._buildState(),
    });
  }
}

module.exports = GameEngine;
