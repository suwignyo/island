/** Reading the days: the label near a plot, the entry panel, and the marker above the plot. */
import * as THREE from 'three';
import type { DayEntry, Island, Plot } from '@island/world';

const NEAR = 1.5;       // distance from the plot door at which the label shows
const AUTO_CLOSE = 3.5; // the entry closes when the visitor walks this far away
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
}

export class Reader {
  nearDay: number | null = null;
  openDay: number | null = null;
  private label: HTMLDivElement;
  private panel: HTMLDivElement;
  private marker: THREE.Mesh;
  private tops = new Map<number, number>();
  private v = new THREE.Vector3();

  private island: Island;
  private days: DayEntry[];
  private touch: boolean;

  constructor(island: Island, days: DayEntry[], plotMeshes: Map<number, THREE.Mesh>, scene: THREE.Scene, ui: HTMLElement, touch: boolean) {
    this.island = island; this.days = days; this.touch = touch;
    for (const [day, mesh] of plotMeshes) { mesh.geometry.computeBoundingBox(); this.tops.set(day, mesh.geometry.boundingBox!.max.y); }
    this.label = document.createElement('div');
    this.label.className = 'panel plot-label hidden';
    this.panel = document.createElement('div');
    this.panel.className = 'panel entry hidden';
    this.panel.setAttribute('role', 'dialog');
    this.panel.setAttribute('aria-live', 'polite');
    ui.append(this.label, this.panel);
    this.marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), new THREE.MeshStandardMaterial({ color: 0xffc233, emissive: 0xffc233, emissiveIntensity: 0.9, flatShading: true }));
    this.marker.scale.y = 1.35;
    this.marker.visible = false;
    scene.add(this.marker);
  }

  plot(day: number): Plot | undefined { return this.island.plots[day - 1]; }

  /** The plot whose door is nearest to the visitor, if it is near enough. */
  private nearest(x: number, z: number): number | null {
    let best: number | null = null, bestD = NEAR;
    for (const p of this.island.plots) {
      const d = Math.hypot(p.door.x - x, p.door.z - z);
      if (d < bestD) { bestD = d; best = p.day; }
    }
    return best;
  }

  open(day: number) {
    const e = this.days[day - 1];
    if (!e) return;
    this.openDay = day;
    this.panel.replaceChildren();
    const close = document.createElement('button');
    close.className = 'close'; close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.textContent = '×';
    close.addEventListener('click', () => this.close());
    const date = document.createElement('div'); date.className = 'date'; date.textContent = `Day ${e.day} · ${formatDate(e.date)}`;
    const text = document.createElement('div'); text.className = 'text'; text.textContent = e.text;
    const chips = document.createElement('div'); chips.className = 'chips';
    for (const t of e.tags) { const c = document.createElement('span'); c.className = 'chip'; c.textContent = t; chips.append(c); }
    this.panel.append(close, date, text, chips);
    this.panel.classList.remove('hidden');
    history.replaceState(null, '', `#day-${day}`);
  }

  close() {
    if (this.openDay === null) return;
    this.openDay = null;
    this.panel.classList.add('hidden');
    history.replaceState(null, '', location.pathname + location.search);
  }

  /** E key: open the nearest plot, or close the open entry. */
  toggle() {
    if (this.openDay !== null) this.close();
    else if (this.nearDay !== null) this.open(this.nearDay);
  }

  /** Called before each render. `time` is simulation time, so tests stay deterministic. */
  update(player: { x: number; z: number }, camera: THREE.Camera, time: number, width: number, height: number) {
    this.nearDay = this.nearest(player.x, player.z);
    if (this.openDay !== null) {
      const p = this.plot(this.openDay)!;
      if (Math.hypot(p.door.x - player.x, p.door.z - player.z) > AUTO_CLOSE) this.close();
    }
    const focus = this.openDay ?? this.nearDay;
    if (focus === null) { this.marker.visible = false; this.label.classList.add('hidden'); return; }
    const p = this.plot(focus)!, top = this.tops.get(focus) ?? p.y + 1;
    this.marker.visible = true;
    this.marker.position.set(p.x, top + 0.45 + Math.sin(time * 2.4) * 0.06, p.z);
    this.marker.rotation.y = time * 1.2;

    if (this.openDay === focus) { this.label.classList.add('hidden'); return; }
    camera.updateMatrixWorld(); // lookAt() does not update the matrix until the next draw
    this.v.set(p.x, top + 0.75, p.z).project(camera);
    if (this.v.z > 1) { this.label.classList.add('hidden'); return; }
    // keep the label inside the window, also when the camera is close and the roof is above the screen
    const sx = Math.min(width - 80, Math.max(80, (this.v.x * 0.5 + 0.5) * width));
    const sy = Math.min(height - 120, Math.max(64, (-this.v.y * 0.5 + 0.5) * height));
    this.label.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) translate(-50%, -100%)`;
    const text = `Day ${focus}`;
    if (this.label.dataset.day !== String(focus)) {
      this.label.dataset.day = String(focus);
      this.label.innerHTML = `<b></b><span>${this.touch ? 'Tap to read' : 'E to read'}</span>`;
      this.label.querySelector('b')!.textContent = text;
    }
    this.label.classList.remove('hidden');
  }
}
