'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const Bot = require('../src/Bot');
const { ROULETTE_BOT_ACK_DELAY_MS } = require('../src/constants');

/**
 * Kolo Totalizátoru točí ten, kdo stojí na poli 30, ale dívají se na něj
 * všichni. Potvrzení změní `pendingAction`, a klienti diváků podle toho
 * overlay schovají — takže když točí bot, nesmí potvrdit dřív, než kolo dojede.
 * Načasování drží server, stejně jako u `SIX_REROLL_DELAY_MS`.
 */

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';

  engine.players.set('BOT', {
    id: 'BOT', socketId: null, name: 'Robot Karel', color: '#fff', isHost: false,
    isBot: true, position: 0, balance: 30000, bankrupt: false, inJail: false,
    jailTurns: 0, skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
    jailFreeCards: 0, ready: true, disconnected: false, canFly: false,
    pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
  });
  engine.turnOrder = ['BOT'];
  engine.currentTurnIdx = 0;
  return engine;
}

/** Odchytí prodlevu, se kterou `_notifyBots` ozbrojí timer bota. */
function capturedDelay(engine) {
  const realSetTimeout = global.setTimeout;
  const delays = [];
  global.setTimeout = (fn, delay) => { delays.push(delay); return realSetTimeout(() => {}, 0); };
  try {
    engine._notifyBots();
  } finally {
    global.setTimeout = realSetTimeout;
  }
  engine._clearBotTimers();
  return delays;
}

test('prodleva bota na roulette_ack pokryje celé točení kola', async () => {
  const { SPIN_MS } = await import('../public/js/animations/rouletteAnimationGate.mjs');
  assert.ok(
    ROULETTE_BOT_ACK_DELAY_MS >= SPIN_MS,
    `ROULETTE_BOT_ACK_DELAY_MS (${ROULETTE_BOT_ACK_DELAY_MS}) musí pokrýt SPIN_MS (${SPIN_MS})`
  );
});

test('bot točící Totalizátorem čeká dýl než běžnou pauzu na přemýšlení', () => {
  const engine = makeEngine();
  engine.pendingAction = { type: 'roulette_ack', targetId: 'BOT', data: { result: { id: 'immunity' } } };

  assert.equal(engine._botThinkDelay('BOT'), ROULETTE_BOT_ACK_DELAY_MS);
  assert.deepEqual(capturedDelay(engine), [ROULETTE_BOT_ACK_DELAY_MS]);
});

test('ostatní prompty bota nezdržují', () => {
  const engine = makeEngine();
  engine.pendingAction = { type: 'wait_roll', targetId: 'BOT' };

  assert.equal(engine._botThinkDelay('BOT'), Bot.BOT_THINK_MS);
  assert.deepEqual(capturedDelay(engine), [Bot.BOT_THINK_MS]);
});

test('cizí kolo bota nezdržuje — čeká jen ten, kdo točí', () => {
  const engine = makeEngine();
  engine.pendingAction = { type: 'roulette_ack', targetId: 'HUMAN', data: { result: { id: 'immunity' } } };

  assert.equal(engine._botThinkDelay('BOT'), Bot.BOT_THINK_MS);
});
