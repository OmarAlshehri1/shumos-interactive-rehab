import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { leaf, mat, rng, shared } from './kit';
import { FLATS, heightAt, noise, riverX, WORLD } from './terrain';
import { inBuildZone, nearFootprint } from './layout';

function crownRound(): THREE.BufferGeometry {
  const parts = [
    new THREE.IcosahedronGeometry(1.7, 1).scale(1, 0.85, 1).translate(0, 3.0, 0),
    new THREE.IcosahedronGeometry(1.1, 1).translate(1.0, 3.4, 0.2),
    new THREE.IcosahedronGeometry(1.0, 1).translate(-0.9, 3.6, -0.3),
  ].map((g) => g.toNonIndexed());
  return mergeGeometries(parts)!;
}
function crownPine(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) parts.push(new THREE.ConeGeometry(1.7 - i * 0.34, 2.0, 7).translate(0, 1.7 + i * 1.05, 0).toNonIndexed());
  return mergeGeometries(parts)!;
}
const trunkGeo = () => new THREE.CylinderGeometry(0.22, 0.32, 2.2, 6).translate(0, 1.1, 0).toNonIndexed();

export interface Forest { group: THREE.Group; dispose(): void; count: number }

/** The living backdrop: forests on the hills and along the river, wild flower meadows, kept clear of every building footprint. */
export function buildForest(quality: 'high' | 'balanced' | 'low'): Forest {
  const group = new THREE.Group();
  const r = rng(2024);
  const want = quality === 'low' ? 380 : quality === 'balanced' ? 900 : 1500;
  const spots: { x: number; z: number; k: 0 | 1; s: number }[] = [];
  for (let tries = 0; tries < want * 14 && spots.length < want; tries++) {
    const x = WORLD.cx + (r() - 0.5) * WORLD.w * 0.98, z = WORLD.cz + (r() - 0.5) * WORLD.d * 0.98;
    const h = heightAt(x, z);
    if (h < 1.1 || h > 15) continue;
    if (z > -92 && Math.abs(x - riverX(z)) < 7.5) continue;
    if (nearFootprint(x, z, 2) || inBuildZone(x, z, FLATS, 2)) continue;
    const dens = noise(x * 0.045 + 3, z * 0.045 - 8);
    if (dens < 0.42 && r() > 0.12) continue; // forests in clumps, a few lone trees elsewhere
    spots.push({ x, z, k: h > 6 || noise(x * 0.1, z * 0.1) > 0.62 ? 1 : 0, s: 0.8 + r() * 0.7 });
  }
  const make = (geo: THREE.BufferGeometry, material: THREE.Material, items: typeof spots, colors?: string[]) => {
    const m = new THREE.InstancedMesh(geo, material, Math.max(1, items.length));
    const d = new THREE.Object3D(), c = new THREE.Color();
    items.forEach((it, i) => {
      d.position.set(it.x, heightAt(it.x, it.z) - 0.1, it.z);
      d.rotation.y = r() * 6.28; d.scale.setScalar(it.s); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
      if (colors) { c.set(colors[Math.floor(r() * colors.length)]); m.setColorAt(i, c); }
    });
    m.count = items.length; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
    group.add(m);
    return m;
  };
  const round = spots.filter((s) => s.k === 0), pine = spots.filter((s) => s.k === 1);
  const lm = leaf('#ffffff'), lp = leaf('#ffffff');
  make(trunkGeo(), mat('#7a5638', { rough: 0.95 }), spots);
  make(crownRound(), lm, round, ['#4da83a', '#5cb844', '#3f9a3a', '#6bc24a', '#7ac24a']);
  make(crownPine(), lp, pine, ['#2f7a45', '#3a8a4e', '#2a6f4a']);
  // meadow flowers: tiny coloured dots in clumps
  const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.16, 0), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 700);
  const d = new THREE.Object3D(), c = new THREE.Color();
  const pal = ['#ff7aa8', '#ffd54a', '#ffffff', '#c78bff', '#ff9a4a'];
  let n = 0;
  for (let tries = 0; tries < 6000 && n < 700; tries++) {
    const x = WORLD.cx + (r() - 0.5) * WORLD.w * 0.8, z = WORLD.cz + (r() - 0.5) * WORLD.d * 0.7;
    const h = heightAt(x, z);
    if (h < 1.3 || h > 8 || nearFootprint(x, z, 1) || inBuildZone(x, z, FLATS, 0) || noise(x * 0.09 + 20, z * 0.09) < 0.6 || (z > -92 && Math.abs(x - riverX(z)) < 6)) continue;
    d.position.set(x, h + 0.14, z); d.scale.setScalar(0.7 + r() * 0.8); d.updateMatrix(); fl.setMatrixAt(n, d.matrix); c.set(pal[Math.floor(r() * pal.length)]); fl.setColorAt(n, c); n++;
  }
  fl.count = n; fl.frustumCulled = false; group.add(fl);
  void shared;
  return {
    group, count: spots.length,
    dispose() { group.traverse((o) => { const m = o as THREE.InstancedMesh; if (m.isInstancedMesh) { m.geometry.dispose(); m.dispose(); } }); },
  };
}

/** Soft low-poly clouds that drift slowly across the sky. */
export function buildClouds(): { group: THREE.Group; update(dt: number, night: number): void; dispose(): void } {
  const group = new THREE.Group();
  const r = rng(99);
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, flatShading: true, emissive: '#ffffff', emissiveIntensity: 0.25, transparent: true, opacity: 0.95 });
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(4 + r() * 4, 1), m);
      s.position.set(k * 5 - n * 2.5, r() * 2, (r() - 0.5) * 5); s.scale.y = 0.55;
      g.add(s);
    }
    g.position.set((r() - 0.5) * 420, 70 + r() * 25, -130 + r() * 200);
    g.userData.v = 0.8 + r() * 1.2;
    group.add(g);
  }
  return {
    group,
    update(dt, night) {
      group.children.forEach((c) => { c.position.x += (c.userData.v as number) * dt; if (c.position.x > 230) c.position.x = -230; });
      m.emissiveIntensity = 0.25 * (1 - night * 0.9);
      m.color.setScalar(1 - night * 0.75);
    },
    dispose() { group.traverse((o) => { const x = o as THREE.Mesh; if (x.isMesh) x.geometry.dispose(); }); m.dispose(); },
  };
}
