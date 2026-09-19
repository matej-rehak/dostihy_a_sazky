'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { hasHumanPlayers } = require('../src/roomLifecycle');

/**
 * Fixture musí odpovídat realitě: `addPlayer` klíč `isBot` vůbec nenastavuje,
 * takže skuteční lidé ho mají `undefined`, ne `false`.
 */
function playersMap(entries) {
  return new Map(entries.map((p, i) => [p.id || `p${i}`, p]));
}

function human(id, extra = {}) {
  return { id, ...extra };            // bez klíče `isBot` — jako z addPlayer
}

function bot(id, extra = {}) {
  return { id, isBot: true, ...extra };
}

/** Engine bez broadcastu; `destroy()` v cleanupu, aby `node --test` skončil. */
function makeEngine(t) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  t.after(() => engine.destroy());
  return engine;
}

function humanSocket(playerId) {
  return { playerId, id: `sock-${playerId}`, emit: () => {} };
}

// ─── hasHumanPlayers (čistý predikát) ────────────────────────────────────────

test('hasHumanPlayers vrací false pro prázdnou místnost', () => {
  assert.equal(hasHumanPlayers(playersMap([])), false);
});

test('hasHumanPlayers vrací true, pokud je v místnosti alespoň jeden člověk', () => {
  assert.equal(hasHumanPlayers(playersMap([human('h1')])), true);
});

test('hasHumanPlayers vrací false, pokud zůstávají jen boti', () => {
  assert.equal(hasHumanPlayers(playersMap([bot('bot-1'), bot('bot-2')])), false);
});

test('hasHumanPlayers vrací true, pokud jsou v místnosti boti i člověk', () => {
  assert.equal(hasHumanPlayers(playersMap([bot('bot-1'), human('h1')])), true);
});

test('hasHumanPlayers považuje chybějící isBot za člověka (zpětná kompatibilita)', () => {
  assert.equal(hasHumanPlayers(playersMap([{ id: 'h1' }])), true);
});

test('hasHumanPlayers nepočítá člověka, který místnost opustil', () => {
  const players = playersMap([bot('bot-1'), human('h1', { left: true, bankrupt: true })]);
  assert.equal(hasHumanPlayers(players), false);
});

test('hasHumanPlayers počítá zbankrotovaného člověka, který u hry zůstal', () => {
  const players = playersMap([bot('bot-1'), human('h1', { bankrupt: true })]);
  assert.equal(hasHumanPlayers(players), true);
});

// ─── Regrese finding 1: opuštěná hra s boty musí uvolnit místnost ────────────

test('removePlayer ve fázi playing označí člověka jako odešlého → místnost jde uvolnit', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  engine.addBot();
  engine.addBot();
  engine.players.forEach(p => { p.ready = true; });
  engine.startGame(humanSocket('h1'));
  assert.equal(engine.phase, 'playing');

  engine.removePlayer({ playerId: 'h1' });

  // Ve fázi playing se hráč ze `players` NEMAŽE (jen zbankrotuje) — proto
  // se predikát nesmí spoléhat na velikost mapy.
  assert.equal(engine.players.size, 4);
  assert.equal(engine.players.get('h1').bankrupt, true);
  assert.equal(engine.players.get('h1').left, true);
  assert.equal(hasHumanPlayers(engine.players), false);
});

test('removePlayer v lobby označí odešlého člověka jako left', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  const gone = engine.players.get('h1');

  engine.removePlayer({ playerId: 'h1' });

  assert.equal(engine.players.has('h1'), false);
  assert.equal(gone.left, true);
  assert.equal(hasHumanPlayers(engine.players), false);
});

test('destroy() zastaví engine včetně všech timerů, ne jen těch botích', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Matej', null);
  engine.addBot();
  engine.addBot();
  engine.players.forEach(p => { p.ready = true; });
  engine.startGame(humanSocket('h1'));

  // Rozehraj stav tak, aby byly armované i ostatní timery enginu.
  engine.config.turnTimeLimitSeconds = 60;
  engine._setPendingAction({ type: 'wait_roll', targetId: 'h1' });
  engine._timer = setTimeout(() => {}, 60_000);
  engine._gameTimeLimitTimer = setTimeout(() => {}, 60_000);
  engine._broadcastTimer = setTimeout(() => {}, 60_000);
  assert.ok(engine._botTimers.size > 0, 'boti mají být probuzení');
  assert.ok(engine._turnTimer, 'turn timer má být armovaný');
  assert.ok(engine._starterTimer, 'starter timer má být armovaný');

  engine.destroy();

  assert.equal(engine.phase, 'ended');
  assert.equal(engine._botTimers.size, 0);
  assert.equal(engine._timer, null);
  assert.equal(engine._turnTimer, null);
  assert.equal(engine._broadcastTimer, null);
  assert.equal(engine._gameTimeLimitTimer, null);
  assert.equal(engine._starterTimer, null);

  // Po destroy se engine už nesmí sám nahodit zpátky.
  engine._notifyBots();
  assert.equal(engine._botTimers.size, 0);
});

// ─── Regrese finding 2: hostitelem se nesmí stát bot ─────────────────────────

test('po odchodu hostitele přebírá roli člověk, ne bot', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Host', null);
  engine.addBot();
  engine.addPlayer(humanSocket('h2'), 'Druhy', null);
  assert.equal(engine.players.get('h1').isHost, true);

  engine.removePlayer({ playerId: 'h1' });

  const hosts = [...engine.players.values()].filter(p => p.isHost);
  assert.equal(hosts.length, 1);
  assert.equal(hosts[0].id, 'h2');
  assert.equal(hosts[0].isBot, undefined);
});

test('když po odchodu hostitele zbydou jen boti, hostitele nedostane nikdo', (t) => {
  const engine = makeEngine(t);
  engine.addPlayer(humanSocket('h1'), 'Host', null);
  engine.addBot();
  engine.addBot();

  engine.removePlayer({ playerId: 'h1' });

  assert.equal([...engine.players.values()].some(p => p.isHost), false);
  assert.equal(hasHumanPlayers(engine.players), false);
});
