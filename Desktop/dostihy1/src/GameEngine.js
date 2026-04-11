'use strict';

const BOARD = require('./data/boardData');
const { FinanceDeck, NahodaDeck } = require('./Cards');

const STARTING_BALANCE = 30000;
const START_BONUS      = 4000;
const JAIL_SPACE       = 10;
const JAIL_TURNS_MAX   = 3;
const JAIL_FINE        = 500;
const ACTION_DELAY_MS  = 1200; // pause between auto-actions for animation

const PLAYER_COLORS = ['#e74c3c','#3b82f6','#10b981','#f59e0b','#a855f7','#f97316'];

function roll() { return Math.floor(Math.random() * 6) + 1; }
function fmt(n)  { return Number(n).toLocaleString('cs-CZ'); }

class GameEngine {
  constructor(io) {
    this.io            = io;
    this.phase         = 'lobby';       // 'lobby' | 'playing' | 'ended'
    this.players       = new Map();     // socketId → player object
    this.turnOrder     = [];            // [socketId, ...]
    this.currentTurnIdx = 0;
    this.ownerships    = {};            // { spaceId: socketId }
    this.tokens        = {};            // { spaceId: { small:0-4, big:false } }
    this.pendingAction = null;
    this.lastDice      = null;
    this.log           = [];
    this.round         = 1;
    this.financeCards  = FinanceDeck();
    this.nahodaCards   = NahodaDeck();
    this._timer        = null;
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
    const isHost   = this.players.size === 0;
    const usedColors = [...this.players.values()].map(p => p.color);
    const finalColor = color && !usedColors.includes(color)
      ? color
      : PLAYER_COLORS.find(c => !usedColors.includes(c)) || '#ffffff';

    const player = {
      id: socket.id, name, color: finalColor, isHost,
      position: 0, balance: STARTING_BALANCE,
      bankrupt: false, inJail: false, jailTurns: 0, skipTurns: 0,
      properties: [],
    };
    this.players.set(socket.id, player);
    this._addLog(`🐎 ${name} se připojil(a) k hře`);
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
    }
    this._broadcast();
  }

  startGame(socket) {
    if (this.phase !== 'lobby') return;
    const host = this.players.get(socket.id);
    if (!host?.isHost) { socket.emit('game:error', { message: 'Hru může spustit pouze host.' }); return; }
    if (this.players.size < 2) { socket.emit('game:error', { message: 'Potřeba alespoň 2 hráče.' }); return; }

    this.phase      = 'playing';
    this.turnOrder  = [...this.players.keys()];
    this.currentTurnIdx = 0;
    this._addLog('🏁 Hra začala! Hodí se na pořadí...');
    this._broadcast();
    setTimeout(() => this._startTurn(), 800);
  }

  // ─── Turn ─────────────────────────────────────────────────────────────────

  _startTurn() {
    if (this.phase !== 'playing') return;
    const pid    = this._currentPlayerId();
    const player = this.players.get(pid);
    if (!player || player.bankrupt) { this._advanceTurn(); return; }

    // Skip turns (card effect)
    if (player.skipTurns > 0) {
      player.skipTurns--;
      this._addLog(`${player.name} vynechává tah (nemocný kůň)`);
      this._broadcast();
      this._timer = setTimeout(() => this._advanceTurn(), ACTION_DELAY_MS * 2);
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
    const pid    = socket.id;
    const player = this.players.get(pid);
    if (!player) return;
    if (this._currentPlayerId() !== pid) { socket.emit('game:error', { message: 'Nejsi na řadě.' }); return; }
    if (!this.pendingAction || this.pendingAction.type !== 'wait_roll') { socket.emit('game:error', { message: 'Teď nelze hodit.' }); return; }

    const dice = roll();
    this.lastDice = dice;
    this._addLog(`🎲 ${player.name} hodil(a) ${dice}`);
    this.pendingAction = null;
    this._broadcast();

    this._timer = setTimeout(() => this._movePlayer(pid, dice), ACTION_DELAY_MS);
  }

  handleRespond(socket, data) {
    const pid = socket.id;
    if (!this.pendingAction || this.pendingAction.targetId !== pid) return;
    const { decision, spaceId, tokenType } = data || {};
    const action = this.pendingAction.type;
    this.pendingAction = null;

    if (action === 'buy_offer') {
      if (decision === 'buy') {
        this._buyProperty(pid, spaceId);
        this._broadcast();
        this._timer = setTimeout(() => this._offerTokensOrEnd(pid), ACTION_DELAY_MS);
      } else {
        this._addLog(`${this.players.get(pid).name} odmítl(a) koupit ${BOARD[spaceId].name}`);
        this._broadcast();
        this._timer = setTimeout(() => this._advanceTurn(), ACTION_DELAY_MS);
      }

    } else if (action === 'card_ack') {
      this._broadcast();
      // Effect already applied — just end turn
      this._timer = setTimeout(() => {
        // If card sent player to jail, don't evaluate space again
        const p = this.players.get(pid);
        if (p.inJail) { this._advanceTurn(); return; }
        // Normal end
        this._offerTokensOrEnd(pid);
      }, ACTION_DELAY_MS);

    } else if (action === 'jail_choice') {
      if (decision === 'pay_fine') {
        const p = this.players.get(pid);
        p.balance  -= JAIL_FINE;
        p.inJail    = false;
        p.jailTurns = 0;
        this._addLog(`${p.name} zaplatil(a) kauci ${fmt(JAIL_FINE)} Kč a opouští Distanc`);
        this.pendingAction = { type: 'wait_roll', targetId: pid };
        this._broadcast();
      } else if (decision === 'roll_jail') {
        const dice = roll();
        this.lastDice = dice;
        const player  = this.players.get(pid);
        this._addLog(`🎲 ${player.name} (v Distancu) hodil(a) ${dice}`);
        if (dice === 6) {
          player.inJail    = false;
          player.jailTurns = 0;
          this._addLog(`🔓 ${player.name} hodil(a) šestku — volno!`);
          this._broadcast();
          this._timer = setTimeout(() => this._movePlayer(pid, dice), ACTION_DELAY_MS);
        } else {
          player.jailTurns--;
          this._addLog(`${player.name} zůstává v Distancu (${player.jailTurns} kol zbývá)`);
          this._broadcast();
          this._timer = setTimeout(() => this._advanceTurn(), ACTION_DELAY_MS);
        }
      }

    } else if (action === 'token_manage') {
      if (decision === 'add_token') {
        this._addToken(pid, spaceId, tokenType);
        this._broadcast();
        this._timer = setTimeout(() => this._offerTokensOrEnd(pid), ACTION_DELAY_MS);
      } else {
        // end_turn
        this._advanceTurn();
      }
    }
  }

  // ─── Movement & Space Evaluation ──────────────────────────────────────────

  _movePlayer(pid, steps) {
    const player  = this.players.get(pid);
    const oldPos  = player.position;
    const newPos  = (oldPos + steps) % 40;
    const crossed = (oldPos + steps) >= 40;

    player.position = newPos;

    if (crossed && newPos !== 0) {
      player.balance += START_BONUS;
      this._addLog(`${player.name} prošel(a) START — +${fmt(START_BONUS)} Kč`);
    }
    if (newPos === 0) {
      player.balance += START_BONUS;
      this._addLog(`${player.name} přistál(a) na START — +${fmt(START_BONUS)} Kč`);
    }

    const space = BOARD[newPos];
    this._addLog(`➡️ ${player.name} přesunul(a) se na ${space.name}`);
    this._broadcast();

    this._timer = setTimeout(() => this._evaluateSpace(pid), ACTION_DELAY_MS);
  }

  _evaluateSpace(pid) {
    const player = this.players.get(pid);
    const space  = BOARD[player.position];

    switch (space.type) {
      case 'start':
      case 'free_parking':
        this._addLog(`${player.name} odpočívá na poli ${space.name}`);
        this._broadcast();
        this._timer = setTimeout(() => this._offerTokensOrEnd(pid), ACTION_DELAY_MS);
        break;

      case 'tax':
        player.balance -= space.amount;
        this._addLog(`${player.name} platí daň ${fmt(space.amount)} Kč`);
        this._checkBankrupt(pid);
        this._broadcast();
        this._timer = setTimeout(() => this._offerTokensOrEnd(pid), ACTION_DELAY_MS);
        break;

      case 'jail':
        // Just visiting
        this._addLog(`${player.name} navštívil(a) Distanc (jen návštěva)`);
        this._broadcast();
        this._timer = setTimeout(() => this._offerTokensOrEnd(pid), ACTION_DELAY_MS);
        break;

      case 'go_to_jail':
        this._sendToJail(pid);
        this._broadcast();
        this._timer = setTimeout(() => this._advanceTurn(), ACTION_DELAY_MS);
        break;

      case 'finance':
      case 'nahoda': {
        const card   = space.type === 'finance' ? this.financeCards.draw() : this.nahodaCards.draw();
        const label  = space.type === 'finance' ? 'Finance' : 'Náhoda';
        this._addLog(`🃏 ${player.name} táhne kartu ${label}: "${card.text}"`);
        this._applyCard(pid, card);
        this.pendingAction = { type: 'card_ack', targetId: pid, data: { card, label } };
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
          this._broadcast();
          this._timer = setTimeout(() => this._offerTokensOrEnd(pid), ACTION_DELAY_MS);
        } else {
          // Pay rent
          const rent = this._calcRent(space.id, this.lastDice || 1);
          const ownerPlayer = this.players.get(owner);
          this._addLog(`💸 ${player.name} platí nájem ${fmt(rent)} Kč → ${ownerPlayer.name} (${space.name})`);
          this._transfer(pid, owner, rent);
          this._broadcast();
          this._timer = setTimeout(() => this._offerTokensOrEnd(pid), ACTION_DELAY_MS);
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
    this._broadcast();
    this._timer = setTimeout(() => this._startTurn(), 600);
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
            p.balance      -= card.amount;
            player.balance += card.amount;
            this._checkBankrupt(id);
          }
        });
        break;
      case 'pay_to_all':
        this.players.forEach((p, id) => {
          if (id !== pid && !p.bankrupt) {
            player.balance -= card.amount;
            p.balance      += card.amount;
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
          player.balance += START_BONUS;
          this._addLog(`${player.name} prošel(a) START — +${fmt(START_BONUS)} Kč`);
        }
        if (card.passStart && card.space === 0) {
          player.balance += START_BONUS;
          this._addLog(`${player.name} přistál(a) na START — +${fmt(START_BONUS)} Kč`);
        }
        break;
      }
      case 'move_forward': {
        const np = (player.position + card.steps) % 40;
        if (np < player.position) { player.balance += START_BONUS; }
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

  _calcRent(spaceId, dice) {
    const space = BOARD[spaceId];
    const owner = this.ownerships[spaceId];
    if (!owner) return 0;

    if (space.type === 'service') {
      if (space.serviceType === 'trener') {
        const count = this.players.get(owner).properties.filter(
          sid => BOARD[sid].serviceType === 'trener'
        ).length;
        return count * 500;
      }
      // preprava / staje
      return 4 * dice;
    }

    // horse
    const tok = this.tokens[spaceId] || { small: 0, big: false };
    if (tok.big)    return space.rents[5];
    if (tok.small > 0) return space.rents[tok.small];

    // base rent — doubled if owner has whole stáj
    const base      = space.rents[0];
    const ownsGroup = BOARD
      .filter(s => s.group === space.group)
      .every(s => this.ownerships[s.id] === owner);
    return ownsGroup ? base * 2 : base;
  }

  _buyProperty(pid, spaceId) {
    const player = this.players.get(pid);
    const space  = BOARD[spaceId];
    player.balance      -= space.price;
    this.ownerships[spaceId] = pid;
    player.properties.push(spaceId);
    this._addLog(`🏠 ${player.name} koupil(a) ${space.name} za ${fmt(space.price)} Kč`);
    this._checkBankrupt(pid);
  }

  _addToken(pid, spaceId, tokenType) {
    const player = this.players.get(pid);
    const space  = BOARD[spaceId];
    if (!this.tokens[spaceId]) this.tokens[spaceId] = { small: 0, big: false };
    const tok = this.tokens[spaceId];

    if (tokenType === 'big') {
      if (tok.big) return;
      player.balance -= space.bigTokenCost;
      tok.small = 0;
      tok.big   = true;
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
    return player.properties.filter(spaceId => {
      const space = BOARD[spaceId];
      if (space.type !== 'horse') return false;
      const tok = this.tokens[spaceId] || { small: 0, big: false };
      if (tok.big) return false;
      // Owns whole stáj?
      const ownsGroup = BOARD
        .filter(s => s.group === space.group)
        .every(s => this.ownerships[s.id] === pid);
      if (!ownsGroup) return false;
      // Has money?
      const cost = tok.small >= 4 ? space.bigTokenCost : space.tokenCost;
      return player.balance >= cost;
    });
  }

  _transfer(fromId, toId, amount) {
    const from = this.players.get(fromId);
    const to   = this.players.get(toId);
    if (!from || !to) return;
    from.balance -= amount;
    to.balance   += amount;
    this._checkBankrupt(fromId);
  }

  _sendToJail(pid) {
    const player    = this.players.get(pid);
    player.position  = JAIL_SPACE;
    player.inJail    = true;
    player.jailTurns = JAIL_TURNS_MAX;
    this._addLog(`🔒 ${player.name} jde do Distancu!`);
  }

  _checkBankrupt(pid) {
    const player = this.players.get(pid);
    if (player && player.balance < 0 && !player.bankrupt) {
      this._declareBankrupt(pid);
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
    this.io.emit('game:state', this._buildState());
  }

  _buildState() {
    return {
      phase:              this.phase,
      players:            [...this.players.values()],
      turnOrder:          this.turnOrder,
      currentTurnId:      this._currentPlayerId(),
      ownerships:         this.ownerships,
      tokens:             this.tokens,
      pendingAction:      this.pendingAction,
      lastDice:           this.lastDice,
      log:                this.log.slice(0, 20),
      round:              this.round,
    };
  }

  /** Send board data + full state to a newly joined socket */
  sendInit(socket) {
    socket.emit('game:init', {
      board: BOARD,
      colors: PLAYER_COLORS,
      state: this._buildState(),
    });
  }
}

module.exports = GameEngine;
