import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import './style.css';
import * as THREE from 'three';
import { buildIsland, loadJournal } from '@island/world';
import { buildScene } from './scene.ts';
import { character } from './kit.ts';
import { Reader } from './reading.ts';
import './test-hooks.ts';

const params = new URLSearchParams(location.search);
/** Test mode: no clock, no animation loop. Tests drive the world with window.__island.step(). */
const TEST = params.has('test');
const FIXED_DT = 1 / 60;

// one Markdown file for each day, bundled at build time
const files = import.meta.glob<string>('../../../content/days/*.md', { query: '?raw', import: 'default', eager: true });
const journal = loadJournal(files);
if (journal.errors.length) throw new Error(`Invalid journal:\n${journal.errors.join('\n')}`);
const days = journal.entries;
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
/** A plot the visitor walks to after a tap; its entry opens on arrival. */
let pendingOpen: number | null = null;
let simTime = 0;
const keys = new Set<string>();

function tryMove(dx: number, dz: number): boolean {
  if (island.isWalkable(player.x + dx, player.z + dz, BODY)) { player.x += dx; player.z += dz; return true; }
  // slide along the obstacle
  if (island.isWalkable(player.x + dx, player.z, BODY)) { player.x += dx; return true; }
  if (island.isWalkable(player.x, player.z + dz, BODY)) { player.z += dz; return true; }
  return false;
}

function stepPlayer(dt: number) {
  simTime += dt;
  let forward = 0, turn = 0;
  if (keys.has('KeyW') || keys.has('ArrowUp')) forward += 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) forward -= 0.6;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) turn += 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) turn -= 1;
  if (forward || turn) { target = null; pendingOpen = null; }
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
  if (pendingOpen !== null) {
    const door = island.plots[pendingOpen - 1]!.door;
    if (Math.hypot(door.x - player.x, door.z - player.z) < 0.45) { reader.open(pendingOpen); pendingOpen = null; target = null; }
    else if (!target) pendingOpen = null;
  }
}

// ---------- camera ----------
const CAM_BACK = 2.7, CAM_UP = 1.45, LOOK_AHEAD = 1.8;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
const goal = { pos: new THREE.Vector3(), look: new THREE.Vector3(), blocked: false };
const camRay = new THREE.Raycaster();
const camBlockers: THREE.Object3D[] = [...world.plotMeshes.values(), ...(world.decor ? [world.decor] : [])];
const head = new THREE.Vector3(), toCam = new THREE.Vector3();

function cameraGoal() {
  const fx = Math.sin(player.heading), fz = Math.cos(player.heading), y = island.height(player.x, player.z);
  goal.pos.set(player.x - fx * CAM_BACK, y + CAM_UP, player.z - fz * CAM_BACK);
  goal.look.set(player.x + fx * LOOK_AHEAD, y + 0.3, player.z + fz * LOOK_AHEAD);
  // if a house or a tree is between the character and the camera, move the camera in front of it
  head.set(player.x, y + 0.55, player.z);
  toCam.subVectors(goal.pos, head);
  const full = toCam.length();
  camRay.set(head, toCam.normalize());
  camRay.far = full;
  const hit = camRay.intersectObjects(camBlockers, false)[0];
  goal.blocked = !!hit;
  if (hit) goal.pos.copy(head).addScaledVector(toCam, Math.max(0.5, hit.distance - 0.3));
}
function updateCamera(dt: number, snap = false) {
  cameraGoal();
  const k = snap ? 1 : 1 - Math.exp(-dt * 5);
  // move in at once when blocked, so the camera never shows the inside of a house
  camPos.lerp(goal.pos, goal.blocked ? 1 : k); camLook.lerp(goal.look, k);
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
addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey) return;
  if (e.code === 'KeyE' && !e.repeat) { reader.toggle(); redraw(); }
  else if (e.code === 'Escape') { reader.close(); redraw(); }
  else keys.add(e.code);
});
/** In test mode nothing draws on its own, so input that changes the interface draws once. */
function redraw() { if (TEST) render(); }
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
  // a tap on a plot walks to its door and opens the entry; a tap on the ground walks there
  const plotHit = raycaster.intersectObjects([...world.plotMeshes.values()], false)[0];
  if (plotHit) {
    const day = plotHit.object.userData.day as number, door = island.plots[day - 1]!.door;
    if (Math.hypot(door.x - player.x, door.z - player.z) < 1.5) { reader.open(day); target = null; pendingOpen = null; }
    else { target = { x: door.x, z: door.z }; pendingOpen = day; }
  } else {
    const hit = new THREE.Vector3();
    if (raycaster.ray.intersectPlane(ground, hit) && island.coast(hit.x, hit.z) < 0.86) { target = { x: hit.x, z: hit.z }; pendingOpen = null; }
  }
  setHint(false);
  redraw();
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
const reader = new Reader(island, days, world.plotMeshes, scene, ui, touch);

/**
 * Stands the visitor at the door of a plot, turned to it at an angle, so that the camera is
 * on the street and not inside the plots on the other side. Picks the side with a free view.
 */
function standAt(day: number) {
  const p = island.plots[day - 1]!;
  const ox = p.door.x - p.x, oz = p.door.z - p.z, l = Math.hypot(ox, oz);
  const x = p.door.x + (ox / l) * 0.35, z = p.door.z + (oz / l) * 0.35;
  const toPlot = Math.atan2(p.x - x, p.z - z);
  // a narrow (phone) screen shows less to the sides, so turn less
  const t = canvas.clientWidth < canvas.clientHeight ? 0.38 : 0.75;
  let best = toPlot + t;
  for (const turn of [t, -t]) {
    Object.assign(player, { x, z, heading: toPlot + turn });
    cameraGoal();
    if (!goal.blocked) { best = toPlot + turn; break; }
  }
  Object.assign(player, { x, z, heading: best });
}
// a link like #day-5 opens that day
function openFromHash() {
  const m = /^#day-(\d+)$/.exec(location.hash), day = m ? Number(m[1]) : 0;
  if (day < 1 || day > island.dayCount || reader.openDay === day) return;
  target = null; pendingOpen = null;
  if (day === 1) Object.assign(player, { x: 0.3, z: 2.6, heading: Math.PI }); else standAt(day);
  reader.open(day);
  syncCharacter(); updateCamera(0, true);
}
openFromHash();
addEventListener('hashchange', () => { openFromHash(); redraw(); });

// ---------- loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}
function render() { resize(); reader.update(player, camera, simTime, canvas.clientWidth, canvas.clientHeight); renderer.render(scene, camera); }

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
    standAt(island.plots.find(q => q.type === type)!.day);
  };
}
VIEWS.origin = () => { Object.assign(player, { x: 0.3, z: 3.2, heading: Math.PI }); };

window.__island = {
  ready: true,
  dayCount: island.dayCount,
  step,
  view(name: string) { const v = VIEWS[name]; if (!v) throw new Error(`unknown view ${name}`); target = null; pendingOpen = null; keys.clear(); reader.close(); v(); syncCharacter(); updateCamera(0, true); render(); },
  walkTo(x: number, z: number) { target = { x, z }; },
  player: () => ({ x: player.x, z: player.z, heading: player.heading }),
  stats: () => { render(); return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles }; },
  hideUi(hide: boolean) { ui.style.display = hide ? 'none' : ''; },
  nearDay: () => reader.nearDay,
  plot: (day: number) => { const p = island.plots[day - 1]!; return { x: p.x, z: p.z, radius: p.radius }; },
  coast: (x: number, z: number) => island.coast(x, z),
  openDay: () => reader.openDay,
  screenOf(day: number) {
    camera.updateMatrixWorld();
    const p = island.plots[day - 1]!, v = new THREE.Vector3(p.x, p.y + 0.4, p.z).project(camera);
    return { x: (v.x * 0.5 + 0.5) * canvas.clientWidth, y: (-v.y * 0.5 + 0.5) * canvas.clientHeight };
  },
};
