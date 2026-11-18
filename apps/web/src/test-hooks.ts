/** The test interface on window.__island. The browser tests use it to drive the world without a clock. */
export interface IslandHooks {
  ready: boolean;
  dayCount: number;
  /** Advances the simulation by a number of fixed 1/60 s frames, then renders. */
  step(frames: number): void;
  /** Moves the character to a named camera position: street, origin, house, tree, garden. */
  view(name: string): void;
  walkTo(x: number, z: number): void;
  player(): { x: number; z: number; heading: number };
  stats(): { calls: number; triangles: number };
  hideUi(hide: boolean): void;
}
declare global { interface Window { __island: IslandHooks } }
