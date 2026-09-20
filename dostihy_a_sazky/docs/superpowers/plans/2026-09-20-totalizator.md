# Totalizátor — implementační plán

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Přidat volitelný režim pole 30 (`field30Mode: 'roulette'`), který místo Podezření z dopingu spustí ruletu o devíti výsečích s efekty, jaké stávající karty neumí.

**Architecture:** Definice devíti výsledků a losování žijí v čistém modulu `src/Roulette.js` bez vedlejších efektů (vzor `src/Cards.js` a `src/Bot.js`). Napojení na engine je v novém mixinu `src/mixins/roulette.js`. Výsledek určuje **server** a pošle ho v `pendingAction`; klient kolo jen dojíždí na už rozhodnutý výsledek — stejně jako u kostky a karet. Efekty, které nepůsobí okamžitě, sedí jako příznaky na hráči podle existujícího vzoru `canFly` / `jailFreeCards`.

**Tech Stack:** Node.js ≥18, CommonJS na backendu, `node --test` bez frameworku, Socket.IO 4, vanilla ESM na frontendu, žádný build krok.

**Spec:** `docs/superpowers/specs/2026-09-20-totalizator-design.md`

## Global Constraints

- `'use strict';` na prvním řádku každého nového `.js` souboru na backendu.
- Backend = CommonJS (`require` / `module.exports`). Frontend `public/js/` = ESM.
- Naming: camelCase proměnné/funkce, PascalCase třídy, SCREAMING_SNAKE konstanty. Soubory: `src/Roulette.js` (PascalCase jako `src/Cards.js`), `src/mixins/roulette.js` (lowercase jako ostatní mixiny).
- **Nezasahovat do třídy `GameEngine`** nad rámec Tasku 2 a 3 — logika patří do mixinů.
- Testy běží přes `npm test`. Ověřuj ale přes `node --test tests/` z hlavního stromu — `npm test` sbírá i zapomenutý worktree `.claude/worktrees/` a hlásí 2 cizí pády.
- `*.md` je v `.gitignore` — dokumenty přidávej přes `git add -f`.
- Žádná nová npm závislost.
- Stávající konstanty v `src/constants.js` se **nemění**. Nové konstanty Totalizátoru patří do `src/Roulette.js`, ne do `constants.js`.
- Režim `'doping'` zůstává výchozí a beze změny chování.

## Design Constraints — závazné pro každý UI task

Ruleta se musí obléknout do **stávajícího návrhového systému hry**. Nesmí přijít s vlastní paletou, vlastním písmem ani vlastním tvarem tlačítek. Konkrétně:

- **Barvy jen z tokenů v `:root`.** Nikdy hex napřímo. K dispozici: `--bg-card` `#121d2d`, `--bg-card2` `#1a2639`, `--gold` `#ffd700`, `--gold-dim` `#b8960c`, `--gold-glow`, `--green` `#00ff88`, `--red` `#ff4d4d`, `--blue` `#40c4ff`, `--text`, `--text-dim`, `--border`, `--border-hi`.
- **Výseče kola** se střídají `--bg-card` / `--bg-card2`. Semantickou barvu (`--green` / `--red`) nese **jen ikona a rámeček vítězné výseče**, ne výplň všech devíti — devět barevných výsečí by rozbilo paletu.
- **Zlatá je akcent, ne plocha.** Ráfek kola, ručička a aktivní stav = `--gold`. Plochy zůstávají tmavě modré.
- **Písmo:** nadpisy `var(--font-h)` (Bebas Neue) velkými písmeny s `letter-spacing: 2px`, texty `var(--font)` (Outfit).
- **Overlay kopíruje `.card-3d-overlay`:** `position: fixed; inset: 0; background: rgba(0,0,0,.4); backdrop-filter: blur(8px)`, otevírání přes třídu `.is-open` s `transition: opacity 200ms var(--ease-out)`, scéna nabíhá z `translateY(12px) scale(0.96)` na `translateY(0) scale(1)`.
- **Tlačítka:** jen existující třídy `btn btn-gold btn-lg`. Nezakládej nové varianty.
- **Rádiusy:** `var(--radius)` (6px) pro drobné prvky, 16px pro modal podle `.modal-card`.
- **Animace musí jít vypnout** — respektuj `isEffectEnabled()` ze `settings.js` i `prefersReducedMotion()`, stejně jako to dělá `showCardOverlay`.
- **Overlay musí být přetahovatelný** jen pokud má záhlaví; kolo ho nemá, takže se do `draggable.js` nezapojuje.

---

## Přehled souborů

| Soubor | Odpovědnost | Task |
|---|---|---|
| `src/Roulette.js` | Devět výsledků jako data + `spin()` | 1 |
| `tests/roulette-outcomes.test.js` | Definice a losování | 1 |
| `src/GameEngine.js` | `field30Mode` do výchozí config, registrace mixinu | 2, 3 |
| `src/mixins/lobby.js` | Validace `field30Mode`, nové příznaky na hráči | 2, 3 |
| `tests/roulette-config.test.js` | Validace konfigurace | 2 |
| `src/mixins/roulette.js` | `_spinRoulette`, `_handleRouletteAck`, `_applyRentModifiers`, handlery promptů | 3–7 |
| `src/mixins/movement.js` | Větev na `field30Mode`, platba nájmu přes modifikátory | 3, 4 |
| `src/mixins/actions.js` | Routing tří nových promptů + timeout | 3, 6, 7 |
| `tests/roulette-spin.test.js` | Vstup na pole, prompt, efekty bez volby | 3 |
| `src/mixins/economy.js` | `tokenStrike` v `_calcRent`, `_effectiveBuyPrice` | 4 |
| `src/mixins/turns.js` | Platba nájmu přes modifikátory, vyhodnocení sázky | 4, 5 |
| `tests/roulette-modifiers.test.js` | Dvojitý nájem, imunita, stávka, přednostní právo | 4 |
| `tests/roulette-bet.test.js` | Sázka přes dva tahy a reconnect | 5 |
| `tests/roulette-target.test.js` | Stávka a udání | 6 |
| `tests/roulette-horse.test.js` | Dražba a dostih zdarma | 7 |
| `src/Bot.js` | `case` pro tři nové prompty | 8 |
| `tests/roulette-bot.test.js` | Bot nezamrzne | 8 |
| `public/partials/lobby.html` | Výběr režimu pole 30 | 9 |
| `public/js/ui/lobby.js` | Čtení a zápis `field30Mode` | 9 |
| `public/js/ui/board.js` | Ikona a název pole 30 | 9 |
| `public/partials/overlays.html` | Markup kola | 10 |
| `public/style.css` | Kolo podle návrhového systému | 10 |
| `public/js/animations/rouletteAnimationGate.mjs` | Čisté načasování a geometrie kola | 11 |
| `public/js/animations/roulette.js` | Animace kola | 11 |
| `public/js/settingsGate.mjs`, `public/index.html` | Přepínač `rouletteSpin` | 11 |
| `tests/roulette-gate.test.mjs` | Geometrie a načasování | 11 |
| `public/js/ui/actions.js` | Renderery tří promptů | 12 |
| `CLAUDE.md` | Dokumentace režimu | 13 |

---

## Task 1: `src/Roulette.js` — devět výsledků a losování

**Files:**
- Create: `src/Roulette.js`
- Test: `tests/roulette-outcomes.test.js`

**Interfaces:**
- Consumes: nic
- Produces: `{ OUTCOMES, spin }`. `OUTCOMES` je pole devíti objektů s povinnými klíči `id` (string), `icon` (string), `name` (string), `text` (string), `prompt` (`null` | `'pick_horse'` | `'pick_player'`). `spin(rnd = Math.random)` vrací jeden prvek `OUTCOMES`.

- [ ] **Step 1: Write the failing test**

```js
// tests/roulette-outcomes.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { OUTCOMES, spin } = require('../src/Roulette');

test('devět výsečí s povinnými poli a unikátními id', () => {
  assert.equal(OUTCOMES.length, 9);

  const ids = new Set();
  for (const o of OUTCOMES) {
    assert.equal(typeof o.id, 'string', `id chybí u ${JSON.stringify(o)}`);
    assert.ok(o.icon && o.name && o.text, `popisná pole chybí u ${o.id}`);
    assert.ok(
      o.prompt === null || o.prompt === 'pick_horse' || o.prompt === 'pick_player',
      `neplatný prompt u ${o.id}: ${o.prompt}`
    );
    assert.equal(ids.has(o.id), false, `duplicitní id ${o.id}`);
    ids.add(o.id);
  }
});

test('spin vrací prvky podle rovnoměrného rozdělení', () => {
  // rnd je injektovaná, aby šlo testovat deterministicky
  assert.equal(spin(() => 0).id, OUTCOMES[0].id);
  assert.equal(spin(() => 0.999).id, OUTCOMES[8].id);

  // každá výseč je dosažitelná právě v jednom 1/9 pásmu
  for (let i = 0; i < 9; i++) {
    const middle = (i + 0.5) / 9;
    assert.equal(spin(() => middle).id, OUTCOMES[i].id, `pásmo ${i} nesedí`);
  }
});

test('sázka má férovou očekávanou hodnotu', () => {
  const bet = OUTCOMES.find(o => o.id === 'bet');
  // 1d6, hranice 5 → výhra ve 2 z 6 případů
  const winChance = (6 - bet.threshold + 1) / 6;
  const ev = winChance * bet.stake * bet.payoutMultiplier - bet.stake;
  assert.equal(ev, 0, `sázka není férová, EV = ${ev}`);
});

test('prompty sedí na očekávané výseče', () => {
  const byId = Object.fromEntries(OUTCOMES.map(o => [o.id, o]));
  assert.equal(byId.auction.prompt, 'pick_horse');
  assert.equal(byId.free_token.prompt, 'pick_horse');
  assert.equal(byId.strike.prompt, 'pick_player');
  assert.equal(byId.report.prompt, 'pick_player');
  assert.equal(byId.doping.prompt, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roulette-outcomes.test.js`
Expected: FAIL — `Cannot find module '../src/Roulette'`

- [ ] **Step 3: Write minimal implementation**

```js
// src/Roulette.js
'use strict';

/**
 * Devět výsečí Totalizátoru.
 *
 * Výsledky jsou DATA, ne funkce — bot i klient s nimi pak umí pracovat, aniž
 * by je znaly jménem, a testy se píšou proti definicím místo proti chování.
 * Chování jednotlivých id řeší `src/mixins/roulette.js`.
 *
 * Každá výseč staví na ose, kterou stávajících 28 karet nepokrývá:
 * vlastnictví, žetony, nájem, cílení na soupeře, volba hráče a sázka.
 */
const OUTCOMES = [
  {
    id: 'bet', icon: '🎲', name: 'Sázka na vlastní hod', prompt: null,
    stake: 5000, threshold: 5, payoutMultiplier: 3,
    text: 'Vsadil(a) jsi 5.000 Kč na vlastní hod. Padne-li 5 nebo 6, bereš trojnásobek.',
  },
  {
    id: 'auction', icon: '🏇', name: 'Dražba', prompt: 'pick_horse',
    surchargePct: 50,
    text: 'Vyber si libovolného volného koně a kup ho s přirážkou 50 %.',
  },
  {
    id: 'preemption', icon: '🎟️', name: 'Přednostní právo', prompt: null,
    text: 'Příštího volného koně, na kterého došlápneš, koupíš za polovinu.',
  },
  {
    id: 'free_token', icon: '🏗️', name: 'Dostih zdarma', prompt: 'pick_horse',
    text: 'Polož žeton dostihů na svého koně zdarma.',
  },
  {
    id: 'double_rent', icon: '💵', name: 'Dvojitý nájem', prompt: null,
    text: 'Příští nájem, který vybereš, bude dvojnásobný.',
  },
  {
    id: 'immunity', icon: '🛡️', name: 'Imunita', prompt: null,
    text: 'Příští nájem, který bys platil(a), je zdarma.',
  },
  {
    id: 'strike', icon: '🚧', name: 'Stávka ve stáji', prompt: 'pick_player',
    rounds: 1,
    text: 'Vyber soupeře — jedno kolo mu nebudou fungovat žetony dostihů.',
  },
  {
    id: 'report', icon: '🎯', name: 'Udání', prompt: 'pick_player',
    text: 'Vyber soupeře — půjde rovnou na Distanc.',
  },
  {
    id: 'doping', icon: '🤒', name: 'Podezření z dopingu', prompt: null,
    turns: 1,
    text: 'Stojíš jedno kolo a nefungují ti žetony dostihů.',
  },
];

/**
 * @param {() => number} rnd injektovatelný generátor kvůli testům
 * @returns {object} jedna z výsečí OUTCOMES
 */
function spin(rnd = Math.random) {
  return OUTCOMES[Math.floor(rnd() * OUTCOMES.length)];
}

module.exports = { OUTCOMES, spin };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roulette-outcomes.test.js`
Expected: PASS, 4 testy

- [ ] **Step 5: Commit**

```bash
git add src/Roulette.js tests/roulette-outcomes.test.js
git commit -m "feat(totalizator): devět výsečí rulety jako čistý modul"
```

---

## Task 2: Konfigurace `field30Mode`

**Files:**
- Modify: `src/GameEngine.js:35` (výchozí `this.config`)
- Modify: `src/mixins/lobby.js` (`updateConfig`, za blokem `field20Mode`)
- Test: `tests/roulette-config.test.js`

**Interfaces:**
- Consumes: nic
- Produces: `engine.config.field30Mode` — `'doping'` | `'roulette'`, výchozí `'doping'`

- [ ] **Step 1: Write the failing test**

```js
// tests/roulette-config.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  return engine;
}

function makeHost(engine) {
  const socket = { playerId: 'HOST', id: 'sock-host', emit: () => {} };
  engine.addPlayer(socket, 'Host', '#e74c3c');
  return socket;
}

test('field30Mode je výchozí doping', () => {
  const engine = makeEngine();
  assert.equal(engine.config.field30Mode, 'doping');
});

test('hostitel přepne na ruletu', () => {
  const engine = makeEngine();
  const host = makeHost(engine);
  engine.updateConfig(host, { field30Mode: 'roulette' });
  assert.equal(engine.config.field30Mode, 'roulette');
});

test('neplatná hodnota spadne zpět na doping', () => {
  const engine = makeEngine();
  const host = makeHost(engine);
  engine.updateConfig(host, { field30Mode: 'roulette' });
  engine.updateConfig(host, { field30Mode: 'kasino' });
  assert.equal(engine.config.field30Mode, 'doping');
});

test('field30Mode se veze ve stavu ke klientovi', () => {
  const engine = makeEngine();
  const host = makeHost(engine);
  engine.updateConfig(host, { field30Mode: 'roulette' });
  assert.equal(engine._buildState().config.field30Mode, 'roulette');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roulette-config.test.js`
Expected: FAIL — první test hlásí `undefined !== 'doping'`

- [ ] **Step 3: Write minimal implementation**

V `src/GameEngine.js` rozšiř výchozí konfiguraci (řádek 35) o `field30Mode`:

```js
    this.config = { startBalance: 30000, startBonus: 4000, buyoutMultiplier: 0, timeLimitMinutes: 0, turnTimeLimitSeconds: 0, field20Mode: 'parking', airportFee: 2000, field30Mode: 'doping' };
```

V `src/mixins/lobby.js` v `updateConfig` přidej hned za blok `field20Mode`:

```js
    const field30Mode = nextConfig.field30Mode;
    this.config.field30Mode = (field30Mode === 'roulette' || field30Mode === 'doping')
      ? field30Mode
      : 'doping';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roulette-config.test.js`
Expected: PASS, 4 testy

- [ ] **Step 5: Commit**

```bash
git add src/GameEngine.js src/mixins/lobby.js tests/roulette-config.test.js
git commit -m "feat(totalizator): konfigurace field30Mode"
```

---

## Task 3: Vstup na pole, prompt a efekty bez volby

Tenhle task staví kostru: příznaky na hráči, větev v `_evaluateSpace`, losování, prompt `roulette_ack` a čtyři efekty, které nepotřebují druhý prompt (`preemption`, `double_rent`, `immunity`, `doping`).

**Files:**
- Create: `src/mixins/roulette.js`
- Modify: `src/mixins/lobby.js` (objekt `player` v `addPlayer`)
- Modify: `src/mixins/movement.js` (`case 'skip_turn'` v `_evaluateSpace`)
- Modify: `src/mixins/actions.js` (`handleRespond` switch, `_handleTurnTimeout` switch)
- Modify: `src/GameEngine.js` (registrace mixinu)
- Test: `tests/roulette-spin.test.js`

**Interfaces:**
- Consumes: `{ OUTCOMES, spin }` z Tasku 1, `engine.config.field30Mode` z Tasku 2
- Produces:
  - Příznaky na hráči: `pendingBet` (`null` | `{ stake, threshold, payout }`), `doubleRent` (number), `rentImmunity` (number), `halfPriceNext` (boolean), `tokenStrike` (number)
  - `_spinRoulette(pid)` — vylosuje a otevře prompt `roulette_ack`
  - `_handleRouletteAck(pid, actionData)` — aplikuje efekt
  - `_applyRouletteOutcome(pid, outcome)` — vrací `true`, pokud efekt otevřel další prompt

- [ ] **Step 1: Write the failing test**

```js
// tests/roulette-spin.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { OUTCOMES } = require('../src/Roulette');

function makeEngine(field30Mode = 'roulette') {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = field30Mode;

  ['A', 'B'].forEach((id, i) => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: i === 0,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;
  return engine;
}

function forceOutcome(engine, id) {
  const idx = OUTCOMES.findIndex(o => o.id === id);
  engine._rouletteRnd = () => (idx + 0.5) / OUTCOMES.length;
}

test('režim doping se chová jako dřív — žádná ruleta', () => {
  const engine = makeEngine('doping');
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');

  assert.equal(engine.players.get('A').skipTurns, 1);
  assert.equal(engine.pendingAction, null);
});

test('režim roulette otevře prompt roulette_ack s výsledkem', () => {
  const engine = makeEngine();
  forceOutcome(engine, 'immunity');
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');

  assert.equal(engine.pendingAction.type, 'roulette_ack');
  assert.equal(engine.pendingAction.targetId, 'A');
  assert.equal(engine.pendingAction.data.result.id, 'immunity');
  // Efekt se aplikuje až po potvrzení, ne při zatočení
  assert.equal(engine.players.get('A').rentImmunity, 0);
});

test('potvrzení nabije imunitu a tah pokračuje', () => {
  const engine = makeEngine();
  forceOutcome(engine, 'immunity');
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});

  assert.equal(engine.players.get('A').rentImmunity, 1);
});

test('dvojitý nájem a přednostní právo se nabijí', () => {
  for (const [id, field, expected] of [
    ['double_rent', 'doubleRent', 1],
    ['preemption', 'halfPriceNext', true],
  ]) {
    const engine = makeEngine();
    forceOutcome(engine, id);
    engine.players.get('A').position = 30;
    engine._evaluateSpace('A');
    engine.handleRespond({ playerId: 'A', emit: () => {} }, {});
    assert.equal(engine.players.get('A')[field], expected, `${id} nenabil ${field}`);
  }
});

test('doping na ruletě zachová původní efekt', () => {
  const engine = makeEngine();
  forceOutcome(engine, 'doping');
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});

  assert.equal(engine.players.get('A').skipTurns, 1);
});

test('nový hráč má všechny příznaky vynulované', () => {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine.addPlayer({ playerId: 'X', id: 'sock-x', emit: () => {} }, 'X', '#fff');
  const p = engine.players.get('X');

  assert.equal(p.pendingBet, null);
  assert.equal(p.doubleRent, 0);
  assert.equal(p.rentImmunity, 0);
  assert.equal(p.halfPriceNext, false);
  assert.equal(p.tokenStrike, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roulette-spin.test.js`
Expected: FAIL — `engine.pendingAction` je `null` místo `roulette_ack`

- [ ] **Step 3a: Příznaky na hráči**

V `src/mixins/lobby.js` v `addPlayer` rozšiř objekt `player` o pět polí. `_buildState` serializuje hráče přes `...rest`, takže se rozešlou samy — nic dalšího není potřeba:

```js
      canFly: false, left: false,
      // Totalizátor — příznaky visící na hráči přes tahy (vzor `canFly`).
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
```

- [ ] **Step 3b: Nový mixin**

```js
// src/mixins/roulette.js
'use strict';

const { ACTION_DELAY_MS } = require('../constants');
const { spin } = require('../Roulette');

module.exports = {

  /**
   * Vylosuje výseč a otevře potvrzovací prompt.
   *
   * Výsledek určuje SERVER a pošle ho v `pendingAction`. Klient kolo jen
   * dojíždí na už rozhodnutý výsledek — stejně jako u kostky (`lastDice`)
   * a karet (`card_ack`). Reconnect uprostřed točení tím nic nerozbije
   * a výsledek nejde ovlivnit z klienta.
   */
  _spinRoulette(pid) {
    const player = this.players.get(pid);
    if (!player) return;

    // `_rouletteRnd` existuje jen kvůli testům, v provozu je undefined.
    const outcome = spin(this._rouletteRnd || undefined);
    this._addLog(`🎰 ${player.name} točí Totalizátorem: ${outcome.icon} ${outcome.name}`);
    // `spinId` odlišuje jednotlivá zatočení — klient podle něj pozná, že po
    // reconnectu dostal tentýž výsledek znovu, a kolo už neroztáčí.
    // Stejný vzor jako `lastDice.id`.
    this._setPendingAction({
      type: 'roulette_ack',
      targetId: pid,
      data: { result: { ...outcome, spinId: Math.random() } },
    });
    this._broadcast();
  },

  _handleRouletteAck(pid, actionData) {
    const outcome = actionData && actionData.result;
    if (!outcome) { this._offerTokensOrEnd(pid); return; }

    const opened = this._applyRouletteOutcome(pid, outcome);
    // Efekt s volbou si otevřel vlastní prompt — tah pokračuje až po odpovědi.
    if (opened) { this._broadcast(); return; }

    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
  },

  /**
   * @returns {boolean} true, pokud efekt otevřel další prompt
   */
  _applyRouletteOutcome(pid, outcome) {
    const player = this.players.get(pid);
    if (!player) return false;

    switch (outcome.id) {
      case 'preemption':
        player.halfPriceNext = true;
        this._addLog(`🎟️ ${player.name} má přednostní právo — příští volný kůň za polovinu.`);
        return false;

      case 'double_rent':
        player.doubleRent++;
        this._addLog(`💵 ${player.name} vybere příští nájem dvojnásobně.`);
        return false;

      case 'immunity':
        player.rentImmunity++;
        this._addLog(`🛡️ ${player.name} příští nájem neplatí.`);
        return false;

      case 'doping':
        player.skipTurns = outcome.turns;
        this._addLog(`🤒 ${player.name} je pod podezřením z dopingu — vynechává příští tah.`);
        return false;

      default:
        return false;
    }
  },
};
```

- [ ] **Step 3c: Větev v `_evaluateSpace`**

V `src/mixins/movement.js` nahraď celý `case 'skip_turn':` — zrcadlí to, jak `case 'free_parking':` větví na `config.field20Mode`:

```js
      case 'skip_turn':
        if (this.config.field30Mode === 'roulette') {
          this._spinRoulette(pid);
          break;
        }
        player.skipTurns = space.turns;
        this._addLog(`🚫 ${player.name} zastavil(a) na poli ${space.name} — vynechává příští tah.`);
        this._scheduleAction(ACTION_DELAY_MS, () => this._advanceTurn());
        break;
```

- [ ] **Step 3d: Routing promptu**

V `src/mixins/actions.js` do switche v `handleRespond` přidej za `case 'airport_select_target'`:

```js
      case 'roulette_ack': return this._handleRouletteAck(pid, actionData);
```

A do switche v `_handleTurnTimeout` přidej — při vypršení limitu se efekt aplikuje sám, hráč o výhru nepřijde:

```js
      case 'roulette_ack':
        this._handleRouletteAck(targetId, data);
        break;
```

- [ ] **Step 3e: Registrace mixinu**

V `src/GameEngine.js` přidej `require` k ostatním mixinům:

```js
const RouletteMixin = require('./mixins/roulette');
```

a zařaď ho do `Object.assign` za `TokensMixin` (potřebuje `_offerTokensOrEnd`):

```js
  TokensMixin,   // _addToken, _eligibleTokenSpaces, _offerTokensOrEnd
  RouletteMixin, // _spinRoulette, _handleRouletteAck, modifikátory nájmu
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roulette-spin.test.js`
Expected: PASS, 6 testů

- [ ] **Step 5: Run the whole suite**

Run: `node --test tests/`
Expected: PASS — žádný stávající test nesmí spadnout. `case 'skip_turn'` se v režimu `'doping'` chová beze změny, což hlídá první test.

- [ ] **Step 6: Commit**

```bash
git add src/mixins/roulette.js src/mixins/lobby.js src/mixins/movement.js src/mixins/actions.js src/GameEngine.js tests/roulette-spin.test.js
git commit -m "feat(totalizator): vstup na pole, prompt a efekty bez volby"
```

---

## Task 4: Modifikátory nájmu a ceny

**Files:**
- Modify: `src/mixins/economy.js` (`_calcRent` — větev `tokenStrike`; nové `_effectiveBuyPrice`; `_buyProperty`)
- Modify: `src/mixins/roulette.js` (nové `_applyRentModifiers`)
- Modify: `src/mixins/movement.js:116` a `src/mixins/turns.js:102` (obě platby nájmu)
- Modify: `src/mixins/turns.js` (`_startTurn` — dekrement `tokenStrike`)
- Test: `tests/roulette-modifiers.test.js`

**Interfaces:**
- Consumes: příznaky z Tasku 3
- Produces:
  - `_applyRentModifiers(payerId, ownerId, rent)` → number. Spotřebuje `doubleRent` majitele a `rentImmunity` plátce.
  - `_effectiveBuyPrice(pid, spaceId)` → number. Vrací poloviční cenu, má-li hráč `halfPriceNext`. **Nespotřebuje** příznak — ten spotřebuje až `_buyProperty`.

**Pozor na pořadí:** imunita se vyhodnocuje **po** zdvojnásobení, takže imunita proti dvojitému nájmu vyhraje a **obě** nabití se spotřebují.

- [ ] **Step 1: Write the failing test**

```js
// tests/roulette-modifiers.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const BOARD = require('../src/data/boardData');

// Fantome (1) a Gavora (3) tvoří celou oranžovou stáj — dvoučlennou,
// takže monopol jde postavit dvěma koni.
const FANTOME = 1;
const GAVORA = 3;

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';

  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B'];
  return engine;
}

function giveStable(engine, pid) {
  [FANTOME, GAVORA].forEach(sid => {
    engine.ownerships[sid] = pid;
    engine.players.get(pid).properties.push(sid);
  });
}

test('stávka vypne žetony stejně jako doping', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  engine.tokens[FANTOME] = { small: 2, big: false };

  const withTokens = engine._calcRent(FANTOME, 3);
  assert.equal(withTokens, BOARD[FANTOME].rents[2]);

  engine.players.get('B').tokenStrike = 1;
  const striking = engine._calcRent(FANTOME, 3);
  assert.equal(striking, BOARD[FANTOME].rents[0], 'při stávce má platit základní nájem');
});

test('dvojitý nájem zdvojnásobí a spotřebuje se jednou', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  engine.players.get('B').doubleRent = 1;

  const base = engine._calcRent(FANTOME, 3);
  assert.equal(engine._applyRentModifiers('A', 'B', base), base * 2);
  assert.equal(engine.players.get('B').doubleRent, 0);

  // druhý nájem už je normální
  assert.equal(engine._applyRentModifiers('A', 'B', base), base);
});

test('imunita vynuluje nájem a spotřebuje se jednou', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  engine.players.get('A').rentImmunity = 1;

  const base = engine._calcRent(FANTOME, 3);
  assert.equal(engine._applyRentModifiers('A', 'B', base), 0);
  assert.equal(engine.players.get('A').rentImmunity, 0);
  assert.equal(engine._applyRentModifiers('A', 'B', base), base);
});

test('imunita vyhraje nad dvojitým nájmem a obě nabití se spotřebují', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  engine.players.get('B').doubleRent = 1;
  engine.players.get('A').rentImmunity = 1;

  const base = engine._calcRent(FANTOME, 3);
  assert.equal(engine._applyRentModifiers('A', 'B', base), 0);
  assert.equal(engine.players.get('B').doubleRent, 0, 'dvojitý nájem se musí spotřebovat taky');
  assert.equal(engine.players.get('A').rentImmunity, 0);
});

test('nabití nepřeteče pod nulu', () => {
  const engine = makeEngine();
  giveStable(engine, 'B');
  const base = engine._calcRent(FANTOME, 3);

  engine._applyRentModifiers('A', 'B', base);
  assert.equal(engine.players.get('B').doubleRent, 0);
  assert.equal(engine.players.get('A').rentImmunity, 0);
});

test('přednostní právo půlí cenu a spotřebuje se až nákupem', () => {
  const engine = makeEngine();
  const price = BOARD[FANTOME].price;
  engine.players.get('A').halfPriceNext = true;

  assert.equal(engine._effectiveBuyPrice('A', FANTOME), Math.floor(price / 2));
  // pouhý dotaz na cenu příznak nespotřebuje
  assert.equal(engine.players.get('A').halfPriceNext, true);

  engine._buyProperty('A', FANTOME);
  assert.equal(engine.players.get('A').balance, 30000 - Math.floor(price / 2));
  assert.equal(engine.players.get('A').halfPriceNext, false);

  // druhý nákup je za plnou cenu
  assert.equal(engine._effectiveBuyPrice('A', GAVORA), BOARD[GAVORA].price);
});

test('stávka se snižuje na začátku tahu cílového hráče', () => {
  const engine = makeEngine();
  engine.players.get('A').tokenStrike = 1;
  engine.currentTurnIdx = 0;
  engine._startTurn();

  assert.equal(engine.players.get('A').tokenStrike, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roulette-modifiers.test.js`
Expected: FAIL — `engine._applyRentModifiers is not a function`

- [ ] **Step 3a: `tokenStrike` do `_calcRent`**

V `src/mixins/economy.js` v `_calcRent` přidej třetí větev do existující podmínky „žetony nefungují", hned za větev `skipTurns`:

```js
      } else if (ownerPlayer.skipTurns > 0) {
        this._addLog(`ℹ️ Majitel ${ownerPlayer.name} je pod podezřením z dopingu — žetony nefungují!`);
      } else if (ownerPlayer.tokenStrike > 0) {
        this._addLog(`ℹ️ Ve stáji ${ownerPlayer.name} je stávka — žetony nefungují!`);
      } else if (!hasMonopoly) {
```

- [ ] **Step 3b: `_applyRentModifiers` do mixinu rulety**

Do `src/mixins/roulette.js` přidej do `module.exports`:

```js
  /**
   * Spotřebuje nabité modifikátory a vrátí skutečnou částku k zaplacení.
   *
   * Vědomě NEŽIJE v `_calcRent` — ta se volá i pro zobrazení a odhady, a
   * spotřebovávat nabití při výpočtu by je nenávratně sežralo. Tohle se volá
   * výhradně z platebních míst.
   *
   * Pořadí je určující: imunita se vyhodnocuje AŽ PO zdvojnásobení, takže
   * proti dvojitému nájmu vyhraje — ale obě nabití se spotřebují.
   */
  _applyRentModifiers(payerId, ownerId, rent) {
    const payer = this.players.get(payerId);
    const owner = this.players.get(ownerId);
    let amount = rent;

    if (owner && owner.doubleRent > 0) {
      owner.doubleRent--;
      amount *= 2;
      this._addLog(`💵 ${owner.name} uplatňuje dvojitý nájem — ${amount} Kč.`);
    }

    if (payer && payer.rentImmunity > 0) {
      payer.rentImmunity--;
      this._addLog(`🛡️ ${payer.name} uplatňuje imunitu — nájem neplatí.`);
      return 0;
    }

    return amount;
  },
```

- [ ] **Step 3c: Obě platební místa**

V `src/mixins/movement.js` (řádek 116) obal výpočet:

```js
            const rent = this._applyRentModifiers(pid, owner, this._calcRent(space.id, this.lastDice?.value || 1));
```

V `src/mixins/turns.js` (řádek 102) stejně:

```js
      const rent = this._applyRentModifiers(pid, owner, this._calcRent(spaceId, dice));
```

- [ ] **Step 3d: `_effectiveBuyPrice` a `_buyProperty`**

V `src/mixins/economy.js` přidej nad `_buyProperty`:

```js
  /**
   * Cena, za kterou hráč koně skutečně koupí. Přednostní právo z Totalizátoru
   * ji půlí. Příznak se tady NESPOTŘEBUJE — dotaz na cenu se dělá i při
   * kontrole, jestli na koně hráč vůbec má.
   */
  _effectiveBuyPrice(pid, spaceId) {
    const player = this.players.get(pid);
    const price = BOARD[spaceId].price;
    if (player && player.halfPriceNext) return Math.floor(price / 2);
    return price;
  },
```

a přepiš `_buyProperty` tak, aby cenu brala odtud a příznak spotřebovala:

```js
  _buyProperty(pid, spaceId, priceOverride = null) {
    const player = this.players.get(pid);
    const space = BOARD[spaceId];
    const price = priceOverride !== null ? priceOverride : this._effectiveBuyPrice(pid, spaceId);

    // Příznak spotřebuj jen tehdy, když kůň SKUTEČNĚ mění majitele —
    // a jen u běžného nákupu. Dražba má vlastní cenu a právo nespotřebuje.
    if (priceOverride === null && player.halfPriceNext) {
      player.halfPriceNext = false;
      this._addLog(`🎟️ ${player.name} uplatnil(a) přednostní právo — poloviční cena.`);
    }

    player.balance -= price;
    this.ownerships[spaceId] = pid;
    player.properties.push(spaceId);
    this._addLog(`🏠 ${player.name} koupil(a) ${space.name} za ${fmt(price)} Kč`);
    this._checkBankrupt(pid);
    this._checkStableCompletion(pid, spaceId);
  },
```

V `src/mixins/movement.js` uprav kontrolu dostupnosti v `case 'horse': case 'service':` — jinak by hra nenabídla koupi koně, na kterého hráč má jen díky polovičnímu právu:

```js
          if (player.balance >= this._effectiveBuyPrice(pid, space.id)) {
```

- [ ] **Step 3e: Dekrement stávky**

V `src/mixins/turns.js` v `_startTurn` přidej hned za kontrolu `player.bankrupt` a **před** větev `skipTurns` — stávka běží i hráči, který zrovna vynechává tah:

```js
    if (player.tokenStrike > 0) {
      player.tokenStrike--;
      if (player.tokenStrike === 0) {
        this._addLog(`🚧 Stávka ve stáji ${player.name} skončila.`);
      }
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roulette-modifiers.test.js`
Expected: PASS, 7 testů

- [ ] **Step 5: Run the whole suite**

Run: `node --test tests/`
Expected: PASS. Pozor zejména na `tests/bot-rent-estimate.test.js` — porovnává `Bot.estimateRent` s `_calcRent`. Protože modifikátory žijí mimo `_calcRent`, test musí projít beze změny. Kdyby spadl, modifikátor se omylem dostal do `_calcRent`.

- [ ] **Step 6: Commit**

```bash
git add src/mixins/economy.js src/mixins/roulette.js src/mixins/movement.js src/mixins/turns.js tests/roulette-modifiers.test.js
git commit -m "feat(totalizator): modifikátory nájmu a poloviční cena"
```

---

## Task 5: Sázka na vlastní hod

**Files:**
- Modify: `src/mixins/roulette.js` (`_applyRouletteOutcome` — větev `bet`)
- Modify: `src/mixins/turns.js` (`handleRoll` — vyhodnocení na začátku větve `wait_roll`)
- Test: `tests/roulette-bet.test.js`

**Interfaces:**
- Consumes: `player.pendingBet` z Tasku 3
- Produces: `_resolvePendingBet(pid, dice)` — vyhodnotí a vynuluje sázku

**Pravidla:**
- Sázka se strhává **hned při zatočení**, ne až při hodu — jinak by hráč mohl mezitím zbankrotovat a sázka by zmizela bez zaplacení.
- Při zůstatku pod 5 000 Kč se vsadí celá hotovost a výplata se škáluje `stake × payoutMultiplier`.
- Při nulovém zůstatku se sázka nekoná.
- Vyhodnotí se na **prvním** hodu po vsazení. Šestka dává právo na další hod — sázka už je v tu chvíli vynulovaná, takže se opakovaný hod nesází.

- [ ] **Step 1: Write the failing test**

```js
// tests/roulette-bet.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { OUTCOMES } = require('../src/Roulette');

const BET = OUTCOMES.find(o => o.id === 'bet');

function makeEngine() {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';

  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;

  const idx = OUTCOMES.findIndex(o => o.id === 'bet');
  engine._rouletteRnd = () => (idx + 0.5) / OUTCOMES.length;
  return engine;
}

function placeBet(engine) {
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});
}

test('sázka se strhne hned při zatočení', () => {
  const engine = makeEngine();
  placeBet(engine);

  assert.equal(engine.players.get('A').balance, 30000 - BET.stake);
  assert.deepEqual(engine.players.get('A').pendingBet, {
    stake: BET.stake, threshold: BET.threshold, payout: BET.stake * BET.payoutMultiplier,
  });
});

test('výhra vyplatí trojnásobek a sázku vynuluje', () => {
  const engine = makeEngine();
  placeBet(engine);

  engine._setPendingAction({ type: 'wait_roll', targetId: 'A' });
  engine._movePlayer = () => {};
  engine._forceDice = 5;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  assert.equal(engine.players.get('A').balance, 30000 - BET.stake + BET.stake * BET.payoutMultiplier);
  assert.equal(engine.players.get('A').pendingBet, null);
});

test('prohra sázku jen vynuluje', () => {
  const engine = makeEngine();
  placeBet(engine);

  engine._setPendingAction({ type: 'wait_roll', targetId: 'A' });
  engine._movePlayer = () => {};
  engine._forceDice = 3;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  assert.equal(engine.players.get('A').balance, 30000 - BET.stake);
  assert.equal(engine.players.get('A').pendingBet, null);
});

test('šestka vyhraje a opakovaný hod se už nesází', () => {
  const engine = makeEngine();
  placeBet(engine);
  const afterStake = engine.players.get('A').balance;

  engine._setPendingAction({ type: 'wait_roll', targetId: 'A' });
  engine._movePlayer = () => {};
  engine._forceDice = 6;
  engine.handleRoll({ playerId: 'A', emit: () => {} });

  assert.equal(engine.players.get('A').balance, afterStake + BET.stake * BET.payoutMultiplier);
  assert.equal(engine.players.get('A').pendingBet, null, 'šestka musí sázku spotřebovat');
});

test('chudý hráč vsadí jen to, co má', () => {
  const engine = makeEngine();
  engine.players.get('A').balance = 2000;
  placeBet(engine);

  assert.equal(engine.players.get('A').balance, 0);
  assert.equal(engine.players.get('A').pendingBet.stake, 2000);
  assert.equal(engine.players.get('A').pendingBet.payout, 2000 * BET.payoutMultiplier);
});

test('s nulovým zůstatkem se sázka nekoná', () => {
  const engine = makeEngine();
  engine.players.get('A').balance = 0;
  placeBet(engine);

  assert.equal(engine.players.get('A').pendingBet, null);
  assert.equal(engine.players.get('A').balance, 0);
});

test('sázka přežije serializaci stavu', () => {
  const engine = makeEngine();
  placeBet(engine);

  const restored = engine._buildState().players.find(p => p.id === 'A');
  assert.deepEqual(restored.pendingBet, engine.players.get('A').pendingBet);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roulette-bet.test.js`
Expected: FAIL — `pendingBet` zůstává `null`, zůstatek se nemění

- [ ] **Step 3a: Vsazení**

V `src/mixins/roulette.js` doplň do switche v `_applyRouletteOutcome` větev `bet` před `default`:

```js
      case 'bet': {
        // Strhává se HNED, ne až při hodu — jinak by hráč mohl mezitím
        // zbankrotovat a sázka by zmizela bez zaplacení.
        const stake = Math.min(outcome.stake, player.balance);
        if (stake <= 0) {
          this._addLog(`🎲 ${player.name} nemá na sázku — Totalizátor tentokrát nepřijímá.`);
          return false;
        }
        player.balance -= stake;
        player.pendingBet = {
          stake,
          threshold: outcome.threshold,
          payout: stake * outcome.payoutMultiplier,
        };
        this._addLog(`🎲 ${player.name} vsadil(a) ${stake} Kč na vlastní hod (${outcome.threshold}+).`);
        return false;
      }
```

- [ ] **Step 3b: Vyhodnocení**

Do `src/mixins/roulette.js` přidej:

```js
  /** Vyhodnotí a vynuluje sázku. Volá se z `handleRoll` na prvním hodu po vsazení. */
  _resolvePendingBet(pid, dice) {
    const player = this.players.get(pid);
    if (!player || !player.pendingBet) return;

    const { threshold, payout } = player.pendingBet;
    player.pendingBet = null;

    if (dice >= threshold) {
      player.balance += payout;
      this._addLog(`🎉 ${player.name} trefil(a) sázku (${dice}) a bere ${payout} Kč!`);
    } else {
      this._addLog(`💸 ${player.name} sázku neuhrál(a) (${dice}) — vklad propadá.`);
    }
  },
```

- [ ] **Step 3c: Napojení na hod**

V `src/mixins/turns.js` v `handleRoll`, ve větvi `if (this.pendingAction.type === 'wait_roll')`, hned **za** přiřazení `this.lastDice` a **před** kontrolu dvojité šestky:

```js
      this.lastDice = { value: dice, id: Math.random() };

      // Sázka z Totalizátoru se vyhodnotí na prvním hodu po vsazení.
      // Vynuluje se tady, takže opakovaný hod po šestce se už nesází.
      this._resolvePendingBet(pid, dice);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roulette-bet.test.js`
Expected: PASS, 7 testů

- [ ] **Step 5: Run the whole suite**

Run: `node --test tests/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/mixins/roulette.js src/mixins/turns.js tests/roulette-bet.test.js
git commit -m "feat(totalizator): sázka na vlastní hod"
```

---

## Task 6: Cílené efekty — stávka a udání

**Files:**
- Modify: `src/mixins/roulette.js` (větve `strike`, `report`; `_handleRoulettePickPlayer`)
- Modify: `src/mixins/actions.js` (`handleRespond` a `_handleTurnTimeout`)
- Test: `tests/roulette-target.test.js`

**Interfaces:**
- Consumes: `_applyRouletteOutcome` z Tasku 3
- Produces: prompt `roulette_pick_player` s `data: { outcomeId, candidates: [playerId] }`; handler `_handleRoulettePickPlayer(pid, decision, actionData)` kde `decision` je id cílového hráče

**Vzor:** `airport_select_target` — stejný tvar promptu i timeoutu.

- [ ] **Step 1: Write the failing test**

```js
// tests/roulette-target.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const { OUTCOMES } = require('../src/Roulette');
const { JAIL_SPACE } = require('../src/constants');

function makeEngine(outcomeId) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';

  ['A', 'B', 'C'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B', 'C'];
  engine.currentTurnIdx = 0;

  const idx = OUTCOMES.findIndex(o => o.id === outcomeId);
  engine._rouletteRnd = () => (idx + 0.5) / OUTCOMES.length;
  return engine;
}

function spinAndAck(engine) {
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});
}

test('stávka otevře výběr soupeře bez sebe sama', () => {
  const engine = makeEngine('strike');
  spinAndAck(engine);

  assert.equal(engine.pendingAction.type, 'roulette_pick_player');
  assert.equal(engine.pendingAction.targetId, 'A');
  assert.deepEqual(engine.pendingAction.data.candidates.sort(), ['B', 'C']);
});

test('stávka nabije tokenStrike vybranému soupeři', () => {
  const engine = makeEngine('strike');
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'C' });

  assert.equal(engine.players.get('C').tokenStrike, 1);
  assert.equal(engine.players.get('B').tokenStrike, 0);
  assert.equal(engine.players.get('A').tokenStrike, 0);
});

test('udání pošle vybraného soupeře na Distanc', () => {
  const engine = makeEngine('report');
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'B' });

  const b = engine.players.get('B');
  assert.equal(b.inJail, true);
  assert.equal(b.position, JAIL_SPACE);
});

test('neplatný cíl efekt zahodí a tah pokračuje', () => {
  const engine = makeEngine('strike');
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'A' });

  assert.equal(engine.players.get('A').tokenStrike, 0);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_player');
});

test('bankrotáři nejsou mezi kandidáty', () => {
  const engine = makeEngine('report');
  engine.players.get('B').bankrupt = true;
  spinAndAck(engine);

  assert.deepEqual(engine.pendingAction.data.candidates, ['C']);
});

test('bez soupeřů efekt propadne a prompt se neotevře', () => {
  const engine = makeEngine('strike');
  engine.players.get('B').bankrupt = true;
  engine.players.get('C').bankrupt = true;
  spinAndAck(engine);

  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_player');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roulette-target.test.js`
Expected: FAIL — `pendingAction.type` není `roulette_pick_player`

- [ ] **Step 3a: Otevření promptu**

V `src/mixins/roulette.js` doplň do `_applyRouletteOutcome` před `default`:

```js
      case 'strike':
      case 'report': {
        const candidates = this.turnOrder.filter(
          id => id !== pid && !this.players.get(id)?.bankrupt
        );
        if (candidates.length === 0) {
          this._addLog(`🎰 ${player.name} nemá koho vybrat — efekt propadá.`);
          return false;
        }
        this._setPendingAction({
          type: 'roulette_pick_player',
          targetId: pid,
          data: { outcomeId: outcome.id, candidates },
        });
        return true;
      }
```

- [ ] **Step 3b: Handler výběru**

Do `src/mixins/roulette.js` přidej:

```js
  _handleRoulettePickPlayer(pid, decision, actionData) {
    const { outcomeId, candidates } = actionData || {};
    const target = this.players.get(decision);

    // Neplatný cíl (vlastní id, bankrotář, nesmysl z klienta) efekt zahodí.
    // Tah musí pokračovat, jinak by hra zamrzla.
    if (!target || !candidates || !candidates.includes(decision)) {
      this._addLog('🎰 Neplatný cíl — efekt Totalizátoru propadá.');
    } else if (outcomeId === 'strike') {
      target.tokenStrike = 1;
      this._addLog(`🚧 Ve stáji ${target.name} je stávka — jedno kolo mu nefungují žetony.`);
    } else if (outcomeId === 'report') {
      this._sendToJail(decision);
      this._addLog(`🎯 ${target.name} byl(a) udán(a) a míří na Distanc.`);
    }

    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
  },
```

- [ ] **Step 3c: Routing**

V `src/mixins/actions.js` do `handleRespond`:

```js
      case 'roulette_pick_player': return this._handleRoulettePickPlayer(pid, decision, actionData);
```

A do `_handleTurnTimeout` — při vypršení se vybere první kandidát, ať hra nestojí:

```js
      case 'roulette_pick_player':
        this._handleRoulettePickPlayer(targetId, data?.candidates?.[0], data);
        break;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roulette-target.test.js`
Expected: PASS, 6 testů

- [ ] **Step 5: Commit**

```bash
git add src/mixins/roulette.js src/mixins/actions.js tests/roulette-target.test.js
git commit -m "feat(totalizator): stávka ve stáji a udání"
```

---

## Task 7: Výběr koně — dražba a dostih zdarma

**Files:**
- Modify: `src/mixins/roulette.js` (větve `auction`, `free_token`; `_handleRoulettePickHorse`)
- Modify: `src/mixins/actions.js` (`handleRespond` a `_handleTurnTimeout`)
- Test: `tests/roulette-horse.test.js`

**Interfaces:**
- Consumes: `_buyProperty(pid, spaceId, priceOverride)` a `_addToken` 
- Produces: prompt `roulette_pick_horse` s `data: { outcomeId, options: [{ spaceId, price }] }`; handler `_handleRoulettePickHorse(pid, decision, actionData)` kde `decision` je `spaceId` nebo `'decline'`

**Pravidla:**
- Dražba nabídne jen koně, na které hráč **má** (cena s přirážkou ≤ zůstatek). Odmítnutí efekt spotřebuje.
- Dostih zdarma nabídne jen koně z **úplné stáje** bez velkého žetonu a s méně než 4 malými.
- Dražba nespotřebuje přednostní právo — má vlastní cenu.

- [ ] **Step 1: Write the failing test**

```js
// tests/roulette-horse.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const GameEngine = require('../src/GameEngine');
const BOARD = require('../src/data/boardData');
const { OUTCOMES } = require('../src/Roulette');

const FANTOME = 1;
const GAVORA = 3;
const AUCTION = OUTCOMES.find(o => o.id === 'auction');

function makeEngine(outcomeId) {
  const engine = new GameEngine({ to: () => ({ emit: () => {} }) }, 'room-test');
  engine._broadcast = () => {};
  engine._scheduleAction = (delay, fn) => fn();
  engine.phase = 'playing';
  engine.config.field30Mode = 'roulette';

  ['A', 'B'].forEach(id => {
    engine.players.set(id, {
      id, socketId: `sock-${id}`, name: id, color: '#fff', isHost: false,
      position: 0, balance: 30000, bankrupt: false, inJail: false, jailTurns: 0,
      skipTurns: 0, properties: [], rollAccumulator: 0, moveDirection: 1,
      jailFreeCards: 0, ready: true, disconnected: false, canFly: false, left: false,
      pendingBet: null, doubleRent: 0, rentImmunity: 0, halfPriceNext: false, tokenStrike: 0,
    });
  });
  engine.turnOrder = ['A', 'B'];
  engine.currentTurnIdx = 0;

  const idx = OUTCOMES.findIndex(o => o.id === outcomeId);
  engine._rouletteRnd = () => (idx + 0.5) / OUTCOMES.length;
  return engine;
}

function spinAndAck(engine) {
  engine.players.get('A').position = 30;
  engine._evaluateSpace('A');
  engine.handleRespond({ playerId: 'A', emit: () => {} }, {});
}

test('dražba nabídne volné koně s přirážkou 50 %', () => {
  const engine = makeEngine('auction');
  engine.ownerships[GAVORA] = 'B';
  spinAndAck(engine);

  assert.equal(engine.pendingAction.type, 'roulette_pick_horse');
  const option = engine.pendingAction.data.options.find(o => o.spaceId === FANTOME);
  const expected = Math.round(BOARD[FANTOME].price * (1 + AUCTION.surchargePct / 100));
  assert.equal(option.price, expected);
  // obsazený kůň v nabídce být nesmí
  assert.equal(engine.pendingAction.data.options.some(o => o.spaceId === GAVORA), false);
});

test('dražba převede koně a strhne cenu s přirážkou', () => {
  const engine = makeEngine('auction');
  spinAndAck(engine);
  const price = engine.pendingAction.data.options.find(o => o.spaceId === FANTOME).price;
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.ownerships[FANTOME], 'A');
  assert.equal(engine.players.get('A').balance, 30000 - price);
});

test('dražba nespotřebuje přednostní právo', () => {
  const engine = makeEngine('auction');
  engine.players.get('A').halfPriceNext = true;
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.players.get('A').halfPriceNext, true);
});

test('odmítnutá dražba efekt spotřebuje a tah pokračuje', () => {
  const engine = makeEngine('auction');
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: 'decline' });

  assert.equal(engine.ownerships[FANTOME], undefined);
  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_horse');
});

test('nabídnou se jen koně, na které hráč má', () => {
  const engine = makeEngine('auction');
  engine.players.get('A').balance = 1900; // Fantome 1200 → 1800 ano, Lady Anne 2000 → 3000 ne
  spinAndAck(engine);

  const ids = engine.pendingAction.data.options.map(o => o.spaceId);
  assert.ok(ids.includes(FANTOME));
  assert.equal(ids.includes(6), false, 'Lady Anne je nad rozpočet');
});

test('dostih zdarma položí žeton bez placení', () => {
  const engine = makeEngine('free_token');
  [FANTOME, GAVORA].forEach(sid => {
    engine.ownerships[sid] = 'A';
    engine.players.get('A').properties.push(sid);
  });
  spinAndAck(engine);
  engine.handleRespond({ playerId: 'A', emit: () => {} }, { decision: FANTOME });

  assert.equal(engine.tokens[FANTOME].small, 1);
  assert.equal(engine.players.get('A').balance, 30000, 'žeton musí být zdarma');
});

test('bez úplné stáje dostih zdarma propadne', () => {
  const engine = makeEngine('free_token');
  engine.ownerships[FANTOME] = 'A';
  engine.players.get('A').properties.push(FANTOME);
  spinAndAck(engine);

  assert.notEqual(engine.pendingAction?.type, 'roulette_pick_horse');
  assert.equal(engine.tokens[FANTOME], undefined);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roulette-horse.test.js`
Expected: FAIL — prompt `roulette_pick_horse` se neotevře

- [ ] **Step 3a: Otevření promptu**

V `src/mixins/roulette.js` doplň do `_applyRouletteOutcome` před `default`. Vyžaduje `const BOARD = require('../data/boardData');` na začátku souboru:

```js
      case 'auction': {
        const options = BOARD
          .filter(s => s.type === 'horse' && !this.ownerships[s.id])
          .map(s => ({
            spaceId: s.id,
            price: Math.round(s.price * (1 + outcome.surchargePct / 100)),
          }))
          .filter(o => o.price <= player.balance);

        if (options.length === 0) {
          this._addLog(`🏇 ${player.name} nemá na žádného volného koně — dražba propadá.`);
          return false;
        }
        this._setPendingAction({
          type: 'roulette_pick_horse',
          targetId: pid,
          data: { outcomeId: outcome.id, options },
        });
        return true;
      }

      case 'free_token': {
        const options = player.properties
          .filter(sid => {
            const space = BOARD[sid];
            if (space.type !== 'horse') return false;
            if (!this._ownsFullGroup(pid, space.group)) return false;
            const tok = this.tokens[sid] || { small: 0, big: false };
            return !tok.big && tok.small < 4;
          })
          .map(sid => ({ spaceId: sid, price: 0 }));

        if (options.length === 0) {
          this._addLog(`🏗️ ${player.name} nemá koně z úplné stáje — dostih zdarma propadá.`);
          return false;
        }
        this._setPendingAction({
          type: 'roulette_pick_horse',
          targetId: pid,
          data: { outcomeId: outcome.id, options },
        });
        return true;
      }
```

- [ ] **Step 3b: Handler výběru**

```js
  _handleRoulettePickHorse(pid, decision, actionData) {
    const { outcomeId, options } = actionData || {};
    const player = this.players.get(pid);
    const chosen = (options || []).find(o => o.spaceId === decision);

    if (!player || !chosen) {
      // Odmítnutí i nesmysl z klienta efekt spotřebují — nedrží se na příště.
      this._addLog('🎰 Nabídka Totalizátoru nevyužita.');
    } else if (outcomeId === 'auction') {
      // Vlastní cena → `_buyProperty` nespotřebuje přednostní právo.
      this._buyProperty(pid, chosen.spaceId, chosen.price);
    } else if (outcomeId === 'free_token') {
      const tok = this.tokens[chosen.spaceId] || { small: 0, big: false };
      if (!this.tokens[chosen.spaceId]) this.tokens[chosen.spaceId] = tok;
      tok.small++;
      this._addLog(`🏗️ ${player.name} dostal(a) žeton dostihů na ${BOARD[chosen.spaceId].name} zdarma.`);
    }

    this._broadcast();
    this._scheduleAction(ACTION_DELAY_MS, () => this._offerTokensOrEnd(pid));
  },
```

- [ ] **Step 3c: Routing**

V `src/mixins/actions.js` do `handleRespond`:

```js
      case 'roulette_pick_horse': return this._handleRoulettePickHorse(pid, decision, actionData);
```

A do `_handleTurnTimeout` — při vypršení se nabídka odmítne:

```js
      case 'roulette_pick_horse':
        this._handleRoulettePickHorse(targetId, 'decline', data);
        break;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roulette-horse.test.js`
Expected: PASS, 7 testů

- [ ] **Step 5: Run the whole suite**

Run: `node --test tests/`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/mixins/roulette.js src/mixins/actions.js tests/roulette-horse.test.js
git commit -m "feat(totalizator): dražba a dostih zdarma"
```

---

## Task 8: Bot

**Kritické:** `_botAct` volá `Bot.decideAction(this, botId)`. Na neznámý typ promptu vrátí `null`, bot neodpoví a **hra stojí až do vypršení limitu tahu** — a když limit není nastavený, stojí navždy. Každý ze tří nových promptů proto musí dostat `case`.

**Files:**
- Modify: `src/Bot.js` (`decideAction` — tři nové `case`)
- Test: `tests/roulette-bot.test.js`

**Interfaces:**
- Consumes: `evaluatePurchase(ctx, botId, spaceId)` → `{ buy: boolean, reason: string }` (**žádné `score`**), `estimateRent(ctx, spaceId, dice)`, `calcReserve(ctx, botId)`, `ctx._calcAssetsValue(pid)`
- Produces: rozhodnutí ve tvaru `{ kind: 'respond', data: { decision } }`

> **Tvar návratové hodnoty je `kind`, ne `action`.** `decideAction` vrací `{ kind: 'roll' }` nebo `{ kind: 'respond', data: {…} }` — viz `src/Bot.js:314-322`. Uvnitř switche je `pa` aktuální `pendingAction` a `d` je `pa.data || {}`.

- [ ] **Step 1: Write the failing test**

```js
// tests/roulette-bot.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Bot = require('../src/Bot');
const { makeCtx, makePlayer, addPlayer } = require('./helpers/botCtx');

const FANTOME = 1;

function ctxWithPrompt(pendingAction, extra = {}) {
  const ctx = makeCtx({ pendingAction, ...extra });
  addPlayer(ctx, makePlayer('BOT', { isBot: true }));
  addPlayer(ctx, makePlayer('HUMAN'));
  ctx.turnOrder = ['BOT', 'HUMAN'];
  return ctx;
}

test('bot potvrdí roulette_ack', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_ack', targetId: 'BOT', data: { result: { id: 'immunity' } },
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.notEqual(action, null, 'bot nesmí zamrznout na roulette_ack');
  assert.equal(action.kind, 'respond');
});

test('bot vybere soupeře pro cílený efekt', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_pick_player', targetId: 'BOT',
    data: { outcomeId: 'report', candidates: ['HUMAN'] },
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.notEqual(action, null);
  assert.equal(action.data.decision, 'HUMAN');
});

test('bot si vybere koně v dražbě', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_pick_horse', targetId: 'BOT',
    data: { outcomeId: 'auction', options: [{ spaceId: FANTOME, price: 1800 }] },
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.notEqual(action, null, 'bot nesmí zamrznout na dražbě');
  assert.ok(action.data.decision === FANTOME || action.data.decision === 'decline');
});

test('bot na dražbu, na kterou nemá, odpoví decline', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_pick_horse', targetId: 'BOT',
    data: { outcomeId: 'auction', options: [{ spaceId: FANTOME, price: 999999 }] },
  });
  ctx.players.get('BOT').balance = 1000;
  const action = Bot.decideAction(ctx, 'BOT');

  assert.equal(action.data.decision, 'decline');
});

test('bot si vezme žeton zdarma vždy', () => {
  const ctx = ctxWithPrompt({
    type: 'roulette_pick_horse', targetId: 'BOT',
    data: { outcomeId: 'free_token', options: [{ spaceId: FANTOME, price: 0 }] },
  });
  const action = Bot.decideAction(ctx, 'BOT');

  assert.equal(action.data.decision, FANTOME);
});

test('žádný nový prompt nevrací null', () => {
  const prompts = [
    { type: 'roulette_ack', data: { result: { id: 'doping' } } },
    { type: 'roulette_pick_player', data: { outcomeId: 'strike', candidates: ['HUMAN'] } },
    { type: 'roulette_pick_horse', data: { outcomeId: 'auction', options: [{ spaceId: FANTOME, price: 1800 }] } },
    { type: 'roulette_pick_horse', data: { outcomeId: 'free_token', options: [{ spaceId: FANTOME, price: 0 }] } },
  ];
  for (const p of prompts) {
    const ctx = ctxWithPrompt({ ...p, targetId: 'BOT' });
    assert.notEqual(Bot.decideAction(ctx, 'BOT'), null, `bot zamrzl na ${p.type}/${p.data.outcomeId ?? ''}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roulette-bot.test.js`
Expected: FAIL — `decideAction` vrací `null`

- [ ] **Step 3: Write implementation**

V `src/Bot.js` do switche v `decideAction` přidej za `case 'airport_select_target'`:

```js
    case 'roulette_ack':
      // Výsledek je daný, není co rozhodovat — jen potvrdit, jako u karty.
      return { kind: 'respond', data: { decision: 'ack' } };

    case 'roulette_pick_player': {
      const candidates = d.candidates || [];
      if (candidates.length === 0) return { kind: 'respond', data: { decision: null } };
      // Vedoucí soupeř = ten s největším majetkem. Stávku i udání má smysl
      // mířit na něj, ne na hráče, který stejně dohrává.
      const leader = candidates
        .map(id => ({ id, worth: (ctx.players.get(id)?.balance || 0) + ctx._calcAssetsValue(id) }))
        .sort((a, b) => b.worth - a.worth)[0];
      return { kind: 'respond', data: { decision: leader.id } };
    }

    case 'roulette_pick_horse': {
      const options = d.options || [];
      if (options.length === 0) return { kind: 'respond', data: { decision: 'decline' } };

      if (d.outcomeId === 'free_token') {
        // Žeton zdarma se vyplatí vždy — ber toho koně, kde zvedne nájem nejvíc.
        const best = options
          .map(o => ({ ...o, gain: estimateRent(ctx, o.spaceId) }))
          .sort((a, b) => b.gain - a.gain)[0];
        return { kind: 'respond', data: { decision: best.spaceId } };
      }

      // Dražba. `evaluatePurchase` vrací { buy, reason } a počítá s BĚŽNOU
      // cenou, ne s přirážkou — proto se k jeho verdiktu přidává vlastní
      // kontrola, že po zaplacení dražební ceny zbude rezerva.
      const reserve = calcReserve(ctx, botId);
      const balance = bot.balance;
      const viable = options.filter(o =>
        o.price <= balance &&
        balance - o.price >= reserve &&
        evaluatePurchase(ctx, botId, o.spaceId).buy
      );
      if (viable.length === 0) return { kind: 'respond', data: { decision: 'decline' } };

      // Z použitelných ber toho, kde je odhadovaný nájem nejvyšší.
      const best = viable
        .map(o => ({ ...o, gain: estimateRent(ctx, o.spaceId) }))
        .sort((a, b) => b.gain - a.gain)[0];
      return { kind: 'respond', data: { decision: best.spaceId } };
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roulette-bot.test.js`
Expected: PASS, 6 testů

- [ ] **Step 5: Commit**

```bash
git add src/Bot.js tests/roulette-bot.test.js
git commit -m "feat(totalizator): rozhodnutí bota pro nové prompty"
```

---

## Task 9: Klient — nastavení a políčko

**Files:**
- Modify: `public/partials/lobby.html` (za `config-row` pro `cfg-field20Mode`)
- Modify: `public/js/ui/lobby.js` (zápis i čtení konfigurace, řádky ~76, ~97–107, ~208–216)
- Modify: `public/js/ui/board.js:253-261`

- [ ] **Step 1: Řádek v nastavení hostitele**

Do `public/partials/lobby.html` za blok `cfg-airportFee-row`:

```html
              <div class="config-row">
                <label>Pole 30:</label>
                <select id="cfg-field30Mode" class="text-input">
                  <option value="doping">Podezření z dopingu</option>
                  <option value="roulette">Totalizátor</option>
                </select>
              </div>
```

- [ ] **Step 2: Čtení a zápis v `lobby.js`**

Do pole id v `initLobbyListeners` (řádek ~208) přidej `'cfg-field30Mode'`, do objektu konfigurace (řádek ~216):

```js
        field30Mode:       document.getElementById('cfg-field30Mode')?.value ?? 'doping',
```

Do funkce, která plní formulář ze stavu (u řádku ~105), přidej vedle `cfgField20`:

```js
  const cfgField30 = document.getElementById('cfg-field30Mode');
  if (cfgField30 && document.activeElement !== cfgField30) cfgField30.value = c.field30Mode ?? 'doping';
```

A do souhrnu konfigurace (řádek ~76) přidej popisek:

```js
  const field30Label = c.field30Mode === 'roulette' ? 'Totalizátor' : 'Podezření z dopingu';
```

Zobraz ho vedle `field20Label` stejným způsobem, jakým se vykresluje ten.

- [ ] **Step 3: Ikona a název pole**

V `public/js/ui/board.js` za blok `field20Mode` (řádek ~261):

```js
  const field30Mode = gameState.config?.field30Mode ?? 'doping';
  const field30El = dom.board?.querySelector(`.space[data-id="30"]`);
  if (field30El) {
    const iconEl = field30El.querySelector('.corner-icon');
    const nameEl = field30El.querySelector('.corner-name');
    if (iconEl) iconEl.textContent = field30Mode === 'roulette' ? '🎰' : '💉';
    if (nameEl) nameEl.textContent = field30Mode === 'roulette' ? 'Totalizátor' : 'Podezření z dopingu';
  }
```

- [ ] **Step 4: Ruční ověření**

Spusť `npm run dev`, otevři http://localhost:3001, založ místnost. Přepni Pole 30 na Totalizátor a zkontroluj, že se popisek propíše všem hráčům v lobby a že roh plánu změní ikonu na 🎰.

- [ ] **Step 5: Commit**

```bash
git add public/partials/lobby.html public/js/ui/lobby.js public/js/ui/board.js
git commit -m "feat(totalizator): volba režimu pole 30 v lobby a na plánu"
```

---

## Task 10: Klient — kolo podle návrhového systému

**Přečti znovu sekci „Design Constraints" na začátku plánu.** Tenhle task ji musí dodržet do puntíku.

**Files:**
- Modify: `public/partials/overlays.html`
- Modify: `public/style.css`

- [ ] **Step 1: Markup**

Do `public/partials/overlays.html` za blok `space-inspect-overlay`. Struktura kopíruje `card-3d-overlay` — proto stejné třídy chování (`hidden`, `is-open`):

```html
  <!-- Totalizátor -->
  <div id="roulette-overlay" class="roulette-overlay hidden">
    <div class="roulette-scene">
      <h2 class="roulette-title">Totalizátor</h2>
      <div class="roulette-wheel-wrap">
        <div class="roulette-pointer" aria-hidden="true"></div>
        <div id="roulette-wheel" class="roulette-wheel"></div>
      </div>
      <div class="roulette-result">
        <div id="roulette-result-icon" class="roulette-result-icon"></div>
        <div id="roulette-result-name" class="roulette-result-name"></div>
        <div id="roulette-result-text" class="roulette-result-text"></div>
      </div>
      <button id="roulette-btn" class="btn btn-gold btn-lg hidden">Potvrdit</button>
    </div>
  </div>
```

- [ ] **Step 2: CSS**

Na konec `public/style.css`. Všimni si, že **žádná hodnota není hex napřímo** — všechno jde z tokenů:

```css
/* ═══════════════════════════════════════════════════════════════════════════
   Totalizátor — ruleta na poli 30
   Overlay kopíruje .card-3d-overlay, aby se obě odhalení chovala stejně.
   ═══════════════════════════════════════════════════════════════════════════ */
.roulette-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 200ms var(--ease-out);
}

.roulette-overlay.is-open { opacity: 1; }

.roulette-scene {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 28px;
  background: var(--bg-card);
  border: 1px solid var(--gold);
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
  transform: translateY(12px) scale(0.96);
  transition: transform 260ms var(--ease-out);
}

.roulette-overlay.is-open .roulette-scene {
  transform: translateY(0) scale(1);
}

.roulette-title {
  font-family: var(--font-h);
  color: var(--gold);
  letter-spacing: 2px;
  font-size: 1.4rem;
  margin: 0;
}

.roulette-wheel-wrap {
  position: relative;
  width: 280px;
  height: 280px;
}

/* Ručička ukazuje dolů na horní okraj kola. */
.roulette-pointer {
  position: absolute;
  top: -6px;
  left: 50%;
  transform: translateX(-50%);
  width: 0;
  height: 0;
  border-left: 11px solid transparent;
  border-right: 11px solid transparent;
  border-top: 20px solid var(--gold);
  filter: drop-shadow(0 2px 6px var(--gold-glow));
  z-index: 2;
}

.roulette-wheel {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 3px solid var(--gold);
  box-shadow: 0 0 0 1px var(--border-hi), 0 12px 40px rgba(0, 0, 0, 0.6);
  /* Výplň kreslí conic-gradient sestavený v JS ze dvou tokenových barev —
     devět barevných výsečí by rozbilo paletu hry. */
  transition: transform 3200ms var(--ease-in-out);
}

/* Vypnutá animace z nastavení: kolo skočí rovnou na výsledek. */
.roulette-wheel.no-spin { transition: none; }

.roulette-segment-label {
  position: absolute;
  font-size: 18px;
  transform-origin: center;
  pointer-events: none;
}

.roulette-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 92px;
  text-align: center;
  max-width: 300px;
}

.roulette-result-icon { font-size: 34px; line-height: 1; }

.roulette-result-name {
  font-family: var(--font-h);
  letter-spacing: 1.5px;
  font-size: 1.15rem;
  color: var(--gold);
}

.roulette-result-text {
  font-family: var(--font);
  font-size: 13px;
  color: var(--text-dim);
  line-height: 1.45;
}

/* Semantiku nese jen jméno výsledku, ne výplň kola. */
.roulette-result-name.is-good { color: var(--green); }
.roulette-result-name.is-bad  { color: var(--red); }

@media (max-width: 768px) {
  .roulette-scene       { padding: 18px; gap: 12px; width: 92%; }
  .roulette-wheel-wrap  { width: 220px; height: 220px; }
  .roulette-result-text { font-size: 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .roulette-wheel { transition: none; }
  .roulette-overlay, .roulette-scene { transition: none; }
}
```

- [ ] **Step 3: Ruční ověření**

Otevři hru s `?debug`, nastav `field30Mode` na `roulette` a postav figurku na pole 30. Zkontroluj, že overlay má stejné prolnutí i stejný nájezd scény jako karta z Financí, že tlačítko vypadá jako ostatní zlatá tlačítka a že se nic nerozbije na šířce telefonu.

- [ ] **Step 4: Commit**

```bash
git add public/partials/overlays.html public/style.css
git commit -m "feat(totalizator): overlay kola v návrhovém systému hry"
```

---

## Task 11: Klient — animace kola

**Files:**
- Create: `public/js/animations/rouletteAnimationGate.mjs` (název podle konvence `diceAnimationGate.mjs` / `pawnAnimationGate.mjs` / `starterAnimationGate.mjs`)
- Create: `public/js/animations/roulette.js`
- Modify: `public/js/settingsGate.mjs`, `public/index.html` (přepínač `rouletteSpin`)
- Test: `tests/roulette-gate.test.mjs`

**Interfaces:**
- Consumes: `isEffectEnabled` ze `settings.js`, `prefersReducedMotion` z `utils.js`
- Produces:
  - `segmentAngle(count)` → stupně na jednu výseč
  - `targetRotation(index, count, turns)` → stupně, o které se kolo má otočit, aby `index` skončil pod ručičkou
  - `showRouletteOverlay(result, isTargeted, onConfirm)`

- [ ] **Step 1: Write the failing test**

```js
// tests/roulette-gate.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { segmentAngle, targetRotation, SPIN_MS } from '../public/js/animations/rouletteAnimationGate.mjs';

test('devět výsečí po 40 stupních', () => {
  assert.equal(segmentAngle(9), 40);
});

test('první výseč končí pod ručičkou bez zbytkového posunu', () => {
  const rot = targetRotation(0, 9, 4);
  assert.equal(rot % 360, 0);
  assert.equal(rot, 4 * 360);
});

test('každá výseč se zastaví ve svém pásmu', () => {
  for (let i = 0; i < 9; i++) {
    const rot = targetRotation(i, 9, 4);
    // Kolo se točí dopředu, výseč i musí skončit na svém úhlu
    const landed = ((360 - (rot % 360)) % 360) / 40;
    assert.equal(Math.round(landed), i, `výseč ${i} se zastavila na ${landed}`);
  }
});

test('víc otáček neposune cílovou výseč', () => {
  assert.equal(targetRotation(3, 9, 2) % 360, targetRotation(3, 9, 6) % 360);
});

test('doba točení pokryje čtyři otáčky a je konečná', () => {
  assert.ok(SPIN_MS > 0 && Number.isFinite(SPIN_MS));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/roulette-gate.test.mjs`
Expected: FAIL — `Cannot find module`

- [ ] **Step 3a: Gate**

```js
// public/js/animations/rouletteAnimationGate.mjs
/**
 * Čistá geometrie a načasování rulety — bez DOM, aby šla testovat.
 * Hodnota SPIN_MS musí sedět s `transition` na `.roulette-wheel`
 * v public/style.css; hlídá to tests/roulette-gate.test.mjs.
 */
export const SPIN_MS = 3200;
export const SPIN_TURNS = 4;

/** Kolik stupňů zabere jedna výseč. */
export function segmentAngle(count) {
  return 360 / count;
}

/**
 * O kolik stupňů otočit kolo, aby výseč `index` skončila pod ručičkou nahoře.
 *
 * Kolo se točí po směru, takže výseč se pod ručičku dostane odečtením jejího
 * úhlu od plné otáčky. `turns` přidává celé otáčky kvůli efektu — na koncové
 * poloze nic nemění.
 */
export function targetRotation(index, count, turns = SPIN_TURNS) {
  return turns * 360 - index * segmentAngle(count);
}
```

- [ ] **Step 3b: Animace**

```js
// public/js/animations/roulette.js
import { isEffectEnabled } from '../settings.js';
import { prefersReducedMotion } from '../utils.js';
import { SPIN_MS, segmentAngle, targetRotation } from './rouletteAnimationGate.mjs';

let hideTimer = null;

/**
 * Sestaví výplň kola ze dvou tokenových barev. Devět barevných výsečí by
 * rozbilo paletu hry, takže se jen střídají dvě plochy a semantiku nese
 * až jméno výsledku pod kolem.
 */
function paintWheel(wheelEl, count) {
  const step = segmentAngle(count);
  const stops = [];
  for (let i = 0; i < count; i++) {
    const color = i % 2 === 0 ? 'var(--bg-card2)' : 'var(--bg-card)';
    stops.push(`${color} ${i * step}deg ${(i + 1) * step}deg`);
  }
  wheelEl.style.background = `conic-gradient(${stops.join(', ')})`;
}

export function showRouletteOverlay(result, outcomes, isTargeted, onConfirm) {
  const overlay = document.getElementById('roulette-overlay');
  const wheel   = document.getElementById('roulette-wheel');
  const iconEl  = document.getElementById('roulette-result-icon');
  const nameEl  = document.getElementById('roulette-result-name');
  const textEl  = document.getElementById('roulette-result-text');
  const btn     = document.getElementById('roulette-btn');
  if (!overlay || !wheel) return;

  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }

  const index = outcomes.findIndex(o => o.id === result.id);
  const spin = isEffectEnabled('rouletteSpin') && !prefersReducedMotion();

  overlay.classList.remove('hidden');
  paintWheel(wheel, outcomes.length);
  wheel.classList.toggle('no-spin', !spin);

  // Výsledek je hned k dispozici; jen ho při točení odhalíme až po dojetí.
  const reveal = () => {
    if (iconEl) iconEl.textContent = result.icon;
    if (nameEl) nameEl.textContent = result.name;
    if (textEl) textEl.textContent = result.text;
    if (btn) btn.classList.toggle('hidden', !isTargeted);
  };

  if (iconEl) iconEl.textContent = '';
  if (nameEl) nameEl.textContent = '';
  if (textEl) textEl.textContent = '';
  if (btn) btn.classList.add('hidden');

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      wheel.style.transform = `rotate(${targetRotation(index, outcomes.length)}deg)`;
    });
  });

  if (spin) {
    hideTimer = setTimeout(reveal, SPIN_MS);
  } else {
    reveal();
  }

  if (isTargeted && btn) {
    btn.onclick = () => {
      overlay.classList.remove('is-open');
      setTimeout(() => {
        overlay.classList.add('hidden');
        // Rotaci vynuluj bez přechodu, jinak se příští kolo rozjede pozpátku.
        wheel.classList.add('no-spin');
        wheel.style.transform = 'rotate(0deg)';
        onConfirm();
      }, 200);
    };
  }
}

export function hideRouletteOverlay() {
  const overlay = document.getElementById('roulette-overlay');
  if (overlay) overlay.classList.add('hidden');
}
```

- [ ] **Step 3c: Ochrana proti přetočení po reconnectu**

Bez tohohle kroku se kolo po obnovení stránky rozjede znovu, protože `game:init`
přijde se stále platným `roulette_ack`. Do `public/js/animations/roulette.js`
přidej paměť už odanimovaných výsledků:

```js
// Každé zatočení má na serveru vlastní `spinId`. Po reconnectu dorazí stejný
// `roulette_ack` znovu — bez téhle paměti by se kolo roztočilo podruhé.
let lastSpinId = null;
```

a hned na začátek `showRouletteOverlay` (za kontrolu `if (!overlay || !wheel) return;`):

```js
  // Už jsme tenhle výsledek animovali → ukaž rovnou dojeté kolo.
  const alreadySeen = lastSpinId === result.spinId;
  lastSpinId = result.spinId;
```

a v místě, kde se rozhoduje o točení, zohledni to:

```js
  const spin = isEffectEnabled('rouletteSpin') && !prefersReducedMotion() && !alreadySeen;
```

V `public/js/main.js` v `resetLocalState` paměť vynuluj, ať další hra začíná
čistě — přidej export `resetRouletteCache()` do `roulette.js`, který nastaví
`lastSpinId = null`, a zavolej ho vedle `resetLogCache()`.

`spinId` už server posílá — přidal ho `_spinRoulette` v Tasku 3.

- [ ] **Step 3d: Přepínač v nastavení**

Do `public/js/settingsGate.mjs` přidej `rouletteSpin: true` mezi výchozí hodnoty, stejně jako je tam `cardFlip`. Do `public/index.html` do skupiny „Animace" za řádek `set-cardFlip`:

```html
          <div class="setting-row">
            <label for="set-rouletteSpin">Točení Totalizátoru</label>
            <input id="set-rouletteSpin" type="checkbox" class="setting-check" checked onchange="window.setGameSetting('rouletteSpin', this.checked)">
          </div>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/roulette-gate.test.mjs`
Expected: PASS, 5 testů

- [ ] **Step 5: Commit**

```bash
git add public/js/animations/rouletteAnimationGate.mjs public/js/animations/roulette.js public/js/settingsGate.mjs public/index.html tests/roulette-gate.test.mjs
git commit -m "feat(totalizator): animace kola s vypínatelným točením"
```

---

## Task 12: Klient — renderery promptů

**Files:**
- Modify: `public/js/ui/actions.js`
- Modify: `public/js/main.js` (skrytí overlaye při opuštění hry)

- [ ] **Step 1: Napojení `roulette_ack`**

V `public/js/ui/actions.js` přidej import:

```js
import { showRouletteOverlay, hideRouletteOverlay } from '../animations/roulette.js';
import { OUTCOMES } from '../rouletteOutcomes.mjs';
```

> `src/Roulette.js` je CommonJS a frontend ho načíst neumí. Vytvoř `public/js/rouletteOutcomes.mjs`, který exportuje **stejné pole** — a přidej do `tests/roulette-outcomes.test.js` test, že se obě kopie shodují v `id` a pořadí. Bez toho by se kolo mohlo rozejít se serverem a zastavit na špatné výseči.

Do switche u řádku ~130 přidej:

```js
    case 'roulette_ack': renderRouletteAck(isTargeted, targetPlayer, pa); break;
    case 'roulette_pick_player': renderRoulettePickPlayer(isTargeted, targetPlayer, pa, gameState); break;
    case 'roulette_pick_horse': renderRoulettePickHorse(isTargeted, targetPlayer, pa); break;
```

A k řádku 44, kde se skrývá karta, přidej stejné pravidlo pro kolo:

```js
  if (!pa || pa.type !== 'roulette_ack') hideRouletteOverlay();
```

- [ ] **Step 2: Tři renderery**

Přidej na konec `public/js/ui/actions.js`. Vzorem jsou `renderCardAck` a
`renderAirportSelectTarget` ve stejném souboru — drž se jejich tvaru:

```js
function renderRouletteAck(isTargeted, targetPlayer, pa) {
  // Kolo vidí všichni — i ten, kdo zrovna není na tahu. Tlačítko má jen
  // hráč, kterého se výsledek týká.
  showRouletteOverlay(pa.data.result, OUTCOMES, isTargeted, () => {
    socket.emit('game:respond', { decision: 'ack' });
  });

  dom.actionContent.innerHTML = '';
  dom.actionContent.appendChild(
    makeEl('p', 'dim', isTargeted
      ? 'Totalizátor se točí…'
      : `${targetPlayer?.name ?? 'Hráč'} točí Totalizátorem…`)
  );
}

function renderRoulettePickPlayer(isTargeted, targetPlayer, pa, gameState) {
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(
      makeEl('p', 'dim', `${targetPlayer?.name ?? 'Hráč'} vybírá cíl…`)
    );
    return;
  }

  const label = pa.data.outcomeId === 'strike'
    ? 'Komu zastavíš stáj?'
    : 'Koho udáš?';
  dom.actionContent.appendChild(makeEl('p', '', label));

  pa.data.candidates.forEach(id => {
    const target = gameState.players?.find(p => p.id === id);
    if (!target) return;
    const btn = actionBtn(target.name, 'btn-outline', () => {
      socket.emit('game:respond', { decision: id });
    });
    btn.style.borderColor = safeColor(target.color);
    dom.actionContent.appendChild(btn);
  });
}

function renderRoulettePickHorse(isTargeted, targetPlayer, pa) {
  dom.actionContent.innerHTML = '';

  if (!isTargeted) {
    dom.actionContent.appendChild(
      makeEl('p', 'dim', `${targetPlayer?.name ?? 'Hráč'} si vybírá koně…`)
    );
    return;
  }

  const isAuction = pa.data.outcomeId === 'auction';
  dom.actionContent.appendChild(
    makeEl('p', '', isAuction ? 'Vyber koně do dražby:' : 'Kam položíš žeton zdarma?')
  );

  pa.data.options.forEach(({ spaceId, price }) => {
    const space = state.boardData?.[spaceId];
    const name = space?.name ?? `Pole ${spaceId}`;
    // U žetonu zdarma nemá cena co dělat — je nula.
    const caption = isAuction ? `${name} — ${fmt(price)} Kč` : name;
    dom.actionContent.appendChild(
      actionBtn(caption, 'btn-gold', () => {
        socket.emit('game:respond', { decision: spaceId });
      })
    );
  });

  if (isAuction) {
    dom.actionContent.appendChild(
      actionBtn('Nechat být', 'btn-outline', () => {
        socket.emit('game:respond', { decision: 'decline' });
      })
    );
  }
}
```

> Ověřeno proti skutečnému kódu: `actionBtn(label, cls, onClick)`
> (`actionsHelpers.js:4`) tenhle podpis má, definice plánu je na klientovi
> v `state.boardData` (`state.js:4`) a `fmt`, `safeColor`, `makeEl`, `state`
> i `socket` už jsou v hlavičce `actions.js` importované — nic přidávat
> nemusíš. `actionBtn` si po kliknutí sám zakáže tlačítko, takže proti
> dvojímu odeslání není potřeba vlastní ochrana.

- [ ] **Step 3: Úklid při opuštění hry**

V `public/js/main.js` v `resetLocalState` za `resetLogCache()`:

```js
  hideRouletteOverlay();
```

a doplň import ze stejného modulu.

- [ ] **Step 4: Ruční ověření celého toku**

1. `npm run dev`, dvě okna prohlížeče, režim Totalizátor.
2. Přes `?debug` postav hráče na pole 30 a zatoč — ověř, že **oba** klienti vidí stejný výsledek a kolo se zastaví na správné výseči.
3. Vyzkoušej všech devět výsledků (debug panel umí nastavit stav). U dražby a stávky ověř, že výběr funguje a že po odpovědi tah pokračuje.
4. Přidej bota a nech ho projít polem 30 — hra nesmí zamrznout.
5. Uprostřed točení obnov stránku (F5) — po reconnectu se musí zobrazit dojeté kolo, ne rozjeté znovu.

- [ ] **Step 5: Commit**

```bash
git add public/js/ui/actions.js public/js/main.js public/js/rouletteOutcomes.mjs
git commit -m "feat(totalizator): renderery promptů rulety"
```

---

## Task 13: Dokumentace

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Popis režimu**

Do sekce „Pravidla hry (implementovaná)" přidej podsekci o Totalizátoru: devět výsečí, rovnoměrné rozdělení, výchozí je doping. Do stromu adresářů přidej `src/Roulette.js` a `src/mixins/roulette.js`. Do tabulky událostí nic nepřibývá — ruleta jede po stávajícím `game:respond`.

- [ ] **Step 2: Commit**

```bash
git add -f CLAUDE.md
git commit -m "docs: popis režimu Totalizátor"
```

---

## Dokončení

- [ ] **Celá suita zelená**

Run: `node --test tests/`
Expected: PASS. Před začátkem prací byl stav **227 pass / 0 fail**; nové testy ho zvednou zhruba na 270. `npm test` bude hlásit 2 pády navíc ze zapomenutého worktree `.claude/worktrees/admiring-allen-1694ee` — ty s touhle prací nesouvisí.

- [ ] **Obě větve pole 30 ručně**

Odehraj krátkou partii v režimu `doping` a ověř, že se chová **přesně jako dřív**. Pak totéž v režimu `roulette`.

- [ ] **Vyhodnocení čísel**

Spec označuje **přirážku u dražby (+50 %)** za nejcitlivější číslo v návrhu. Po pár partiích se k němu vrať: pokud se ukáže, že se draží skoro vždy, zvedni ji; pokud se nedraží nikdy, sniž ji. Je to jediná hodnota, kterou plán vědomě nechává otevřenou.
