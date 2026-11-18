/**
 * Publishes the preview images of a PR and shows them in one PR comment, with the GitHub REST API only
 * (the CI image has no git push setup and no gh). The images go to the `previews` branch, which has no
 * history with main, under pr-<number>/. The comment is updated on each run, not added again.
 *
 *   GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo PR=12 SHA=abc node scripts/preview-publish.ts
 */
import { readFileSync } from 'node:fs';

const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPOSITORY, pr = process.env.PR, sha = (process.env.SHA ?? '').slice(0, 8);
if (!token || !repo || !pr) throw new Error('GITHUB_TOKEN, GITHUB_REPOSITORY and PR are required');
const BRANCH = 'previews', MARKER = '<!-- day-preview -->';

async function api(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok && res.status !== 404) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return { status: res.status, json: res.status === 204 ? null : await res.json() };
}

// the previews branch: created once, with no parent commit
if ((await api('GET', `/git/ref/heads/${BRANCH}`)).status === 404) {
  const blob = (await api('POST', '/git/blobs', { content: 'Preview images for day PRs. Made by CI.\n', encoding: 'utf-8' })).json;
  const tree = (await api('POST', '/git/trees', { tree: [{ path: 'README.md', mode: '100644', type: 'blob', sha: blob.sha }] })).json;
  const commit = (await api('POST', '/git/commits', { message: 'Start the previews branch', tree: tree.sha, parents: [] })).json;
  await api('POST', '/git/refs', { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
}

const urls: Record<string, string> = {};
for (const name of ['newest', 'map']) {
  const path = `pr-${pr}/${name}.png`;
  const existing = await api('GET', `/contents/${path}?ref=${BRANCH}`);
  await api('PUT', `/contents/${path}`, {
    message: `Preview ${name} for PR ${pr}`, branch: BRANCH,
    content: readFileSync(`previews/${name}.png`).toString('base64'),
    sha: existing.status === 200 ? existing.json.sha : undefined,
  });
  urls[name] = `https://raw.githubusercontent.com/${repo}/${BRANCH}/${path}?v=${sha}`;
}

const body = `${MARKER}\n### Preview of the new day\n\nMade by CI from commit ${sha}, with the real journal.\n\n| Newest day | Map |\n| :- | :- |\n| ![newest](${urls.newest}) | ![map](${urls.map}) |\n`;
const comments = (await api('GET', `/issues/${pr}/comments?per_page=100`)).json as { id: number; body: string }[];
const mine = comments.find(c => c.body.startsWith(MARKER));
if (mine) await api('PATCH', `/issues/comments/${mine.id}`, { body });
else await api('POST', `/issues/${pr}/comments`, { body });
console.log('preview published');
