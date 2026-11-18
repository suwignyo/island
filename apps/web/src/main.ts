import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './style.css';
import * as THREE from 'three';
import { buildIsland, validateEntries, type DayEntry } from '@island/world';
import entries from '../../../content/days.json';
import { buildScene } from './scene.ts';
import { character } from './kit.ts';
import './test-hooks.ts';

const params = new URLSearchParams(location.search);
/** Test mode: no clock, no animation loop. Tests drive the world with window.__island.step(). */
const TEST = params.has('test');
const FIXED_DT = 1 / 60;

const days = entries as DayEntry[];
const problems = validateEntries(days);
if (problems.length) throw new Error(`Invalid journal entries:\n${problems.join('\n')}`);
const island = buildIsland(days);

// ---------- renderer and scene ----------
const canvas = document.getElementById('world') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: TEST });
renderer.setPixelRatio(TEST ? 1 : Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const world = buildScene(island);
const { scene, sun } = world;
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 900);

const me = character();
me.group.scale.setScalar(1.2);
scene.add(me.group);

// ---------- player state ----------
const SPEED = 2.0, TURN = 2.6, BODY = 0.15;
const player = { x: island.start.x, z: island.start.z, heading: island.start.heading, walk: 0, moving: false };
let target: { x: number; z: number } | null = null;
const keys = new Set<string>();

function tryMove(dx: number, dz: number): boolean {
  if (island.isWalkable(player.x + dx, player.z + dz, BODY)) { player.x += dx; player.z += dz; return true; }
  // slide along the obstacle
  if (island.isWalkable(player.x + dx, player.z, BODY)) { player.x += dx; return true; }
  if (island.isWalkable(player.x, player.z + dz, BODY)) { player.z += dz; return true; }
  return false;
}

function stepPlayer(dt: number) {
  let forward = 0, turn = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 0.6;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
  if (forward || turn) target = null;
  if (target) {
    const dx = target.x - player.x, dz = target.z - player.z, dist = Math.hypot(dx, dz);
    if (dist < 0.08) target = null;
    else {
      const want = Math.atan2(dx, dz);
      let diff = want - player.heading; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      player.heading += Math.max(-TURN * 1.6 * dt, Math.min(TURN * 1.6 * dt, diff));
      forward = Math.abs(diff) < 1.2 ? Math.min(1, dist / 0.3) : 0;
    }
  }
  player.heading += turn * TURN * dt;
  player.moving = false;
  if (forward) {
    const step = forward * SPEED * dt;
    player.moving = tryMove(Math.sin(player.heading) * step, Math.cos(player.heading) * step);
    if (!player.moving) target = null;
  }
  player.walk = player.moving ? player.walk + dt * 11 : 0;
}

// ---------- camera ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function cameraGoal(out: { pos: THREE.Vector3; look: THREE.Vector3 }) {
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading), y = island.height(player.x, player.z);
  out.pos.set(player.x - fx * 2.7, y + 1.45, player.z - fz * 2.7);
  out.look.set(player.x + fx * 1.8, y + 0.3, player.z + fz * 1.8);
}
const goal = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
function updateCamera(dt: number, snap = false) {
  cameraGoal(goal);
  const k = snap ? 1 : 1 - Math.exp(-dt * 5);
  camPos.lerp(goal.pos, k); camLook.lerp(goal.look, k);
  camera.position.copy(camPos); camera.lookAt(camLook);
  // the shadow box follows the camera
  sun.target.position.set(camLook.x, 0, camLook.z);
  sun.position.set(camLook.x - 16, 20, camLook.z + 7);
}

function syncCharacter() {
  me.group.position.set(player.x, island.height(player.x, player.z) + 0.03, player.z);
  me.group.rotation.y = player.heading;
  const swing = Math.sin(player.walk) * 0.6;
  me.legs[0]!.rotation.x = swing; me.legs[1]!.rotation.x = -swing;
}

// ---------- input ----------
addEventListener('keydown', e => { if (!e.metaKey && !e.ctrlKey) keys.add(e.code); });
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
let down: { x: number; y: number; t: number } | null = null;
canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
canvas.addEventListener('pointerup', e => {
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; }
  down = null;
  const rect = canvas.getBoundingClientRect();
  pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = new THREE.Vector3();
  if (raycaster.ray.intersectPlane(ground, hit) && island.coast(hit.x, hit.z) < 0.86) target = { x: hit.x, z: hit.z };
  setHint(false);
});

// ---------- interface ----------
const ui = document.getElementById('ui')!;
const touch = matchMedia('(pointer: coarse)').matches;
ui.innerHTML = `
  <div class="panel brand"><span class="day">Day ${island.dayCount}</span><span class="sub">one new object for each day</span></div>
  <div class="panel hint" id="hint">${touch ? 'Tap the ground to walk' : '<b>W A S D</b> or arrows to walk · or click the ground'}</div>`;
const hint = document.getElementById('hint')!;
function setHint(show: boolean) { hint.classList.toggle('hidden', !show); }
addEventListener('keydown', () => setHint(false), { once: true });

// ---------- loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}
function render() { resize(); renderer.render(scene, camera); }

function step(frames: number) {
  for (let i = 0; i < frames; i++) { stepPlayer(FIXED_DT); updateCamera(FIXED_DT); }
  syncCharacter(); render();
}

syncCharacter(); updateCamera(0, true); render();

if (!TEST) {
  let last = performance.now(), acc = 0;
  const frame = (now: number) => {
    acc += Math.min(0.25, (now - last) / 1000); last = now;
    while (acc >= FIXED_DT) { stepPlayer(FIXED_DT); updateCamera(FIXED_DT); acc -= FIXED_DT; }
    syncCharacter(); render();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---------- test hooks ----------
const VIEWS: Record<string, () => void> = {
  street: () => { Object.assign(player, { x: island.start.x, z: island.start.z, heading: island.start.heading }); },
};
for (const type of ['house', 'tree', 'garden'] as const) {
  VIEWS[type] = () => {
    const p = island.plots.find(q => q.type === type)!;
    // stand on the street, look at the plot from the front
    const bx = p.door.x + (p.door.x - p.x) * 1.0, bz = p.door.z + (p.door.z - p.z) * 1.0;
    Object.assign(player, { x: bx, z: bz, heading: Math.atan2(p.x - bx, p.z - bz) });
  };
}
VIEWS.origin = () => { Object.assign(player, { x: 0.3, z: 3.2, heading: Math.PI }); };

window.__island = {
  ready: true,
  dayCount: island.dayCount,
  step,
  view(name: string) { const v = VIEWS[name]; if (!v) throw new Error(`unknown view ${name}`); target = null; keys.clear(); v(); syncCharacter(); updateCamera(0, true); render(); },
  walkTo(x: number, z: number) { target = { x, z }; },
  player: () => ({ x: player.x, z: player.z, heading: player.heading }),
  stats: () => { render(); return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
  hideUi(hide: boolean) { ui.style.display = hide ? 'none' : ''; },
};
