/** The journal data: one entry for each day. The agents add entries; the world is computed from them. */
export const OBJECT_TYPES = ['origin', 'house', 'tree', 'garden'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export interface DayEntry {
  day: number;
  date: string; // ISO date, YYYY-MM-DD
  text: string;
  type: ObjectType;
  tags: string[];
}

/** Returns a list of problems. An empty list means the entries are valid. */
export function validateEntries(entries: unknown): string[] {
  const errors: string[] = [];
  if (!Array.isArray(entries)) return ['entries must be an array'];
  entries.forEach((e: Partial<DayEntry>, i) => {
    const at = `entry ${i}`;
    if (e.day !== i + 1) errors.push(`${at}: day must be ${i + 1}, found ${String(e.day)}`);
    if (typeof e.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.date) || Number.isNaN(Date.parse(e.date)))
      errors.push(`${at}: date must be YYYY-MM-DD`);
    if (typeof e.text !== 'string' || e.text.trim().length === 0 || e.text.length > 280)
      errors.push(`${at}: text must have 1 to 280 characters`);
    if (!OBJECT_TYPES.includes(e.type as ObjectType)) errors.push(`${at}: unknown type "${String(e.type)}"`);
    if (i === 0 && e.type !== 'origin') errors.push(`${at}: day 1 must have type "origin"`);
    if (i > 0 && e.type === 'origin') errors.push(`${at}: only day 1 can have type "origin"`);
    if (!Array.isArray(e.tags) || e.tags.some(t => typeof t !== 'string' || !/^[a-z0-9-]{1,24}$/.test(t)))
      errors.push(`${at}: tags must be lowercase words`);
    const prev = entries[i - 1] as Partial<DayEntry> | undefined;
    if (prev && typeof prev.date === 'string' && typeof e.date === 'string' && e.date <= prev.date)
      errors.push(`${at}: date must be after the date of the previous entry`);
  });
  return errors;
}
