/**
 * The island layout. Everything here is a pure function of the journal entries:
 * the same entries always give the same island, and a new day never moves an old plot.
 */
import type { DayEntry, ObjectType } from './content.ts';
import { fbm2, lerp, rng, smoothstep } from './rng.ts';

export interface Vec2 { x: number; z: number }

/** Spiral street: radius r = A + B * theta (Archimedean spiral). */
export const SPIRAL = {
  A: 2.4,          // radius where the street leaves the plaza
  B: 0.66,         // distance between two arms is 2 * PI * B (about 4.1 units)
  FIRST_THETA: 2.4, // angle of the first plot, so that inner plots stay clear of the plaza
  PLOT_STEP: 0.95, // street length between two plots (plots alternate sides)
  PLOT_OFFSET: 1.16, // distance from the street center line to the plot center
  STREET_HALF_WIDTH: 0.4,
  PLAZA_RADIUS: 1.75,
  LAND_HEIGHT: 0.5,
} as const;

export const ROOF_COLORS = [0xf2785c, 0xf4b942, 0x3bafa9, 0x8e6bbf, 0x5b8def, 0xe5533d] as const;

export interface HouseVariant { kind: 'house'; roof: number; hip: boolean; w: number; d: number; h: number; chimney: boolean }
export interface TreeVariant { kind: 'tree'; shape: 'round' | 'pine'; h: number; leaf: number; bush: boolean }
export interface GardenVariant { kind: 'garden' }
export interface OriginVariant { kind: 'origin' }
export type Variant = HouseVariant | TreeVariant | GardenVariant | OriginVariant;

export interface Plot {
  day: number;
  type: ObjectType;
  x: number; z: number; y: number;
  /** Rotation around the vertical axis. The front (+z of the object) looks at the street. */
  facing: number;
  side: 1 | -1;
  /** Point on the street in front of the plot, where a visitor stands to read it. */
  door: Vec2;
  radius: number;
  variant: Variant;
}

export interface Decor { kind: 'round' | 'pine' | 'bush' | 'rock'; x: number; z: number; y: number; seed: number; size: number; radius: number }
export interface Collider { x: number; z: number; r: number }

export interface Island {
  dayCount: number;
  radius: number;
  plots: Plot[];
  /** Street center line from the plaza to just past the newest plot. */
  street: Vec2[];
  decor: Decor[];
  colliders: Collider[];
  start: { x: number; z: number; heading: number };
  height(x: number, z: number): number;
  /** 0 at the center, 1 at the coast line, more than 1 in the sea. */
  coast(x: number, z: number): number;
  isWalkable(x: number, z: number, bodyRadius?: number): boolean;
}

// ---------- spiral geometry ----------
const spiralPoint = (theta: number): Vec2 => {
  const r = SPIRAL.A + SPIRAL.B * theta;
  return { x: r * Math.cos(theta), z: r * Math.sin(theta) };
};
const spiralTangent = (theta: number): Vec2 => {
  const r = SPIRAL.A + SPIRAL.B * theta, c = Math.cos(theta), s = Math.sin(theta);
  const x = SPIRAL.B * c - r * s, z = SPIRAL.B * s + r * c, l = Math.hypot(x, z);
  return { x: x / l, z: z / l };
};
/** Unit vector that points away from the center (to the outer side of the street). */
const spiralOutward = (theta: number): Vec2 => { const t = spiralTangent(theta); return { x: t.z, z: -t.x }; };

/** Arc length table, so that plots are at equal distances along the street. */
const ARC_STEP = 0.002;
const arcTable: number[] = [0];
function thetaAtArc(s: number): number {

  while (arcTable[arcTable.length - 1]! < s) {
    const k = arcTable.length, a = spiralPoint((k - 1) * ARC_STEP), b = spiralPoint(k * ARC_STEP);
    arcTable.push(arcTable[k - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
  }
  let lo = 0, hi = arcTable.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arcTable[mid]! < s) lo = mid + 1; else hi = mid; }
  const i = Math.max(1, lo);
  const s0 = arcTable[i - 1]!, s1 = arcTable[i]!;
  return (i - 1 + (s - s0) / (s1 - s0)) * ARC_STEP;
}
function arcAtTheta(theta: number): number {
  thetaAtArc(0);
  while ((arcTable.length - 1) * ARC_STEP < theta) thetaAtArc(arcTable[arcTable.length - 1]! + 1);
  const i = Math.floor(theta / ARC_STEP), f = theta / ARC_STEP - i;
  return lerp(arcTable[i]!, arcTable[i + 1]!, f);
}
const FIRST_ARC = arcAtTheta(SPIRAL.FIRST_THETA);

/** Street angle of a day. Day 1 is the plaza; day 2 is the first plot. */
export function plotTheta(day: number): number {
  return thetaAtArc(FIRST_ARC + (day - 2) * SPIRAL.PLOT_STEP);
}

// ---------- variants ----------
const LEAF_COLORS = [0x7fbf5a, 0x8fcf63, 0x6fb24f] as const;
function variantFor(type: ObjectType, day: number): Variant {
  const r = rng(day * 7919 + 17);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  switch (type) {
    case 'origin': return { kind: 'origin' };
    case 'garden': return { kind: 'garden' };
    case 'tree': return { kind: 'tree', shape: r() < 0.6 ? 'round' : 'pine', h: 1.5 + r() * 0.5, leaf: pick(LEAF_COLORS), bush: r() < 0.5 };
    case 'house': return { kind: 'house', roof: pick(ROOF_COLORS), hip: r() < 0.3, w: 1.0 + r() * 0.3, d: 0.85 + r() * 0.2, h: 0.62 + r() * 0.22, chimney: r() < 0.6 };
  }
}
const PLOT_RADIUS: Record<ObjectType, number> = { origin: 0.4, house: 0.62, tree: 0.3, garden: 0.5 };

// ---------- the island ----------
export function buildIsland(entries: readonly DayEntry[]): Island {
  const dayCount = entries.length;
  const lastTheta = dayCount >= 2 ? plotTheta(dayCount) : SPIRAL.FIRST_THETA * 0.5;
  const outer = SPIRAL.A + SPIRAL.B * lastTheta + SPIRAL.PLOT_OFFSET;
  // the wobble of the coast takes up to 14% of the radius, so keep the outer plots below 70% of it
  const radius = Math.max(11, (outer + 1.2) / 0.7);

  const edge = (th: number) => radius * (1 + 0.07 * Math.sin(3 * th + 0.7) + 0.045 * Math.sin(5 * th + 2.1) + 0.025 * Math.sin(8 * th + 4.0));
  const coast = (x: number, z: number) => Math.hypot(x, z) / edge(Math.atan2(z, x));
  const height = (x: number, z: number) => {
    const inside = 1 - smoothstep(0.83, 1.05, coast(x, z));
    const land = SPIRAL.LAND_HEIGHT + 0.16 * (fbm2(x * 0.11 + 20, z * 0.11 + 20, 5) - 0.5);
    return lerp(-1.0, land, inside);
  };

  // plots
  const plots: Plot[] = entries.map(e => {
    if (e.day === 1) {
      return { day: 1, type: e.type, x: 0, z: 0, y: height(0, 0), facing: 0, side: 1, door: { x: 0, z: 1.2 }, radius: PLOT_RADIUS.origin, variant: variantFor('origin', 1) };
    }
    const th = plotTheta(e.day), p = spiralPoint(th), o = spiralOutward(th);
    const side: 1 | -1 = e.day % 2 === 0 ? 1 : -1;
    const x = p.x + o.x * side * SPIRAL.PLOT_OFFSET, z = p.z + o.z * side * SPIRAL.PLOT_OFFSET;
    const facing = Math.atan2(-side * o.x, -side * o.z);
    return { day: e.day, type: e.type, x, z, y: height(x, z), facing, side, door: { x: p.x + o.x * side * 0.25, z: p.z + o.z * side * 0.25 }, radius: PLOT_RADIUS[e.type], variant: variantFor(e.type, e.day) };
  });

  // street center line
  const street: Vec2[] = [];
  const streetEnd = lastTheta + 0.7;
  // the street starts at the edge of the plaza: r = A + B * theta is 1.6 at this angle
  const streetStart = (1.6 - SPIRAL.A) / SPIRAL.B;
  for (let th = streetStart; th <= streetEnd; th += 0.03) street.push(spiralPoint(th));
  const distToStreet = (x: number, z: number) => {
    let best = Infinity;
    for (let i = 1; i < street.length; i++) {
      const a = street[i - 1]!, b = street[i]!, dx = b.x - a.x, dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
    }
    return best;
  };

  // trees, bushes and rocks outside the built street
  const decor: Decor[] = [];
  const r = rng(1);
  const builtRadius = SPIRAL.A + SPIRAL.B * lastTheta;
  for (let i = 0; i < 6000 && decor.length < 70 + Math.round(radius * 4); i++) {
    const x = (r() * 2 - 1) * radius * 1.1, z = (r() * 2 - 1) * radius * 1.1, seed = Math.floor(r() * 1e9);
    const t = coast(x, z), d = Math.hypot(x, z);
    if (t > 0.78 || d < SPIRAL.PLAZA_RADIUS + 1.3) continue;
    if (d < builtRadius + 1.6 && distToStreet(x, z) < 2.4) continue;
    if (distToStreet(x, z) < 2.4) continue;
    if (decor.some(q => Math.hypot(q.x - x, q.z - z) < 1.0)) continue;
    const k = r();
    const kind: Decor['kind'] = k < 0.28 ? 'pine' : k < 0.82 ? 'round' : k < 0.94 ? 'bush' : 'rock';
    const size = kind === 'rock' ? 0.3 + r() * 0.35 : kind === 'bush' ? 0.3 + r() * 0.15 : 1.5 + r() * 0.9;
    const radiusOf = kind === 'rock' ? size * 0.8 : kind === 'bush' ? size * 0.7 : 0.22;
    decor.push({ kind, x, z, y: height(x, z), seed, size, radius: radiusOf });
  }

  const colliders: Collider[] = [
    ...plots.map(p => ({ x: p.x, z: p.z, r: p.radius })),
    ...decor.map(d => ({ x: d.x, z: d.z, r: d.radius })),
  ];
  const isWalkable = (x: number, z: number, body = 0.15) => coast(x, z) < 0.86 && colliders.every(c => Math.hypot(c.x - x, c.z - z) >= c.r + body);

  // the visitor starts on the street just past the newest plot, looking back along the street (back in time)
  const newest = plots[plots.length - 1]!;
  const startTheta = dayCount >= 2 ? plotTheta(dayCount) + 0.3 : 0;
  const sp = spiralPoint(startTheta), st = spiralTangent(startTheta);
  const start = dayCount >= 2 ? { x: sp.x, z: sp.z, heading: Math.atan2(-st.x, -st.z) } : { x: newest.door.x, z: newest.door.z, heading: Math.PI };

  return { dayCount, radius, plots, street, decor, colliders, start, height, coast, isWalkable };
}

/** Grid search: can a visitor walk from the start to each point? Used by tests. */
export function reachable(island: Island, targets: readonly Vec2[], cell = 0.2): boolean[] {
  const R = island.radius * 1.2, n = Math.ceil((2 * R) / cell);
  const idx = (x: number, z: number) => Math.floor((x + R) / cell) + Math.floor((z + R) / cell) * n;
  const seen = new Uint8Array(n * n), queue: number[] = [];
  const s = idx(island.start.x, island.start.z);
  seen[s] = 1; queue.push(s);
  while (queue.length) {
    const c = queue.pop()!, cx = c % n, cz = Math.floor(c / n);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= n || nz >= n) continue;
      const k = nx + nz * n;
      if (seen[k]) continue;
      if (!island.isWalkable(-R + (nx + 0.5) * cell, -R + (nz + 0.5) * cell)) continue;
      seen[k] = 1; queue.push(k);
    }
  }
  return targets.map(t => seen[idx(t.x, t.z)] === 1);
}
