// Výkup bankou podle nastavení `bankSaleRatio` (1/2, 2/3, 3/4, plná cena):
// server, bot i klientské zrcadlo musí počítat stejně.

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as client from '../public/js/ui/bankSale.mjs';

const require = createRequire(import.meta.url);
const constants = require('../src/constants.js');
const { SETTINGS, defaultConfig } = require('../src/gameSettings.js');
const GameEngine = require('../src/GameEngine.js');
const BOARD = require('../src/data/boardData.js');

const FANTOME = 1;
const RATIOS = ['1/2', '2/3', '3/4', '1'];

test('klientské zrcadlo má stejné poměry i výchozí hodnotu jako server', () => {
  assert.deepEqual(client.BANK_SALE_RATIOS, constants.BANK_SALE_RATIOS);
  assert.equal(client.BANK_SALE_DEFAULT, constants.BANK_SALE_DEFAULT);
});

test('nastavení nabízí právě tyto poměry a výchozí je 2/3', () => {
  const setting = SETTINGS.find(s => s.key === 'bankSaleRatio');
  assert.deepEqual(setting.options.map(o => o.value), RATIOS);
  assert.deepEqual(Object.keys(constants.BANK_SALE_RATIOS).sort(), [...RATIOS].sort());
  assert.equal(defaultConfig().bankSaleRatio, '2/3');
});

test('bankSaleValue počítá podíl dolů zaokrouhlený', () => {
  assert.equal(constants.bankSaleValue(1200, '1/2'), 600);
  assert.equal(constants.bankSaleValue(1000, '2/3'), 666);
  assert.equal(constants.bankSaleValue(1000, '3/4'), 750);
  assert.equal(constants.bankSaleValue(1000, '1'), 1000);
  assert.equal(constants.bankSaleValue(1000, 'nesmysl'), 666, 'neznámý poměr = výchozí 2/3');
});

function makeEngine(ratio) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = () => {};
  engine.config.bankSaleRatio = ratio;
  engine.phase = 'playing';
  engine.players.set('A', {
    id: 'A', name: 'A', position: 0, balance: 0, bankrupt: false, inJail: false,
    jailTurns: 0, skipTurns: 0, properties: [FANTOME], rollAccumulator: 0, jailFreeCards: 0,
  });
  engine.ownerships[FANTOME] = 'A';
  engine.turnOrder = ['A'];
  engine.currentTurnIdx = 0;
  return engine;
}

for (const ratio of RATIOS) {
  test(`prodej koně se žetony (${ratio}) — server = klient`, () => {
    const tok = { small: 3, big: false };
    const engine = makeEngine(ratio);
    engine.tokens[FANTOME] = { ...tok };
    const expected = client.propertySellValue(BOARD[FANTOME], tok, ratio);
    assert.equal(engine._calcLiquidationValue('A'), expected);
    engine._sellProperty('A', FANTOME);
    assert.equal(engine.players.get('A').balance, expected);
  });

  test(`prodej jednoho žetonu (${ratio}) — server = klient`, () => {
    const tok = { small: 2, big: false };
    const engine = makeEngine(ratio);
    engine.tokens[FANTOME] = { ...tok };
    engine._removeToken('A', FANTOME);
    assert.equal(engine.players.get('A').balance, client.tokenSellValue(BOARD[FANTOME], tok, ratio));
  });
}
