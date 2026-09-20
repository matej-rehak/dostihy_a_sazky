import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { state } from '../state.js';
import { fmt, safeColor } from '../utils.js';
import { socket } from '../socket.js';

// Board geometry constants — mirror CSS grid: corners=80px, regular=1fr
const CORNER_S   = 1.0;
const REGULAR_S  = 0.63;
const TILE_H     = 0.12;
const GAP        = 0.022;
const BOARD_HALF = (CORNER_S + 9 * REGULAR_S + CORNER_S) / 2;

let scene, camera, renderer, controls, animId;
let tileGroups = {};   // spaceId → Mesh
let pawnMeshes = {};   // playerId → Group
let ownDots    = {};   // spaceId → Mesh
let tokenDots  = {};   // spaceId → Mesh[]
const raycaster = new THREE.Raycaster();

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

function tileDims(row, col) {
  const cRow = row === 1 || row === 11;
  const cCol = col === 1 || col === 11;
  return {
    w: (cCol ? CORNER_S : REGULAR_S) - GAP,
    d: (cRow ? CORNER_S : REGULAR_S) - GAP,
  };
}

// ── Canvas textures ───────────────────────────────────────────────────────────

const CORNER_ICONS = { 0: '🚩', 10: '✋', 20: '🅿', 30: '🚫' };
const TYPE_ICONS   = { finance: '💱', nahoda: '?', tax: '📉', go_to_jail: '✋', service: '👤', start: '🚩' };
const SVC_ICONS    = { trener: '👤', preprava: '🚚', staje: '🐴' };

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

function makeTileCanvas(space, side) {
  const S = 192;
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = S;
  const ctx = cv.getContext('2d');

  ctx.fillStyle = '#e8d38b';
  ctx.fillRect(0, 0, S, S);

  if (side === 'corner') {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, S, S);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#3a2000';
    ctx.font = `${S * 0.27}px sans-serif`;
    ctx.fillText(CORNER_ICONS[space.id] ?? '⬜', S / 2, S * 0.38);
    ctx.font = `bold ${S * 0.10}px Bebas Neue, sans-serif`;
    ctx.fillText(space.name.toUpperCase(), S / 2, S * 0.70);
    return cv;
  }

  // Colored stripe at canvas-bottom (UV maps this toward the board center)
  if (space.type === 'horse' && space.groupColor) {
    ctx.fillStyle = space.groupColor;
    ctx.fillRect(0, S - 28, S, 28);
  }

  let icon = '';
  if (space.type === 'service') icon = SVC_ICONS[space.serviceType] ?? TYPE_ICONS.service;
  else if (space.type !== 'horse') icon = TYPE_ICONS[space.type] ?? '';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (icon) {
    ctx.font = `${S * 0.20}px sans-serif`;
    ctx.fillStyle = '#3a2000';
    ctx.fillText(icon, S / 2, S * 0.40);
  }

  const nameFont = `bold ${S * 0.087}px Bebas Neue, sans-serif`;
  const lines    = wrapText(ctx, space.name.toUpperCase(), S - 18, nameFont);
  const lineH    = S * 0.105;
  const baseY    = icon ? S * 0.62 : S * 0.46 - ((lines.length - 1) * lineH) / 2;
  ctx.font      = nameFont;
  ctx.fillStyle = '#3a2000';
  lines.forEach((l, i) => ctx.fillText(l, S / 2, baseY + i * lineH));

  if (space.price) {
    ctx.font      = `${S * 0.076}px sans-serif`;
    ctx.fillStyle = '#a06010';
    ctx.fillText(fmt(space.price) + ' Kč', S / 2, S * 0.87);
  }

  return cv;
}

// ── Build scene ───────────────────────────────────────────────────────────────

export function buildBoard3d(boardData, canvas) {
  if (scene) return;

  const W = canvas.clientWidth  || 600;
  const H = canvas.clientHeight || 600;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x142030);
  scene.fog = new THREE.Fog(0x142030, 20, 32);

  camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
  camera.position.set(0, 9.5, 7.5);
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
    new THREE.PlaneGeometry(14, 14),
    new THREE.MeshLambertMaterial({ color: 0x28622a })
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

  boardData.forEach(space => addTile(space));

  canvas.addEventListener('click', e => handleClick(e, canvas));

  const ro = new ResizeObserver(() => {
    if (!renderer || !camera) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  });
  ro.observe(canvas);

  const loop = () => {
    animId = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  };
  loop();
}

function addTile(space) {
  const [row, col] = getGridPos(space.id);
  const side = getSide(space.id);
  const { w, d } = tileDims(row, col);

  const topTex = new THREE.CanvasTexture(makeTileCanvas(space, side));
  topTex.center.set(0.5, 0.5);
  // Rotate UV so text/stripe faces toward the board center
  if (side === 'top')   topTex.rotation =  Math.PI;
  if (side === 'left')  topTex.rotation =  Math.PI / 2;
  if (side === 'right') topTex.rotation = -Math.PI / 2;

  const beige = new THREE.MeshLambertMaterial({ color: 0xe8d38b });
  const top   = new THREE.MeshLambertMaterial({ map: topTex });
  const mats  = [beige, beige, top, beige, beige, beige];

  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, TILE_H, d), mats);
  mesh.position.set(colToX(col), TILE_H / 2, rowToZ(row));
  mesh.receiveShadow = true;
  mesh.userData.spaceId = space.id;
  scene.add(mesh);
  tileGroups[space.id] = mesh;
}

// ── Update ────────────────────────────────────────────────────────────────────

export function updateBoard3d(gameState) {
  if (!scene) return;

  const pa        = gameState.pendingAction;
  const inAirport = pa?.type === 'airport_select_target' && pa.targetId === state.myId;
  const me        = gameState.players.find(p => p.id === state.myId);
  const myPos     = me?.position;
  const curPlayer = gameState.players.find(p => p.id === gameState.currentTurnId);

  // Tile highlights
  Object.values(tileGroups).forEach(mesh => {
    let hex = 0x000000;
    if (inAirport) {
      hex = mesh.userData.spaceId === myPos ? 0x220000 : 0x001400;
    } else if (curPlayer && mesh.userData.spaceId === curPlayer.position) {
      hex = 0x222200;
    }
    if (Array.isArray(mesh.material)) mesh.material.forEach(m => m.emissive?.setHex(hex));
  });

  // Ownership dots
  Object.values(ownDots).forEach(m => scene.remove(m));
  ownDots = {};
  Object.entries(gameState.ownerships || {}).forEach(([sid, pid]) => {
    const owner = gameState.players.find(p => p.id === pid);
    const tile  = tileGroups[sid];
    if (!owner || !tile) return;
    const dot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.055, 0.065, 8),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(safeColor(owner.color)) })
    );
    dot.position.set(tile.position.x, TILE_H + 0.033, tile.position.z);
    scene.add(dot);
    ownDots[sid] = dot;
  });

  // Token dots (gold cylinders above tile)
  Object.values(tokenDots).forEach(arr => arr?.forEach(m => scene.remove(m)));
  tokenDots = {};
  Object.entries(gameState.tokens || {}).forEach(([sid, tok]) => {
    const tile = tileGroups[sid];
    if (!tile) return;
    const arr    = [];
    const goldMat = () => new THREE.MeshLambertMaterial({ color: 0xffd700 });
    if (tok.big) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.07, 8), goldMat());
      m.position.set(tile.position.x + 0.1, TILE_H + 0.035, tile.position.z);
      scene.add(m); arr.push(m);
    } else {
      for (let i = 0; i < tok.small; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.06, 8), goldMat());
        m.position.set(tile.position.x + (i - (tok.small - 1) / 2) * 0.1, TILE_H + 0.03, tile.position.z);
        scene.add(m); arr.push(m);
      }
    }
    tokenDots[sid] = arr;
  });

  syncPawns(gameState);
}

// ── Pawns ─────────────────────────────────────────────────────────────────────

function tileWorldPos(spaceId) {
  const t = tileGroups[spaceId];
  return t
    ? new THREE.Vector3(t.position.x, TILE_H + 0.22, t.position.z)
    : new THREE.Vector3(0, 1, 0);
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
    const ox        = (idx - (sameSpace.length - 1) / 2) * 0.13;
    const wp        = tileWorldPos(visPos);
    pawnMeshes[p.id].position.set(wp.x + ox, wp.y, wp.z);

    const active = p.id === gameState.currentTurnId;
    pawnMeshes[p.id].traverse(child => {
      if (child.isMesh) child.material.emissive?.setHex(active ? 0x332200 : 0x000000);
    });
  });
}

function makePawn(player) {
  const color = new THREE.Color(safeColor(player.color));
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
  const gs = window.__gameState;
  const pa = gs?.pendingAction;
  if (!pa || pa.type !== 'airport_select_target' || pa.targetId !== state.myId) return;

  const rect = canvas.getBoundingClientRect();
  raycaster.setFromCamera(
    new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width)  *  2 - 1,
      ((e.clientY - rect.top)  / rect.height) * -2 + 1
    ),
    camera
  );
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
  if (animId) { cancelAnimationFrame(animId); animId = null; }
  controls?.dispose();
  renderer?.dispose();
  scene?.clear();
  scene = null; camera = null; renderer = null; controls = null;
  tileGroups = {}; pawnMeshes = {}; ownDots = {}; tokenDots = {};
}
