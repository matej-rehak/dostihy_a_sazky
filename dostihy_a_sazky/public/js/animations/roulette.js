import { prefersReducedMotion } from '../utils.js';
import { audioManager } from '../audio.js';
import { rouletteResultSound } from '../soundEvents.mjs';
import {
  SPIN_MS, targetRotation, spinPlan, hideDelay, segmentLabelRotation, segmentBounds,
  WHEEL, polar, segmentPath, labelLayout, segmentUnderPointer, nameReadsOutward,
  GROUP_FACE, GROUP_LABEL, groupOdds, formatShare,
} from './rouletteAnimationGate.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';

// Délka prolnutí overlaye. Musí odpovídat `transition: opacity 200ms` na
// .roulette-overlay v public/style.css — o ni se opírá zavírací prodleva
// po potvrzení výsledku.
const FADE_MS = 200;

let hideTimer = null;
let tickFrame = null;
// Odložené zavření kola, které potvrdil někdo jiný (bot) — viz hideRouletteOverlay.
let lingerTimer = null;
// Kdy se odhalí (odhalil) výsledek právě ukázaného kola; null = kolo není vidět.
let revealAt = null;

// Každé zatočení má na serveru vlastní `spinId`. Dvě různé otázky, dvě různé
// paměti — dřív je držela jedna proměnná a pletly se dohromady:
//
//  • `animatedSpinId` — „tohle zatočení jsem už odanimoval". Po reconnectu
//    dorazí stejný `roulette_ack` znovu a kolo se ukáže rovnou dojeté.
//  • `spinningSpinId` — „tohle zatočení právě běží". `updateActionPanel` se
//    volá při KAŽDÉM `game:state` (cizí reconnect, odpověď na obchod…), takže
//    během točení sem klidně přijde druhé zavolání se stejným `spinId`.
//    To musí být no-op; dřív spadlo do větve „už viděno" a živé kolo skočilo
//    na výsledek.
let animatedSpinId = null;
let spinningSpinId = null;
// Zvuk výsledku jen jednou na zatočení — overlay se při změnách stavu kreslí znovu.
let soundedSpinId = null;

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/**
 * Vykreslí kolo jako SVG: plochy výsečí v barvě skupiny, zlatý ráfek
 * s kolíky na švech a popisky podél poloměru.
 *
 * Popisky jsou uvnitř SVG, které se otáčí — točí se spolu s kolem. Každý je
 * otočený o `segmentLabelRotation`, takže leží ve středu své výseče; ta
 * vybraná pak skončí pod ručičkou, protože `targetRotation` je k témuž úhlu
 * inverzní.
 *
 * Seznam výsečí chodí v `game:init`. Když ještě nedorazil, vykreslí se prázdné
 * kolo o jedné ploše — výsledek se čte z `result`, takže hra běží dál.
 *
 * `restRotation` je poloha, na které kolo zastaví — podle ní se volí směr
 * čtení názvů, aby po dojetí žádný nebyl vzhůru nohama.
 */
function paintWheel(wheelEl, outcomes, weights, restRotation) {
  const bounds = segmentBounds(weights);
  const { size, center, face, rim, rimWidth, pegRadius } = WHEEL;
  const list = outcomes.length ? outcomes : [{ weight: 1, group: 'neutral' }];

  const svg = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, class: 'roulette-svg' });

  const faces = svgEl('g', { class: 'roulette-faces' });
  list.forEach((o, i) => {
    const { start, size: deg } = bounds[i];
    const path = svgEl('path', {
      d: segmentPath(start, deg),
      class: 'roulette-face',
      'data-index': i,
      'data-group': o.group || 'neutral',
    });
    path.style.fill = GROUP_FACE[o.group] || GROUP_FACE.neutral;
    faces.appendChild(path);
  });
  svg.appendChild(faces);

  // Ráfek + kolíky: kolík sedí na každém švu, ručička o ně při točení ťuká.
  svg.appendChild(svgEl('circle', {
    cx: center, cy: center, r: rim, class: 'roulette-rim', 'stroke-width': rimWidth,
  }));
  svg.appendChild(svgEl('circle', {
    cx: center, cy: center, r: face, class: 'roulette-rim-inner',
  }));
  if (list.length > 1) {
    bounds.forEach(({ start }) => {
      const p = polar(rim, start);
      svg.appendChild(svgEl('circle', { cx: p.x, cy: p.y, r: pegRadius, class: 'roulette-peg' }));
    });
  }

  const labels = svgEl('g', { class: 'roulette-labels' });
  list.forEach((o, i) => {
    if (!o.icon && !o.short && !o.name) return;
    const layout = labelLayout(bounds[i].size);
    const g = svgEl('g', {
      class: 'roulette-label',
      'data-index': i,
      transform: `rotate(${segmentLabelRotation(i, weights)} ${center} ${center})`,
    });

    const icon = svgEl('text', {
      x: center, y: center - layout.iconR,
      class: 'roulette-label-icon', 'font-size': layout.iconSize,
    });
    icon.textContent = o.icon || '';

    // Název leží podél poloměru, takže se vejde i do úzkých výsečí. Na
    // pravé polovině zastaveného kola by text od ráfku ke středu byl vzhůru
    // nohama — tam se čte opačně, od středu k ráfku.
    const outward = nameReadsOutward(segmentLabelRotation(i, weights), restRotation);
    const name = svgEl('text', {
      x: 0, y: 0,
      class: 'roulette-label-name', 'font-size': layout.nameSize,
      'text-anchor': outward ? 'end' : 'start',
      transform: `translate(${center} ${center - layout.nameR}) rotate(${outward ? -90 : 90})`,
    });
    name.textContent = o.short || o.name || '';

    g.append(icon, name);
    labels.appendChild(g);
  });
  svg.appendChild(labels);

  wheelEl.replaceChildren(svg);
}

/** Legenda nad kolem: jakou šanci má každá skupina. */
function paintOdds(oddsEl, outcomes) {
  if (!oddsEl) return;
  oddsEl.replaceChildren(...groupOdds(outcomes).map(({ group, share }) => {
    const chip = document.createElement('span');
    chip.className = 'roulette-odds-chip';
    chip.dataset.group = group;
    chip.textContent = `${GROUP_LABEL[group]} ${formatShare(share)}`;
    return chip;
  }));
}

/**
 * Ručička ťukne pokaždé, když pod ní projede šev. Úhel se čte z matice,
 * kterou prohlížeč pro běžící CSS přechod počítá — JS tak nemusí přechod
 * napodobovat a nemůže se s ním rozejít.
 */
function startPointerTicks(wheel, pointer, weights) {
  stopPointerTicks();
  if (!pointer || weights.length < 2 || typeof pointer.animate !== 'function') return;
  let lastIndex = null;
  let unwrapped = 0;
  let lastRaw = 0;
  const step = () => {
    const m = getComputedStyle(wheel).transform;
    const match = m && m.startsWith('matrix(') ? m.slice(7, -1).split(',').map(Number) : null;
    if (match) {
      const raw = (Math.atan2(match[1], match[0]) * 180) / Math.PI;
      let delta = raw - lastRaw;
      if (delta < -180) delta += 360;
      if (delta > 180) delta -= 360;
      unwrapped += delta;
      lastRaw = raw;
      const index = segmentUnderPointer(unwrapped, weights);
      if (lastIndex !== null && index !== lastIndex) {
        pointer.animate(
          [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-22deg)' }, { transform: 'rotate(0deg)' }],
          { duration: 140, easing: 'ease-out' }
        );
      }
      lastIndex = index;
    }
    tickFrame = requestAnimationFrame(step);
  };
  tickFrame = requestAnimationFrame(step);
}

function stopPointerTicks() {
  if (tickFrame) { cancelAnimationFrame(tickFrame); tickFrame = null; }
}

/**
 * @param {object}   result      výsledek ze serveru (`index`, `icon`, `name`, `text`, `group`, `spinId`)
 * @param {object[]} outcomes    všechny výseče v pořadí na kole (z `game:init`)
 * @param {boolean}  isTargeted  jde o mé zatočení → dostanu tlačítko Potvrdit
 * @param {Function} onConfirm
 * @param {string}   [spinnerName] kdo točí — ostatním se ukáže místo tlačítka
 */
export function showRouletteOverlay(result, outcomes, isTargeted, onConfirm, spinnerName) {
  const overlay = document.getElementById('roulette-overlay');
  const wheel   = document.getElementById('roulette-wheel');
  const pointer = document.getElementById('roulette-pointer');
  const resultEl = document.getElementById('roulette-result');
  const iconEl  = document.getElementById('roulette-result-icon');
  const nameEl  = document.getElementById('roulette-result-name');
  const textEl  = document.getElementById('roulette-result-text');
  const statusEl = document.getElementById('roulette-status');
  const whoEl   = document.getElementById('roulette-who');
  const btn     = document.getElementById('roulette-btn');
  if (!overlay || !wheel) return;

  const plan = spinPlan({
    spinId: result.spinId,
    animatedSpinId,
    spinningSpinId,
    // Kolo se nedá přeskočit ani vypnout v nastavení — vždy se dotočí celé.
    // Výjimkou je jen systémové „omezit pohyb" (přístupnost).
    animationEnabled: !prefersReducedMotion(),
  });
  // Kolo pro tenhle `spinId` se právě točí → nesahat na něj.
  if (plan === 'ignore') return;
  animatedSpinId = result.spinId;

  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (lingerTimer) { clearTimeout(lingerTimer); lingerTimer = null; }
  stopPointerTicks();

  // Pozici výseče určuje server (`result.index`) — klient ji nedohledává.
  // Když seznam výsečí ještě nedorazil, kolo se vykreslí prázdné; výsledek
  // se čte z `result`, takže hra funguje i tak.
  const weights = outcomes.length ? outcomes.map(o => o.weight || 1) : [1];
  const index = Number.isInteger(result.index) && result.index < weights.length ? result.index : 0;
  const spin = plan === 'spin';

  overlay.classList.remove('hidden');
  paintWheel(wheel, outcomes, weights, targetRotation(index, weights));
  paintOdds(document.getElementById('roulette-odds'), outcomes);
  if (whoEl) whoEl.textContent = isTargeted ? 'Točíš ty' : `Točí ${spinnerName || 'soupeř'}`;

  // Kolo vždy startuje z nuly. Divák, kterému overlay zavřel nový stav hry
  // (ne tlačítko), měl kolo pořád otočené z minula — a další zatočení by
  // pak ujelo jen pár stupňů místo celých otáček.
  wheel.classList.add('no-spin');
  wheel.style.transform = 'rotate(0deg)';
  void wheel.offsetWidth;
  wheel.classList.toggle('no-spin', !spin);

  const highlight = on => {
    wheel.classList.toggle('has-winner', on);
    wheel.querySelectorAll('.roulette-face, .roulette-label').forEach(el => {
      el.classList.toggle('is-winner', on && Number(el.dataset.index) === index);
    });
  };

  // Výsledek je hned k dispozici; jen ho při točení odhalíme až po dojetí.
  const reveal = () => {
    stopPointerTicks();
    highlight(true);
    if (soundedSpinId !== result.spinId) {
      soundedSpinId = result.spinId;
      const sound = rouletteResultSound(result.group);
      if (sound) audioManager.play(sound);
    }
    if (resultEl) {
      resultEl.dataset.state = 'done';
      resultEl.dataset.group = result.group || '';
    }
    if (iconEl) iconEl.textContent = result.icon;
    if (nameEl) nameEl.textContent = result.name;
    if (textEl) textEl.textContent = result.text;
    if (btn) btn.classList.toggle('is-hidden', !isTargeted);
    if (statusEl) {
      statusEl.textContent = isTargeted ? '' : `Čeká se, až ${spinnerName || 'hráč'} potvrdí…`;
      statusEl.classList.toggle('is-hidden', isTargeted);
    }
  };

  highlight(false);
  if (resultEl) { resultEl.dataset.state = 'spinning'; resultEl.dataset.group = ''; }
  if (iconEl) iconEl.textContent = '';
  if (nameEl) nameEl.textContent = 'Kolo se točí…';
  if (textEl) textEl.textContent = '';
  if (btn) btn.classList.add('is-hidden');
  if (statusEl) { statusEl.textContent = ''; statusEl.classList.add('is-hidden'); }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      overlay.classList.add('is-open');
      wheel.style.transform = `rotate(${targetRotation(index, weights)}deg)`;
      if (spin) {
        startPointerTicks(wheel, pointer, weights);
        audioManager.play('roulette_spin');
      }
    });
  });

  revealAt = Date.now() + (spin ? SPIN_MS : 0);
  if (spin) {
    spinningSpinId = result.spinId;
    hideTimer = setTimeout(() => {
      spinningSpinId = null;
      reveal();
    }, SPIN_MS);
  } else {
    spinningSpinId = null;
    reveal();
  }

  if (isTargeted && btn) {
    btn.onclick = () => {
      revealAt = null;   // vlastní potvrzení — zavírá se hned, bez odkladu
      overlay.classList.remove('is-open');
      setTimeout(() => {
        overlay.classList.add('hidden');
        // Rotaci vynuluj bez přechodu, jinak se příští kolo rozjede pozpátku.
        wheel.classList.add('no-spin');
        wheel.style.transform = 'rotate(0deg)';
        onConfirm();
      }, FADE_MS);
    };
  }
}

function closeNow() {
  if (lingerTimer) { clearTimeout(lingerTimer); lingerTimer = null; }
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  spinningSpinId = null;
  revealAt = null;
  const overlay = document.getElementById('roulette-overlay');
  if (overlay) overlay.classList.add('hidden');
  stopPointerTicks();
}

/**
 * Zavře kolo, jehož `roulette_ack` už ve stavu není.
 *
 * Bot potvrzuje za pevnou dobu od zatočení, ale divákovi se kolo mohlo
 * otevřít později. Kolo se proto vždy dotočí a výsledek chvíli zůstane
 * (`hideDelay`); teprve pak zmizí. Nové zatočení odložené zavření zruší.
 * `immediate` (návrat do lobby) zavře hned.
 */
export function hideRouletteOverlay({ immediate = false } = {}) {
  if (immediate) { closeNow(); return; }
  if (lingerTimer) return;   // zavření už je naplánované
  const delay = hideDelay({ revealAt, now: Date.now() });
  if (delay === 0) { closeNow(); return; }
  // Tlačítko Potvrdit už nemá co potvrdit — prompt odešel.
  document.getElementById('roulette-btn')?.classList.add('is-hidden');
  lingerTimer = setTimeout(() => { lingerTimer = null; closeNow(); }, delay);
}

/**
 * Vynuluje paměť odanimovaných zatočení — volá se při návratu do lobby.
 * Zruší i rozplánované odhalení výsledku: bez toho by hráč, který odejde
 * uprostřed točení, dostal `reveal()` o pár sekund později do
 * DOM patřícího už jiné obrazovce.
 */
export function resetRouletteCache() {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  if (lingerTimer) { clearTimeout(lingerTimer); lingerTimer = null; }
  revealAt = null;
  stopPointerTicks();
  animatedSpinId = null;
  spinningSpinId = null;
}
