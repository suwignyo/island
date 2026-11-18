import { afterEach, describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addDay } from '../new-day.ts';

const FIXTURE = new URL('../../e2e/fixtures/days/', import.meta.url).pathname;
let dir = '';
const fresh = () => { dir = mkdtempSync(join(tmpdir(), 'days-')); cpSync(FIXTURE, dir, { recursive: true }); return dir; };
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

describe('new-day script', () => {
  it('writes the next day file', () => {
    const d = fresh();
    const r = addDay(d, { text: '  Long   rally practice.  ', type: 'tree', tags: ['Tennis', 'tennis'], date: '2026-11-19' });
    expect(r.day).toBe(12);
    expect(readFileSync(join(d, '012.md'), 'utf8')).toBe('---\ndate: 2026-11-19\ntype: tree\ntags: [tennis]\n---\nLong rally practice.\n');
  });

  it('refuses a date that is not after the last day', () => {
    const d = fresh();
    expect(() => addDay(d, { text: 'Text', type: 'house', tags: [], date: '2026-11-18' })).toThrow(/after the date/);
    expect(readdirSync(d)).toHaveLength(11);
  });

  it('refuses an unknown type, the origin type, and bad tags', () => {
    const d = fresh();
    expect(() => addDay(d, { text: 'Text', type: 'castle', tags: [], date: '2026-11-19' })).toThrow(/unknown type/);
    expect(() => addDay(d, { text: 'Text', type: 'origin', tags: [], date: '2026-11-19' })).toThrow(/unknown type/);
    expect(() => addDay(d, { text: 'Text', type: 'house', tags: ['two words'], date: '2026-11-19' })).toThrow(/tags/);
  });

  it('refuses text that could break the file header', () => {
    const d = fresh();
    expect(() => addDay(d, { text: 'a\n---\ntype: house', type: 'house', tags: [], date: '2026-11-19' })).toThrow(/---/);
  });
});
