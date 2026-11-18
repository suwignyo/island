/**
 * The journal on disk: one Markdown file for each day, named by the day number (content/days/005.md).
 *
 *   ---
 *   date: 2026-11-12
 *   type: house
 *   tags: [tennis]
 *   ---
 *   Serve practice. 40 serves, 26 in.
 *
 * One file for each day means that a daily PR adds one new file and changes no shared file.
 */
import { validateEntries, type DayEntry, type ObjectType } from './content.ts';

const FILE_NAME = /(?:^|\/)(\d{3,4})\.md$/;

export interface Journal { entries: DayEntry[]; errors: string[] }

/** Parses one day file. The day number comes from the file name. */
export function parseDayFile(path: string, text: string): { entry?: DayEntry; errors: string[] } {
  const name = FILE_NAME.exec(path);
  if (!name) return { errors: [`${path}: file name must be the day number, for example 005.md`] };
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
  if (!m) return { errors: [`${path}: the file must start with a --- block`] };
  const fields = new Map<string, string>();
  const errors: string[] = [];
  for (const line of m[1]!.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const kv = /^([a-z]+):\s*(.*)$/.exec(line);
    if (!kv) { errors.push(`${path}: cannot read the line "${line}"`); continue; }
    fields.set(kv[1]!, kv[2]!.trim());
  }
  for (const key of fields.keys()) if (!['date', 'type', 'tags'].includes(key)) errors.push(`${path}: unknown field "${key}"`);
  const tagsRaw = fields.get('tags') ?? '[]';
  const tagsMatch = /^\[(.*)\]$/.exec(tagsRaw);
  if (!tagsMatch) errors.push(`${path}: tags must be a list, for example [tennis, work]`);
  const tags = tagsMatch ? tagsMatch[1]!.split(',').map(t => t.trim()).filter(Boolean) : [];
  return {
    errors,
    entry: { day: Number(name[1]), date: fields.get('date') ?? '', type: (fields.get('type') ?? '') as ObjectType, text: m[2]!.trim(), tags },
  };
}

/** Parses all day files (path to text) and checks them as one journal. */
export function loadJournal(files: Record<string, string>): Journal {
  const errors: string[] = [];
  const entries: DayEntry[] = [];
  for (const [path, text] of Object.entries(files)) {
    const r = parseDayFile(path, text);
    errors.push(...r.errors);
    if (r.entry) entries.push(r.entry);
  }
  entries.sort((a, b) => a.day - b.day);
  errors.push(...validateEntries(entries));
  return { entries, errors };
}
