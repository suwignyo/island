/**
 * Adds the next day to the journal: writes content/days/NNN.md and checks the whole journal.
 *
 *   node scripts/new-day.ts --from .day/day.json
 *
 * The input file is the structured answer of the day agent: { text, type, tags, date }.
 * The model only decides these values. This script writes the file, so the model needs no
 * write access, and every value is checked here before it reaches the repository.
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadJournal, OBJECT_TYPES, type ObjectType } from '../packages/world/src/index.ts';

export interface NewDay { text: string; type: string; tags: string[]; date: string }

export function addDay(dir: string, input: NewDay): { day: number; path: string } {
  const names = readdirSync(dir).filter(f => f.endsWith('.md'));
  const files = Object.fromEntries(names.map(f => [f, readFileSync(join(dir, f), 'utf8')]));
  const day = names.length + 1;
  if (!OBJECT_TYPES.includes(input.type as ObjectType) || input.type === 'origin') throw new Error(`unknown type "${input.type}"`);
  const text = input.text.replace(/\s+/g, ' ').trim();
  if (text.includes('---')) throw new Error('text must not contain ---');
  const tags = [...new Set(input.tags.map(t => t.trim().toLowerCase()))].filter(Boolean);
  const name = `${String(day).padStart(3, '0')}.md`;
  const body = `---\ndate: ${input.date}\ntype: ${input.type}\ntags: [${tags.join(', ')}]\n---\n${text}\n`;
  // check the whole journal with the new file before anything is written
  const journal = loadJournal({ ...files, [name]: body });
  if (journal.errors.length) throw new Error(`the new day is not valid:\n${journal.errors.join('\n')}`);
  const path = join(dir, name);
  writeFileSync(path, body, { flag: 'wx' });
  return { day, path };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--from');
  const from = i > 0 ? process.argv[i + 1] : undefined;
  if (!from) { console.error('usage: node scripts/new-day.ts --from <day.json>'); process.exit(2); }
  const input = JSON.parse(readFileSync(from, 'utf8')) as NewDay;
  const r = addDay(new URL('../content/days/', import.meta.url).pathname, input);
  console.log(JSON.stringify(r));
}
