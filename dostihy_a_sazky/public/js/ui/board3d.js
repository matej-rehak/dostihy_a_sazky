import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { state } from '../state.js';
import { fmt, safeColor } from '../utils.js';
import { socket } from '../socket.js';
import { createDice3d } from './dice3d.js';
import { canRollNow, requestRoll } from './rollRequest.js';
import { prefersReducedMotion } from '../reducedMotion.mjs';
import { cornerArt } from './cornerArt.mjs';
import { tileAmount, tileSuffix } from './rentView.mjs';
import { inflationRaised } from '../animations/inflationTickGate.mjs';
import { stateInflationFactor } from './inflation.mjs';
import { tickNumber } from '../animations/inflationTick.js';
import { playStartPass3d } from '../animations/startPass.js';
import { passesStart } from '../animations/pawnAnimationGate.mjs';
import { createRenderLoop } from './renderLoop.mjs';

// Board geometry constants — mirror CSS grid: corners=80px, regular=1fr
const CORNER_S   = 1.0;
const REGULAR_S  = 0.63;
const TILE_H     = 0.12;
const GAP        = 0.022;
const BOARD_HALF = (CORNER_S + 9 * REGULAR_S + CORNER_S) / 2;

let scene, camera, renderer, controls, renderLoop;
let tileGroups = {};   // spaceId → Mesh
let pawnMeshes = {};   // playerId → Group
let tokenDots  = {};   // spaceId → Mesh[]
let dice3d     = null;
let prevInflation = null;         // Inflace — viz updateBoard3d
const priceTicks = new Map();     // spaceId → zrušení běžícího počítadla
const raycaster = new THREE.Raycaster();

// ── Modely z Blenderu (.glb v public/models/) ────────────────────────────────
// Chybějící soubor není chyba — zůstane jednoduchá figurka poskládaná z kódu.
const PAWN_MODEL_URL = 'models/figurka.glb';
const PAWN_HEIGHT    = 0.38;   // model se na tuhle výšku přeškáluje, ať je v Blenderu jakkoli velký
// Materiál s tímhle jménem (pojmenovaný v Blenderu) dostane barvu hráče
const PLAYER_COLOR_MATERIAL = 'Barva';
let pawnModel = null;

// Deska, rám a střed plánu. Modelováno v Blenderu 1:1 v jednotkách téhle scény
// (horní plocha desky v y = 0, kam se pokládají políčka) — proto se nepřeškáluje.
const BOARD_MODEL_URL = 'models/plan.glb';
const BOARD_BOTTOM    = -0.18;   // spodek desky; na tuhle výšku klesne stůl

// Přeškáluje model na danou výšku, postaví ho spodkem na y = 0 a vycentruje v x/z
function normalizeModel(root, height) {
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  root.scale.multiplyScalar(height / (size.y || 1));
  const box    = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  root.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
  const wrapper = new THREE.Group();
  wrapper.add(root);
  return wrapper;
}

function loadPawnModel() {
  if (pawnModel) return;
  new GLTFLoader().load(PAWN_MODEL_URL, gltf => {
    pawnModel = normalizeModel(gltf.scene, PAWN_HEIGHT);
    if (!scene) return;
    // Figurky postavené z náhradních tvarů vyměníme za model
    Object.values(pawnMeshes).forEach(m => scene.remove(m));
    pawnMeshes = {};
    if (window.__gameState) syncPawns(window.__gameState);
  }, undefined, () => { /* model zatím neexistuje — zůstává náhradní figurka */ });
}

// Žetony dostihů jako ve 2D: kulaté disky s obrázkem žetonu nahoře
// (img/dostih.png žlutý, img/hlavni-dostih.png červený a větší — jako v původní hře).
const TOKEN_STYLES = {
  small: { img: 'img/dostih.png',        radius: 0.05, height: 0.018, side: 0xc9a000 },
  big:   { img: 'img/hlavni-dostih.png', radius: 0.08, height: 0.026, side: 0xa82a2a },
};
const tokenMaterials = {};   // small / big → [bok, vrch, spodek]; sdílené všemi žetony

function tokenMats(kind) {
  if (tokenMaterials[kind]) return tokenMaterials[kind];
  const st = TOKEN_STYLES[kind];
  const tex = new THREE.TextureLoader().load(st.img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const side = new THREE.MeshLambertMaterial({ color: st.side });
  tokenMaterials[kind] = [side, new THREE.MeshLambertMaterial({ map: tex, transparent: true }), side];
  return tokenMaterials[kind];
}

function makeToken(big) {
  const kind = big ? 'big' : 'small';
  const st = TOKEN_STYLES[kind];
  const m = new THREE.Mesh(new THREE.CylinderGeometry(st.radius, st.radius, st.height, 32), tokenMats(kind));
  m.position.y = st.height / 2;   // válec má střed uprostřed, žeton leží spodkem na políčku
  m.rotation.y = -Math.PI / 2;    // obrázek na víčku čitelně k divákovi
  m.castShadow = true;
  const g = new THREE.Group();
  g.add(m);
  return g;
}

// Místo pro žetony: pás mezi jménem a cenou na textuře políčka (cena je u vnějšího
// okraje, u vnitřního stojí figurky) — 0.2 od středu políčka směrem ven
function tokenSpot(spaceId) {
  const spot = pawnSpot(spaceId);
  const t = tileGroups[spaceId];
  const outward = new THREE.Vector3(t.position.x, TILE_H, t.position.z).sub(spot.pos).normalize();
  return { pos: new THREE.Vector3(t.position.x, TILE_H, t.position.z).addScaledVector(outward, 0.2), along: spot.along };
}

// Po načtení nahradí plochý střed a logo z kódu; bez souboru zůstanou
function loadBoardModel(placeholders) {
  const target = scene;
  new GLTFLoader().load(BOARD_MODEL_URL, gltf => {
    if (scene !== target) return;   // pohled se mezitím zavřel
    gltf.scene.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    scene.add(gltf.scene);
    placeholders.center.visible = false;
    placeholders.logo.visible   = false;
    placeholders.floor.position.y = BOARD_BOTTOM;

    const center = gltf.scene.getObjectByName('Stred');
    if (center?.isMesh) paintCenter(center);
    const lines = ['Napis_1', 'Napis_2'].map(n => gltf.scene.getObjectByName(n)).filter(Boolean);
    if (lines.length) styleTitle(lines);
  }, undefined, () => { /* model zatím neexistuje — zůstává plochý střed */ });
}

// Obraz ze středu 2D plánu (.bc-artwork) přes celý vnitřní čtverec. Promítá se
// shora podle rozměrů meshe, takže nezáleží na UV z Blenderu.
const CENTER_ART_URL = 'img/centerpiece.png';

function paintCenter(mesh) {
  const geo = mesh.geometry;
  geo.computeBoundingBox();
  const box = geo.boundingBox;
  const w   = box.max.x - box.min.x;
  const cx  = (box.min.x + box.max.x) / 2;
  const cz  = (box.min.z + box.max.z) / 2;
  const pos = geo.attributes.position;
  const uv  = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2]     = (pos.getX(i) - cx) / w + 0.5;
    uv[i * 2 + 1] = 0.5 - (pos.getZ(i) - cz) / w;   // horní okraj obrazu = vzdálená strana
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const tex = new THREE.TextureLoader().load(CENTER_ART_URL);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  mesh.material = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
}

// Titulek jako ve 2D (.bc-title): zlaté písmo na tmavém štítku se zlatým dvojitým rámem
function styleTitle(lines) {
  const box = new THREE.Box3();
  lines.forEach(text => {
    text.traverse(c => {
      if (c.isMesh) c.material = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.5, roughness: 0.35 });
    });
    box.expandByObject(text);
  });
  const w = box.max.x - box.min.x + 0.5;
  const d = box.max.z - box.min.z + 0.3;

  const PX = 256;   // pixelů na jednotku
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * PX); cv.height = Math.round(d * PX);
  const ctx = cv.getContext('2d');
  const W = cv.width, H = cv.height, line = PX * 0.02, gap = PX * 0.03;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = line;
  ctx.strokeRect(line / 2, line / 2, W - line, H - line);                         // double border: vnější
  ctx.strokeRect(line * 1.5 + gap, line * 1.5 + gap, W - line * 3 - gap * 2, H - line * 3 - gap * 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  plate.rotation.x = -Math.PI / 2;
  // Mezi obrazem (y ≈ 0.004) a spodkem písmen
  plate.position.set((box.min.x + box.max.x) / 2, 0.02, (box.min.z + box.max.z) / 2);
  scene.add(plate);
}

// ── Grid helpers (identical logic to board.js) ────────────────────────────────

function getGridPos(id) {
  if (id === 0)  return [11, 11];
  if (id === 10) return [11,  1];
  if (id === 20) return [ 1,  1];
  if (id === 30) return [ 1, 11];
  if (id >= 1  && id <=  9) return [11, 11 - id];
  if (id >= 11 && id <= 19) return [11 - (id - 10), 1];
  if (id >= 21 && id <= 29) return [1, id - 19];
  if (id >= 31 && id <= 39) return [id - 29, 11];
}

function getSide(id) {
  if ([0, 10, 20, 30].includes(id)) return 'corner';
  if (id >= 1  && id <=  9) return 'bottom';
  if (id >= 11 && id <= 19) return 'left';
  if (id >= 21 && id <= 29) return 'top';
  if (id >= 31 && id <= 39) return 'right';
}

function colToX(col) {
  if (col === 1)  return -BOARD_HALF + CORNER_S / 2;
  if (col === 11) return  BOARD_HALF - CORNER_S / 2;
  return -BOARD_HALF + CORNER_S + (col - 2) * REGULAR_S + REGULAR_S / 2;
}

function rowToZ(row) {
  if (row === 1)  return -BOARD_HALF + CORNER_S / 2;
  if (row === 11) return  BOARD_HALF - CORNER_S / 2;
  return -BOARD_HALF + CORNER_S + (row - 2) * REGULAR_S + REGULAR_S / 2;
}

// ── Canvas textures ───────────────────────────────────────────────────────────

const TYPE_ICONS   = { finance: '💱', nahoda: '?', tax: '📉', go_to_jail: '✋', service: '👤', start: '🚩' };
const SVC_ICONS    = { trener: '👤', preprava: '🚚', staje: '🐴' };

// Obrázkové ikony mají přednost před emoji. Canvas je umí nakreslit až po
// načtení — dlaždice postavené dřív se překreslí v addTile.
function loadImages(srcs) {
  const out = {};
  for (const [key, src] of Object.entries(srcs)) {
    const img = new Image();
    img.src = src;
    out[key] = img;
  }
  return out;
}
const TYPE_IMAGES    = loadImages({ finance: 'img/finance.png', nahoda: 'img/nahoda.png', tax: 'img/veterinar.png' });
const SERVICE_IMAGES = loadImages({ trener: 'img/trener.png', preprava: 'img/preprava.png', staje: 'img/staje.png' });

// Rohy (hlavně 20 a 30) mění ikonku podle režimu hry — obrázky se načítají až podle potřeby
let boardConfig = {};
const cornerImages = new Map();   // src → Image
function cornerImage(src) {
  if (!cornerImages.has(src)) {
    const img = new Image();
    img.src = src;
    cornerImages.set(src, img);
  }
  return cornerImages.get(src);
}

function iconImageFor(space, side) {
  if (side === 'corner') {
    const art = cornerArt(space.id, boardConfig);
    return art?.img ? cornerImage(art.img) : null;
  }
  if (space.type === 'service') return SERVICE_IMAGES[space.serviceType];
  return TYPE_IMAGES[space.type];
}
const imageReady = img => img && img.complete && img.naturalWidth > 0;

function wrapText(ctx, text, maxW, font) {
  ctx.font = font;
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; }
    else line = test;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

// Textura je v „čtecí" orientaci: na výšku, barevný pruh nahoře = ke středu plánu
// (jako ve 2D). Otáčí se celé políčko, ne textura — otočená textura na obdélníku
// by se zdeformovala. Rozlišení odpovídá rozměrům políčka, ať je text ostrý.
const TILE_PX = 560;   // pixelů na jednotku scény

function tileSize(side) {
  const long = CORNER_S - GAP;
  return side === 'corner' ? { w: long, d: long } : { w: REGULAR_S - GAP, d: long };
}

// Barvy a písmo jako 2D políčko (style.css: .space, .space-name, .space-price)
const TILE_BG     = '#121d2d';                  // --bg-card
const TILE_BORDER = 'rgba(255, 255, 255, 0.15)'; // --border-hi
const TILE_TEXT   = '#e2e8f8';                  // --text
const TILE_PRICE  = '#ffd700';                  // --gold
const TILE_FONT   = '"Outfit", sans-serif';

// Vlastnictví jako ve 2D (.own-overlay): závoj v barvě majitele (30 %) a vnitřní rám
function drawOwnership(ctx, W, H, ownerColor) {
  const c = new THREE.Color(ownerColor);
  ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, 0.3)`;
  ctx.fillRect(0, 0, W, H);
  const ring = W * 0.05;
  ctx.strokeStyle = ownerColor;
  ctx.lineWidth = ring;
  ctx.strokeRect(ring / 2, ring / 2, W - ring, H - ring);
}

// priceText: text ceny dole na políčku; u koupeného koně aktuální nájem
function makeTileCanvas(space, side, ownerColor = null, priceText = null) {
  const { w, d } = tileSize(side);
  const W = Math.round(w * TILE_PX), H = Math.round(d * TILE_PX);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const FONT = TILE_FONT;

  ctx.fillStyle = TILE_BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = TILE_BORDER;
  ctx.lineWidth = W * 0.012;
  ctx.strokeRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TILE_TEXT;

  if (side === 'corner') {
    const img = iconImageFor(space, side);
    if (img && imageReady(img)) {
      const sz = W * 0.52;
      ctx.drawImage(img, (W - sz) / 2, H * 0.40 - sz / 2, sz, sz);
    } else {
      ctx.font = `${W * 0.30}px sans-serif`;
      ctx.fillText(cornerArt(space.id, boardConfig).icon, W / 2, H * 0.40);
    }
    const font  = `900 ${W * 0.10}px ${FONT}`;
    const name  = space.id === 0 ? space.name : cornerArt(space.id, boardConfig).name;
    const lines = wrapText(ctx, name.toUpperCase(), W * 0.9, font);
    ctx.font = font;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, H * 0.78 + i * W * 0.11));
    return cv;
  }

  const stripeH = H * 0.13;
  if (space.type === 'horse' && space.groupColor) {
    ctx.fillStyle = space.groupColor;
    ctx.fillRect(0, 0, W, stripeH);
  }
  if (ownerColor) drawOwnership(ctx, W, H, ownerColor);

  let icon = '';
  if (space.type === 'service') icon = SVC_ICONS[space.serviceType] ?? TYPE_ICONS.service;
  else if (space.type !== 'horse') icon = TYPE_ICONS[space.type] ?? '';

  const img = iconImageFor(space, side);
  const hasIcon = (img && imageReady(img)) || icon;
  if (img && imageReady(img)) {
    // Veterinář má pod ikonou dva řádky názvu i poplatek — menší ikona
    const sz = W * (space.type === 'tax' ? 0.52 : 0.70);
    ctx.drawImage(img, (W - sz) / 2, H * 0.40 - sz / 2, sz, sz);
  } else if (icon) {
    ctx.font = `${W * 0.34}px sans-serif`;
    ctx.fillStyle = TILE_TEXT;
    ctx.fillText(icon, W / 2, H * 0.40);
  }

  const nameFont = `800 ${W * 0.13}px ${FONT}`;
  const lines    = wrapText(ctx, space.name.toUpperCase(), W * 0.9, nameFont);
  const lineH    = W * 0.17;
  const baseY    = hasIcon ? H * 0.70 : H * 0.44 - ((lines.length - 1) * lineH) / 2;
  ctx.font      = nameFont;
  ctx.fillStyle = ownerColor ? '#ffffff' : TILE_TEXT;   // pod závojem světlejší, jako .is-owned
  lines.forEach((l, i) => ctx.fillText(l, W / 2, baseY + i * lineH));

  const amount = space.price || space.amount;   // amount = poplatek Veterináře
  if (amount) {
    const text = priceText ?? fmt(amount) + ' Kč';
    // Dlouhá částka (např. 40 000 Kč) se nesmí vylít z políčka — písmo se zmenší
    let size = W * 0.12;
    ctx.font = `900 ${size}px ${FONT}`;
    const maxW = W * 0.9;
    const textW = ctx.measureText(text).width;
    if (textW > maxW) {
      size *= maxW / textW;
      ctx.font = `900 ${size}px ${FONT}`;
    }
    ctx.fillStyle = TILE_PRICE;
    ctx.fillText(text, W / 2, H * 0.90);
  }

  return cv;
}

// ── Build scene ───────────────────────────────────────────────────────────────

export function buildBoard3d(boardData, canvas) {
  if (scene) return;

  const W = canvas.clientWidth  || 600;
  const H = canvas.clientHeight || 600;

  scene = new THREE.Scene();
  // Pozadí i mlha v barvě stolu — na širokém plátně nesmí být vidět okraj podlahy
  scene.background = new THREE.Color(0x0b1a0c);
  scene.fog = new THREE.Fog(0x0b1a0c, 14, 34);

  camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
  camera.position.set(0, 9.0, 6.6);   // blíž — plátno je teď široké, plán se vejde na výšku
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance   = 3.5;
  controls.maxDistance   = 18;
  controls.maxPolarAngle = Math.PI / 2.05;

  scene.add(new THREE.AmbientLight(0xffffff, 0.62));
  const sun = new THREE.DirectionalLight(0xfff8e7, 0.88);
  sun.position.set(4, 10, 6);
  sun.castShadow = true;
  scene.add(sun);

  // Green felt floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshLambertMaterial({ color: 0x143314 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.01;
  scene.add(floor);

  // Cream center area
  const innerW = BOARD_HALF * 2 - 2 * (CORNER_S + REGULAR_S) + GAP * 4;
  const center = new THREE.Mesh(
    new THREE.PlaneGeometry(innerW, innerW),
    new THREE.MeshLambertMaterial({ color: 0xfdf6e3 })
  );
  center.rotation.x = -Math.PI / 2;
  center.position.y = 0.001;
  scene.add(center);

  // Center logo
  const lc = document.createElement('canvas');
  lc.width = 512; lc.height = 512;
  const lx = lc.getContext('2d');
  lx.fillStyle = 'rgba(139,69,19,0.88)';
  lx.font = 'bold 88px Bebas Neue, sans-serif';
  lx.textAlign = 'center';
  lx.textBaseline = 'middle';
  lx.fillText('DOSTIHY', 256, 208);
  lx.fillText('A SÁZKY', 256, 308);
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(innerW * 0.68, innerW * 0.68),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(lc), transparent: true })
  );
  logo.rotation.x = -Math.PI / 2;
  logo.position.y = 0.003;
  scene.add(logo);

  // Odlesky pro kovové materiály z Blenderu (zlatá lišta, trofej) — bez prostředí by byly černé
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.3;
  pmrem.dispose();

  boardData.forEach(space => addTile(space));
  loadBoardModel({ floor, center, logo });
  loadPawnModel();
  dice3d = createDice3d(scene);

  // Tažení kamery končí taky „clickem" — ten nesmí hodit kostkou ani vybrat políčko
  let downAt = null;
  canvas.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('click', e => {
    if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5) return;
    handleClick(e, canvas);
  });

  const ro = new ResizeObserver(() => {
    if (!renderer || !camera) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  });
  ro.observe(canvas);

  renderLoop = createRenderLoop(() => {
    controls.update();
    dice3d?.tick(performance.now());
    pulseGlows(performance.now());
    renderer.render(scene, camera);
  });
  renderLoop.start();
}

// Ve 2D je 3D plátno jen skryté — smyčka se zastaví, ať scéna zbytečně nekreslí.
export function pauseBoard3d()  { renderLoop?.stop(); }
export function resumeBoard3d() { renderLoop?.start(); }

// Zvýraznění políčka jako ve 2D: vnitřní rám + záře dovnitř, pulzuje.
// turn = .current-turn, airport = .airport-selectable, self = .airport-selectable.is-self
const GLOW_STYLES = {
  turn:    { rgb: '255, 215, 0', ring: 0.8,  inner: 0.3,  period: 1500, min: 0.5 },
  airport: { rgb: '255, 215, 0', ring: 0.55, inner: 0.3,  period: 1600, min: 0.55 },
  self:    { rgb: '255, 77, 77', ring: 0.5,  inner: 0.15, period: 0,    min: 1 },
};
const glowTextures = new Map();   // "corner|turn" → CanvasTexture

function glowTexture(side, style) {
  const key = `${side === 'corner' ? 'corner' : 'edge'}|${style}`;
  if (glowTextures.has(key)) return glowTextures.get(key);
  const { w, d } = tileSize(side);
  const PX = 160;
  const W = Math.round(w * PX), H = Math.round(d * PX);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const g = GLOW_STYLES[style];
  const depth = PX * 0.12;   // jak daleko dovnitř záře sahá
  const edges = [
    [0, 0, 0, depth, 0, 0, W, depth],          // nahoře
    [0, H, 0, H - depth, 0, H - depth, W, depth],
    [0, 0, depth, 0, 0, 0, depth, H],          // vlevo
    [W, 0, W - depth, 0, W - depth, 0, depth, H],
  ];
  for (const [x0, y0, x1, y1, rx, ry, rw, rh] of edges) {
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    grad.addColorStop(0, `rgba(${g.rgb}, ${g.inner})`);
    grad.addColorStop(1, `rgba(${g.rgb}, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(rx, ry, rw, rh);
  }
  const ring = PX * 0.035;
  ctx.strokeStyle = `rgba(${g.rgb}, ${g.ring})`;
  ctx.lineWidth = ring;
  ctx.strokeRect(ring / 2, ring / 2, W - ring, H - ring);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowTextures.set(key, tex);
  return tex;
}

// Pulz všech zvýrazněných políček; volá se každý snímek
function pulseGlows(now) {
  const still = prefersReducedMotion();
  for (const tile of Object.values(tileGroups)) {
    const glow = tile.userData.glow;
    if (!glow?.visible) continue;
    const g = GLOW_STYLES[glow.userData.style];
    glow.material.opacity = still || !g.period
      ? 1
      : g.min + (1 - g.min) * (0.5 + 0.5 * Math.cos((now / g.period) * Math.PI * 2));
  }
}

const TILE_ROTATION = { corner: 0, bottom: 0, top: Math.PI, left: -Math.PI / 2, right: Math.PI / 2 };

function addTile(space) {
  const [row, col] = getGridPos(space.id);
  const side = getSide(space.id);
  const { w, d } = tileSize(side);

  const topTex = new THREE.CanvasTexture(makeTileCanvas(space, side));
  topTex.colorSpace = THREE.SRGBColorSpace;
  topTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  let ownerColor = null;
  let priceText = null;
  const redraw = () => {
    topTex.image = makeTileCanvas(space, side, ownerColor, priceText);
    topTex.needsUpdate = true;
    // Ikonka se ještě načítá — překreslit, až dorazí (i po změně režimu rohu)
    const iconImg = iconImageFor(space, side);
    if (iconImg && !imageReady(iconImg)) iconImg.addEventListener('load', redraw, { once: true });
  };
  const iconImg = iconImageFor(space, side);
  if (iconImg && !imageReady(iconImg)) iconImg.addEventListener('load', redraw, { once: true });
  // Canvas kreslí záložním písmem, dokud se nenačte Bebas Neue
  document.fonts?.ready.then(() => { if (scene) redraw(); });

  const edge = new THREE.MeshLambertMaterial({ color: 0x0c1422 });
  const top  = new THREE.MeshLambertMaterial({ map: topTex });
  const mats = [edge, edge, top, edge, edge, edge];

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, TILE_H, d), mats);
  mesh.position.set(colToX(col), TILE_H / 2, rowToZ(row));
  // Horní strana textury (pruh) míří v modelu k -z; otočíme ji ke středu plánu
  mesh.rotation.y = TILE_ROTATION[side];
  mesh.receiveShadow = true;
  mesh.userData.spaceId = space.id;
  mesh.userData.side    = side;
  mesh.userData.redraw  = redraw;

  // Zvýraznění leží těsně nad horní plochou; je dítětem políčka, otáčí se s ním
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false })
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = TILE_H / 2 + 0.003;
  glow.visible = false;
  glow.raycast = () => {};   // klik na políčko (letiště) musí trefit políčko, ne záři
  mesh.add(glow);
  mesh.userData.glow = glow;
  mesh.userData.setGlow = style => {
    glow.visible = !!style;
    if (!style || glow.userData.style === style) return;
    glow.userData.style = style;
    glow.material.map = glowTexture(side, style);
    glow.material.needsUpdate = true;
  };
  // Překreslí se jen při změně majitele — canvas je drahý
  mesh.userData.setOwner = color => {
    if (color === ownerColor) return;
    ownerColor = color;
    redraw();
  };
  mesh.userData.setPriceText = text => {
    if (text === priceText) return;
    priceText = text;
    redraw();
  };
  mesh.userData.space = space;
  scene.add(mesh);
  tileGroups[space.id] = mesh;
}

// ── Update ────────────────────────────────────────────────────────────────────

// instant: jen ukázat stav bez animace hodu (přepnutí z 2D, kdy hod proběhl mimo 3D)
export function updateBoard3d(gameState, { instant = false } = {}) {
  if (!scene) return;

  const pa        = gameState.pendingAction;
  const inAirport = pa?.type === 'airport_select_target' && pa.targetId === state.myId;
  const me        = gameState.players.find(p => p.id === state.myId);
  const myPos     = me?.position;
  const curPlayer = gameState.players.find(p => p.id === gameState.currentTurnId);

  // Režim polí 20 / 30 (Parkoviště ↔ Letiště, Doping ↔ Ruleta)
  const cfg = gameState.config ?? {};
  if (cfg.field20Mode !== boardConfig.field20Mode || cfg.field30Mode !== boardConfig.field30Mode) {
    boardConfig = { field20Mode: cfg.field20Mode, field30Mode: cfg.field30Mode };
    tileGroups[20]?.userData.redraw();
    tileGroups[30]?.userData.redraw();
  }

  // Zvýraznění políček jako ve 2D
  Object.values(tileGroups).forEach(mesh => {
    const sid = mesh.userData.spaceId;
    let style = null;
    if (inAirport)                                   style = sid === myPos ? 'self' : 'airport';
    else if (curPlayer && sid === curPlayer.position) style = 'turn';
    mesh.userData.setGlow(style);
  });

  // Vlastnictví: závoj a rám v barvě majitele přímo na políčku (jako ve 2D)
  Object.entries(tileGroups).forEach(([sid, tile]) => {
    const owner = gameState.players.find(p => p.id === gameState.ownerships?.[sid]);
    tile.userData.setOwner(owner ? safeColor(owner.color) : null);
  });

  // Koupený kůň ukazuje místo ceny aktuální nájem, Veterinář svůj poplatek —
  // stejně jako 2D (rentView.mjs tileAmount). Vše po inflaci z Rulety.
  const board = Object.values(tileGroups).map(t => t.userData.space).sort((a, b) => a.id - b.id);
  // Po Inflaci se ceny protočí nahoru jako ve 2D; textura se přitom kreslí
  // jen ~12× za sekundu, víc by oko nepoznalo.
  const factor = stateInflationFactor(gameState);
  const inflating = inflationRaised(prevInflation, factor);
  prevInflation = factor;
  Object.values(tileGroups).forEach(tile => {
    const space = tile.userData.space;
    const amount = tileAmount(board, gameState, space.id);
    if (amount === null) return;
    const suffix = tileSuffix(board, gameState, space.id);
    const shown = tile.userData.amount;
    if (shown === amount && tile.userData.suffix === suffix) return;
    priceTicks.get(space.id)?.();
    priceTicks.delete(space.id);
    tile.userData.amount = amount;
    tile.userData.suffix = suffix;
    const show = v => tile.userData.setPriceText(`${fmt(v)}${suffix}`);
    if (!inflating || !Number.isFinite(shown)) { show(amount); return; }
    priceTicks.set(space.id, tickNumber(shown, amount, show, {
      minStepMs: 80,
      onDone: () => priceTicks.delete(space.id),
    }));
  });

  // Žetony dostihů — řada disků u vnějšího okraje políčka
  Object.values(tokenDots).forEach(arr => arr?.forEach(m => scene.remove(m)));
  tokenDots = {};
  Object.entries(gameState.tokens || {}).forEach(([sid, tok]) => {
    if (!tileGroups[sid]) return;
    const spot = tokenSpot(sid);
    const count = tok.big ? 1 : tok.small;
    const arr = [];
    for (let i = 0; i < count; i++) {
      const m = makeToken(tok.big);
      m.position.copy(spot.pos).addScaledVector(spot.along, (i - (count - 1) / 2) * 0.11);
      scene.add(m); arr.push(m);
    }
    tokenDots[sid] = arr;
  });

  dice3d?.update(gameState.lastDice, canRollNow(gameState), instant);
  syncPawns(gameState);
}

// ── Pawns ─────────────────────────────────────────────────────────────────────

// Figurky stojí u vnitřního okraje políčka (na barevném pruhu), ne uprostřed —
// jinak zakrývají jméno koně. Směr ke středu plánu podle strany:
const INWARD = { bottom: [0, -1], top: [0, 1], left: [1, 0], right: [-1, 0] };
const PAWN_INSET = 0.32;   // od středu políčka ke vnitřnímu okraji

// Místo figurky na políčku a směr, kterým se vedle sebe řadí víc figurek
function pawnSpot(spaceId) {
  const t = tileGroups[spaceId];
  if (!t) return { pos: new THREE.Vector3(0, 1, 0), along: new THREE.Vector3(1, 0, 0) };
  let [ix, iz] = INWARD[t.userData.side] ?? [0, 0];
  if (t.userData.side === 'corner') {            // roh: úhlopříčně ke středu
    const len = Math.hypot(t.position.x, t.position.z) || 1;
    ix = -t.position.x / len; iz = -t.position.z / len;
  }
  const inset = t.userData.side === 'corner' ? 0.22 : PAWN_INSET;
  return {
    pos:   new THREE.Vector3(t.position.x + ix * inset, TILE_H, t.position.z + iz * inset),
    along: new THREE.Vector3(-iz, 0, ix),
  };
}

function syncPawns(gameState) {
  gameState.players.forEach(p => {
    if (p.bankrupt) {
      if (pawnMeshes[p.id]) { scene.remove(pawnMeshes[p.id]); delete pawnMeshes[p.id]; }
      return;
    }
    if (!pawnMeshes[p.id]) { pawnMeshes[p.id] = makePawn(p); scene.add(pawnMeshes[p.id]); }

    const visPos    = state.clientVisualPos[p.id] ?? p.position;
    const sameSpace = gameState.players.filter(q => !q.bankrupt && (state.clientVisualPos[q.id] ?? q.position) === visPos);
    const idx       = sameSpace.findIndex(q => q.id === p.id);
    const spot      = pawnSpot(visPos);
    const shift     = (idx - (sameSpace.length - 1) / 2) * 0.13;
    pawnMeshes[p.id].position.copy(spot.pos).addScaledVector(spot.along, shift);

    const active = p.id === gameState.currentTurnId;
    pawnMeshes[p.id].traverse(child => {
      if (child.isMesh) child.material.emissive?.setHex(active ? 0x332200 : 0x000000);
    });
  });
}

function makePawn(player) {
  const color = new THREE.Color(safeColor(player.color));
  if (pawnModel) {
    const model = pawnModel.clone(true);
    model.traverse(child => {
      if (!child.isMesh) return;
      child.castShadow = true;
      // clone() materiály sdílí — každá figurka potřebuje vlastní kvůli barvě a zvýraznění tahu
      child.material = child.material.clone();
      if (child.material.name === PLAYER_COLOR_MATERIAL) child.material.color.copy(color);
    });
    return model;
  }

  const mat   = () => new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(0) });
  const group = new THREE.Group();
  const base  = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.04, 10), mat());
  base.position.y = 0.02;
  const body  = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.088, 0.22, 10), mat());
  body.position.y = 0.13;
  const head  = new THREE.Mesh(new THREE.SphereGeometry(0.088, 10, 10), mat());
  head.position.y = 0.29;
  group.add(base, body, head);
  group.castShadow = true;
  return group;
}

/** Kde je střed políčka na obrazovce (px od levého horního rohu okna). */
function tileScreenPoint(spaceId) {
  const tile = tileGroups[spaceId];
  if (!tile || !camera || !renderer) return null;
  const v = tile.getWorldPosition(new THREE.Vector3()).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  return {
    x: rect.left + (v.x + 1) / 2 * rect.width,
    y: rect.top + (1 - v.y) / 2 * rect.height,
  };
}

export function animatePawns3d(gameState, onDone) {
  const needs = gameState.players.some(
    p => !p.bankrupt && (state.clientVisualPos[p.id] ?? p.position) !== p.position
  );
  if (!needs) { syncPawns(gameState); return false; }
  if (state.isAnimatingPawn) return true;

  state.isAnimatingPawn = true;
  const longest = gameState.players.reduce((max, p) => {
    if (p.bankrupt) return max;
    const cur = state.clientVisualPos[p.id] ?? p.position;
    if (cur === p.position) return max;
    const fwd = (p.position - cur + 40) % 40;
    const bwd = (cur - p.position + 40) % 40;
    return Math.max(max, p.moveDirection === -1 ? bwd : fwd);
  }, 0);
  const delay = longest <= 3 ? 180 : longest <= 6 ? 150 : 120;

  const step = () => {
    let still = false;
    gameState.players.forEach(p => {
      if (p.bankrupt) return;
      const cur = state.clientVisualPos[p.id] ?? p.position;
      if (cur !== p.position) {
        state.clientVisualPos[p.id] = p.moveDirection === -1
          ? (cur - 1 + 40) % 40
          : (cur + 1) % 40;
        if (passesStart(state.clientVisualPos[p.id], p.moveDirection)) playStartPass3d(gameState, tileScreenPoint(0));
        if (state.clientVisualPos[p.id] !== p.position) still = true;
      }
    });
    syncPawns(gameState);
    if (still) setTimeout(step, delay);
    else { state.isAnimatingPawn = false; syncPawns(gameState); onDone?.(); }
  };
  step();
  return true;
}

// ── Raycasting click (airport card) ──────────────────────────────────────────

function handleClick(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  raycaster.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1
    ),
    camera
  );

  if (dice3d?.hit(raycaster)) { requestRoll(); return; }

  const gs = window.__gameState;
  const pa = gs?.pendingAction;
  if (!pa || pa.type !== 'airport_select_target' || pa.targetId !== state.myId) return;

  const hits = raycaster.intersectObjects(Object.values(tileGroups));
  if (!hits.length) return;
  const sid = hits[0].object.userData.spaceId;
  if (sid === undefined) return;
  const me = gs.players?.find(p => p.id === state.myId);
  if (me?.position === sid) return;
  socket.emit('game:respond', { decision: 'fly', spaceId: sid });
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

export function destroyBoard3d() {
  renderLoop?.stop(); renderLoop = null;
  controls?.dispose();
  renderer?.dispose();
  scene?.clear();
  scene = null; camera = null; renderer = null; controls = null;
  tileGroups = {}; pawnMeshes = {}; tokenDots = {};
  priceTicks.forEach(cancel => cancel()); priceTicks.clear(); prevInflation = null;
  dice3d = null;
}
