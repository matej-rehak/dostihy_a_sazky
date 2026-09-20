import test from 'node:test';
import assert from 'node:assert/strict';

import { POOL_SIZE, createPool } from '../public/js/audioPool.mjs';

/**
 * `play()` dřív na každé přehrání klonoval `<audio>` element. Losování prvního
 * hráče volá tik 30× za tři sekundy, chůze figurky ještě častěji — vznikaly
 * desítky mediálních elementů, každý se svým dekodérem. Pool je drží na uzdě.
 */

function countingFactory() {
  let created = 0;
  const make = () => ({ id: ++created });
  return { make, created: () => created };
}

test('výchozí velikost poolu je 4', () => {
  assert.equal(POOL_SIZE, 4);
});

test('pool nevytvoří víc uzlů, než je jeho velikost', () => {
  const { make, created } = countingFactory();
  const pool = createPool(make, 4);

  for (let i = 0; i < 100; i++) pool.acquire();

  assert.equal(created(), 4, 'po 100 přehráních smí existovat nejvýš 4 elementy');
  assert.equal(pool.size, 4);
});

test('uzly se vytváří až když jsou potřeba', () => {
  const { make, created } = countingFactory();
  const pool = createPool(make, 4);

  assert.equal(created(), 0, 'prázdný pool nic nepředpřipravuje');
  pool.acquire();
  assert.equal(created(), 1, 'první přehrání vytvoří jeden element, ne celý pool');
});

test('pool se točí dokola, takže krátké zvuky můžou znít přes sebe', () => {
  const pool = createPool(countingFactory().make, 3);
  const first = [pool.acquire(), pool.acquire(), pool.acquire()];
  const ids = first.map(n => n.id);

  assert.deepEqual([...new Set(ids)], ids, 'tři po sobě jdoucí přehrání dostanou různé elementy');
  assert.equal(pool.acquire().id, ids[0], 'čtvrté se vrátí na začátek');
});

test('pool o velikosti 1 pořád funguje', () => {
  const pool = createPool(countingFactory().make, 1);
  const a = pool.acquire();
  const b = pool.acquire();
  assert.equal(a.id, b.id);
  assert.equal(pool.size, 1);
});

test('nesmyslná velikost poolu nevyrobí prázdný pool', () => {
  const pool = createPool(countingFactory().make, 0);
  assert.ok(pool.acquire(), 'vždy musí vrátit použitelný element');
  assert.ok(pool.size >= 1);
});
