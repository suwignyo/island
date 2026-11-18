import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildIsland, reachable, SPIRAL, validateEntries, type DayEntry, type ObjectType } from '../src/index.ts';
import { realEntries } from './fixtures.ts';

const real = realEntries();
const TYPES: ObjectType[] = ['house', 'tree', 'garden'];

/** Makes n valid entries, with types from the given list (or a fixed cycle). */
function makeEntries(n: number, types: ObjectType[] = []): DayEntry[] {
  return Array.from({ length: n }, (_, i) => ({
    day: i + 1,
    date: new Date(Date.UTC(2026, 0, 1) + i * 86400000).toISOString().slice(0, 10),
    text: `Day ${i + 1}`,
    type: i === 0 ? 'origin' : (types[i] ?? TYPES[i % 3]!),
    tags: [],
  }));
}

describe('journal entries', () => {
  it('the committed entries are valid', () => {
    expect(validateEntries(real)).toEqual([]);
  });
  it('finds invalid entries', () => {
    const bad = makeEntries(3);
    bad[1]!.type = 'castle' as ObjectType;
    bad[2]!.date = bad[0]!.date;
    const errors = validateEntries(bad);
    expect(errors.some(e => e.includes('unknown type'))).toBe(true);
    expect(errors.some(e => e.includes('after the date'))).toBe(true);
  });
});

describe('island layout', () => {
  it('gives the same island for the same entries', () => {
    const a = buildIsland(real), b = buildIsland(structuredClone(real));
    expect(JSON.stringify({ ...a, height: 0, coast: 0, isWalkable: 0 })).toEqual(JSON.stringify({ ...b, height: 0, coast: 0, isWalkable: 0 }));
  });

  it('never moves an old plot when a new day is added', () => {
    const small = buildIsland(makeEntries(30)), big = buildIsland(makeEntries(31));
    small.plots.forEach((p, i) => {
      const q = big.plots[i]!;
      expect([q.x, q.z, q.facing]).toEqual([p.x, p.z, p.facing]);
      expect(q.variant).toEqual(p.variant);
    });
  });

  it('keeps plots apart and off the street, for up to one year of days', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 366 }), n => {
      const island = buildIsland(makeEntries(n));
      const ps = island.plots;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]!;
        expect(island.coast(p.x, p.z)).toBeLessThan(0.8);
        if (p.day > 1) expect(Math.hypot(p.x, p.z)).toBeGreaterThan(SPIRAL.PLAZA_RADIUS + p.radius);
        for (let j = i + 1; j < ps.length; j++) {
          const q = ps[j]!;
          expect(Math.hypot(p.x - q.x, p.z - q.z)).toBeGreaterThanOrEqual(p.radius + q.radius + 0.1);
        }
      }
      for (const d of island.decor) for (const p of ps) expect(Math.hypot(d.x - p.x, d.z - p.z)).toBeGreaterThan(d.radius + p.radius);
    }), { numRuns: 25 });
  }, 60_000);

  it('lets the visitor walk to the front of every plot', () => {
    for (const n of [11, 60, 200]) {
      const island = buildIsland(makeEntries(n));
      expect(island.isWalkable(island.start.x, island.start.z)).toBe(true);
      const ok = reachable(island, island.plots.map(p => p.door));
      expect(ok.every(Boolean), `day count ${n}: unreachable days ${ok.flatMap((v, i) => (v ? [] : [i + 1])).join(',')}`).toBe(true);
    }
  }, 60_000);

  it('gives each object type its own look from the day number', () => {
    const island = buildIsland(makeEntries(40, Array(40).fill('house')));
    const roofs = new Set(island.plots.flatMap(p => (p.variant.kind === 'house' ? [p.variant.roof] : [])));
    expect(roofs.size).toBeGreaterThan(3);
  });
});
