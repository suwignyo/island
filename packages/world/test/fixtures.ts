import { readdirSync, readFileSync } from 'node:fs';
import { loadJournal, type DayEntry } from '../src/index.ts';

const DIR = new URL('../../../content/days/', import.meta.url);

export function readJournalDir(): Record<string, string> {
  return Object.fromEntries(readdirSync(DIR).filter(f => f.endsWith('.md')).map(f => [f, readFileSync(new URL(f, DIR), 'utf8')]));
}

export function realEntries(): DayEntry[] {
  return loadJournal(readJournalDir()).entries;
}
