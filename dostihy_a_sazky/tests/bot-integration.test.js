'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const Bot = require('../src/Bot');

/**
 * Engine s vypnutým broadcastem. Cleanup je povinný — naplánované timery
 * bota by jinak držely event loop a `node --test` by se neukončil.
 */
function makeEngine(t) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  t.after(() => {
    engine._clearBotTimers();
    clearTimeout(engine._timer);
    clearTimeout(engine._turnTimer);
    clearTimeout(engine._broadcastTimer);
    clearTimeout(engine._gameTimeLimitTimer);
  });
  return engine;
}

function humanSocket(playerId) {
  return { playerId, id: `sock-${playerId}`, emit: () => {} };
}

test('addBot přidá připraveného hráče, který není host', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);

  assert.equal(engine.addBot(), true);
  assert.equal(engine.players.size, 2);

  const bot = [...engine.players.values()].find(p => p.isBot);
  assert.equal(bot.ready, true);
  assert.equal(bot.isHost, false);
  assert.equal(bot.socketId, null);
});

test('addBot odmítne mimo lobby', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.phase = 'playing';
  assert.equal(engine.addBot(), false);
});

test('addBot respektuje limit 6 hráčů', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  for (let i = 0; i < 5; i++) assert.equal(engine.addBot(), true);
  assert.equal(engine.players.size, 6);
  assert.equal(engine.addBot(), false);
});

test('removeBot odebere jen boty', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);

  assert.equal(engine.removeBot('h1'), false);
  assert.equal(engine.removeBot(bot.id), true);
  assert.equal(engine.players.size, 1);
});

test('_botAct hodí kostkou, když je bot na tahu (přímé volání, bez reálného timeru)', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);

  engine.phase = 'playing';
  engine.turnOrder = [bot.id, 'h1'];
  engine.currentTurnIdx = 0;
  engine._scheduleAction = () => {};          // utni řetěz po hodu

  engine._setPendingAction({ type: 'wait_roll', targetId: bot.id });
  assert.equal(engine._botTimers.has(bot.id), true);

  engine._botAct(bot.id);
  assert.ok(engine.lastDice, 'bot měl hodit kostkou');
});

test('bot nehraje, když pendingAction mezitím přešla na jiného hráče', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);

  engine.phase = 'playing';
  engine.turnOrder = [bot.id, 'h1'];
  engine.currentTurnIdx = 0;

  engine._setPendingAction({ type: 'wait_roll', targetId: bot.id });
  // stav se změní dřív, než timer vystřelí
  engine._setPendingAction({ type: 'wait_roll', targetId: 'h1' });

  engine._botAct(bot.id);
  assert.equal(engine.lastDice, null, 'bot neměl hodit za někoho jiného');
});

test('bot po skončení hry nehraje', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);

  engine.phase = 'playing';
  engine.turnOrder = [bot.id, 'h1'];
  engine._setPendingAction({ type: 'wait_roll', targetId: bot.id });
  engine.phase = 'ended';

  engine._botAct(bot.id);
  assert.equal(engine.lastDice, null);
});

test('bot odmítne cílenou nabídku, ale veřejnou nechá být', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);

  engine.phase = 'playing';
  engine.turnOrder = ['h1', bot.id];
  engine.currentTurnIdx = 0;
  engine._scheduleAction = () => {};

  const emptyTrade = { horses: [], money: 0 };
  engine.tradeOffers = [
    { id: 'pub',  fromId: 'h1', targetId: null,    offer: emptyTrade, request: emptyTrade,
      fromContext: 'wait_roll', turnPlayerId: 'h1' },
    { id: 'mine', fromId: 'h1', targetId: bot.id,  offer: emptyTrade, request: emptyTrade,
      fromContext: 'wait_roll', turnPlayerId: 'h1' },
  ];
  engine._setPendingAction({ type: 'wait_roll', targetId: 'h1' });

  engine._botAct(bot.id);

  const ids = engine.tradeOffers.map(o => o.id);
  assert.deepEqual(ids, ['pub'], 'veřejná nabídka musí zůstat ve frontě');
});

test('bot odmítne cílenou nabídku přes reálný timer a řetěz pokračuje dál', async (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);

  engine.phase = 'playing';
  engine.turnOrder = ['h1', bot.id];
  engine.currentTurnIdx = 0;
  engine._scheduleAction = () => {};

  const emptyTrade = { horses: [], money: 0 };
  engine.tradeOffers = [
    { id: 'pub',  fromId: 'h1', targetId: null,   offer: emptyTrade, request: emptyTrade,
      fromContext: 'wait_roll', turnPlayerId: 'h1' },
    { id: 'mine', fromId: 'h1', targetId: bot.id, offer: emptyTrade, request: emptyTrade,
      fromContext: 'wait_roll', turnPlayerId: 'h1' },
  ];

  // Jako v produkci: pendingAction patří jinému hráči (bot není na tahu),
  // _setPendingAction sama vyzbrojí reálný setTimeout přes _notifyBots.
  engine._setPendingAction({ type: 'wait_roll', targetId: 'h1' });
  assert.equal(engine._botTimers.has(bot.id), true, 'timer musí být vyzbrojen produkční cestou');

  await new Promise((resolve) => setTimeout(resolve, Bot.BOT_THINK_MS + 100));

  const ids = engine.tradeOffers.map(o => o.id);
  assert.deepEqual(ids, ['pub'], 'bot odmítl cílenou nabídku, veřejná zůstala ve frontě');

  // Odmítnutí zmenšilo frontu obchodů → _botAct musel na konci zavolat
  // _notifyBots() znovu, což je přesně řetězení z odchylky od specu 3.4.
  assert.equal(engine._botTimers.has(bot.id), true,
    'po zpracované nabídce musí být naplánován navazující _botAct (řetězení)');
});

test('_notifyBots přeskočí zbankrotovaného bota', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);
  bot.bankrupt = true;

  engine.phase = 'playing';
  engine._notifyBots();
  assert.equal(engine._botTimers.has(bot.id), false, 'zbankrotovaný bot nesmí dostat timer');
});

test('_notifyBots neplánuje, když hra neběží', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);

  engine.phase = 'lobby';
  engine._notifyBots();
  assert.equal(engine._botTimers.has(bot.id), false);
});

test('_botAct bez rozhodnutí neplánuje nekonečnou smyčku', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const bot = [...engine.players.values()].find(p => p.isBot);

  engine.phase = 'playing';
  engine.turnOrder = ['h1', bot.id];
  engine._setPendingAction({ type: 'wait_roll', targetId: 'h1' });
  engine._botTimers.forEach(t => clearTimeout(t));
  engine._botTimers.clear();

  engine._botAct(bot.id);
  assert.equal(engine._botTimers.size, 0);
});

test('BOT_THINK_MS je bezpečně pod nejkratším limitem na tah', () => {
  assert.ok(Bot.BOT_THINK_MS < 1000,
    'turnTimeLimitSeconds má minimum 1 s — bot musí stihnout odehrát dřív');
});
