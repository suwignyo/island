/**
 * The plain-code steps around the day agent. The model only reads the log and answers in a fixed
 * structure; these steps prepare its input and check its answer. See .github/workflows/day-agent.yml.
 *
 *   node scripts/day-agent.ts prepare   reads BODY, CREATED, TZ_NAME; writes .day/issue.md, types.txt, date.txt
 *   node scripts/day-agent.ts finish    reads .day/answer.json; writes .day/day.json and .day/meta.json
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { OBJECT_TYPES } from '../packages/world/src/index.ts';

export const DRAWABLE_TYPES = OBJECT_TYPES.filter(t => t !== 'origin');
const AGENT_CHOOSES = 'Let the agent choose';

/** Reads a GitHub issue form body ("### Label" followed by the value). */
export function parseForm(body: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = body.split(/^###\s+/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const label = (nl < 0 ? part : part.slice(0, nl)).trim().toLowerCase();
    const value = nl < 0 ? '' : part.slice(nl + 1).trim();
    out[label] = value === '_No response_' ? '' : value;
  }
  return out;
}

/** The date of the day: the form field if it is valid, else the issue date in the owner's time zone. */
export function dayDate(form: Record<string, string>, createdIso: string, timeZone: string): string {
  const given = form.date ?? '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(given) && !Number.isNaN(Date.parse(given))) return given;
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(createdIso));
}

/** The whole prompt in one message, so the model needs no tools and one turn. */
export function buildPrompt(instructions: string, vision: string, log: string): string {
  const start = vision.indexOf('## Object types for version 1');
  const end = vision.indexOf('\n## ', start + 1);
  const table = start < 0 ? '' : vision.slice(start, end < 0 ? undefined : end).trim();
  return `${instructions.trim()}\n\n<log>\n${log.replaceAll('</log>', '')}\n</log>\n\n<types>\n${DRAWABLE_TYPES.join('\n')}\n</types>\n\n<vision>\n${table}\n</vision>\n`;
}

export interface Answer { action: 'add' | 'ask'; text: string; type: string; wanted_type: string; tags: string[]; question: string }

/** Checks the model's answer, and applies what the owner chose in the form, which always wins. */
export function finish(answer: Answer, form: Record<string, string>, date: string) {
  if (answer.action !== 'add' && answer.action !== 'ask') throw new Error(`unknown action "${String(answer.action)}"`);
  const chosen = form.object && form.object !== AGENT_CHOOSES ? form.object : '';
  const type = chosen && DRAWABLE_TYPES.includes(chosen as never) ? chosen : answer.type;
  if (answer.action === 'add' && !DRAWABLE_TYPES.includes(type as never)) throw new Error(`the agent chose an unknown type "${type}"`);
  const formTags = (form.tags ?? '').split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
  const tags = (formTags.length ? formTags : answer.tags).map(t => t.toLowerCase().replace(/[^a-z0-9-]/g, '')).filter(Boolean).slice(0, 3);
  return {
    day: { text: answer.text, type, tags, date },
    meta: { action: answer.action, question: answer.question, wantedType: answer.wanted_type },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync('.day', { recursive: true });
  const body = process.env.BODY ?? (() => { try { return readFileSync('.day/issue.md', 'utf8'); } catch { return ''; } })();
  const form = parseForm(body);
  const cmd = process.argv[2];
  if (cmd === 'prepare') {
    writeFileSync('.day/issue.md', body);
    writeFileSync('.day/types.txt', DRAWABLE_TYPES.join('\n') + '\n');
    writeFileSync('.day/date.txt', dayDate(form, process.env.CREATED ?? new Date().toISOString(), process.env.TZ_NAME || 'UTC'));
    writeFileSync('.day/prompt.md', buildPrompt(readFileSync('.github/day-agent/prompt.md', 'utf8'), readFileSync('docs/VISION.md', 'utf8'), body));
  } else if (cmd === 'finish') {
    const out = JSON.parse(readFileSync('.day/answer.json', 'utf8')) as { structured_output?: Answer; total_cost_usd?: number; is_error?: boolean; result?: string };
    if (!out.structured_output) throw new Error(`the agent gave no structured answer: ${String(out.result ?? '').slice(0, 500)}`);
    const r = finish(out.structured_output, form, readFileSync('.day/date.txt', 'utf8').trim());
    writeFileSync('.day/day.json', JSON.stringify(r.day, null, 2));
    writeFileSync('.day/meta.json', JSON.stringify({ ...r.meta, costUsd: out.total_cost_usd ?? null }, null, 2));
    console.log(r.meta.action);
  } else {
    console.error('usage: node scripts/day-agent.ts prepare|finish'); process.exit(2);
  }
}
