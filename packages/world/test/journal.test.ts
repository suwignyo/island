import { describe, expect, it } from 'vitest';
import { loadJournal, parseDayFile } from '../src/index.ts';
import { readJournalDir } from './fixtures.ts';

describe('journal files', () => {
  it('the committed journal is valid', () => {
    const j = loadJournal(readJournalDir());
    expect(j.errors).toEqual([]);
    expect(j.entries.length).toBeGreaterThan(1);
  });

  it('reads one day file', () => {
    const r = parseDayFile('content/days/005.md', '---\ndate: 2026-11-12\ntype: house\ntags: [tennis, work]\n---\nServe practice.\n');
    expect(r.errors).toEqual([]);
    expect(r.entry).toEqual({ day: 5, date: '2026-11-12', type: 'house', tags: ['tennis', 'work'], text: 'Serve practice.' });
  });

  it('finds a missing day, a bad name, and an unknown field', () => {
    const ok = (d: string) => `---\ndate: ${d}\ntype: house\ntags: []\n---\nText\n`;
    const j = loadJournal({
      '001.md': '---\ndate: 2026-01-01\ntype: origin\ntags: []\n---\nStart\n',
      '003.md': ok('2026-01-03'),
      'notes.md': ok('2026-01-04'),
      '004.md': '---\ndate: 2026-01-05\ntype: house\nmood: happy\ntags: []\n---\nText\n',
    });
    expect(j.errors.some(e => e.includes('day must be 2'))).toBe(true);
    expect(j.errors.some(e => e.includes('notes.md'))).toBe(true);
    expect(j.errors.some(e => e.includes('unknown field "mood"'))).toBe(true);
  });
});
