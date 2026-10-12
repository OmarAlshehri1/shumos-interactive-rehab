import * as THREE from "three";

/** Tracks every GPU resource created for a scene so one dispose() releases all of them. */
export class Own {
  private geoms = new Set<THREE.BufferGeometry>();
  private mats = new Set<THREE.Material>();
  private texs = new Set<THREE.Texture>();
  geom<T extends THREE.BufferGeometry>(g: T): T { this.geoms.add(g); return g; }
  mat<T extends THREE.Material>(m: T): T { this.mats.add(m); return m; }
  tex<T extends THREE.Texture>(t: T): T { this.texs.add(t); return t; }
  /** Dispose and forget any tracked resource. */
  release(r: THREE.BufferGeometry | THREE.Material | THREE.Texture): void {
    r.dispose();
    if (r instanceof THREE.BufferGeometry) this.geoms.delete(r); else if (r instanceof THREE.Texture) this.texs.delete(r); else this.mats.delete(r);
  }
  /** Dispose and forget one texture. */
  drop(t: THREE.Texture | undefined): void { if (t) { t.dispose(); this.texs.delete(t); } }
  /** Dispose everything created since `mark` snapshots (used when a stage's props are replaced). */
  snapshot(): { g: Set<THREE.BufferGeometry>; m: Set<THREE.Material>; t: Set<THREE.Texture> } {
    return { g: new Set(this.geoms), m: new Set(this.mats), t: new Set(this.texs) };
  }
  disposeSince(snap: { g: Set<THREE.BufferGeometry>; m: Set<THREE.Material>; t: Set<THREE.Texture> }): void {
    for (const g of [...this.geoms]) if (!snap.g.has(g)) { g.dispose(); this.geoms.delete(g); }
    for (const m of [...this.mats]) if (!snap.m.has(m)) { m.dispose(); this.mats.delete(m); }
    for (const t of [...this.texs]) if (!snap.t.has(t)) { t.dispose(); this.texs.delete(t); }
  }
  disposeAll(): void {
    this.geoms.forEach((g) => g.dispose());
    this.mats.forEach((m) => m.dispose());
    this.texs.forEach((t) => t.dispose());
    this.geoms.clear(); this.mats.clear(); this.texs.clear();
  }
  counts() { return { geometries: this.geoms.size, materials: this.mats.size, textures: this.texs.size }; }
}
