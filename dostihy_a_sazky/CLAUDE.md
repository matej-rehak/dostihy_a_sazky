# CLAUDE.md

> Tento soubor čte Claude Code automaticky na začátku každé session.

---

## Projekt

**Co to je:** Digitální multiplayer verze české deskové hry **Dostihy a sázky** (1984, autor Ladislav Mareš) — obdoba Monopoly s koňmi.  
**Stack:** Node.js · Express · Socket.IO · JWT (backend) | Vanilla HTML + CSS + JS (frontend, žádný build step)  
**Repozitář:** `c:\Users\Matej\Desktop\dostihy_a_sazky\dostihy_a_sazky`  
**Stav:** ✅ Plně funkční desková hra — lobby, hra, žetony, karty, obchod, reconnect

---

## Příkazy

```bash
npm install      # instalace závislostí
npm run dev      # vývoj (nodemon server.js)
npm start        # produkce (node server.js)
```

Server běží na: **http://localhost:3001**  
Frontend se servíruje jako statické soubory z `public/` — žádný build krok není potřeba.

---

## Adresářová struktura

```
server.js                   ← HTTP + Socket.IO server, správa místností, reconnect
├── src/
│   ├── GameEngine.js       ← Hlavní třída hry (složena z mixinů přes Object.assign)
│   ├── Cards.js            ← Balíčky karet Finance a Náhoda
│   ├── auth.js             ← JWT generování / ověřování (playerId persistence)
│   ├── constants.js        ← BOARD_SIZE, JAIL_*, ACTION_DELAY_MS, PLAYER_COLORS, roll(), fmt()
│   ├── data/
│   │   └── boardData.js    ← Definice všech 40 políček herního plánu
│   └── mixins/             ← Logika hry rozdělena do mixinů
│       ├── state.js        ← _buildState, sendInit, _broadcast, _addLog, _scheduleAction
│       ├── lobby.js        ← addPlayer, removePlayer, toggleReady, startGame, updateConfig
│       ├── turns.js        ← _startTurn, handleRoll, _advanceTurn
│       ├── movement.js     ← _movePlayer, _evaluateSpace
│       ├── actions.js      ← handleRespond, _handleBuy, _handleSell, _handleRent, _handleJail…
│       ├── cards.js        ← _applyCard (Finance / Náhoda karty)
│       ├── economy.js      ← _buyProperty, _sellProperty, _calcRent, _transfer, _calcAssetsValue, bankrot
│       ├── tokens.js       ← _addToken, _eligibleTokenSpaces, _offerTokensOrEnd
│       ├── trade.js        ← initiateTrade (nabídka obchodu mezi hráči)
│       └── debug.js        ← handleDebugSetState (rychlé nastavení stavu v dev módu)
├── public/
│   ├── index.html          ← Shell stránka (jen head + #app-root + scripty — žádné views)
│   ├── style.css           ← Veškeré CSS (design systém, animace, responzivita)
│   ├── partials/           ← HTML fragmenty; main.js je načítá přes fetch() a injectuje do #app-root
│   │   ├── overlays.html   ← Globální overlays (reconnect, starter animace, karta, tooltip, toast)
│   │   ├── intro.html      ← intro-view (výběr / vytváření místností)
│   │   ├── lobby.html      ← lobby-view (formulář, hráči, nastavení hostitele)
│   │   └── game.html       ← game-view (herní plán, right panel, debug panel)
│   └── js/
│       ├── main.js         ← Bootstrap: loadPartials() → async IIFE → socket listenery + init
│       ├── socket.js       ← Socket.IO klientská instance
│       ├── state.js        ← Klientský stav (gameState, myId, boardBuilt, …)
│       ├── dom.js          ← Lazy gettery přes Object.defineProperty (getElementById při každém přístupu)
│       ├── utils.js        ← Pomocné funkce (fmt, esc, getEl, makeEl, showToast)
│       ├── ui/             ← UI moduly (každý zodpovídá za svou část DOM)
│       │   ├── actions.js  ← Herní tlačítka, odpovědní dialogy (koupit/prodat/…)
│       │   ├── board.js    ← Vykreslování herního plánu a figurek
│       │   ├── debug.js    ← Debug panel (jen při URL ?debug, nastavení stavu)
│       │   ├── lobby.js    ← Lobby obrazovka (seznam místností, join, create)
│       │   ├── log.js      ← Herní log zpráv
│       │   ├── players.js  ← Panel hráčů (barva, peníze, majetek)
│       │   └── tooltip.js  ← Tooltips nad políčky herního plánu
│       └── animations/     ← Canvas / CSS animace
│           ├── cards.js    ← Animace tažení karty
│           ├── dice.js     ← Animace hodu kostkou
│           ├── particles.js← Particle efekty
│           ├── pawns.js    ← Pohyb figurek po plánu
│           └── starter.js  ← Úvodní animace při spuštění
├── agents/                 ← AI agentní systém (orchestrátor pattern)
│   ├── AGENTS.md           ← Role a pravidla každého agenta
│   ├── TASKS.md            ← Fronta úkolů
│   ├── MEMORY.md           ← Technická rozhodnutí a poznatky
│   └── CONTEXT.md          ← Kontext projektu pro agenty
└── prompts/                ← Systémové prompty pro jednotlivé agenty
```

### Partials systém (jak funguje)

HTML views jsou rozděleny do `public/partials/*.html`. Soubory jsou čisté HTML fragmenty (bez `<html>/<body>` wrapperů), servírované jako statika přes Express.

**Tok inicializace v `main.js`:**
1. `socket.on('game:token', …)` se registruje hned — DOM nepotřebuje
2. `await loadPartials()` — fetch všech 4 partials paralelně, inject do `#app-root`
3. Teprve potom se registrují socket listenery závislé na DOM (`disconnect`, `room:list`, `game:init`, …)

**`dom.js` — lazy gettery:**  
`dom.introView` apod. nejsou uložené reference, ale `Object.defineProperty` gettery, které volají `document.getElementById()` při každém přístupu. To zajišťuje správnost i po dynamickém vložení HTML.  
⚠️ Nevolej `dom.X` před dokončením `loadPartials()` — element ještě neexistuje.

---

## Architektura backendu

### GameEngine (mixin pattern)
`GameEngine` je třída sestavená přes `Object.assign(GameEngine.prototype, ...mixins)`. **Nezasahuj do třídy samotné** — veškerá logika patří do příslušného mixinu.

### Socket.IO události (server → klient)
| Událost | Kdy se posílá |
|---------|--------------|
| `room:list` | Změna seznamu místností |
| `game:init` | Připojení / reconnect hráče — plný stav |
| `game:state` | Každá změna stavu hry |
| `game:token` | JWT po přihlášení nebo reconnectu |
| `game:prompt` | Interaktivní volba pro aktuálního hráče |
| `game:log` | Nový záznam do herního logu |
| `game:error` | Chybová zpráva |

### Socket.IO události (klient → server)
| Událost | Popis |
|---------|-------|
| `room:list` | Vyžádání seznamu místností |
| `room:create` | Vytvoření místnosti (`{ name, password }`) |
| `room:join` | Připojení do místnosti (`{ roomId, password }`) |
| `game:join` | Přihlášení jako hráč (`{ name, color }`) |
| `game:ready` | Přepnutí ready stavu |
| `game:update_config` | Změna konfigurace (`startBalance`, `startBonus`, atd.) |
| `game:start` | Spuštění hry |
| `game:roll` | Hod kostkou |
| `game:respond` | Odpověď na prompt (`{ action, payload }`) |
| `game:trade_init` | Zahájení obchodu |
| `game:debug_set_state` | Debug override stavu |

### Reconnect
Hráč má **30 s** grace period po odpojení (`RECONNECT_GRACE_MS = 30_000`). JWT v `localStorage` zajišťuje persistence `playerId` mezi refreshi.

---

## Pravidla hry (implementovaná)

### Základní info
- Typ: Strategická desková hra (obdoba Monopoly)
- Hráči: 2–6, plán: 40 políček
- Výchozí startovní kapitál: **30 000 Kč**, průchod STARTem: **+4 000 Kč**

### Koně — 8 stájí, 22 koní
| Stáj (barva) | Koně |
|---|---|
| Oranžová | Fantome, Gavora |
| Hnědá | Lady Anne, Pasek, Koran |
| Modrá | Neklan, Portland, Japan |
| Světle zelená | Kostrava, Lukava, Melák |
| Růžová | Grifel, Mohyla, Metál |
| Žlutá | Tara, Furioso, Genius |
| Tmavě zelená | Shagga, Dahoman, Gira |
| Fialová | Narcius, Napoli |

### Průběh tahu
1. Hod kostkou → pohyb figurky
2. Šestka = právo na další hod
3. Volný kůň → nabídka koupě
4. Kůň soupeře → platba nájmu (násobí se žetony dostihů)
5. Vlastní celá stáj + stojíš na svém koni → možnost přidat žeton dostihů (jen na políčko, kde stojíš)
6. Finance / Náhoda → tažení karty
7. Distanc (pole 10) = Vězení; trest: 3 000 Kč nebo 3 kola čekání

### Tokeny dostihů
- Max 4 malé + 1 velký žeton na koně
- Nájem roste s počtem žetonů (řeší `EconomyMixin._calcRent`)

### Konec hry
- Hráč bez peněz → bankrot → vypadá ze hry
- Vítěz: poslední zbývající hráč

---

## Kódovací konvence

- **Jazyk:** JavaScript (ES2020+), `'use strict'` v každém souboru
- **Moduly:** CommonJS (`require` / `module.exports`) na backendu, ESM (`import` / `export`) **není** — frontend používá klasické `<script>` tagy
- **Naming:** camelCase pro proměnné/funkce, PascalCase pro třídy, SCREAMING_SNAKE pro konstanty
- **Formát:** bez builderu — edituj přímo soubory v `public/`
- **Async:** Socket.IO callbacky, žádné Promise chains v herní logice
- **Chyby:** zachytávej explicitně; na klientovi používej `socket.on('game:error', ...)`, na serveru `socket.emit('game:error', { message })`
- **Debug panel:** viditelný jen pokud URL obsahuje `?debug`

---

## Kdy se zeptat uživatele

Před těmito akcemi vždy požádej o potvrzení:
- Smazání souborů nebo dat
- Změna herních pravidel (konstanty, výpočty nájmu, ceny karet)
- Přidání nové závislosti do `package.json`
- Změna Socket.IO API (přidání/odebrání události)
- Jakákoli změna `agents/` souborů

---

## Agentní systém

Složka `agents/` implementuje orchestrátor pattern pro AI-asistovaný vývoj:
- `AGENTS.md` — role a pravidla každého agenta (nečti ani nepiš v souborech agentů bez zadání)
- `TASKS.md` — fronta úkolů (stav: `todo → in_progress → review → done`)
- `MEMORY.md` — technická rozhodnutí a poznatky (nikdy nesmazávat)
- `CONTEXT.md` — kontext projektu

---

## Aktuální focus

> Aktualizuj tuto sekci při zahájení každé nové fáze práce.

**Aktuální úkol:** —  
**Kontext:** —  
**Hotovo bude:** —
