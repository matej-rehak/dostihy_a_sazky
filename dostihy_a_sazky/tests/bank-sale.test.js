'use strict';

// Dobrovolný prodej bance: hráč na tahu (před hodem nebo v Distancu) smí
// prodat koně, služby i žetony za podíl ceny (tady nastavený na polovinu). Tah se tím neposouvá.

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const BOARD = require('../src/data/boardData');

const FANTOME = 1;   // kůň, cena 1 200
const GAVORA = 3;    // druhý kůň oranžové stáje
const TRENER = 5;    // služba, cena 4 000
const PREPRAVA = 12; // služba, cena 3 000

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = () => {};
  // Testy níž počítají s polovinou; ostatní poměry hlídá bank-sale-ratio.test.mjs.
  engine.config.bankSaleRatio = '1/2';
  engine.phase = 'playing';
  ['A', 'B'].forEach(id => engine.players.set(id, {
    id, name: id, position: 0, balance: 30000, bankrupt: false, inJail: false,
    jailTurns: 0, skipTurns: 0, properties: [], rollAccumulator: 0, jailFreeCards: 0,
  }));
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  engine.pendingAction = { type: 'wait_roll', targetId: 'A' };
  return engine;
}

function own(engine, pid, ...sids) {
  sids.forEach(sid => {
    engine.ownerships[sid] = pid;
    engine.players.get(pid).properties.push(sid);
  });
}

const sell = (engine, pid, decision, spaceId) =>
  engine.handleRespond({ playerId: pid, emit: () => {} }, { decision, spaceId });
const bal = (engine, pid) => engine.players.get(pid).balance;

test('prodej koně bance dá polovinu ceny a tah zůstane na hráči', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  sell(engine, 'A', 'bank_sell_property', FANTOME);

  assert.equal(bal(engine, 'A'), 30000 + BOARD[FANTOME].price / 2);
  assert.equal(engine.ownerships[FANTOME], undefined);
  assert.deepEqual(engine.players.get('A').properties, []);
  assert.deepEqual(engine.pendingAction, { type: 'wait_roll', targetId: 'A' }, 'hráč dál hází');
});

test('služby (trenér, přeprava) jdou prodat stejně', () => {
  const engine = makeEngine();
  own(engine, 'A', TRENER, PREPRAVA);
  sell(engine, 'A', 'bank_sell_property', TRENER);
  sell(engine, 'A', 'bank_sell_property', PREPRAVA);
  assert.equal(bal(engine, 'A'), 30000 + 2000 + 1500);
  assert.deepEqual(engine.players.get('A').properties, []);
});

test('kůň se prodá i se žetony — vše za polovinu', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME, GAVORA);
  engine.tokens[FANTOME] = { small: 3, big: false };
  sell(engine, 'A', 'bank_sell_property', FANTOME);
  const sp = BOARD[FANTOME];
  assert.equal(bal(engine, 'A'), 30000 + sp.price / 2 + 3 * Math.floor(sp.tokenCost / 2));
  assert.equal(engine.tokens[FANTOME], undefined);
});

test('jednotlivý žeton jde prodat zvlášť, kůň zůstává', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME, GAVORA);
  engine.tokens[FANTOME] = { small: 2, big: false };
  sell(engine, 'A', 'bank_sell_token', FANTOME);
  assert.equal(bal(engine, 'A'), 30000 + Math.floor(BOARD[FANTOME].tokenCost / 2));
  assert.deepEqual(engine.tokens[FANTOME], { small: 1, big: false });
  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.equal(engine.pendingAction.type, 'wait_roll');
});

test('hlavní dostih se prodá za polovinu a vrátí 4 malé žetony', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME, GAVORA);
  engine.tokens[FANTOME] = { small: 0, big: true };
  sell(engine, 'A', 'bank_sell_token', FANTOME);
  assert.equal(bal(engine, 'A'), 30000 + Math.floor(BOARD[FANTOME].bigTokenCost / 2));
  assert.deepEqual(engine.tokens[FANTOME], { small: 4, big: false });
});

test('prodej funguje i v Distancu', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  engine.players.get('A').inJail = true;
  engine.pendingAction = { type: 'jail_choice', targetId: 'A' };
  sell(engine, 'A', 'bank_sell_property', FANTOME);
  assert.equal(bal(engine, 'A'), 30600);
  assert.equal(engine.pendingAction.type, 'jail_choice');
});

test('cizí kůň ani cizí tah prodej nepovolí', () => {
  const engine = makeEngine();
  own(engine, 'B', FANTOME);
  sell(engine, 'A', 'bank_sell_property', FANTOME); // není jeho
  assert.equal(engine.ownerships[FANTOME], 'B');
  sell(engine, 'B', 'bank_sell_property', FANTOME); // B není na tahu
  assert.equal(engine.ownerships[FANTOME], 'B');
  assert.equal(bal(engine, 'B'), 30000);
  assert.deepEqual(engine.pendingAction, { type: 'wait_roll', targetId: 'A' });
});

test('mimo začátek tahu (např. nabídka koupě) prodej nejde a nabídka se nezahodí', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  engine.pendingAction = { type: 'buy_offer', targetId: 'A', data: { spaceId: 6 } };
  engine._handleBuyOffer = () => { throw new Error('nabídka koupě se nesmí vyhodnotit'); };
  assert.doesNotThrow(() => sell(engine, 'A', 'bank_sell_property', FANTOME));
  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.equal(engine.pendingAction?.type, 'buy_offer', 'nabídka koupě musí čekat dál');
});

test('prodej koně zruší obchodní nabídky, které ho obsahují', () => {
  const engine = makeEngine();
  own(engine, 'A', FANTOME);
  engine.tradeOffers.push({
    id: 't1', fromId: 'A', targetId: 'B', fromContext: 'wait_roll', turnPlayerId: 'A',
    offer: { horses: [FANTOME], money: 0 }, request: { horses: [], money: 500 },
  });
  sell(engine, 'A', 'bank_sell_property', FANTOME);
  assert.equal(engine.tradeOffers.length, 0);
});

test('inflace prodejní cenu nemění', () => {
  const engine = makeEngine();
  engine.inflation = 3;
  own(engine, 'A', FANTOME);
  sell(engine, 'A', 'bank_sell_property', FANTOME);
  assert.equal(bal(engine, 'A'), 30600);
});

/**
 * Okno „Prodej bance" ukazuje ceny z public/js/ui/bankSale.mjs, server platí
 * podle _sellProperty / _removeToken. Kdyby se rozešly, hráč by na tlačítku
 * četl jinou částku, než dostane.
 */
test('klient ukazuje stejné výkupní ceny, jaké server vyplatí — pro každý poměr', async () => {
  const { propertySellValue, tokenSellValue, BANK_SALE_RATIOS } = await import('../public/js/ui/bankSale.mjs');
  const variants = [undefined, { small: 1, big: false }, { small: 3, big: false }, { small: 0, big: true }];
  const engineWith = ratio => { const e = makeEngine(); e.config.bankSaleRatio = ratio; return e; };
  for (const ratio of Object.keys(BANK_SALE_RATIOS)) {
    for (const space of BOARD.filter(s => s.price && (s.type === 'horse' || s.type === 'service'))) {
      for (const tok of space.type === 'horse' ? variants : [undefined]) {
        const whole = engineWith(ratio);
        own(whole, 'A', space.id);
        if (tok) whole.tokens[space.id] = { ...tok };
        sell(whole, 'A', 'bank_sell_property', space.id);
        assert.equal(bal(whole, 'A') - 30000, propertySellValue(space, tok, ratio), `${ratio} ${space.name} ${JSON.stringify(tok)}`);

        if (tok) {
          const one = engineWith(ratio);
          own(one, 'A', space.id);
          one.tokens[space.id] = { ...tok };
          sell(one, 'A', 'bank_sell_token', space.id);
          assert.equal(bal(one, 'A') - 30000, tokenSellValue(space, tok, ratio), `${ratio} žeton ${space.name} ${JSON.stringify(tok)}`);
        }
      }
    }
  }
});
