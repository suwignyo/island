/**
 * The API. Step 1 is a small stub: it serves the journal entries and a health check.
 * Later steps add log intake (a log line becomes an agent work item) and visitor messages.
 */
import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import { buildIsland, validateEntries, type DayEntry } from '@island/world';

export async function loadEntries(path: URL): Promise<DayEntry[]> {
  const entries: unknown = JSON.parse(await readFile(path, 'utf8'));
  const problems = validateEntries(entries);
  if (problems.length) throw new Error(`Invalid journal entries:\n${problems.join('\n')}`);
  return entries as DayEntry[];
}

export function createApi(entries: DayEntry[]): Server {
  const island = buildIsland(entries);
  return createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return send(405, { error: 'method not allowed' });
    if (url.pathname === '/api/health') return send(200, { ok: true, days: entries.length });
    if (url.pathname === '/api/days') return send(200, entries);
    const m = /^\/api\/days\/(\d+)$/.exec(url.pathname);
    if (m) {
      const day = Number(m[1]), entry = entries[day - 1], plot = island.plots[day - 1];
      return entry && plot ? send(200, { ...entry, plot: { x: plot.x, z: plot.z, type: plot.type } }) : send(404, { error: `no day ${day}` });
    }
    return send(404, { error: 'not found' });
  });
}
