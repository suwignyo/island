import { createApi, loadEntries } from './server.ts';

const port = Number(process.env.PORT ?? 8787);
const entries = await loadEntries(new URL('../../../content/days/', import.meta.url));
createApi(entries).listen(port, () => console.log(`API on http://localhost:${port}`));
