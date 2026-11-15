'use strict';

const BOARD = require('../data/boardData');
const { ACTION_DELAY_MS, SIX_REROLL_DELAY_MS, DICE_REVEAL_MS, roll, fmt } = require('../constants');
const { eventId } = require('../random');

module.exports = {

  /**
   * Hráč tento tah stojí. Do stavu jde `turnSkip` (nové id při každém
   * přeskočení), podle kterého klient přeskočenému ukáže banner — dřív se
   * přeskakovalo potichu a hráč nevěděl, proč nejede.
   */
  _skipTurn(pid, reason, remaining) {
    this.turnSkip = { id: eventId(), playerId: pid, reason, remaining };
    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS * 1.5, () => this._advanceTurn());
  },

  _startTurn() {
    if (this.phase !== 'playing') return;
    const pid = this._currentPlayerId();
    const player = this.players.get(pid);
    if (!player || player.bankrupt) { this._advanceTurn(); return; }

    if (player.skipTurns > 0) {
      player.skipTurns--;
      this._addLog(`🚫 ${player.name} vynechává tah (${player.skipTurns} kol zbývá)`);
      this._skipTurn(pid, 'doping', player.skipTurns + (player.waitTurns || 0));
      return;
    }

    if (player.waitTurns > 0) {
      player.waitTurns--;
      this._addLog(`⏳ ${player.name} se zdržuje (${player.waitTurns} kol zbývá)`);
      this._skipTurn(pid, 'wait', player.waitTurns);
      return;
    }

    if (player.inJail) {
      if (player.jailTurns <= 0) {
        player.inJail = false;
        this._addLog(`${player.name} je propuštěn(a) z Distancu`);
        this._setPendingAction({ type: 'wait_roll', targetId: pid });
      } else {
        this._setPendingAction({ type: 'jail_choice', targetId: pid });
      }
    } else if (player.canFly && this.config.field20Mode === 'airport') {
      this._setPendingAction({
        type: 'airport_choice',
        targetId: pid,
        data: { fee: this._airportFee() },
      });
    } else if (player.canSpin && this.config.field30Mode === 'roulette') {
      // Minule zastavil na Ruletě — teď se rozhodne: zatočit, nebo hodit.
      this._setPendingAction({ type: 'roulette_choice', targetId: pid, data: { fee: this._rouletteFee() } });
    } else {
      this._setPendingAction({ type: 'wait_roll', targetId: pid });
    }
    this._broadcast();
  },

  /**
   * @param {object} [data] `{ bet: { number, stake } }` — volitelná sázka na
   *   vlastní hod (jen při `config.diceBetEnabled`, viz mixins/diceBet.js).
   */
  handleRoll(socket, data) {
    if (this.phase !== 'playing') return;
    const pid = socket.playerId;
    const player = this.players.get(pid);
    if (!player) return;
    if (this._currentPlayerId() !== pid) { socket.emit('game:error', { message: 'Nejsi na řadě.' }); return; }
    if (!this.pendingAction) { socket.emit('game:error', { message: 'Teď nelze hodit.' }); return; }

    if (this.pendingAction.type === 'wait_roll') {
      // Neplatná sázka zruší celý hod — hráč nesmí hodit „naslepo" bez
      // sázky, kterou si myslí, že podal.
      const betResult = this._takeDiceBet(pid, data?.bet);
      if (!betResult.ok) { socket.emit('game:error', { message: betResult.error }); return; }

      const dice = this._rollDie();
      this.lastDice = { value: dice, id: eventId() };

      // Držitel karty „Opakovaný hod" se po dopadu kostky může rozhodnout,
      // jestli hod nechá, nebo ho kartou zopakuje (mixins/reroll.js).
      if (player.rerollCards > 0) {
        this._setPendingAction(null);
        this._scheduleAction(DICE_REVEAL_MS, () => this._offerReroll(pid, dice, betResult.bet));
        return;
      }
      this._finishRoll(pid, dice, betResult.bet);
    } else if (this.pendingAction.type === 'service_roll') {
      const dice = this._rollDie();
      this.lastDice = { value: dice, id: eventId() };
      const { spaceId } = this.pendingAction.data;
      const space = BOARD[spaceId];
      const owner = this.ownerships[spaceId];
      const ownerPlayer = this.players.get(owner);

      // Kostka se nejdřív dotočí, teprve pak se ukáže číslo v logu a strhnou
      // peníze — jinak by hráč výsledek znal dřív, než kostka dopadne.
      this._setPendingAction(null);
      this._scheduleAction(DICE_REVEAL_MS, () => {
        const rent = this._calcRent(spaceId, dice);
        this._addLog(`🎲 ${player.name} hází pro poplatek: ${dice}`);
        this._addLog(`💸 ${player.name} platí poplatek ${fmt(rent)} Kč → ${ownerPlayer.name} (${space.name})`);
        this._transfer(pid, owner, rent);
        this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
      });
    } else {
      socket.emit('game:error', { message: 'Teď nelze hodit.' });
    }
  },

  /** Hod kostkou; testy a debug si ho vynutí přes `_forceDice`. */
  _rollDie() {
    const dice = (this._forceDice >= 1 && this._forceDice <= 6) ? this._forceDice : roll();
    if (this._forceDice) this._forceDice = null;
    return dice;
  },

  /**
   * Dohraje běžný hod: sázky, šestky (nasčítání / Distanc za dvě po sobě)
   * a pohyb figurky. `bet` je sázka na vlastní hod, už stržená při hodu.
   */
  _finishRoll(pid, dice, bet) {
    const player = this.players.get(pid);
    if (!player) return;
    const prevAccumulator = player.rollAccumulator || 0;
    this._resolveDiceBet(pid, bet, dice);

    // Sázka z Rulety se vyhodnotí na prvním hodu po vsazení.
    // Vynuluje se tady, takže opakovaný hod po šestce se už nesází.
    this._resolvePendingBet(pid, dice);

    if (dice === 6 && prevAccumulator > 0) {
      // Dvojitá šestka → jde do Distancu z libovolného místa
      player.rollAccumulator = 0;
      this._addLog(`🎲 ${player.name} hodil(a) 6 dvakrát za sebou → jde do Distancu! 🔒`);
      this._setPendingAction(null);
      this._sendToJail(pid, 'double_six_jail');
      this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
    } else {
      player.rollAccumulator = prevAccumulator + dice;
      if (dice === 6) {
        this._addLog(`🎲 ${player.name} hodil(a) 6! Celkem nasčítáno: ${player.rollAccumulator}. Hází znovu...`);
        // Další hod se povolí až po dohrání animace šestky. Kdyby se povolil
        // hned, protihráčův klient dostane nový hod doprostřed běžící
        // animace a ta se utne. Viz SIX_REROLL_DELAY_MS.
        this._setPendingAction(null);
        this._scheduleAction(SIX_REROLL_DELAY_MS, () => {
          this._setPendingAction({ type: 'wait_roll', targetId: pid });
          this._broadcast();
        });
      } else {
        const totalSteps = player.rollAccumulator;
        player.rollAccumulator = 0;
        this._addLog(`🎲 ${player.name} hodil(a) ${dice}. Celkem se posouvá o ${totalSteps} polí.`);
        player.moveDirection = 1;
        this._setPendingAction(null);
        this._scheduleAction(ACTION_DELAY_MS, () => this._movePlayer(pid, totalSteps));
      }
    }
  },

  _advanceTurn() {
    if (this.phase !== 'playing') return;
    if (this.timeLimitExpired) {
      this._endByTimeLimit();
      return;
    }
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

    this._setPendingAction(null);
    // Nové kolo začíná návratem na prvního hráče — kromě případu, kdy první
    // hráč právě vypadl na svém tahu (viz `_removeFromTurnOrder`).
    if (this.currentTurnIdx === 0 && !this._keepRoundOnNextAdvance) {
      this.round++;
      this._applyRoundInflation();
    }
    this._keepRoundOnNextAdvance = false;
    this._scheduleAction(600, () => this._startTurn());
  },
};
