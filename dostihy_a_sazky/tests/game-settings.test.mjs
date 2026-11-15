import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import {
  isVisible, formatValue, readInput, summaryByGroup, defaultsOf, isDefault, changedGroups,
} from '../public/js/ui/settingsView.mjs';

const require = createRequire(import.meta.url);
const { GROUPS, SETTINGS, defaultConfig, sanitizeConfig } = require('../src/gameSettings');
const GameEngine = require('../src/GameEngine');

const schema = { groups: GROUPS, fields: SETTINGS };
const field = key => SETTINGS.find(s => s.key === key);

// ─── Schéma ──────────────────────────────────────────────────────────────────

/**
 * Lobby kreslí formulář jen ze schématu. Chybějící skupina, popisek nebo
 * výchozí mimo rozsah by se projevily až v prohlížeči — tady se chytí hned,
 * jakmile někdo přidá nové nastavení.
 */
test('každé nastavení je ve schématu kompletní', () => {
  const groupIds = new Set(GROUPS.map(g => g.id));
  const keys = new Set();
  for (const s of SETTINGS) {
    assert.ok(!keys.has(s.key), `duplicitní klíč ${s.key}`);
    keys.add(s.key);
    assert.ok(groupIds.has(s.group), `${s.key}: neznámá skupina ${s.group}`);
    assert.ok(s.label, `${s.key}: chybí popisek`);
    assert.ok(['number', 'select', 'toggle'].includes(s.type), `${s.key}: neznámý typ ${s.type}`);
    assert.deepEqual(sanitizeConfig({ [s.key]: s.default })[s.key], s.default, `${s.key}: výchozí hodnota neprojde vlastní validací`);
    if (s.type === 'select') assert.ok(s.options?.length >= 2, `${s.key}: select bez voleb`);
    if (s.visibleIf) assert.ok(keys.has(s.visibleIf.key) || SETTINGS.some(o => o.key === s.visibleIf.key), `${s.key}: visibleIf na neznámý klíč`);
  }
});

test('schéma jde poslat přes Socket.IO (čistá data)', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(schema)), schema);
});

test('nová místnost má výchozí konfiguraci ze schématu', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'r');
  assert.deepEqual(engine.config, defaultConfig());
  // Hodnoty, na kterých stojí pravidla popsaná v CLAUDE.md
  assert.equal(engine.config.startBalance, 30000);
  assert.equal(engine.config.startBonus, 4000);
  assert.equal(engine.config.field30Mode, 'doping');
  assert.equal(engine.config.diceBetEnabled, false);
  assert.equal(engine.config.inflationEveryRounds, 0);
});

test('klient dostane schéma v game:init', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'r');
  let payload;
  engine.sendInit({ emit: (name, data) => { if (name === 'game:init') payload = data; } });
  assert.deepEqual(payload.settings, schema);
});

// ─── Validace ────────────────────────────────────────────────────────────────

test('neplatné a neznámé hodnoty validace opraví', () => {
  const c = sanitizeConfig({
    startBalance: 10, timeLimitMinutes: 999, field20Mode: 'kasino',
    buyoutMultiplier: 1.5, diceBetEnabled: 'true', hacked: 'x', startBonus: '',
  });
  assert.equal(c.startBalance, 1000);
  assert.equal(c.timeLimitMinutes, 240);
  assert.equal(c.field20Mode, 'parking');
  assert.equal(c.buyoutMultiplier, 1.5, 'násobek odkupu se nezaokrouhluje');
  assert.equal(c.diceBetEnabled, false);
  assert.equal(c.startBonus, 4000, 'prázdné políčko = výchozí hodnota');
  assert.ok(!('hacked' in c), 'neznámý klíč se zahodí');
});

test('hostitel může poslat jen změněné pole, zbytek zůstane', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'r');
  engine._broadcast = () => {};
  engine.players.set('H', { id: 'H', isHost: true });
  engine.updateConfig({ playerId: 'H' }, { startBalance: 50000 });
  engine.updateConfig({ playerId: 'H' }, { field20Mode: 'airport' });
  assert.equal(engine.config.startBalance, 50000);
  assert.equal(engine.config.field20Mode, 'airport');
});

test('nehostitel nastavení nezmění', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'r');
  engine._broadcast = () => {};
  engine.players.set('P', { id: 'P', isHost: false });
  engine.updateConfig({ playerId: 'P' }, { startBalance: 50000 });
  assert.equal(engine.config.startBalance, 30000);
});

// ─── Zobrazení v lobby ───────────────────────────────────────────────────────

test('závislá pole se ukážou jen se zapnutou volbou', () => {
  assert.equal(isVisible(field('airportFee'), { field20Mode: 'parking' }), false);
  assert.equal(isVisible(field('airportFee'), { field20Mode: 'airport' }), true);
  assert.equal(isVisible(field('diceBetMaxStake'), { diceBetEnabled: false }), false);
  assert.equal(isVisible(field('diceBetMaxStake'), { diceBetEnabled: true }), true);
  assert.equal(isVisible(field('inflationRate'), { inflationEveryRounds: 0 }), false);
  assert.equal(isVisible(field('inflationRate'), { inflationEveryRounds: 3 }), true);
  assert.equal(isVisible(field('startBalance'), {}), true);
});

test('přehled pravidel formátuje hodnoty čitelně', () => {
  assert.equal(formatValue(field('startBalance'), 30000), '30 000 Kč');
  assert.equal(formatValue(field('timeLimitMinutes'), 0), 'Bez limitu');
  assert.equal(formatValue(field('timeLimitMinutes'), 45), '45 min');
  assert.equal(formatValue(field('field30Mode'), 'roulette'), 'Ruleta');
  assert.equal(formatValue(field('diceBetEnabled'), true), 'Zapnuto');
  assert.equal(formatValue(field('rouletteFee'), 0), 'Zdarma');
});

test('přehled vynechá skrytá pole', () => {
  const groups = summaryByGroup(schema, defaultConfig());
  const keys = groups.flatMap(g => g.items.map(i => i.key));
  assert.ok(keys.includes('startBalance'));
  assert.ok(!keys.includes('airportFee'), 'cena letu jen s Letištěm');
  assert.ok(!keys.includes('diceBetMultiplier'), 'násobek jen se zapnutými sázkami');
});

test('ovládací prvky vrací hodnotu ve správném typu', () => {
  assert.equal(readInput(field('diceBetEnabled'), { checked: true }), true);
  assert.equal(readInput(field('startBalance'), { value: '25000' }), 25000);
  assert.equal(readInput(field('field20Mode'), { value: 'airport' }), 'airport');
});

test('výchozí nastavení na klientovi = výchozí na serveru', () => {
  assert.deepEqual(defaultsOf(schema), defaultConfig());
  assert.equal(isDefault(schema, defaultConfig()), true);
  assert.equal(isDefault(schema, { ...defaultConfig(), startBonus: 0 }), false);
});

test('záložka ukáže tečku jen u skupiny se změněnou hodnotou', () => {
  assert.deepEqual([...changedGroups(schema, defaultConfig())], []);
  const changed = changedGroups(schema, { ...defaultConfig(), diceBetEnabled: true, startBonus: 0 });
  assert.deepEqual([...changed].sort(), ['extras', 'money']);
});

test('riskování botů: výchozí vyvážený, neplatná hodnota spadne na výchozí', () => {
  assert.equal(defaultConfig().botRisk, 'balanced');
  assert.equal(sanitizeConfig({ botRisk: 'risky' }).botRisk, 'risky');
  assert.equal(sanitizeConfig({ botRisk: 'šílený' }).botRisk, 'balanced');
});
