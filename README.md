# Life Island

A low-poly island in the browser that grows by one object for each day of my life. Agents turn each daily log line into a pull request, and I review and merge it.

The target for the project is in [docs/VISION.md](docs/VISION.md).

## Run it

Open the repository in the dev container (VS Code: **Dev Containers: Reopen in Container**), or use Node 22.18 or later:

```bash
npm ci
npm run dev
```

Then open http://localhost:5173. Walk with W A S D or the arrows, or click the ground. On a phone, tap the ground.

`npm run check` runs the type check, the unit and layout tests, the build, and the browser tests. The rules for agents and humans are in [CLAUDE.md](CLAUDE.md).

## The day agent

Open an issue with the **Day log** form. The day agent turns it into a PR with one new day, and a preview comment shows the new day and the map. Merge the PR to add the day.

One-time setup in the repository settings:

1. **Secrets and variables, Actions, Secrets:** add `CLAUDE_CODE_OAUTH_TOKEN` (run `claude setup-token` on your computer; uses your Claude subscription) or `ANTHROPIC_API_KEY` (from the Claude Console; billed per token).
2. **Secrets and variables, Actions, Variables (optional):** add `DAY_TIMEZONE`, for example `Asia/Jakarta`, so that a log written late in the evening gets the right date. The default is UTC.
3. **Actions, General, Workflow permissions:** turn on **Allow GitHub Actions to create and approve pull requests**. The agent needs it to open its PR.
4. **Issues, Labels:** a label named `log` must exist. The form adds it to each day log.

Each run costs about $0.04 to $0.05 of model use (measured; the PR description shows the cost of each run).
