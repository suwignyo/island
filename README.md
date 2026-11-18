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
