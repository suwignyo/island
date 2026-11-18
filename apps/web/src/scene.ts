/** Builds the Three.js scene from the island data. */
import * as THREE from 'three';
import { fbm2, rng, type Island, type Plot } from '@island/world';
import * as K from './kit.ts';

export interface WorldScene {
  scene: THREE.Scene;
  sun: THREE.DirectionalLight;
  plotMeshes: Map<number, THREE.Mesh>;
}

function colorFaces(geo: THREE.BufferGeometry, fn: (x: number, y: number, z: number, c: THREE.Color) => void) {
  const p = geo.getAttribute('position'), cols = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    fn((p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3, (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3, (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3, c);
    for (let k = 0; k < 3; k++) c.toArray(cols, (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

function grid(size: number, cells: number, heightFn: (x: number, z: number) => number, colorFn: (x: number, y: number, z: number, c: THREE.Color) => void, seed: number, rough: number) {
  const r = rng(seed);
  let g: THREE.BufferGeometry = new THREE.PlaneGeometry(size, size, cells, cells);
  g.rotateX(-Math.PI / 2);
  const p = g.getAttribute('position'), step = size / cells;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), z = p.getZ(i);
    const edge = Math.abs(Math.abs(x) - size / 2) < 1e-4 || Math.abs(Math.abs(z) - size / 2) < 1e-4;
    if (!edge) { x += (r() - 0.5) * step * 0.6; z += (r() - 0.5) * step * 0.6; }
    p.setXYZ(i, x, heightFn(x, z), z);
  }
  g = g.toNonIndexed();
  colorFaces(g, (x, y, z, c) => { colorFn(x, y, z, c); c.offsetHSL(0, 0, (r() - 0.5) * 0.03); });
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: rough }));
  m.receiveShadow = true;
  return m;
}

function plotObject(p: Plot): THREE.Group {
  const r = rng(p.day * 104729 + 3), v = p.variant;
  const g = new THREE.Group();
  switch (v.kind) {
    case 'origin': {
      const plaza = new THREE.Mesh(new THREE.CylinderGeometry(1.75, 1.75, 0.06, 12)); plaza.userData.color = K.PALETTE.street; plaza.position.y = 0.02; g.add(plaza);
      g.add(K.bigTree(r));
      const b1 = K.bench(); b1.position.set(1.15, 0.05, 0.5); b1.rotation.y = -1.1; g.add(b1);
      const b2 = K.bench(); b2.position.set(-0.9, 0.05, 0.95); b2.rotation.y = 0.75; g.add(b2);
      break;
    }
    case 'house': g.add(K.house(v)); break;
    case 'garden': g.add(K.gardenPlot(r)); break;
    case 'tree': {
      g.add(v.shape === 'round' ? K.roundTree(r, v.h, v.leaf) : K.pine(r, v.h + 0.2, K.PALETTE.pine[0]));
      if (v.bush) { const b = K.bush(r, 0.24, v.leaf); b.position.set(0.5, 0, 0.3); g.add(b); }
      break;
    }
  }
  g.position.set(p.x, p.y, p.z);
  g.rotation.y = p.facing;
  return g;
}

export function buildScene(island: Island): WorldScene {
  const scene = new THREE.Scene();
  const R = island.radius;

  // sky, fog and light
  {
    const radius = 600, g = new THREE.SphereGeometry(radius, 32, 16), p = g.getAttribute('position'), cols = new Float32Array(p.count * 3);
    const top = new THREE.Color(0x5fa8e8), hor = new THREE.Color(0xdff3ff), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const y = Math.max(0, p.getY(i) / radius); c.copy(hor).lerp(top, Math.pow(y, 0.6)).toArray(cols, i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  }
  scene.fog = new THREE.Fog(0xdff3ff, 18, 80);
  scene.add(new THREE.HemisphereLight(0xd6eeff, 0xb9c98a, 1.75));
  const sun = new THREE.DirectionalLight(0xfff0d2, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);

  // land
  const land = island.height;
  scene.add(grid(R * 2.4, Math.round(R * 4), land, (x, y, z, c) => {
    const n = fbm2(x * 0.3, z * 0.3, 9);
    if (y < 0.14) c.setHex(K.PALETTE.sand); else if (y < 0.3) c.setHex(K.PALETTE.sandDark);
    else c.setHex(K.PALETTE.grass[n > 0.56 ? 0 : n > 0.44 ? 1 : 2]);
  }, 2, 0.95));

  // sea with depth rings, and a foam line on the coast
  scene.add(grid(R * 8, Math.round(R * 4), (x, z) => 0.035 * Math.sin(x * 0.7 + z * 0.4) + 0.03 * Math.sin(z * 0.9 - x * 0.3), (x, _y, z, c) => {
    const t = island.coast(x, z);
    c.setHex(K.PALETTE.sea[t < 1.0 ? 0 : t < 1.13 ? 1 : t < 1.36 ? 2 : t < 1.8 ? 3 : 4]);
  }, 3, 0.32));
  {
    const v: number[] = [], n = 240, T0 = 0.915;
    const at = (i: number, t: number): [number, number] => {
      const th = (i / n) * Math.PI * 2, x = Math.cos(th), z = Math.sin(th);
      let lo = 0, hi = R * 2; // find the radius where coast() = t along this direction
      for (let k = 0; k < 30; k++) { const mid = (lo + hi) / 2; if (island.coast(x * mid, z * mid) < t) lo = mid; else hi = mid; }
      return [x * lo, z * lo];
    };
    for (let i = 0; i < n; i++) {
      const a = at(i, T0 - 0.008), b = at(i, T0 + 0.016), c = at(i + 1, T0 - 0.008), d = at(i + 1, T0 + 0.016);
      v.push(a[0], 0.05, a[1], b[0], 0.05, b[1], c[0], 0.05, c[1], b[0], 0.05, b[1], d[0], 0.05, d[1], c[0], 0.05, c[1]);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })));
  }

  // street
  {
    const v: number[] = [], cols: number[] = [], c = new THREE.Color(), r = rng(4), s = island.street;
    const edge = (i: number, side: number): [number, number, number] => {
      const a = s[Math.max(0, i - 1)]!, b = s[Math.min(s.length - 1, i + 1)]!, dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz);
      const p = s[i]!, x = p.x + (dz / l) * side * 0.4, z = p.z - (dx / l) * side * 0.4;
      return [x, land(x, z) + 0.045, z];
    };
    for (let i = 0; i < s.length - 1; i++) {
      const a = edge(i, -1), b = edge(i, 1), c2 = edge(i + 1, -1), d = edge(i + 1, 1);
      v.push(...a, ...b, ...c2, ...b, ...d, ...c2);
      c.setHex(K.PALETTE.street).offsetHSL(0, 0, (r() - 0.5) * 0.035);
      for (let k = 0; k < 6; k++) cols.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1, side: THREE.DoubleSide })); m.receiveShadow = true;
    scene.add(m);
  }

  // plots: one mesh for each day
  const plotMeshes = new Map<number, THREE.Mesh>();
  for (const p of island.plots) {
    const mesh = K.bake(plotObject(p));
    mesh.name = `day-${p.day}`; mesh.userData.day = p.day;
    plotMeshes.set(p.day, mesh); scene.add(mesh);
  }

  // decor: all in one mesh
  {
    const root = new THREE.Group();
    for (const d of island.decor) {
      const r = rng(d.seed);
      const leaf = K.PALETTE.leaf[Math.floor(r() * 3)]!;
      const obj = d.kind === 'pine' ? K.pine(r, d.size, K.PALETTE.pine[r() < 0.5 ? 0 : 1])
        : d.kind === 'round' ? K.roundTree(r, d.size, leaf)
          : d.kind === 'bush' ? K.bush(r, d.size, leaf) : K.rock(r, d.size);
      obj.position.set(d.x, d.y, d.z); root.add(obj);
    }
    if (root.children.length) scene.add(K.bake(root));
  }

  return { scene, sun, plotMeshes };
}
