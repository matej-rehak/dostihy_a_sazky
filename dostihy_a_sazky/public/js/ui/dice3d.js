// 3D kostka uprostřed plánu pod titulkem. Časování hodu je stejné jako u CSS
// kostky (diceAnimationGate.mjs) — server o něj po šestce odkládá další hod.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SPIN_MS, LAND_MS, SIX_ANIM_MS, shouldStartRollAnimation } from '../animations/diceAnimationGate.mjs';
import { faceUpNormal, throwHeight, throwTravel, spinRemaining, sixPulseScale } from './dice3dGate.mjs';
import { isEffectEnabled } from '../settings.js';

const MODEL_URL   = 'models/kostka.glb';
const HALF        = 0.16;                                   // polovina hrany (model 1:1)
const REST        = new THREE.Vector3(0, 0.004 + HALF, 1.25);   // pod titulkem, jako kostka ve 2D
const THROW_FROM  = new THREE.Vector3(0.9, 1.5, 3.4);        // odkud přiletí (od hráče)
const THROW_MS    = SPIN_MS + LAND_MS;
const SPIN_TURNS  = 3;
const GLOW_COLOR  = new THREE.Color(0xffc34d);
const UP          = new THREE.Vector3(0, 1, 0);

function restQuaternion(value) {
  const n = faceUpNormal(value) ?? faceUpNormal(1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(...n), UP);
  const yaw = new THREE.Quaternion().setFromAxisAngle(UP, (Math.random() - 0.5) * 0.8);
  return yaw.multiply(q);
}

export function createDice3d(scene) {
  const root = new THREE.Group();
  root.position.copy(REST);
  root.visible = false;   // bez modelu kostku neukazujeme — plná kostka bez teček by nic neřekla
  scene.add(root);

  const glowMats = [];
  let prevId   = undefined;   // undefined = ještě jsme nic neukázali
  let restQ    = restQuaternion(1);
  let anim     = null;        // { start, axis, six }
  let pulse    = null;        // { start }
  let rollable = false;

  new GLTFLoader().load(MODEL_URL, gltf => {
    const body = gltf.scene.getObjectByName('Kostka');
    if (!body) return;
    body.removeFromParent();
    body.position.set(0, 0, 0);
    body.traverse(c => {
      if (!c.isMesh) return;
      c.castShadow = true;
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      mats.forEach(m => { if (m.name === 'KostkaTelo' && m.emissive) glowMats.push(m); });
    });
    root.add(body);
    root.quaternion.copy(restQ);
    root.visible = true;
  }, undefined, () => { /* model chybí — kostka zůstane jen v panelu akcí */ });

  function setGlow(intensity) {
    glowMats.forEach(m => { m.emissive.copy(GLOW_COLOR); m.emissiveIntensity = intensity; });
  }

  /**
   * @param lastDice  gameState.lastDice
   * @param canRoll   smí tento hráč hodit (kostka jemně svítí)
   * @param instant   jen ukázat hodnotu bez animace (přepnutí do 3D)
   */
  function update(lastDice, canRoll, instant = false) {
    rollable = canRoll;
    if (!lastDice) return;
    if (prevId === undefined || instant) {
      if (lastDice.id === prevId) return;
      prevId = lastDice.id;
      anim = null; pulse = null;
      restQ = restQuaternion(lastDice.value);
      root.position.copy(REST);
      root.quaternion.copy(restQ);
      return;
    }
    if (!shouldStartRollAnimation(lastDice, prevId)) return;
    prevId = lastDice.id;
    restQ = restQuaternion(lastDice.value);
    const axis = new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    anim  = { start: performance.now(), axis, six: lastDice.value === 6 };
    pulse = null;
    root.scale.setScalar(1);
  }

  const spinQ = new THREE.Quaternion();
  function tick(now) {
    if (anim) {
      const t = Math.min(1, (now - anim.start) / THROW_MS);
      root.position.lerpVectors(THROW_FROM, REST, throwTravel(t));
      root.position.y = REST.y + throwHeight(t, THROW_FROM.y - REST.y);
      spinQ.setFromAxisAngle(anim.axis, SPIN_TURNS * Math.PI * 2 * spinRemaining(t));
      root.quaternion.multiplyQuaternions(spinQ, restQ);
      if (t >= 1) {
        if (anim.six && isEffectEnabled('sixSparks')) pulse = { start: now };
        anim = null;
      }
    }

    if (pulse) {
      const s = (now - pulse.start) / SIX_ANIM_MS;
      root.scale.setScalar(sixPulseScale(s));
      setGlow(0.9 * Math.sin(Math.PI * Math.min(1, s)));
      if (s >= 1) { pulse = null; root.scale.setScalar(1); }
      return;
    }

    setGlow(rollable && !anim ? 0.18 + 0.14 * Math.sin(now / 280) : 0);
  }

  /** Trefil paprsek kostku? */
  function hit(raycaster) {
    return root.visible && raycaster.intersectObject(root, true).length > 0;
  }

  return { update, tick, hit };
}
