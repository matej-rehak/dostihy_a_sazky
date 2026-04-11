# CLAUDE.md

> Tento soubor čte Claude Code automaticky na začátku každé session.

---

## Projekt

**Co to je:** Digitální multiplayer verze české deskové hry **Dostihy a sázky** (1984, autor Ladislav Mareš) — obdoba Monopoly s koňmi a dostihy.
**Stack:** Node.js · Express · Socket.io (backend) | Vanilla HTML + CSS + JS (frontend)
**Repozitář:** lokální, c:\Users\Matej\Desktop\dostihy

---

## ⚠️ DŮLEŽITÉ — Co NENÍ hotovo (původní implementace byla špatná)

Původní implementace byla generická dostihová hra (real-time závod). To NENÍ správně.
Správný cíl: **digitální verze deskové hry Dostihy a sázky** — viz pravidla níže.

---

## Pravidla hry Dostihy a sázky

### Základní info
- Typ: Strategická desková hra (obdoba Monopoly)
- Hráči: 2–6
- Délka: 120–240 minut
- Věk: od 10 let
- Autor: Ladislav Mareš, 1984 (ČSSR)

### Startovní kapitál
- Každý hráč dostane **30 000 Kč** (dostihových korun)
- Za každé projití polem START: **+4 000 Kč**

### Herní pomůcky
- Herní plán s políčky (koně, služby, speciální pole)
- **22 karet koní** (= nemovitosti) rozdělených do barevných stájí
- **14 karet Finance** (obdoba "Šance" v Monopoly)
- **14 karet Náhoda** (obdoba "Pokladna" v Monopoly)
- 4x karta Trenér, 1x Přeprava, 1x Stáje (služby = obdoba železnic/utilit)
- Bankovky: 10, 50, 100, 500, 1 000, 5 000, 10 000 Kč
- **58 žetonů dostihů** (malé = běžné dostihy, velké = hlavní dostih)
  - Na jednoho koně: max 4 malé + 1 velký žeton
- 6 barevných figurek, 1 kostka

### Koně (= nemovitosti) — 8 stájí, 22 koní celkem
Koně jsou pojmenováni po účastnících Velké pardubické:

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
1. Hoď kostkou, posuň figurku
2. Šestka = právo na další hod
3. Pokud stojíš na volném koni → můžeš si ho koupit
4. Pokud stojíš na koni soupeře → platíš za "prohlídku stáje"
5. Máš-li celou stáj → můžeš investovat (přidávat žetony dostihů) → zvyšují se platby

### Speciální pole
- **Finance / Náhoda** — táhni kartu, proveď pokyn
- **Distanc** — čekáš několik kol (= vězení v Monopoly)
- **START** — při průchodu +4 000 Kč

### Služby (Trenér, Přeprava, Stáje)
- Ke koupi, platí se fixní nebo násobené částky
- Analogické k železnicím/elektřině v Monopoly

### Konec hry
- Hráč bez peněz na zaplacení dluhu → bankrot → vypadá ze hry
- **Vítěz:** Poslední hráč ve hře, nebo největší majetek po časovém limitu

### Varianty
- D&S Junior (zjednodušeno, 14 koní)
- Betting on Horses (anglická verze)
- D&S Rychlá hra / Cestovní

---

## Příkazy

```bash
npm install      # instalace
npm run dev      # spuštění (nodemon server.js)
npm start        # produkce
```

Server běží na: http://localhost:3000

---

## Adresářová struktura (aktuální — ŠPATNÁ implementace)

```
src/
├── GameEngine.js       ← herní smyčka (přepsat pro deskovou hru)
├── RaceSimulator.js    ← simulace závodu (nevhodné — smazat/přepsat)
├── BettingSystem.js    ← sázkový systém (přepsat)
└── HorseGenerator.js   ← generátor koní (přepsat/zachovat data)
public/
├── index.html          ← frontend (přepsat)
├── style.css           ← CSS (zachovat design systém, přepsat layout)
└── app.js              ← klient (přepsat)
```

---

## Aktuální focus

**Aktuální úkol:** Přepsat celou aplikaci jako digitální verzi deskové hry Dostihy a sázky
**Kontext:** Původní implementace byla generická závodní hra — špatně pochopeno zadání
**Hotovo bude:** Hráči mohou hrát plnohodnotnou deskovou hru Dostihy a sázky přes prohlížeč v reálném čase

---

## Projekt

**Co to je:** [Jedna věta — co projekt dělá a pro koho]
**Stack:** [Backend: X | Frontend: Y | DB: Z]
**Repozitář:** [URL]

---

## Příkazy (používej přesně tyto)

```bash
# Instalace
npm install

# Vývoj
npm run dev

# Testy
npm test
npm test -- --testPathPattern=src/auth   # jeden modul

# Build
npm run build

# Lint
npm run lint
npm run lint:fix

# Databáze
npm run db:migrate
npm run db:seed
```

> DŮLEŽITÉ: Nikdy nespouštěj `npm run deploy` bez potvrzení od uživatele.

---

## Adresářová struktura

```
src/
├── agents/          ← agentní logika (orchestrátor, sub-agenti)
│   ├── orchestrator.ts
│   └── {agent-name}/
├── api/             ← HTTP endpointy
├── services/        ← business logika
├── models/          ← datové modely a DB schémata
├── utils/           ← sdílené utility
└── types/           ← TypeScript typy a interfacy

docs/                ← dokumentace (čti když potřebuješ detail)
outputs/             ← výstupy agentů (nezasahuj bez zadání)
tests/               ← testy (unit v __tests__, e2e v tests/e2e)
```

---

## Kódovací konvence

- **Jazyk:** TypeScript, strict mode (`"strict": true`)
- **Formát:** Prettier (spustí se přes `npm run lint:fix`)
- **Naming:** camelCase pro proměnné/funkce, PascalCase pro třídy/typy, SCREAMING_SNAKE pro konstanty
- **Imports:** absolutní cesty přes `@/` alias (ne relativní `../../`)
- **Async:** vždy `async/await`, nikoli `.then()` chains
- **Chyby:** vždy zachytávat explicitně, nikdy `catch(e) {}` bez zpracování
- **Funkce:** max. ~40 řádků — pokud delší, extrahuj helper

---

## Git workflow

- **Větve:** `feature/`, `fix/`, `chore/` prefix (např. `feature/auth-agent`)
- **Commit zprávy:** Conventional Commits — `feat:`, `fix:`, `docs:`, `refactor:`
- **PR:** squash merge, popis vysvětluje PROČ ne CO
- **Nikdy** commitovat přímo na `main`

---

## Testovací požadavky

- Každá nová funkce musí mít unit test
- Pokrytí: min. 80 % na `src/services/` a `src/agents/`
- Mock external API volání — nevolat skutečné endpointy v testech
- Před committem spustit: `npm test` a `npm run lint`

---

## Agentní systém — důležitý kontext

Tento projekt používá orchestrátor pattern. Přečti před prací na `src/agents/`:

- `AGENTS.md` — role a pravidla každého agenta
- `TASKS.md` — aktuální fronta úkolů
- `MEMORY.md` — technická rozhodnutí a poznatky

Orchestrátor **nikdy sám nevykonává specializovanou práci** — deleguje.
Sub-agenti **vždy zapisují výstupy** do `outputs/{typ}/`.

---

## Zakázané soubory (nečti ani nepiš)

- `.env`, `.env.local`, `.env.production` — credentials
- `outputs/production/` — produkční data
- `*.key`, `*.pem`, `*.p12` — certifikáty

---

## Terminologie projektu

| Pojem | Význam v tomto projektu |
|-------|------------------------|
| Orchestrátor | Agent koordinující ostatní agenty |
| Handoff | Předání výstupu mezi agenty přes MD soubory |
| Checkpoint | Bod kde systém čeká na lidský souhlas |
| [Přidej vlastní] | [definice] |

---

## Kdy se zeptat uživatele

Před těmito akcemi vždy požádej o potvrzení:
- Smazání souborů nebo dat
- Změna schématu databáze (`db:migrate`)
- Volání externích API s vedlejšími efekty
- Commit nebo push do repozitáře
- Změna architektury (přidání závislosti, refactor struktury)

---

## Aktuální focus

> Aktualizuj tuto sekci při zahájení každé nové fáze práce.

**Aktuální úkol:** [co právě děláš]
**Kontext:** [proč to děláš]
**Hotovo bude:** [jak poznáš že je úkol splněn]
