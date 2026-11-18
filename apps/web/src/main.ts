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

// ---------- street and map mode ----------
/** 0 = street view behind the character, 1 = map view of the whole island. Animated between. */
let blend = 0, blendTarget = 0;
/** Runs once when the camera arrives back in the street. */
let onArrive: (() => void) | null = null;
/** The start of a visit: hold the map for a moment, then move down to the character. */
let introHold = 0;
const MOVE_TIME = 1.6;
const ease = (t: number) => t * t * (3 - 2 * t);
const inMap = () => blendTarget === 1;

function tryMove(dx: number, dz: number): boolean {
  if (island.isWalkable(player.x + dx, player.z + dz, BODY)) { player.x += dx; player.z += dz; return true; }
  // slide along the obstacle
  if (island.isWalkable(player.x + dx, player.z, BODY)) { player.x += dx; return true; }
  if (island.isWalkable(player.x, player.z + dz, BODY)) { player.z += dz; return true; }
  return false;
}

function stepBlend(dt: number) {
  if (introHold > 0) { introHold -= dt; if (introHold <= 0) blendTarget = 0; }
  const before = blend;
  blend = blendTarget > blend ? Math.min(blendTarget, blend + dt / MOVE_TIME) : Math.max(blendTarget, blend - dt / MOVE_TIME);
  if (before > 0 && blend === 0 && onArrive) { const f = onArrive; onArrive = null; f(); }
}

function stepPlayer(dt: number) {
  simTime += dt;
  stepBlend(dt);
  if (blend > 0) { player.moving = false; player.walk = 0; return; }
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
const mapPos = new THREE.Vector3(), mapLook = new THREE.Vector3(0, 0.2, 0.6);
const STREET_FOV = 50, MAP_FOV = 30, MAP_ELEVATION = 0.62, MAP_YAW = 0.35;
function mapPose() {
  resize();
  // far enough that the whole island fits, also on a narrow (phone) screen
  const R = island.radius, aspect = Math.max(0.3, camera.aspect);
  const d = R * Math.max(3.2, 1.08 / (Math.tan(THREE.MathUtils.degToRad(MAP_FOV / 2)) * aspect));
  mapPos.set(d * Math.cos(MAP_ELEVATION) * Math.sin(MAP_YAW), d * Math.sin(MAP_ELEVATION), d * Math.cos(MAP_ELEVATION) * Math.cos(MAP_YAW));
}
const fog = scene.fog as THREE.Fog;
const sc = sun.shadow.camera;
let shadowExtent = 0;
function updateCamera(dt: number, snap = false) {
  cameraGoal();
  const k = snap ? 1 : 1 - Math.exp(-dt * 5);
  // move in at once when blocked, so the camera never shows the inside of a house
  camPos.lerp(goal.pos, goal.blocked ? 1 : k); camLook.lerp(goal.look, k);
  mapPose();
  const e = ease(blend);
  camera.position.lerpVectors(camPos, mapPos, e);
  const look = new THREE.Vector3().lerpVectors(camLook, mapLook, e);
  camera.lookAt(look);
  const fov = THREE.MathUtils.lerp(STREET_FOV, MAP_FOV, e);
  if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
  // on the map, fog starts behind the island and hides the end of the sea
  const mapDistance = mapPos.length();
  fog.near = THREE.MathUtils.lerp(18, mapDistance * 1.25, e); fog.far = THREE.MathUtils.lerp(80, mapDistance * 2.6, e);
  // the shadow box follows the street camera, or covers the whole island on the map
  const extent = e > 0.5 ? island.radius * 1.15 : 9;
  if (extent !== shadowExtent) { shadowExtent = extent; sc.left = -extent; sc.right = extent; sc.top = extent; sc.bottom = -extent; sc.far = e > 0.5 ? 140 : 80; sc.updateProjectionMatrix(); }
  const cx = e > 0.5 ? 0 : camLook.x, cz = e > 0.5 ? 0 : camLook.z, lift = e > 0.5 ? 2.5 : 1;
  sun.target.position.set(cx, 0, cz);
  sun.position.set(cx - 16 * lift, 20 * lift, cz + 7 * lift);
}

function enterMap() {
  if (inMap()) return;
  target = null; pendingOpen = null; onArrive = null; keys.clear();
  reader.close(); blendTarget = 1; setHint(true); updateUi();
}
function leaveMap(then?: () => void) {
  introHold = 0;
  blendTarget = 0; onArrive = then ?? null; updateUi();
  if (blend === 0 && onArrive) { const f = onArrive; onArrive = null; f(); }
}
/** From the map: stand in front of a day, move down, and open its entry on arrival. */
function jumpTo(day: number) {
  if (day === 1) Object.assign(player, { x: 0.3, z: 2.6, heading: Math.PI }); else standAt(day);
  cameraGoal(); camPos.copy(goal.pos); camLook.copy(goal.look);
  syncCharacter();
  leaveMap(() => reader.open(day));
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
  if (introHold > 0) leaveMap();
  if (e.code === 'KeyM' && !e.repeat) { if (inMap()) leaveMap(); else enterMap(); redraw(); }
  else if (e.code === 'KeyE' && !e.repeat) { if (!inMap()) reader.toggle(); redraw(); }
  else if (e.code === 'Escape') { if (inMap()) leaveMap(); else reader.close(); redraw(); }
  else if (!inMap()) keys.add(e.code);
});
/** In test mode nothing draws on its own, so input that changes the interface draws once. */
function redraw() { if (TEST) render(); }
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.5);
let down: { x: number; y: number; t: number } | null = null;
// pinch: two fingers apart walk into the street, together zoom out to the map
const touches = new Map<number, { x: number; y: number }>();
let pinchStart = 0, pinched = false;
const pinchDistance = () => { const [a, b] = [...touches.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };

function pick(clientX: number, clientY: number) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
  camera.updateMatrixWorld();
  raycaster.setFromCamera(pointer, camera);
  const hit = new THREE.Vector3();
  const groundHit = raycaster.ray.intersectPlane(ground, hit) && island.coast(hit.x, hit.z) < 0.86 ? hit : null;
  if (inMap()) {
    // on the map the plots are small: take the plot whose center is nearest to the pointer
    let best: number | null = null, bestD = 30;
    const v = new THREE.Vector3();
    for (const p of island.plots) {
      v.set(p.x, p.y + 0.3, p.z).project(camera);
      const d = Math.hypot((v.x * 0.5 + 0.5) * rect.width - (clientX - rect.left), (-v.y * 0.5 + 0.5) * rect.height - (clientY - rect.top));
      if (d < bestD) { bestD = d; best = p.day; }
    }
    return { day: best, ground: groundHit };
  }
  const plotHit = raycaster.intersectObjects([...world.plotMeshes.values()], false)[0];
  return { day: plotHit ? (plotHit.object.userData.day as number) : null, ground: groundHit };
}

canvas.addEventListener('pointerdown', e => {
  if (introHold > 0) leaveMap();
  down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { pinchStart = pinchDistance(); pinched = false; }
  }
});
canvas.addEventListener('pointermove', e => {
  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2 && !pinched && pinchStart > 0) {
      const r = pinchDistance() / pinchStart;
      if (r < 0.75) { pinched = true; enterMap(); } else if (r > 1.33) { pinched = true; leaveMap(); }
    }
  } else if (e.pointerType === 'mouse' && inMap() && blend === 1) {
    const day = pick(e.clientX, e.clientY).day;
    if (day !== reader.hoverDay) { reader.hoverDay = day; canvas.style.cursor = day ? 'pointer' : ''; redraw(); }
  }
});
const endTouch = (e: PointerEvent) => { touches.delete(e.pointerId); if (touches.size < 2) pinchStart = 0; };
canvas.addEventListener('pointercancel', endTouch);
canvas.addEventListener('pointerup', e => {
  const wasPinch = pinched || touches.size > 1;
  endTouch(e);
  if (wasPinch) { if (touches.size === 0) pinched = false; down = null; return; }
  if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 12) { down = null; return; }
  down = null;
  const { day, ground: groundHit } = pick(e.clientX, e.clientY);
  if (inMap()) {
    // on the map: a tap on a day goes there; a tap on the ground puts the visitor there
    if (blend < 1) return;
    if (day) jumpTo(day);
    else if (groundHit && island.isWalkable(groundHit.x, groundHit.z, BODY)) {
      Object.assign(player, { x: groundHit.x, z: groundHit.z });
      cameraGoal(); camPos.copy(goal.pos); camLook.copy(goal.look); syncCharacter();
      leaveMap();
    }
  } else if (day) {
    // in the street: a tap on a plot walks to its door and opens the entry; a tap on the ground walks there
    const door = island.plots[day - 1]!.door;
    if (Math.hypot(door.x - player.x, door.z - player.z) < 1.5) { reader.open(day); target = null; pendingOpen = null; }
    else { target = { x: door.x, z: door.z }; pendingOpen = day; }
  } else if (groundHit) { target = { x: groundHit.x, z: groundHit.z }; pendingOpen = null; }
  setHint(false);
  redraw();
});
// scroll out for the map, scroll in for the street
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  if (e.deltaY > 0) enterMap(); else if (e.deltaY < 0 && inMap()) leaveMap();
  redraw();
}, { passive: false });

// ---------- interface ----------
const ui = document.getElementById('ui')!;
const touch = matchMedia('(pointer: coarse)').matches;
ui.innerHTML = `
  <div class="panel brand"><span class="day">Day ${island.dayCount}</span><span class="sub">one new object for each day</span></div>
  <button class="panel mode" id="mode" type="button"></button>
  <div class="panel hint" id="hint"></div>`;
const hint = document.getElementById('hint')!;
const modeButton = document.getElementById('mode') as HTMLButtonElement;
modeButton.addEventListener('click', () => { if (inMap()) leaveMap(); else enterMap(); modeButton.blur(); redraw(); });
function setHint(show: boolean) { hint.classList.toggle('hidden', !show); }
function updateUi() {
  const map = inMap();
  modeButton.textContent = map ? 'Back to the street' : 'Map';
  modeButton.setAttribute('aria-label', map ? 'Back to the street view' : 'Show the map of the island');
  hint.innerHTML = map
    ? (touch ? 'Tap a day to go there · spread two fingers to go back' : '<b>Click a day</b> to go there · scroll in or <b>M</b> to go back')
    : (touch ? 'Tap the ground to walk · pinch two fingers for the map' : '<b>W A S D</b> or arrows to walk · <b>M</b> or scroll out for the map');
  if (!map) canvas.style.cursor = '';
}
updateUi();
addEventListener('keydown', () => { if (!inMap()) setHint(false); }, { once: true });
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
  blend = blendTarget = 0; introHold = 0; onArrive = null; updateUi();
  reader.open(day);
  syncCharacter(); updateCamera(0, true);
}
openFromHash();
// a visit starts on the map, then moves down to the character (tests ask for it with ?intro)
if (reader.openDay === null && (!TEST || params.has('intro'))) { blend = blendTarget = 1; introHold = 1.2; updateUi(); }
addEventListener('hashchange', () => { openFromHash(); redraw(); });

// ---------- loop ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
}
function render() { resize(); reader.update(player, camera, simTime, canvas.clientWidth, canvas.clientHeight, blend > 0.5); renderer.render(scene, camera); }

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
VIEWS.map = () => { VIEWS.street!(); blend = blendTarget = 1; };

window.__island = {
  ready: true,
  dayCount: island.dayCount,
  step,
  view(name: string) {
    const v = VIEWS[name]; if (!v) throw new Error(`unknown view ${name}`);
    target = null; pendingOpen = null; onArrive = null; introHold = 0; blend = blendTarget = 0; keys.clear(); reader.close(); reader.hoverDay = null;
    v(); updateUi(); syncCharacter(); updateCamera(0, true); render();
  },
  mode: () => (blend !== blendTarget ? 'moving' : blend === 1 ? 'map' : 'street'),
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
