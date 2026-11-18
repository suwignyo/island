# Life Island

A low-poly 3D island in the browser that grows by one object for each day of the owner's life. Read `docs/VISION.md` before any change. It is the target. If a change disagrees with it, propose a change to the vision in its own PR first.

## Layout

- `packages/world`: pure TypeScript, no browser. The island layout, the journal data rules, seeded random numbers. All game rules go here.
- `apps/web`: Vite and Three.js. Draws the state from `packages/world`. `kit.ts` has the shapes, `scene.ts` builds the scene, `main.ts` has the character, camera, input, and the test hooks.
- `apps/api`: Node HTTP server (stub in step 1). Run with `node src/main.ts` (Node strips the types).
- `content/days.json`: the journal. One entry for each day.
- `e2e`: Playwright tests and the reference images in `e2e/__screenshots__`.

## Commands

- `npm run dev`: the web app on port 5173.
- `npm test`: unit and layout tests (Vitest).
- `npm run typecheck`
- `npm run e2e`: browser tests and fixed camera images. Builds first.
- `npm run check`: all of the above. Run it before you open a PR.

## Rules for the world

- The world is a pure function of `content/days.json`. No `Math.random()`, no `Date.now()`, no real clock in game rules. Use `rng(seed)` from `packages/world`, with the day number in the seed.
- A new day must never move or change an old plot. A test checks this.
- Shapes are made in code from simple solids in `apps/web/src/kit.ts`. Use the colors in `PALETTE` and `ROOF_COLORS` only.
- Merge static meshes with `bake()`. Budgets: at most 600 triangles for one object type, at most 300 draw calls in street view.
- A new object type needs: a variant in `packages/world`, a builder in `kit.ts`, a fixed camera view in the test hooks, and a reference image.

## Rules for tests

- Do not change or delete an existing test or reference image to make CI pass. If a reference image must change, say so in the PR description and explain why. The owner approves each changed image.
- Reference images are made in the Docker image `mcr.microsoft.com/playwright:v1.63.0-noble` (the dev container and CI use it). Update them with `npm run e2e:update` inside that image only.
- Test mode (`/?test`) has no clock. Tests drive the world with `window.__island.step(frames)`. See `apps/web/src/test-hooks.ts`.
- A test that fails sometimes without a cause is a bug. Fix it first.

## Rules for pull requests

- One work item for each PR. Keep PRs small: the owner reviews each one.
- Branch names start with `claude/` for agent work.
- Before you open a PR, run `npm run check` and look at the changed images yourself.
- The PR description says what changed, why, how it was tested, and lists each changed reference image.
- Never push to `main`. Never merge.

## Privacy

`content/days.json` is public. Write only text that the owner approved. No names of other people, no addresses, no health or money details.
