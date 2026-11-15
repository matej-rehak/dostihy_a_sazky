import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { onlineLabel } from '../public/js/ui/onlineCount.mjs';

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

test('počet hráčů online se správně skloňuje', () => {
  assert.equal(onlineLabel(0), '0 hráčů online');
  assert.equal(onlineLabel(1), '1 hráč online');
  assert.equal(onlineLabel(2), '2 hráči online');
  assert.equal(onlineLabel(4), '4 hráči online');
  assert.equal(onlineLabel(5), '5 hráčů online');
  assert.equal(onlineLabel(21), '21 hráčů online');
  assert.equal(onlineLabel(undefined), '0 hráčů online');
});

test('server posílá počet při připojení i odpojení', () => {
  const server = read('../server.js');
  const conn = server.slice(server.indexOf("io.on('connection'"));
  assert.match(conn.slice(0, 300), /broadcastOnline\(\)/, 'při připojení');
  const disc = conn.slice(conn.indexOf("socket.on('disconnect'"));
  assert.match(disc.slice(0, 300), /broadcastOnline\(\)/, 'při odpojení');
});

test('klient poslouchá server:online dřív, než se připojí', () => {
  const main = read('../public/js/main.js');
  const listen = main.indexOf("socket.on('server:online'");
  assert.notEqual(listen, -1);
  assert.ok(listen < main.indexOf('socket.connect()'), 'první počet by jinak propadl');
});

test('úvodní obrazovka nemá černý oddělovač ze středu plánu', () => {
  const intro = read('../public/partials/intro.html');
  assert.doesNotMatch(intro, /bc-divider/);
  assert.match(intro, /id="online-count"/);
});
