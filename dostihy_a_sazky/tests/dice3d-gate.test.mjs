import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  FACE_NORMALS, faceUpNormal, throwHeight, throwTravel, spinRemaining, sixPulseScale, FIRST_IMPACT,
} from '../public/js/ui/dice3dGate.mjs';

test('každá hodnota 1–6 má jednotkovou normálu podél osy', () => {
  for (let v = 1; v <= 6; v++) {
    const n = faceUpNormal(v);
    assert.ok(n, `hodnota ${v} nemá normálu`);
    assert.equal(n.reduce((s, c) => s + Math.abs(c), 0), 1);
  }
  assert.equal(faceUpNormal(0), null);
  assert.equal(faceUpNormal(7), null);
});

test('protilehlé stěny dávají součet 7 a všech šest stěn je různých', () => {
  for (let v = 1; v <= 6; v++) {
    const n = FACE_NORMALS[v];
    const o = FACE_NORMALS[7 - v];
    assert.deepEqual(n.map(c => -c + 0), o, `${v} a ${7 - v} nejsou naproti sobě`);
  }
  const keys = new Set(Object.values(FACE_NORMALS).map(n => n.join(',')));
  assert.equal(keys.size, 6);
});

// Model a FACE_NORMALS se musí shodovat, jinak kostka ukáže jinou hodnotu, než padla.
// Tečky mají vlastní materiál — na každé stěně spočítáme jejich vrcholy a porovnáme
// poměr s počtem teček, který té stěně přiřazuje FACE_NORMALS.
test('model kostky má na každé stěně tolik teček, kolik říká FACE_NORMALS', () => {
  const glb = readFileSync(fileURLToPath(new URL('../public/models/kostka.glb', import.meta.url)));
  const jsonLen = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const bin = glb.subarray(20 + jsonLen + 8);

  const pipMat = gltf.materials.findIndex(m => m.name === 'Tecka');
  assert.notEqual(pipMat, -1, 'model nemá materiál Tecka');
  const prim = gltf.meshes[0].primitives.find(p => p.material === pipMat);
  const acc = gltf.accessors[prim.attributes.POSITION];
  const view = gltf.bufferViews[acc.bufferView];
  const pos = new Float32Array(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0) + (acc.byteOffset ?? 0), acc.count * 3);

  const PIP_GRID = 0.085;   // rozestup teček v modelu
  for (let v = 1; v <= 6; v++) {
    const n = FACE_NORMALS[v];
    const axis = n.findIndex(c => c !== 0);
    const [ia, ib] = [0, 1, 2].filter(i => i !== axis);
    const pips = new Set();
    for (let i = 0; i < acc.count; i++) {
      const p = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      // důlek leží 0.14–0.16 od středu; tečky sousedních stěn sahají max. na 0.115
      if (p[axis] * n[axis] < 0.13) continue;
      pips.add(`${Math.round(p[ia] / PIP_GRID)},${Math.round(p[ib] / PIP_GRID)}`);
    }
    assert.equal(pips.size, v, `stěna ${v} má ${pips.size} teček`);
  }
});

test('výška hodu začíná na startu, dopadá a končí na zemi', () => {
  assert.equal(throwHeight(0, 1.3), 1.3);
  assert.ok(Math.abs(throwHeight(FIRST_IMPACT, 1.3)) < 1e-9);
  assert.equal(throwHeight(1, 1.3), 0);
  for (let i = 0; i <= 100; i++) {
    assert.ok(throwHeight(i / 100, 1.3) >= 0, `pod zemí v t=${i / 100}`);
  }
});

test('výška je spojitá — žádný skok mezi odskoky', () => {
  for (let i = 1; i <= 1000; i++) {
    const a = throwHeight((i - 1) / 1000, 1.3);
    const b = throwHeight(i / 1000, 1.3);
    assert.ok(Math.abs(a - b) < 0.02, `skok v t=${i / 1000}: ${a} → ${b}`);
  }
});

test('kostka dojede na místo dopadu a přestane se točit', () => {
  assert.equal(throwTravel(0), 0);
  assert.equal(throwTravel(1), 1);
  assert.equal(spinRemaining(0), 1);
  assert.equal(spinRemaining(1), 0);
});

test('pulz šestky začíná i končí v původní velikosti', () => {
  assert.equal(sixPulseScale(0), 1);
  assert.ok(Math.abs(sixPulseScale(1) - 1) < 1e-9);
  assert.ok(sixPulseScale(0.5) > 1.2);
});
