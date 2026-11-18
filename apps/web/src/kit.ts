/**
 * Shape kit. Every object is made in code from simple solids: no model files.
 * Builders return a Group of meshes. `bake` merges a group into one mesh with
 * vertex colors, so a whole plot (or all decor) costs one draw call.
 */
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { rng, type Rng } from '@island/world';

export const PALETTE = {
  grass: [0xa9d873, 0x9bcf66, 0x8fc55d],
  sand: 0xf4e3b1, sandDark: 0xe3dc9b,
  street: 0xefe2bd,
  wall: 0xfff3e0, door: 0x9a6a45, glass: 0x7cc3e6, chimney: 0xc9b8a3,
  trunk: 0x8a5a3c, pine: [0x3f8f5f, 0x4c9a63], leaf: [0x7fbf5a, 0x8fcf63, 0x6fb24f],
  rock: [0xb9b2a8, 0xa8a198], soil: 0x9a6a45, flowers: [0xf7b2c4, 0xf4b942, 0xffffff, 0xe5533d, 0x8e6bbf],
  wood: 0xb88455, metal: 0x6b7280,
  sea: [0xa9ece4, 0x86dfe2, 0x66cfdf, 0x52c0d9, 0x45b2d3],
} as const;

const tint = (hex: number, dl = 0) => new THREE.Color(hex).offsetHSL(0, 0, dl).getHex();

/** A mesh part. The color is stored on the mesh and baked into vertex colors later. */
function part(geo: THREE.BufferGeometry, color: number): THREE.Mesh {
  const m = new THREE.Mesh(geo);
  m.userData.color = color;
  return m;
}

export function blob(radius: number, detail: number, jitter: number, r: Rng): THREE.BufferGeometry {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) { const k = 1 + (r() - 0.5) * 2 * jitter; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  return g;
}

function gableRoof(w: number, d: number, h: number, over = 0.12): THREE.BufferGeometry {
  const x = w / 2 + over, z = d / 2 + over;
  const v = [-x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0, x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0,
    x, 0, z, x, 0, -z, x, h, 0, -x, 0, -z, -x, 0, z, -x, h, 0, -x, 0, -z, x, 0, -z, x, 0, z, -x, 0, -z, x, 0, z, -x, 0, z];
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); return g;
}

// ---------- objects ----------
export interface HouseOptions { roof: number; hip: boolean; w: number; d: number; h: number; chimney: boolean }
export function house(o: HouseOptions): THREE.Group {
  const g = new THREE.Group(), { w, d, h } = o, rh = h * 0.78;
  const body = part(new THREE.BoxGeometry(w, h, d), PALETTE.wall); body.position.y = h / 2; g.add(body);
  let roof: THREE.Mesh;
  if (o.hip) { roof = part(new THREE.ConeGeometry(1, rh, 4, 1, false, Math.PI / 4), o.roof); roof.scale.set((w / 2 + 0.12) / 0.7071, 1, (d / 2 + 0.12) / 0.7071); roof.position.y = h + rh / 2; }
  else { roof = part(gableRoof(w, d, rh), o.roof); roof.position.y = h; }
  g.add(roof);
  const door = part(new THREE.BoxGeometry(w * 0.17, h * 0.5, 0.04), PALETTE.door); door.position.set(-w * 0.2, h * 0.25, d / 2 + 0.01); g.add(door);
  const win = (x: number, z: number, ry: number) => { const m = part(new THREE.BoxGeometry(w * 0.18, h * 0.26, 0.04), PALETTE.glass); m.position.set(x, h * 0.55, z); m.rotation.y = ry; g.add(m); };
  win(w * 0.2, d / 2 + 0.01, 0); win(w / 2 + 0.01, 0, Math.PI / 2); win(-w / 2 - 0.01, 0, Math.PI / 2); win(0, -d / 2 - 0.01, 0);
  if (o.chimney) { const c = part(new THREE.BoxGeometry(0.13, rh * 0.8, 0.13), PALETTE.chimney); c.position.set(w * 0.25, h + rh * 0.5, -d * 0.18); g.add(c); }
  return g;
}

export function roundTree(r: Rng, h: number, leaf: number): THREE.Group {
  const g = new THREE.Group(), th = h * 0.36, rad = h * 0.34;
  const t = part(new THREE.CylinderGeometry(h * 0.045, h * 0.07, th, 6), PALETTE.trunk); t.position.y = th / 2; g.add(t);
  const b = part(blob(rad, 1, 0.12, r), leaf); b.position.y = th + rad * 0.72; b.scale.y = 0.88 + r() * 0.2; g.add(b);
  if (r() < 0.65) { const b2 = part(blob(rad * 0.62, 1, 0.12, r), tint(leaf, 0.04)); b2.position.set((r() - 0.5) * rad * 1.2, th + rad * 1.3, (r() - 0.5) * rad * 1.2); g.add(b2); }
  g.rotation.y = r() * 6.28; return g;
}

export function pine(r: Rng, h: number, color: number): THREE.Group {
  const g = new THREE.Group(), th = h * 0.2;
  const t = part(new THREE.CylinderGeometry(h * 0.04, h * 0.06, th, 6), PALETTE.trunk); t.position.y = th / 2; g.add(t);
  for (let i = 0; i < 3; i++) {
    const rad = h * 0.3 * (1 - 0.24 * i), hh = h * 0.42 * (1 - 0.08 * i);
    const m = part(new THREE.ConeGeometry(rad, hh, 7), tint(color, 0.035 * i)); m.position.y = th + h * 0.22 * i + hh / 2; m.rotation.y = r() * 6.28; g.add(m);
  }
  g.rotation.y = r() * 6.28; return g;
}

export function bigTree(r: Rng): THREE.Group {
  const g = new THREE.Group();
  const t = part(new THREE.CylinderGeometry(0.16, 0.26, 1.5, 7), PALETTE.trunk); t.position.y = 0.75; g.add(t);
  const spots: [number, number, number, number][] = [[0, 2.2, 0, 1.15], [0.75, 1.9, 0.3, 0.8], [-0.7, 1.85, -0.25, 0.85], [0.1, 2.0, -0.8, 0.75], [-0.1, 2.95, 0.15, 0.75]];
  spots.forEach(([x, y, z, rad], i) => { const b = part(blob(rad, 1, 0.1, r), tint(0x6fb24f, i * 0.015)); b.position.set(x, y, z); b.scale.y = 0.85; g.add(b); });
  return g;
}

export function bush(r: Rng, s: number, color: number): THREE.Group {
  const g = new THREE.Group(); const b = part(blob(s, 1, 0.15, r), color); b.position.y = s * 0.55; b.scale.y = 0.75; g.add(b); return g;
}

export function rock(r: Rng, s: number): THREE.Group {
  const g = new THREE.Group(); const b = part(blob(s, 0, 0.22, r), PALETTE.rock[r() < 0.5 ? 0 : 1]);
  b.scale.set(1, 0.62 + r() * 0.25, 0.8 + r() * 0.4); b.rotation.y = r() * 6.28; b.position.y = s * 0.25; g.add(b); return g;
}

export function bench(): THREE.Group {
  const g = new THREE.Group(); const s = part(new THREE.BoxGeometry(0.6, 0.04, 0.18), PALETTE.wood); s.position.y = 0.16; g.add(s);
  for (const x of [-0.24, 0.24]) { const l = part(new THREE.BoxGeometry(0.04, 0.16, 0.16), PALETTE.metal); l.position.set(x, 0.08, 0); g.add(l); }
  return g;
}

export function gardenPlot(r: Rng): THREE.Group {
  const g = new THREE.Group(); const soil = part(new THREE.BoxGeometry(0.95, 0.08, 0.7), PALETTE.soil); soil.position.y = 0.04; g.add(soil);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
    const st = part(blob(0.07, 0, 0.1, r), 0x6fb24f); st.position.set(-0.33 + i * 0.22, 0.12, -0.2 + j * 0.2); g.add(st);
    if (r() < 0.7) { const f = part(blob(0.045, 0, 0.1, r), PALETTE.flowers[Math.floor(r() * PALETTE.flowers.length)]!); f.position.set(st.position.x, 0.2, st.position.z); g.add(f); }
  }
  return g;
}

/** The visitor. Returns the group and the two legs, which swing when walking. */
export function character(): { group: THREE.Group; legs: THREE.Object3D[] } {
  const g = new THREE.Group(), mats = new Map<number, THREE.Material>();
  const m = (geo: THREE.BufferGeometry, color: number) => {
    if (!mats.has(color)) mats.set(color, new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: 0.9 }));
    const mesh = new THREE.Mesh(geo, mats.get(color)); mesh.castShadow = true; return mesh;
  };
  const legs = [-1, 1].map(s => { const pivot = new THREE.Group(); pivot.position.set(s * 0.032, 0.16, 0); const leg = m(new THREE.BoxGeometry(0.05, 0.16, 0.06), 0x34495e); leg.position.y = -0.08; pivot.add(leg); g.add(pivot); return pivot; });
  const body = m(new THREE.CylinderGeometry(0.07, 0.085, 0.17, 7), 0xf2785c); body.position.y = 0.245;
  const head = m(new THREE.IcosahedronGeometry(0.075, 1), 0xf3c9a5); head.position.y = 0.4;
  const cap = m(new THREE.CylinderGeometry(0.075, 0.078, 0.05, 8), 0x3bafa9); cap.position.y = 0.445;
  const brim = m(new THREE.BoxGeometry(0.09, 0.012, 0.07), 0x3bafa9); brim.position.set(0, 0.43, 0.08);
  const bag = m(new THREE.BoxGeometry(0.1, 0.13, 0.06), 0x8e6bbf); bag.position.set(0, 0.26, -0.08);
  const racket = m(new THREE.TorusGeometry(0.045, 0.01, 4, 10), 0xffffff); racket.position.set(0.04, 0.37, -0.12); racket.rotation.y = 1.2;
  g.add(body, head, cap, brim, bag, racket);
  return { group: g, legs };
}

// ---------- baking ----------
const bakedMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });

/** Merges every mesh in the group into one mesh with vertex colors. */
export function bake(root: THREE.Object3D, { cast = true, receive = true } = {}): THREE.Mesh {
  root.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const c = new THREE.Color();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    let g = (o.geometry as THREE.BufferGeometry).clone();
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (name !== 'position') g.deleteAttribute(name);
    g.applyMatrix4(o.matrixWorld);
    c.setHex(o.userData.color ?? 0xff00ff);
    const n = g.getAttribute('position').count, cols = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.toArray(cols, i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    parts.push(g);
  });
  const merged = mergeGeometries(parts, false);
  merged.computeVertexNormals();
  const mesh = new THREE.Mesh(merged, bakedMaterial);
  mesh.castShadow = cast; mesh.receiveShadow = receive;
  return mesh;
}

export const seeded = (seed: number) => rng(seed);
