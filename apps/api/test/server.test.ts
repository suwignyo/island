import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApi, loadEntries } from '../src/server.ts';

let base = '';
const server = createApi(await loadEntries(new URL('../../../content/days/', import.meta.url)));
beforeAll(async () => { await new Promise<void>(r => server.listen(0, r)); base = `http://localhost:${(server.address() as AddressInfo).port}`; });
afterAll(() => { server.close(); });

describe('api', () => {
  it('reports health', async () => {
    const res = await fetch(`${base}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });
  it('returns one day with its plot', async () => {
    const body = await (await fetch(`${base}/api/days/5`)).json();
    expect(body).toMatchObject({ day: 5, plot: { type: 'house' } });
  });
  it('returns 404 for a day that does not exist', async () => {
    expect((await fetch(`${base}/api/days/9999`)).status).toBe(404);
  });
  it('refuses other methods', async () => {
    expect((await fetch(`${base}/api/days`, { method: 'POST' })).status).toBe(405);
  });
});
