# Herní bot (AI hráč) — design

**Datum:** 2026-09-19
**Stav:** schváleno, čeká na implementační plán

---

## 1. Cíl

Přidat do hry počítačem řízeného hráče („bota"), kterého hostitel přidá v lobby stejně
snadno jako člověka. Bot odehraje celou partii bez zásahu člověka a umí **hospodařit
s penězi** — nekupuje všechno, na co má, drží rezervu úměrnou hrozbě a využívá letiště,
když se mu to vyplatí.

**Není cílem:** silný protivník. Bot nesimuluje tahy dopředu, nepočítá pravděpodobnosti
karet a sám nenabízí obchody.

---

## 2. Klíčová zjištění z kódu

Tři fakta z enginu, na kterých celý design stojí:

1. **Engine nepotřebuje skutečný socket.** `_handleTurnTimeout` (`src/mixins/actions.js:104`)
   už volá `this.handleRoll({ playerId: targetId, emit: () => {} })`. Všechny vstupní
   metody (`handleRoll`, `handleRespond`) čtou ze socketu jen `playerId` a případně volají
   `emit` pro chybovou hlášku. Bot tedy nepotřebuje síť ani `socket.io-client`.

2. **Monopol sám o sobě nájem nezvyšuje.** `_calcRent` (`src/mixins/economy.js:110-130`)
   vrací `rents[0]` i na kompletní stáji, dokud na ní nestojí žeton. Na rozdíl od Monopoly
   tu **kompletace stáje bez peněz na žetony nemá žádnou návratnost.** To je hlavní důvod,
   proč naivní pravidlo „kup, když na to máš" hraje špatně.

3. **Žetony nefungují, když je majitel v Distancu nebo pod podezřením z dopingu**, a nefungují
   bez monopolu. Odhad nájmu to musí zohlednit.

Dále:

- `players` je `Map` klíčovaná `playerId` (komentář v `GameEngine.js` říká `socketId`, ale
  zapisuje se `socket.playerId`).
- `_setPendingAction` je jediná cesta, kudy se `pendingAction` mění → jediný spolehlivý hook.
- `_buildState` odstraňuje jen `socketId`; pole `isBot` projde na klienta beze změny.
- `_handleTradeResponse` (`src/mixins/actions-trade.js:21`) odstraní nabídku z fronty
  **pro všechny**. Bot proto nesmí odpovídat na veřejné nabídky (`targetId === null`).

---

## 3. Architektura

### 3.1 Komponenty

| Soubor | Odpovědnost | Nový? |
|---|---|---|
| `src/Bot.js` | **Čistá rozhodovací logika.** Žádné side-effecty, timery ani sockety. | ano |
| `src/mixins/bots.js` | `addBot`, `removeBot`, `_notifyBots`, `_botAct` — „kdy" a „jak doručit". | ano |
| `src/GameEngine.js` | +`this._botTimers = new Map()`, +volání `_notifyBots()` v `_setPendingAction`, +mixin v `Object.assign` | úprava |
| `server.js` | 2 nové Socket.IO události | úprava |
| `public/partials/lobby.html` | tlačítko „Přidat bota" | úprava |
| `public/js/ui/lobby.js` | obsluha tlačítka + křížek u bota | úprava |

Hranice je záměrná: **veškerá inteligence je v `src/Bot.js` jako čisté funkce.** Testuje se
bez serveru, bez socketů a bez časovačů — stejným stylem jako stávající testy v `tests/`.

### 3.2 Veřejné rozhraní `src/Bot.js`

```js
// Jediný vstupní bod. Vrací co má bot udělat, nebo null (nereagovat).
decideAction(ctx, botId)
  // → { kind: 'roll' }
  // → { kind: 'respond', data: { decision, spaceId?, tokenType?, tradeOfferId? } }
  // → null

// Exportováno kvůli testům:
estimateRent(ctx, spaceId, dice)   // odhad — viz 5.1
calcReserve(ctx, botId)            // dynamická rezerva — viz 5.2
scoreSpace(ctx, botId, spaceId)    // skóre pole pro letiště — viz 5.6
```

`ctx` je běžný snapshot enginu: `{ players, ownerships, tokens, config, round,
pendingAction, tradeOffers, lastDice }`. Předává se přímo instance enginu — čisté funkce
z ní jen čtou.

### 3.3 Datový model bota

Bot je normální záznam v `players`:

```js
{
  id: `bot-${n}`,
  socketId: null,
  isBot: true,
  ready: true,
  isHost: false,
  disconnected: false,
  // ...zbytek polí identický s lidským hráčem (viz addPlayer v lobby.js)
}
```

Doručení do enginu přes fake socket — vzor, který engine už používá:

```js
const botSocket = { playerId: botId, id: null, emit: () => {} };
```

Protože `socketId` je `null` a bot nemá připojení, nikdy ho netrefí `disconnect` handler
ani grace period v `server.js`.

### 3.4 Řízení — kdy bot hraje

```
_setPendingAction(action)
        ↓
   _notifyBots()
        ↓
   je pendingAction.targetId bot?
        ↓
   setTimeout(BOT_THINK_MS = 800)   → uloženo v this._botTimers
        ↓
   guard: phase === 'playing' && this.pendingAction === zachycená akce
        ↓
   Bot.decideAction() → handleRoll(botSocket) | handleRespond(botSocket, data)
```

Tři guardy proti třem konkrétním rizikům:

| Riziko | Ošetření |
|---|---|
| Re-entrance — bot odpoví synchronně do rozdělaného stavu | vždy přes `setTimeout`, nikdy ne inline |
| Zastaralý timer přepíše novější `pendingAction` | identity check `this.pendingAction === capturedAction` (stejný princip jako guard z fixu `trade-debt-resume`) |
| Turn timeout zahraje za bota | `BOT_THINK_MS = 800` je výrazně méně než `turnTimeLimitSeconds` (min. 1 s) |

Timery se ruší v `_endGame` a `removeBot`.

> **Revize při psaní plánu (2026-09-19):** tenhle hook má dva deadlocky.
> (1) Obchodní nabídka na bota, který není na tahu, ho nikdy neprobudí, protože
> `pendingAction.targetId` patří někomu jinému. (2) `_handleTradeResponse` nevolá
> `_setPendingAction`, takže po odmítnutí nabídky se bot znovu neprobudí a
> nedokončí vlastní tah. Plán proto `_notifyBots()` pouští přes **všechny boty**,
> rozhodnutí počítá až ve chvíli, kdy timer vystřelí (zastaralé rozhodnutí tím
> nemůže vzniknout a identity check odpadá), a `_botAct` na konci volá
> `_notifyBots()` znovu. Detaily v sekci „Odchylka od specu 3.4" v plánu.

### 3.5 Socket.IO API

Dvě nové události, obě klient → server, obě jen pro hostitele v lobby.
Žádná nová událost server → klient — bot se propaguje běžným `game:state`.

| Událost | Payload | Chování |
|---|---|---|
| `game:add_bot` | — | Přidá bota. Odmítne když `phase !== 'lobby'`, `players.size >= 6`, nebo odesílatel není host. |
| `game:remove_bot` | `{ botId }` | Odebere bota. Jen v lobby, jen host, jen záznam s `isBot === true`. |

---

## 4. Rozhodovací tabulka

Celý rozhodovací prostor = typy `pendingAction`, kde `targetId` je bot.

| `pendingAction.type` | Rozhodnutí | Detail |
|---|---|---|
| `wait_roll`, `service_roll` | `handleRoll()` | bez volby |
| `card_ack` | potvrdit | bez volby |
| `buy_offer` | `buy` / `decline` | 5.3 |
| `buyout_offer` | `buy` / `decline` | 5.4 |
| `token_manage` | `add_token` / `end_turn` | 5.5 |
| `airport_choice` | `fly` / `roll` | 5.6 |
| `airport_select_target` | `spaceId` / `cancel` | 5.6 |
| `jail_choice` | `use_jail_card` má-li kartu, jinak `roll_jail` | — |
| `debt_manage` | `sell_property` / `sell_token` / `declare_bankrupt` | 5.7 |
| `trade_offer` | `decline`, a to jen když `targetId === botId` | 5.8 |
| `insufficient_funds`, `selecting_starter` | `null` — nereagovat | engine dořeší sám |

Fronta `tradeOffers` se vyhodnocuje zvlášť, viz 5.8.

---

## 5. Heuristiky

### 5.1 `estimateRent(ctx, spaceId, dice)`

Odhad nájmu, který by bot zaplatil. Nemůže volat `_calcRent` — ta je metodou enginu
a loguje. Reimplementuje stejná pravidla:

- **trenér:** `počet trenérů majitele × 1000`
- **přeprava/stáje:** `(majitel má obě ? 200 : 80) × dice` (pro odhady bez konkrétní kostky `dice = 3.5`)
- **kůň:** `rents[0]`, pokud majitel nemá monopol, je v Distancu (`inJail`) nebo má
  `skipTurns > 0`; jinak `rents[5]` při velkém žetonu, jinak `rents[tok.small]`

**Riziko rozjetí s enginem** řeší test v kapitole 6: matice cca 20 stavů porovnaná proti
skutečnému `_calcRent`. Když se engine změní, test spadne.

### 5.2 `calcReserve(ctx, botId)` — dynamická rezerva

```
threatRent = max( estimateRent(ctx, s) přes všechna pole vlastněná soupeři )
reserve    = clamp(threatRent, 2000, 12000)
if (ctx.round <= 3) reserve = reserve * 0.6
```

Bot drží hotovost úměrnou tomu, co mu reálně hrozí — proti Napoli s velkým dostihem
(nájem 40 000) šetří jinak než ve 2. kole proti prázdnému plánu.

### 5.3 Nákup koně / služby (`buy_offer`)

Vyhodnocuje se shora dolů, první shoda vyhrává. `zbyde = balance − price`.

| Podmínka | Akce |
|---|---|
| **Blokace** — soupeř vlastní zbytek stáje a tohle je poslední volný kůň | kup, pokud `zbyde >= reserve` |
| **Kompletuje stáj** | kup, pokud `zbyde >= reserve + tokenCost` |
| **Postupuje ve stáji** — bot už ve stáji koně má a zbytek je volný | kup, pokud `zbyde >= reserve + tokenCost` |
| **Trenér** | kup, pokud `zbyde >= reserve` |
| **Přeprava / Stáje** | kup jen pokud bot už vlastní tu druhou, a `zbyde >= reserve` |
| **Osamocený kůň ve stáji, kterou drží někdo jiný** | odmítni |
| zbytek | kup, pokud `zbyde >= reserve × 2` |

Podmínka `reserve + tokenCost` u kompletace i postupu je přímý důsledek zjištění č. 2
v kapitole 2: monopol bez peněz na žeton nevydělává nic.

### 5.4 Nepřátelský odkup (`buyout_offer`)

Kup jen když odkup kompletuje botovi stáj **a** zbyde `reserve + tokenCost`. Jinak odmítni.
(Engine nabízí odkup jen když majitel nemá monopol — viz `_offerBuyoutOrEnd`.)

### 5.5 Žetony (`token_manage`)

Stavba je jediný způsob, jak bot vydělává, takže je agresivnější než nákup:
`add_token`, pokud `balance − cost >= reserve`. Typ (malý/velký) určuje engine sám
podle `tok.small >= 4`.

### 5.6 Letiště (`airport_choice`, `airport_select_target`)

`scoreSpace(ctx, botId, spaceId)`. Všechna skóre jsou v korunách, aby se dala přímo
porovnat s `airportFee`:

| Pole | Skóre |
|---|---|
| Volný kůň, kterého by bot podle 5.3 koupil, a to jako blokaci nebo kompletaci | `+ price` |
| Volný kůň, kterého by bot podle 5.3 koupil jako postup ve stáji | `+ price / 2` |
| Volný kůň, kterého by bot podle 5.3 nekoupil | `0` |
| Vlastní kůň s monopolem, kde jde postavit žeton | `+ tokenCost` |
| Soupeřův kůň / služba | `− estimateRent()` |
| `jail` (pole 10 — `_evaluateSpace` ho řeší jako `go_to_jail`), `skip_turn` | `− 8000` |
| `tax` | `− amount` |
| START a jeho průchod po cestě | `0` — viz poznámka níže |
| ostatní | `0` |

> **Revize při psaní plánu (2026-09-19):** původní návrh dával za START a jeho
> průchod `+ startBonus`. To bota degeneruje — z pole 20 obyčejný hod STARTem
> nikdy neprojde, takže jakýkoli let přes START vychází na `+4000 − 2000` a bot
> by létal pokaždé, i na prázdném plánu. Průchod STARTem ale není zásluha letu;
> bot ho dostane i obyčejnou chůzí, let ho jen uspíší. Bonus se proto neskóruje
> a let musí obhájit sám cíl.

Rozhodnutí:

```
best     = max( scoreSpace(s) ) přes všechna pole s ≠ pozice
expected = průměr( scoreSpace(pozice + 1 … pozice + 6) )

fly, pokud  best − expected > config.airportFee  a zároveň bot má na fee
jinak roll
```

V `airport_select_target` bot pošle `spaceId` vítězného pole. Pokrývá oba případy: útěk
před drahým nájmem i skok na koně, kterého bot chce.

### 5.7 Dluhy (`debt_manage`)

Prodej je za 50 %, takže cíl je prodat **co nejméně a to nejpostradatelnější**.

1. Kandidáti seřazeni podle postradatelnosti:
   kůň mimo monopol a bez žetonů → kůň mimo monopol → služba → kůň v monopolu (poslední,
   ničí to celou stáj)
2. V rámci první neprázdné skupiny vyber **nejlevnějšího, který sám pokryje dluh**;
   když žádný nestačí, nejdražšího (minimalizuje počet prodejů)
3. Žetony (`sell_token`) prodávej až když nezbývají žádní postradatelní koně
4. `declare_bankrupt` jako pojistka — engine tenhle prompt normálně nabídne jen když
   dluh pokrýt lze (`_scheduleAction` jinak vyhlásí bankrot sám)

Jedna akce na prompt; engine se po každém prodeji doptá znovu.

### 5.8 Obchody

- `pendingAction.type === 'trade_offer'` a `targetId === botId` → `decline`
- Fronta `tradeOffers`: bot odpovídá `decline` jen na položky s `targetId === botId`
- **Veřejné nabídky (`targetId === null`) bot ignoruje úplně** — `_handleTradeResponse`
  je odstraní z fronty pro všechny hráče, takže by odmítnutím botem zmizely i lidem

---

## 6. Testy

`tests/bot-decisions.test.js` — čisté funkce, bez enginu:

- jeden test na řádek tabulky 5.3 (blokace, kompletace s penězi na žeton i bez nich, postup,
  trenér, přeprava sólo i v páru, osamocený kůň, zbytek)
- `calcReserve`: prázdný plán → 2000; Napoli s velkým dostihem → 12000 (clamp);
  `round <= 3` → ×0.6
- `scoreSpace`: záporné skóre na `go_to_jail`, bonus za průchod STARTem
- rozhodnutí o letu: leť za volným koněm; neleť, když rozdíl nepřesáhne `airportFee`
- `debt_manage`: pořadí postradatelnosti; výběr nejlevnějšího pokrývajícího dluh
- žetony: staví, dokud zbývá rezerva

`tests/bot-rent-estimate.test.js` — **matice proti enginu:**
cca 20 kombinací (monopol ano/ne × žetony 0–4 i velký × majitel v Distancu / doping / normální
× trenér 1–4 × přeprava sólo i se stájemi) porovnaných `estimateRent()` vs. skutečné
`_calcRent()`. Pojistka proti rozjetí obou implementací.

`tests/bot-integration.test.js` — reálný `GameEngine`, 1 bot + 1 fake člověk, řízené timery:

- bot odehraje celý tah (`wait_roll` → pohyb → `buy_offer` → konec tahu)
- zastaralý timer neodpoví na cizí `pendingAction` (identity guard)
- bot neodpoví na veřejnou trade nabídku, ale odmítne cílenou
- `addBot` respektuje limit 6 hráčů a fázi lobby

---

## 7. Mimo rozsah (YAGNI)

- bot sám nenabízí obchody (`game:trade_init`)
- žádná dopředná simulace tahů ani skórování pravděpodobností karet
- žádné úrovně obtížnosti
- bota nelze přidat do rozehrané hry
- bot se nepřizpůsobuje stylu konkrétního soupeře

---

## 8. Odhad rozsahu

Cca 400 řádků nového kódu (z toho cca 250 čistá logika v `src/Bot.js`), cca 30 řádků úprav
stávajících souborů, cca 25 testů.
