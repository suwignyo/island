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
  /** The day whose label shows (the visitor is near its door), or null. */
  nearDay(): number | null;
  /** The day whose entry panel is open, or null. */
  openDay(): number | null;
  /** World position and collision radius of a plot. */
  plot(day: number): { x: number; z: number; radius: number };
  /** 0 at the island center, 1 at the coast line. */
  coast(x: number, z: number): number;
  /** Screen position of a plot, for tests that tap it. */
  screenOf(day: number): { x: number; y: number };
}
declare global { interface Window { __island: IslandHooks } }
