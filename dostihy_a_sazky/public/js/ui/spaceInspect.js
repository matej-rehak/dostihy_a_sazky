import { fmt, esc, safeColor, imgIcon } from '../utils.js';
import { priced } from './inflation.mjs';
import { SERVICE_DICE_RENT, horseRentRow, serviceRentRow } from './rentView.mjs';
import { propertySellValue } from './bankSale.mjs';
import { horsePortrait } from '../horsePortraits.js';

// Slovník s historickými retro popisy (lore) pro koně a služby
const SPACE_LORE = {
  1: 'Rychlý a temperamentní ryzák. Patří do oranžové stáje a je skvělou volbou pro začátek dostihové kariéry.',
  3: 'Spolehlivá klisna s klidnou povahou. S Fantomem tvoří nenáročnou dvojici, která dokáže stabilně vydělávat.',
  5: 'Zkušený profesionální trenér, který systematicky zvyšuje výkonnost vašich koní. Vlastnictví více trenérů násobí zisk.',
  6: 'Elegantní hnědka s výborným klusem. Lady Anne vyžaduje citlivé zacházení, ale na trati je velmi obratná.',
  8: 'Robustní hřebec s obrovskou vytrvalostí. Ideální pro těžší terény a delší vytrvalostní dostihy.',
  9: 'Hrdý hřebec s vynikajícím původem. Nejhodnotnější kůň hnědé stáje, který často rozhoduje o úspěchu chovu.',
  11: 'Bojovný tmavý hnědák. Rychlý na startu, na trati však vyžaduje velmi pevnou ruku žokeje.',
  12: 'Spolehlivá nákladní autodoprava. Zajišťuje bezpečný a rychlý transport koní na dostihy po celé republice.',
  13: 'Neklidný, ale nesmírně rychlý valach. Dokáže překvapit i ty největší favority dostihu.',
  14: 'Vytrvalý a silný kůň s klidným pohledem. Klenot světle modré stáje s vysokým finančním potenciálem.',
  15: 'Zkušený profesionální trenér, který systematicky zvyšuje výkonnost vašich koní. Vlastnictví více trenérů násobí zisk.',
  16: 'Mladá divoká klisna. Její temperament je těžké krotit, ale její rychlost na rovné dráze je ohromující.',
  18: 'Charakterní klisna s výborným finišem. Spolehlivá opora zelené stáje v každém dostihu.',
  19: 'Zkušený překážkový specialista. Melák je nejdražším koněm zelené stáje a ztělesněním spolehlivosti.',
  21: 'Hrdý bělouš s aristokratickým původem. Na trati vyniká elegancí a lehkostí každého kroku.',
  23: 'Kompaktní a mimořádně silná klisna. Vynikající na těžkých skocích, oblíbená mezi zkušenými žokeji.',
  24: 'Ohnivý vraník s nezdolnou vůlí vítězit. Nejrychlejší kůň červené stáje, který soupeřům nedá nic zadarmo.',
  25: 'Zkušený profesionální trenér, který systematicky zvyšuje výkonnost vašich koní. Vlastnictví více trenérů násobí zisk.',
  26: 'Trpělivá a vytrvalá klisna. Tara je skvělá na dlouhé tratě a málokdy zklame své věrné příznivce.',
  27: 'Tradiční plemeník s mohutnou stavbou těla. Furioso přináší do žluté stáje sílu, respekt a jistotu.',
  28: 'Moderně vybavené stáje s prvotřídní veterinární péčí. Nezbytné zázemí pro náročné chovatele.',
  29: 'Genius plně dostává svému jménu. Je to mimořádně inteligentní hřebec, šampion a pýcha žluté stáje.',
  31: 'Ušlechtilý arabský polokrevník. Rychlý, obratný a nesmírně vytrvalý i v nepříznivých podmínkách.',
  32: 'Impozantní hnědák s pevnou konstitucí. Dahoman je spolehlivým pilířem tmavě zelené stáje.',
  34: 'Bleskurychlá klisna s divokým srdcem. Královna tmavě zelené stáje, která dokáže zvrátit průběh jakékoliv hry.',
  35: 'Zkušený profesionální trenér, který systematicky zvyšuje výkonnost vašich koní. Vlastnictví více trenérů násobí zisk.',
  37: 'Elegantní tmavý hnědák s vynikající pověstí. Narcius představuje prestiž a jistotu vysokých zisků.',
  39: 'Absolutní legenda československých dostihů. Nejdražší kůň na plánu, vítěz Velké pardubické a symbol luxusu.'
};

let currentFlipped = false;

const HORSE_RENT_LABELS = ['Základní nájem', 'S 1 dostihem', 'S 2 dostihy', 'S 3 dostihy', 'S 4 dostihy', 'Hlavní dostih'];

// Proč majiteli nefungují žetony — viz horseRentRow v rentView.mjs.
const IDLE_REASON = {
  group: 'Majitel nemá celou stáj — žetony nefungují.',
  jail: 'Majitel je v Distancu — žetony nefungují.',
  doping: 'Majitel je pod podezřením z dopingu — žetony nefungují.',
};

/** Tabulka nájmů; řádek `active` je ten, který se teď opravdu platí. */
function rentTable(rows, active) {
  return `<table class="inspect-table">${rows.map(([label, value], i) => `
    <tr class="${i === active ? 'active-rent' : ''}"><td>${label}</td><td class="rent-val">${value}</td></tr>`).join('')}
  </table>`;
}

function rentsHtml(space, gameState) {
  const board = window.__boardData;
  if (space.type === 'horse') {
    const { row, idle } = board ? horseRentRow(board, gameState, space.id) : { row: null, idle: null };
    const rows = (space.rents ?? []).map((r, i) => [HORSE_RENT_LABELS[i], `${fmt(priced(gameState, r))} Kč`]);
    const note = idle ? `<p class="inspect-note">${IDLE_REASON[idle]}</p>` : '';
    return rentTable(rows, row) + note;
  }
  if (space.type === 'service') {
    const row = board ? serviceRentRow(board, gameState, space.id) : null;
    if (space.serviceType === 'trener') {
      const rows = [1, 2, 3, 4].map(n => [
        `${n} ${n === 1 ? 'trenér' : 'trenéři'}`, `${fmt(priced(gameState, n * 1000))} Kč`,
      ]);
      return `<p class="inspect-note">Nájem podle počtu trenérů majitele.</p>` + rentTable(rows, row);
    }
    const rows = [
      ['Jen Přeprava nebo Stáje', `${SERVICE_DICE_RENT.single} × hod`],
      ['Přeprava i Stáje', `${SERVICE_DICE_RENT.pair} × hod`],
    ];
    return `<p class="inspect-note">Nájem je násobek hodu kostkou.</p>` + rentTable(rows, row);
  }
  if (DECKS[space.type]) return deckHtml(space, gameState);
  return `<p class="inspect-note">Speciální pole herního plánu.</p>`;
}

// Balíčky karet: barva a ikona jako balíček na plánu (.bc-deck) a tažená karta.
const DECKS = {
  finance: { color: '#2980b9', icon: 'img/finance.png' },
  nahoda:  { color: '#27ae60', icon: 'img/nahoda-znak.png' },
};

/** Seznam karet balíčku ze stavu (EngineMixin._deckOverview) s šancí vytažení. */
function deckHtml(space, gameState) {
  const cards = gameState?.cardDecks?.[space.type] ?? [];
  if (!cards.length) return `<p class="inspect-note">Obsah balíčku se načte se stavem hry.</p>`;
  const total = cards.reduce((s, c) => s + c.count, 0);
  // Drženou kartu má u sebe hráč — která je která, říká `type` z přehledu.
  const holderOf = c => gameState.players?.find(p =>
    c.type === 'reroll_card' ? p.rerollCards > 0 : p.jailFreeCards > 0);
  const items = cards.map(c => `
    <li class="inspect-card" data-tone="${c.tone}">
      <span class="inspect-card-text">${esc(c.text)}${c.held
        ? `<small>Drží ${esc(holderOf(c)?.name ?? 'hráč')} — teď se nedá líznout.</small>` : ''}</span>
      <span class="inspect-card-odds">${c.count > 1 ? `<b>${c.count}×</b>` : ''}${c.count}/${total}</span>
    </li>`).join('');
  return `<p class="inspect-note">Balíček má ${total} karet. Po dobrání se zamíchá znovu.</p>
    <ul class="inspect-cards">${items}</ul>`;
}

function pricesHtml(space, gameState) {
  if (!space.price) return '';
  const row = (label, value) => `<div class="inspect-price-row"><span>${label}</span><b>${value}</b></div>`;
  let html = row(space.type === 'horse' ? 'Cena koně' : 'Cena služby', `${fmt(priced(gameState, space.price))} Kč`);
  if (space.type === 'horse') {
    html += row('Cena žetonu', `${fmt(priced(gameState, space.tokenCost))} Kč`);
    html += row('Hlavní dostih', `${fmt(priced(gameState, space.bigTokenCost))} Kč`);
  }
  html += row('Prodej bance', `${fmt(propertySellValue(space, gameState?.tokens?.[space.id], gameState?.config?.bankSaleRatio))} Kč`);
  return html;
}

export function showSpaceInspect(space, gameState) {
  const overlay = document.getElementById('space-inspect-overlay');
  const card = document.getElementById('space-inspect-card');
  const header = document.getElementById('space-inspect-header');
  const nameEl = document.getElementById('space-inspect-name');
  const mediaEl = document.getElementById('space-inspect-icon');
  const rentsEl = document.getElementById('space-inspect-rents');
  const pricesEl = document.getElementById('space-inspect-prices');
  const descEl = document.getElementById('space-inspect-desc');
  const ownerEl = document.getElementById('space-inspect-owner');

  if (!overlay || !card) return;

  card.classList.remove('flipped');
  currentFlipped = false;

  // Záhlaví jako tooltip: kůň v barvě stáje, ostatní tmavé se zlatým názvem.
  if (nameEl) nameEl.textContent = space.name;
  if (header) {
    const color = space.type === 'horse' ? safeColor(space.groupColor) : DECKS[space.type]?.color;
    header.classList.toggle('is-horse', !!color);
    header.style.background = color ?? '';
  }

  // Portrét koně (stejný jako v tooltipu), jinak ikona pole.
  if (mediaEl) {
    const portrait = space.type === 'horse' ? horsePortrait(space.id) : null;
    mediaEl.classList.toggle('is-portrait', !!portrait);
    if (portrait) {
      const img = document.createElement('img');
      img.src = portrait;
      img.alt = '';
      mediaEl.replaceChildren(img);
    } else if (space.type === 'service') {
      mediaEl.replaceChildren(imgIcon(`img/${space.serviceType}.png`));
    } else if (DECKS[space.type]) {
      mediaEl.replaceChildren(imgIcon(DECKS[space.type].icon));
    } else {
      mediaEl.replaceChildren();
    }
    mediaEl.classList.toggle('hidden', !mediaEl.firstChild);
  }

  if (rentsEl) rentsEl.innerHTML = rentsHtml(space, gameState);
  if (pricesEl) pricesEl.innerHTML = pricesHtml(space, gameState);

  if (ownerEl) {
    const ownerId = gameState?.ownerships?.[space.id];
    const owner = ownerId ? gameState.players.find(p => p.id === ownerId) : null;
    ownerEl.classList.toggle('hidden', !owner);
    ownerEl.innerHTML = owner
      ? `<div class="owner-dot" style="background:${safeColor(owner.color)}"></div><div>${esc(owner.name)}</div>`
      : '';
  }

  if (descEl) {
    descEl.textContent = SPACE_LORE[space.id] || 'Klasické pole české společenské hry Dostihy a sázky.';
  }

  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

export function hideSpaceInspect() {
  const overlay = document.getElementById('space-inspect-overlay');
  const card = document.getElementById('space-inspect-card');
  if (overlay) {
    overlay.classList.add('hidden');
  }
  if (card) {
    card.classList.remove('flipped');
  }
  currentFlipped = false;
  document.body.style.overflow = '';
}

export function toggleSpaceInspectFlip() {
  const card = document.getElementById('space-inspect-card');
  if (!card) return;
  currentFlipped = !currentFlipped;
  card.classList.toggle('flipped', currentFlipped);
}

// Inicializace event listenerů pro inspect overlay
export function initInspectListeners() {
  const flipBtn = document.getElementById('space-inspect-flip-btn');
  const closeBtn = document.getElementById('space-inspect-close');
  const backdrop = document.getElementById('space-inspect-backdrop');

  if (flipBtn) {
    flipBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleSpaceInspectFlip();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSpaceInspect();
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      hideSpaceInspect();
    });
  }

  // Zavírání klávesou Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideSpaceInspect();
    }
  });
}
