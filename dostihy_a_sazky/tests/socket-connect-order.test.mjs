import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Regrese: po obnovení stránky se klient připojil hned při načtení modulu
 * socket.js a server mu (hráč se vrací do hry) okamžitě poslal game:init.
 * main.js ale posluchač game:init registroval až po `await loadPartials()`
 * a `await fetch('/api/config')` — Socket.IO zprávy pro neexistující posluchače
 * neschovává, takže game:init propadl. Další game:state pak dorazil bez
 * state.boardData: nevykreslil se plán a renderBuyOffer spadl na
 * „Cannot read properties of null".
 * Socket se proto připojuje ručně, až jsou posluchači zaregistrovaní.
 */

const read = rel => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const socketJs = read('../public/js/socket.js');
const mainJs = read('../public/js/main.js');

test('socket se nepřipojuje sám při načtení modulu', () => {
  assert.match(socketJs, /autoConnect:\s*false/);
});

test('main.js se připojí až po registraci game:init a game:state', () => {
  const connectAt = mainJs.indexOf('socket.connect()');
  assert.notEqual(connectAt, -1, 'main.js nevolá socket.connect()');
  assert.equal(mainJs.indexOf('socket.connect()', connectAt + 1), -1, 'socket.connect() má být jen jednou');

  for (const event of ["socket.on('game:init'", "socket.on('game:state'", "socket.on('game:token'"]) {
    const at = mainJs.indexOf(event);
    assert.notEqual(at, -1, `chybí ${event}`);
    assert.ok(at < connectAt, `${event} musí být zaregistrovaný před socket.connect()`);
  }
});
