# Totalizátor — volitelná náhrada pole Podezření z dopingu

**Datum:** 2026-09-20
**Stav:** návrh ke schválení
**Pole:** 30 (čtvrtý roh plánu)

---

## Proč

Pole 0/10/20/30 jsou čtyři rohy plánu: START, Distanc, Parkoviště, Podezření
z dopingu. Roh 20 už má volitelný režim (`field20Mode`: parkoviště / letiště).
Roh 30 dostane tu samou volbu: `field30Mode` (doping / totalizátor).

Totalizátor je ruleta o devíti výsečích. Klíčové omezení návrhu: **nesmí
dělat to, co už umí karty.**

### Co karty pokrývají

Všech 28 karet (14 Finance + 14 Náhoda) se vejde do dvou os:

- **peníze** — `pay` 100/400/1000/2000/3000, `gain` 500/1000/2000/2000/3000/4000,
  `collect_from_all` 200, dvakrát `pay_per_token_custom`
- **pohyb a čas** — sedm přesunů, tři `skip_turn`, `go_to_jail`, `jail_free_card`

### Co v nich není ani jednou

- vlastnictví koní — žádná karta nesáhne na majetek
- žetony dostihů — karty za ně jen platí, nikdy je nepřidají
- nájem — žádná karta ho neovlivní
- cílení na konkrétního soupeře (jediná výjimka je výběr 200 Kč od všech)
- jakákoli volba hráče — karta se vždy jen stane
- sázka — hra se jmenuje „Dostihy a **sázky**" a sázet se v ní nedá

Devět výsečí Totalizátoru stojí výhradně na těchto osách.

---

## Devět výsečí (rovnoměrně, 11,1 %)

| # | Efekt | Popis | Osa |
|---|---|---|---|
| 1 | 🎲 **Sázka na vlastní hod** | Vsadíš 5 000 Kč. Příští hod 5–6 → dostaneš 15 000 Kč, jinak sázka propadá | sázka |
| 2 | 🏇 **Dražba** | Koupíš libovolného volného koně za cenu **+50 %** | majetek + volba |
| 3 | 🎟️ **Přednostní právo** | Příští volný kůň, na kterého došlápneš, je za **polovinu** | majetek |
| 4 | 🏗️ **Dostih zdarma** | Položíš malý žeton na svého koně bez placení | žetony + volba |
| 5 | 💵 **Dvojitý nájem** | Příští nájem, který vybereš, je dvojnásobný | nájem |
| 6 | 🛡️ **Imunita** | Příští nájem, který bys platil, je zdarma | nájem |
| 7 | 🚧 **Stávka ve stáji** | Vybranému soupeři nefungují žetony 1 kolo | nájem + cílení |
| 8 | 🎯 **Udání** | Soupeř dle tvé volby jde na Distanc (bez bonusu za START) | cílení |
| 9 | 🤒 **Podezření z dopingu** | Stojíš 1 kolo a nefungují ti žetony | původní efekt pole |

**Kolo je záměrně pozitivní.** Osm z devíti výsečí je pro točícího hráče dobrých
nebo neutrálních. Padlo to jako vědomé rozhodnutí při návrhu, ne opomenutím —
Totalizátor má být roh, na který chceš došlápnout. Vyvažuje se čísly (sázka je
férová, dražba má přirážku), ne přidáním trestných polí.

### Odůvodnění čísel

**Sázka 5 000 Kč, hranice 5+, výplata 15 000 Kč.**
Kostka je 1d6, takže 5–6 je 1/3. Očekávaná hodnota `1/3 × 15 000 − 5 000 = 0`.
Sázka je tedy **přesně férová** — jediná věc na kole, která hráči v průměru nic
nedá ani nevezme, zato přidá rozptyl. To je pro totalizátor tematicky správně.
Pokud má hráč méně než 5 000 Kč, vsadí celou hotovost a výplata se škáluje
trojnásobkem sázky. S nulovým zůstatkem se sázka nekoná (zaloguje se).

**Dražba +50 %.**
Nejcitlivější číslo v celém návrhu. Dražba umí dokončit stáj, což je největší
skok v ekonomice hry (žetony začnou fungovat a nájem vyskočí řádově). Při +25 %
by byla skoro vždy výhodná a stala by se jediným důvodem, proč na roh chtít.
+50 % z ní dělá rozhodnutí: u levného koně (1 200 → 1 800 Kč) pořád snadné ano,
u Giry (6 400 → 9 600 Kč) už otázka. **Toto číslo doporučuji odladit při hraní.**

**Dostih zdarma** drží stávající pravidlo, že žeton jde položit jen na koně z
úplné stáje. Nedrží pravidlo „jen na pole, kde stojíš" — to je právě ta výjimka,
kvůli které efekt existuje. Když hráč nemá žádnou úplnou stáj, efekt propadá a
zaloguje se.

**Stávka 1 kolo** — stejná délka jako doping, ať se pravidlo nemusí učit dvakrát.
`tokenStrike` se snižuje o jedna **na začátku tahu cílového hráče**, stejně jako
`skipTurns`. Stávka tedy dopadne na jedno celé kolo soupeřů mezi dvěma jeho tahy.

### Hraniční případy, které musí spec rozhodnout

**Šestka a sázka.** Šestka dává právo na další hod. Sázka se vyhodnotí na
**prvním** hodu po vsazení — při šestce tedy vyhraje a `pendingBet` se hned
vynuluje, takže opakovaný hod už se nesází. Jeden efekt, jedna sázka.

**Odmítnutá dražba.** Hráč může dražbu odmítnout (a bot ji odmítne, když žádný
volný kůň nemá kladné skóre). Odmítnutí efekt spotřebuje — nedrží se na příště.
Nabídnou se jen koně, na které hráč **má** (cena +50 % ≤ zůstatek); když na
žádného nemá, efekt propadá a zaloguje se.

**Nevyužité přednostní právo.** `halfPriceNext` se spotřebuje teprve tehdy, když
kůň **skutečně změní majitele**. Došlápnutí na volného koně a odmítnutí koupě
příznak nespotřebuje — drží se až do prvního nákupu.

---

## Architektura

### Nové soubory

| Soubor | Obsah |
|---|---|
| `src/Roulette.js` | Čistý modul: definice devíti výsledků + `spin()`. Bez vedlejších efektů, po vzoru `Cards.js` a `Bot.js` |
| `src/mixins/roulette.js` | Napojení na engine: `_spinRoulette`, `_handleRouletteAck`, handlery cílících promptů |
| `public/js/animations/roulette.js` | Animace kola |
| `public/js/animations/rouletteGate.mjs` | Čisté načasování animace (testovatelné bez DOM) |

### Zásahy do existujících souborů

| Soubor | Zásah |
|---|---|
| `src/mixins/movement.js` | Větev na `config.field30Mode` v `case 'skip_turn'` — zrcadlí `free_parking` / `field20Mode` |
| `src/mixins/lobby.js` | Validace `field30Mode` (`'doping'` nebo `'roulette'`), výchozí `'doping'` |
| `src/GameEngine.js` | `field30Mode: 'doping'` do výchozí konfigurace |
| `src/mixins/economy.js` | Modifikátory do `_calcRent` a do platby nájmu |
| `src/mixins/turns.js` | Vyhodnocení `pendingBet` v `handleRoll` |
| `src/Bot.js` | `case` pro tři nové typy promptů |
| `public/js/ui/board.js` | Ikona a název pole podle `field30Mode` |
| `public/js/ui/lobby.js` | Výběr `field30Mode` v nastavení hostitele |
| `public/index.html` | Řádek nastavení |
| `public/partials/overlays.html` | Overlay kola |
| `public/style.css` | Kolo, výseče, cílící prompty |

### Model efektu

Výsledky jsou **data, ne funkce** — devět položek tvaru:

```js
{ id: 'bet', icon: '🎲', name: 'Sázka na vlastní hod', kind: 'bet', amount: 5000,
  threshold: 5, payout: 15000, text: '…' }
```

Bot i klient s nimi pak umí pracovat, aniž by znaly jednotlivé efekty jménem,
a testy se píšou proti datům místo proti chování.

### Stav na hráči

Čtyři nová pole. Všechna se rozešlou samy — `_buildState` serializuje hráče
přes `...rest`, takže nic navíc není potřeba:

```js
pendingBet:    null,   // { amount, threshold, payout }
doubleRent:    0,      // nabití; spotřebuje se při výběru nájmu
rentImmunity:  0,      // nabití; spotřebuje se při platbě nájmu
halfPriceNext: false,  // přednostní právo
tokenStrike:   0,      // kola; sedí na CÍLOVÉM hráči, ne na točícím
```

Precedens pro tenhle vzor už ve hře je: `canFly` (letiště) a `jailFreeCards`
jsou přesně takové příznaky — visí na hráči přes tahy a později se spotřebují.

---

## Tok tahu

Kopíruje kartu, protože ta cestu má ověřenou:

```
došlápnutí na pole 30, field30Mode === 'roulette'
  → _spinRoulette(pid): server vylosuje výsledek OKAMŽITĚ
  → pendingAction { type: 'roulette_ack', targetId, data: { result } }
  → _broadcast()
  → klient animuje kolo, které dojede na už rozhodnutý výsledek
  → hráč potvrdí → _handleRouletteAck
      ├─ efekt bez volby  → aplikuje se rovnou → _offerTokensOrEnd
      └─ efekt s volbou   → druhý prompt → po odpovědi → _offerTokensOrEnd
```

**Výsledek určuje server, klient ho jen dojíždí** — stejně jako kostka
(`lastDice`) a karty (`card_ack`). Reconnect uprostřed točení tím pádem nic
nerozbije a výsledek nejde ovlivnit z klienta.

### Tři nové typy promptů

Devět efektů si vystačí se třemi prompty:

| Prompt | Používají | Vzor |
|---|---|---|
| `roulette_ack` | všech devět | `card_ack` |
| `roulette_pick_horse` | Dražba (volní koně), Dostih zdarma (vlastní koně z úplné stáje) | `buy_offer` |
| `roulette_pick_player` | Stávka, Udání | `airport_select_target` |

---

## Napojení na nájem

`_calcRent(spaceId, dice)` je jediný trychtýř a volá se přesně ze dvou míst
(`movement.js:116`, `turns.js:102`). Zásahy jsou proto lokální:

1. **Stávka** — do stávající podmínky „žetony nefungují" přibude třetí větev
   vedle `ownerPlayer.inJail` a `ownerPlayer.skipTurns > 0`:
   `ownerPlayer.tokenStrike > 0`. Log dostane vlastní hlášku.
2. **Dvojitý nájem** — po výpočtu, pokud má **majitel** `doubleRent > 0`,
   nájem se zdvojnásobí a nabití se sníží o jedna.
3. **Imunita** — při platbě, pokud má **plátce** `rentImmunity > 0`, částka je
   nula a nabití se sníží o jedna.

Pořadí je určující: imunita se vyhodnocuje **po** zdvojnásobení, takže imunita
proti dvojitému nájmu vyhraje a obě nabití se spotřebují.

---

## Sázka přes dva tahy

`pendingBet` se nastaví při aplikaci efektu a vyhodnotí na začátku `handleRoll`
při **příštím** hodu téhož hráče:

- hod ≥ `threshold` → `balance += payout`, log výhry
- jinak → nic (sázka propadla už při vsazení), log prohry
- v obou případech `pendingBet = null`

Sázka se strhává **hned při zatočení**, ne až při hodu — jinak by hráč mohl
mezitím zbankrotovat a sázka by zmizela bez zaplacení.

Hráč může být mezitím poslán na Distanc nebo vynechat kolo. Sázka čeká na první
skutečný hod, ať přijde kdykoli. Přežije reconnect, protože je součástí hráče
v `_buildState`.

---

## Bot

**Každý nový prompt musí dostat `case` v `Bot.decideAction`, jinak bot zamrzne.**
`_botAct` volá `Bot.decideAction(this, botId)` a na neznámý typ vrátí `null` →
bot neodpoví → hra stojí, dokud nevyprší časový limit tahu.

| Prompt | Rozhodnutí bota |
|---|---|
| `roulette_ack` | vždy potvrdit (jako `card_ack`) |
| `roulette_pick_horse` — dražba | `Bot.evaluatePurchase` na každého volného koně, vezme nejlepší kladné skóre; při žádném kladném odmítne |
| `roulette_pick_horse` — žeton | kůň s nejvyšším `estimateRent` po přidání žetonu |
| `roulette_pick_player` | hráč s nejvyšší hodnotou majetku (`_calcAssetsValue`), tj. vedoucí soupeř |

---

## Reconnect

Kolo se nesmí přetočit při obnovení stavu. Stejný problém řeší úvodní losování
přes `state.isStarterAnimating` — půjde se stejnou cestou: klient si drží
příznak, že tenhle výsledek už odanimoval, a při `game:init` s existujícím
`roulette_ack` zobrazí rovnou dojeté kolo bez animace.

---

## Testy

| Soubor | Co ověřuje |
|---|---|
| `tests/roulette-outcomes.test.js` | `spin()` vrací jen platné id, všech devět je dosažitelných, definice mají povinná pole |
| `tests/roulette-modifiers.test.js` | `doubleRent` / `rentImmunity` se napojí na `_calcRent`, spotřebují se právě jednou, nepřetečou pod nulu; imunita vyhraje nad dvojitým nájmem; `tokenStrike` vypne žetony |
| `tests/roulette-bet.test.js` | Sázka se strhne při zatočení, vyhodnotí se při příštím hodu, přežije `_buildState` → `game:init`, propadne při prohře |
| `tests/roulette-bot.test.js` | Bot odpoví na všechny tři nové typy promptů a hra nezamrzne |

---

## Co je mimo rozsah

- **Výměna koní mezi hráči.** Původně byla v návrhu, vyřazena záměrně: není to
  jeden prompt, ale otázka, co se stane se žetony na vyměněném koni, jak se
  přepočítá monopol oběma stranám a co když výměna rozbije stáj, ze které někdo
  právě vybírá zvýšený nájem. To je vlastní feature, ne políčko na ruletě.
- **Vážené pravděpodobnosti.** Devět výsečí po 11,1 %.
- **Změna dopingu.** Režim `'doping'` zůstává beze změny a je výchozí.
