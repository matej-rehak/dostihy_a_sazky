/**
 * Čistá geometrie a načasování rulety — bez DOM, aby šla testovat.
 * Hodnota SPIN_MS musí sedět s `transition` na `.roulette-wheel`
 * v public/style.css; hlídá to tests/roulette-gate.test.mjs.
 */
// Plynulost: při 4 otáčkách za 3,2 s s prudkou křivkou se kolo v nejrychlejším
// místě otočilo o ~42° za snímek — víc než je šířka většiny výsečí, takže oko
// vidělo skoky místo točení. 3 otáčky za 3 s s křivkou, která se rychle
// rozjede a dlouho dojíždí, dávají nejvýš ~19° za snímek — pod polovinou
// té hranice a pod šířkou běžných výsečí (hlídá tests/roulette-gate.test.mjs).
export const SPIN_MS = 3000;
export const SPIN_TURNS = 3;
/** Křivka dojezdu kola — musí sedět s `transition` na `.roulette-wheel`. */
export const SPIN_EASING = [0.3, 0.5, 0.25, 1];

/**
 * Jak naložit s (dalším) požadavkem na zobrazení zatočení.
 *
 * `updateActionPanel` běží při KAŽDÉM `game:state`, ne jen při změně promptu —
 * během 3,2s točení sem tedy snadno přijde druhé zavolání se stejným `spinId`
 * (cizí reconnect, odpověď na obchodní nabídku). Dokud běží animace, musí být
 * takové zavolání no-op; dřív spadlo do větve „už viděno" a živé kolo skočilo
 * rovnou na výsledek.
 *
 * Paměť „už odanimováno" (`animatedSpinId`) je jiná otázka než „právě se točí"
 * (`spinningSpinId`) — první přežívá dotočení kvůli reconnectu, druhá ne.
 *
 * @returns {'ignore'|'snap'|'spin'}
 *   `ignore` = nesahat na běžící kolo, `snap` = ukázat rovnou dojeté,
 *   `spin` = roztočit.
 */
export function spinPlan({ spinId, animatedSpinId, spinningSpinId, animationEnabled }) {
  if (spinningSpinId != null && spinningSpinId === spinId) return 'ignore';
  if (!animationEnabled) return 'snap';
  if (animatedSpinId != null && animatedSpinId === spinId) return 'snap';
  return 'spin';
}

/**
 * Jak dlouho zůstane výsledek na kole, když ho potvrdí někdo jiný.
 * Bot potvrzuje za pevnou dobu od zatočení (ROULETTE_BOT_ACK_DELAY_MS
 * v src/constants.js), jenže divákovi se kolo mohlo otevřít později —
 * třeba až po doběhnutí figurky, nebo ve zpomalené kartě prohlížeče.
 */
export const RESULT_HOLD_MS = 1500;

/**
 * Za kolik ms smí zmizet kolo, jehož `roulette_ack` už ze stavu odešel.
 *
 * `revealAt` je okamžik, kdy se výsledek odhalí (při točení v budoucnu,
 * u kola ukázaného rovnou dojetého je to okamžik zobrazení). Kolo se vždy
 * dotočí a výsledek zůstane aspoň `holdMs` — potvrzení bota ho dřív nezavře.
 * `null` = kolo se neukazuje, není co držet.
 */
export function hideDelay({ revealAt, now, holdMs = RESULT_HOLD_MS }) {
  if (revealAt == null) return 0;
  return Math.max(0, revealAt + holdMs - now);
}

/**
 * Výseče mají různou šířku podle váhy — silnější efekt = užší výseč, stejně
 * jako na serveru (`spin` v src/Roulette.js vybírá podle vah). Úhly se proto
 * počítají z pole vah, ne z počtu výsečí.
 *
 * @param {number[]} weights váha každé výseče v pořadí na kole
 * @returns {{ start: number, size: number }[]} počáteční úhel a šířka ve stupních
 */
export function segmentBounds(weights) {
  const total = weights.reduce((s, w) => s + w, 0) || 1;
  let start = 0;
  return weights.map(w => {
    const size = (w / total) * 360;
    const seg = { start, size };
    start += size;
    return seg;
  });
}

function segmentCenter(index, weights) {
  const seg = segmentBounds(weights)[index] || { start: 0, size: 0 };
  return seg.start + seg.size / 2;
}

/**
 * O kolik stupňů otočit kolo, aby výseč `index` skončila pod ručičkou nahoře —
 * uprostřed svého pásma, ne na jeho okraji.
 *
 * Kolo se točí po směru, takže výseč se pod ručičku dostane odečtením úhlu
 * jejího středu od plné otáčky. `turns` přidává celé otáčky kvůli efektu —
 * na koncové poloze nic nemění.
 */
export function targetRotation(index, weights, turns = SPIN_TURNS) {
  return turns * 360 - segmentCenter(index, weights);
}

/**
 * Geometrie kola v souřadnicích SVG (`viewBox="0 0 200 200"`).
 *
 * Kolo se kreslí jako SVG, ne jako `conic-gradient`: tvrdé přechody gradientu
 * nemají antialiasing a švy mezi výsečemi vypadaly jako zubatá čárkovaná
 * čára. Všechny rozměry jsou v jednotkách viewBoxu, takže se kolo i popisky
 * škálují jen šířkou obalu — žádné px ladění pro každý breakpoint zvlášť.
 */
export const WHEEL = Object.freeze({
  size: 200,
  center: 100,
  /** Poloměr plochy výsečí. */
  face: 90,
  /** Střed zlatého ráfku (tloušťka `rimWidth`). */
  rim: 94,
  rimWidth: 8,
  /** Kolíky na švech — o ně ťuká ručička. */
  pegRadius: 2.1,
  /** Náboj uprostřed (kreslí ho HTML nad kolem, tady jen kvůli rozměrům). */
  hub: 17,
});

/** Bod na kružnici o poloměru `r`; úhel ve stupních po směru od 12 hodin. */
export function polar(r, deg) {
  const rad = (deg * Math.PI) / 180;
  const { center } = WHEEL;
  return { x: center + r * Math.sin(rad), y: center - r * Math.cos(rad) };
}

const fix = n => Math.round(n * 1000) / 1000;

/**
 * SVG cesta jedné výseče: ze středu k okraji, obloukem po směru a zpět.
 * Plné kolo (jediná výseč) se kreslí jako dva půloblouky — oblouk se
 * stejným začátkem a koncem by SVG vůbec nevykreslilo.
 */
export function segmentPath(start, size, r = WHEEL.face) {
  const { center } = WHEEL;
  if (size >= 360 - 1e-9) {
    return `M${center} ${center - r} A${r} ${r} 0 1 1 ${center} ${center + r} `
      + `A${r} ${r} 0 1 1 ${center} ${center - r} Z`;
  }
  const a = polar(r, start);
  const b = polar(r, start + size);
  const large = size > 180 ? 1 : 0;
  return `M${center} ${center} L${fix(a.x)} ${fix(a.y)} `
    + `A${r} ${r} 0 ${large} 1 ${fix(b.x)} ${fix(b.y)} Z`;
}

/**
 * Přibližná šířka znaku písma Outfit 600 v násobcích velikosti písma.
 * Záměrně nadsazená — test počítá s nejhorším případem.
 */
export const CHAR_EM = 0.62;

/** Výseč užší než tohle dostane menší písmo i ikonu (Jackpot, Pokuta). */
export const NARROW_DEG = 15;

/**
 * Rozvržení popisku ve výseči šířky `size`°.
 *
 * Popisek leží PODÉL poloměru — ikona u ráfku, název od ní ke středu.
 * Tečný popisek (dřívější varianta) potřeboval šířku oblouku, takže se
 * do výsečí pod 40° vešla jen ikona; radiálnímu stačí, aby oblouk v jeho
 * nejvnitřnějším bodě byl aspoň tak široký jako písmo. Dosah ke středu
 * hlídá tests/roulette-gate.test.mjs pro každou výseč.
 *
 * @returns {{ iconSize: number, iconR: number, nameSize: number, nameR: number }}
 *   velikosti písma a poloměry (v jednotkách viewBoxu); název začíná na
 *   `nameR` a běží směrem ke středu.
 */
export function labelLayout(size) {
  const narrow = size < NARROW_DEG;
  return narrow
    ? { iconSize: 9, iconR: 80, nameSize: 6, nameR: 72 }
    : { iconSize: 12, iconR: 79, nameSize: 8.5, nameR: 70 };
}

/**
 * Má se název výseče číst od středu k ráfku?
 *
 * Radiální text čtený od ráfku ke středu je vlevo od svislice čitelný
 * (zdola nahoru), vpravo by byl vzhůru nohama. Rozhoduje poloha výseče na
 * ZASTAVENÉM kole (`labelRotation + wheelRotation`) — během točení se
 * orientace stejně nedá číst, po dojetí musí sedět.
 */
export function nameReadsOutward(labelRotation, wheelRotation = 0) {
  const at = (((labelRotation + wheelRotation) % 360) + 360) % 360;
  return at > 1 && at < 179;
}

/** Kam až ke středu dosáhne název `text` při daném rozvržení. */
export function nameInnerRadius(text, layout) {
  return layout.nameR - [...text].length * CHAR_EM * layout.nameSize;
}

/** Šířka oblouku výseče `size`° na poloměru `r`. */
export function arcWidth(r, size) {
  return (2 * Math.PI * r * size) / 360;
}

/**
 * Index výseče, která stojí pod ručičkou při otočení kola o `rotation`°.
 * Podle změny indexu klient pozná, že ručičkou projel šev, a ťukne jí.
 */
export function segmentUnderPointer(rotation, weights) {
  const at = (((360 - (rotation % 360)) % 360) + 360) % 360;
  const bounds = segmentBounds(weights);
  for (let i = 0; i < bounds.length; i++) {
    if (at < bounds[i].start + bounds[i].size) return i;
  }
  return bounds.length - 1;
}

/**
 * O kolik stupňů otočit popisek výseče `index`, aby ležel v jejím středu.
 *
 * Protipól `targetRotation`: ta otáčí CELÝM kolem tak, aby se střed výseče
 * dostal pod ručičku, tahle umísťuje popisek do toho středu v souřadnicích
 * kola. Součet obou musí být násobek 360° — jinak by hráč četl pod ručičkou
 * jiný název, než jaký efekt server doopravdy aplikoval. Hlídá to
 * tests/roulette-gate.test.mjs.
 */
export function segmentLabelRotation(index, weights) {
  return segmentCenter(index, weights);
}

/** Barva plochy podle skupiny výseče (tokeny v :root ve style.css). */
export const GROUP_FACE = {
  good: 'var(--roulette-good)',
  neutral: 'var(--roulette-neutral)',
  bad: 'var(--roulette-bad)',
};

export const GROUP_LABEL = { good: 'Dobré', neutral: 'Neutrální', bad: 'Špatné' };

/**
 * Šance každé skupiny — počítá se z vah, ne z předpokladu „třetina",
 * aby legenda nad kolem nelhala, kdyby se váhy na serveru změnily.
 *
 * @returns {{ group: string, share: number }[]} v pořadí dobré, neutrální, špatné
 */
export function groupOdds(outcomes) {
  const total = outcomes.reduce((s, o) => s + (o.weight || 1), 0) || 1;
  return ['good', 'neutral', 'bad']
    .map(group => ({
      group,
      share: outcomes.filter(o => o.group === group).reduce((s, o) => s + (o.weight || 1), 0) / total,
    }))
    .filter(g => g.share > 0);
}

/** Podíl jako čitelný zlomek nebo procento („⅓", „25 %"). */
export function formatShare(share) {
  const fractions = [[1 / 3, '⅓'], [1 / 2, '½'], [1 / 4, '¼'], [2 / 3, '⅔'], [3 / 4, '¾']];
  const hit = fractions.find(([v]) => Math.abs(v - share) < 1e-6);
  return hit ? hit[1] : `${Math.round(share * 100)} %`;
}
