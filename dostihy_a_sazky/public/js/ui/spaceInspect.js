import { fmt, esc, safeColor } from '../utils.js';
import { dom } from '../dom.js';

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

export function showSpaceInspect(space, gameState) {
  const overlay = document.getElementById('space-inspect-overlay');
  const card = document.getElementById('space-inspect-card');
  const header = document.getElementById('space-inspect-header');
  const nameEl = document.getElementById('space-inspect-name');
  const iconEl = document.getElementById('space-inspect-icon');
  const rentsEl = document.getElementById('space-inspect-rents');
  const pricesEl = document.getElementById('space-inspect-prices');
  const descEl = document.getElementById('space-inspect-desc');
  const ownerBadge = document.getElementById('space-inspect-owner-badge');

  if (!overlay || !card) return;

  // Reset stavu otočení karty
  card.classList.remove('flipped');
  currentFlipped = false;

  // Nastavení jména a ikony
  if (nameEl) nameEl.textContent = space.name.toUpperCase();
  
  if (header) {
    if (space.type === 'horse') {
      header.style.background = safeColor(space.groupColor);
      header.style.color = '#fff';
    } else if (space.type === 'service') {
      header.style.background = '#e2e8f8';
      header.style.color = '#121d2d';
    } else {
      header.style.background = 'var(--bg-card2)';
      header.style.color = '#fff';
    }
  }

  // Zobrazení vlastníka na kartě, pokud existuje
  if (ownerBadge && gameState) {
    const ownerId = gameState.ownerships?.[space.id];
    const owner = ownerId ? gameState.players.find(p => p.id === ownerId) : null;
    if (owner) {
      ownerBadge.style.background = safeColor(owner.color);
      ownerBadge.textContent = `Vlastník: ${owner.name}`;
      ownerBadge.classList.remove('hidden');
    } else {
      ownerBadge.classList.add('hidden');
    }
  } else if (ownerBadge) {
    ownerBadge.classList.add('hidden');
  }

  // Nastavení ikony
  if (iconEl) {
    if (space.type === 'horse') {
      iconEl.textContent = '🐴';
    } else if (space.type === 'service') {
      iconEl.textContent = space.serviceType === 'trener' ? '👤' : (space.serviceType === 'preprava' ? '🚚' : '🐴');
    } else {
      iconEl.textContent = 'ℹ️';
    }
  }

  // Sestavení nájmů (Rents)
  if (rentsEl) {
    let rentsHtml = '';
    const tok = gameState?.tokens?.[space.id] || { small: 0, big: false };

    if (space.type === 'horse') {
      rentsHtml += `<table class="inspect-table">`;
      const rents = space.rents ?? [];
      const labels = ['Základní taxi', 'S 1 dostihem', 'S 2 dostihy', 'S 3 dostihy', 'S 4 dostihy', 'HLAVNÍ DOSTIH'];
      rents.forEach((r, i) => {
        const active = (tok.big && i === 5) || (!tok.big && tok.small === i);
        rentsHtml += `<tr class="${active ? 'active-rent' : ''}">
          <td>${labels[i]}</td>
          <td class="rent-val">${fmt(r)} Kč</td>
        </tr>`;
      });
      rentsHtml += `</table>`;
    } else if (space.type === 'service') {
      const isTrener = space.serviceType === 'trener';
      rentsHtml += `<div class="inspect-service-desc">`;
      if (isTrener) {
        rentsHtml += `
          <p>Sazba za trénink se určuje podle počtu vlastněných trenérů:</p>
          <table class="inspect-table">
            <tr><td>1 trenér</td><td>1 000 Kč × hod kostkou</td></tr>
            <tr><td>2 trenéři</td><td>2 000 Kč × hod kostkou</td></tr>
            <tr><td>3 trenéři</td><td>3 000 Kč × hod kostkou</td></tr>
            <tr><td>4 trenéři</td><td>4 000 Kč × hod kostkou</td></tr>
          </table>
        `;
      } else {
        rentsHtml += `
          <p>Sazba za přepravu nebo stáje závisí na tom, kolik těchto služeb vlastníte:</p>
          <table class="inspect-table">
            <tr><td>1 služba</td><td>80 × hod kostkou</td></tr>
            <tr><td>obě služby</td><td>200 × hod kostkou</td></tr>
          </table>
        `;
      }
      rentsHtml += `</div>`;
    } else {
      rentsHtml += `<p class="inspect-service-desc">Specifické pole herního plánu.</p>`;
    }
    rentsEl.innerHTML = rentsHtml;
  }

  // Sestavení cen (Prices)
  if (pricesEl) {
    let pricesHtml = '';
    if (space.price) {
      pricesHtml += `<div class="inspect-price-row"><span>Pořizovací cena:</span><b>${fmt(space.price)} Kč</b></div>`;
      if (space.type === 'horse') {
        pricesHtml += `<div class="inspect-price-row"><span>Cena dostihu (žetonu):</span><b>${fmt(space.tokenCost)} Kč</b></div>`;
      }
      const pledge = Math.round(space.price / 2);
      pricesHtml += `<div class="inspect-price-row"><span>Zástavní hodnota:</span><b>${fmt(pledge)} Kč</b></div>`;
    }
    pricesEl.innerHTML = pricesHtml;
  }

  // Sestavení popisku na zadní straně (Lore)
  if (descEl) {
    descEl.textContent = SPACE_LORE[space.id] || 'Klasické pole české společenské hry Dostihy a sázky.';
  }

  // Zobrazení overlaye
  overlay.classList.remove('hidden');
  document.body.style.overflow = 'hidden'; // Zabránit scrollování pozadí
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
