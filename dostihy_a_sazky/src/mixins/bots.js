'use strict';

const Bot = require('../Bot');
const { PLAYER_COLORS } = require('../constants');

const BOT_NAMES = ['Robot Karel', 'Robot Jana', 'Robot Pepa', 'Robot Eva', 'Robot Tonda'];
const MAX_PLAYERS = 6;

module.exports = {

  /** Přidá bota do lobby. Vrací false, když to nejde. */
  addBot() {
    if (this.phase !== 'lobby') return false;
    if (this.players.size >= MAX_PLAYERS) return false;

    const usedColors = [...this.players.values()].map(p => p.color);
    const color = PLAYER_COLORS.find(c => !usedColors.includes(c)) || '#ffffff';

    const usedNames = new Set([...this.players.values()].map(p => p.name));
    const name = BOT_NAMES.find(n => !usedNames.has(n)) || `Robot ${this.players.size + 1}`;

    const id = `bot-${Math.random().toString(36).slice(2, 10)}`;

    this.players.set(id, {
      id,
      socketId: null,
      name,
      color,
      isHost: false,
      isBot: true,
      position: 0,
      balance: this.config.startBalance,
      bankrupt: false,
      inJail: false,
      jailTurns: 0,
      skipTurns: 0,
      properties: [],
      rollAccumulator: 0,
      moveDirection: 1,
      jailFreeCards: 0,
      ready: true,
      disconnected: false,
      canFly: false,
      // Totalizátor — příznaky visící na hráči přes tahy (vzor `canFly`).
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });

    this._addLog(`🤖 ${name} se připojil(a) k hře`);
    this._broadcast();
    return true;
  },

  /** Odebere bota z lobby. Lidské hráče ignoruje. */
  removeBot(botId) {
    const player = this.players.get(botId);
    if (!player || !player.isBot) return false;
    if (this.phase !== 'lobby') return false;

    const timer = this._botTimers.get(botId);
    if (timer) {
      clearTimeout(timer);
      this._botTimers.delete(botId);
    }

    this.players.delete(botId);
    this._addLog(`🤖 ${player.name} byl(a) odebrán(a) ze hry`);
    this._broadcast();
    return true;
  },

  /**
   * Probudí každého bota, který by mohl mít co na práci.
   * Iteruje VŠECHNY boty, ne jen pendingAction.targetId — obchodní nabídka
   * může mířit na bota, který zrovna není na tahu.
   */
  _notifyBots() {
    if (this.phase !== 'playing') return;

    for (const player of this.players.values()) {
      if (!player.isBot || player.bankrupt) continue;
      if (this._botTimers.has(player.id)) continue;

      const botId = player.id;
      const timer = setTimeout(() => this._botAct(botId), Bot.BOT_THINK_MS);
      this._botTimers.set(botId, timer);
    }
  },

  /**
   * Rozhodnutí se počítá až tady, ze živého stavu — zastaralé rozhodnutí
   * tak nemůže vzniknout. Na konci se probouzí znovu, aby navázaly řetězené
   * akce (odmítnout nabídku → dokončit vlastní tah).
   */
  _botAct(botId) {
    // Timer se ruší i tady: v produkci už vystřelil, ale při přímém volání
    // (testy, budoucí volání z enginu) by jinak zůstal armovaný duplikát.
    const pending = this._botTimers.get(botId);
    if (pending) {
      clearTimeout(pending);
      this._botTimers.delete(botId);
    }
    if (this.phase !== 'playing') return;

    const bot = this.players.get(botId);
    if (!bot || !bot.isBot || bot.bankrupt) return;

    const action = Bot.decideAction(this, botId);
    if (!action) return;

    const botSocket = { playerId: botId, id: null, emit: () => {} };

    // Snímek stavu před odesláním akce: `handleRoll` se chová jako no-op
    // (aniž by spotřeboval `pendingAction`), když volající není
    // `_currentPlayerId()`. Dnes je ta větev pro boty nedosažitelná, ale stojí
    // na předpokladu „boti nikdy nevolají initiateTrade", který nikde jinde
    // hlídaný není. Místo dohadování o tomto invariantu je no-op dispatch
    // konstrukčně neschopný znovu se naplánovat: probudíme se znovu jen tehdy,
    // když akce prokazatelně něco změnila (identita `pendingAction` nebo délka
    // fronty obchodů). Skutečný no-op — stejná reference `pendingAction`,
    // stejná délka fronty — se do `_notifyBots` vracet NESMÍ, jinak by zaseknutý
    // bot zkoušel akci znovu každých BOT_THINK_MS donekonečna. Nezjednodušuj to
    // zpět na bezpodmínečné `_notifyBots()` na konci.
    const pendingBefore = this.pendingAction;
    const offersBefore = this.tradeOffers.length;

    // Bot běží z holého `setTimeout`, takže výjimka odsud by nebyla nikým
    // zachycena a shodila by celý proces — tedy i všechny ostatní místnosti.
    // Timer je v tuto chvíli už smazaný z `_botTimers`, takže chycená chyba
    // bota trvale nezablokuje: probudí ho nejbližší `_setPendingAction`.
    // Záměrně se po chybě neprobouzíme sami — deterministická chyba by
    // znamenala nekonečnou smyčku každých BOT_THINK_MS.
    try {
      if (action.kind === 'roll') {
        this.handleRoll(botSocket);
      } else {
        this.handleRespond(botSocket, action.data);
      }
    } catch (err) {
      console.error(`[Bot] Chyba při vykonávání akce bota ${botId}:`, err);
      return;
    }

    if (this.pendingAction !== pendingBefore || this.tradeOffers.length !== offersBefore) {
      this._notifyBots();
    }
  },

  _clearBotTimers() {
    this._botTimers.forEach(t => clearTimeout(t));
    this._botTimers.clear();
  },
};
