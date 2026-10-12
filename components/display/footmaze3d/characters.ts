import * as THREE from 'three';
import type { CharId } from '@/lib/footmaze3d/mazes';
import type { Disposer } from './kit';

/**
 * Friendly guardians. All are built from soft spheres and capsules, with big eyes and smiles, bright colours and a raised
 * "wait" hand: nothing sharp, nothing dark, nothing that chases. Local +Z is the front; the scene turns them toward the
 * child's waiting zone. `userData.arm` marks the waving arm.
 */
export function makeCharacter(kind: CharId, d: Disposer): THREE.Group {
  const g = new THREE.Group();
  const mat = (color: number, o: Partial<THREE.MeshStandardMaterialParameters> = {}) => d.add(new THREE.MeshStandardMaterial({ color, roughness: 0.55, ...o }));
  const sph = (r: number, x: number, y: number, z: number, m: THREE.Material, sx = 1, sy = 1, sz = 1) => {
    const mm = new THREE.Mesh(d.add(new THREE.SphereGeometry(r, 18, 14)), m);
    mm.position.set(x, y, z); mm.scale.set(sx, sy, sz); mm.castShadow = true; g.add(mm); return mm;
  };
  const dark = mat(0x2b2118, { roughness: 0.4 });
  const white = mat(0xffffff, { roughness: 0.3 });
  const eyes = (y: number, z: number, gap: number, r = 0.075) => {
    for (const s of [-1, 1]) { sph(r * 1.5, s * gap, y, z, white); sph(r, s * gap, y, z + r * 0.9, dark); sph(r * 0.4, s * gap + r * 0.3, y + r * 0.4, z + r * 1.7, white); }
  };
  const smile = (y: number, z: number, w = 0.12) => {
    const m = new THREE.Mesh(d.add(new THREE.TorusGeometry(w, 0.018, 6, 16, Math.PI)), dark);
    m.position.set(0, y, z); m.rotation.z = Math.PI; g.add(m);
  };
  const arm = (side: 1 | -1, color: number, wave: boolean, y = 0.78) => {
    const a = new THREE.Group();
    const limb = new THREE.Mesh(d.add(new THREE.CapsuleGeometry(0.075, 0.34, 4, 10)), mat(color)); limb.position.y = 0.2; limb.castShadow = true; a.add(limb);
    const hand = new THREE.Mesh(d.add(new THREE.SphereGeometry(0.11, 12, 10)), mat(0xfff1d6)); hand.position.y = 0.42; a.add(hand);
    a.position.set(side * 0.42, y, 0.04);
    a.rotation.z = side * (wave ? -2.6 : -0.5);
    if (wave) a.userData.arm = true;
    g.add(a);
  };

  if (kind === 'robot') {
    // a small garden robot: rounded body, glowing screen face, antenna with a light, wheels
    const body = mat(0x5ec8ff, { roughness: 0.35, metalness: 0.15 }), trim = mat(0xfff1d6), glow = mat(0x9fffe0, { emissive: 0x3fe0a0, emissiveIntensity: 1.1 });
    sph(0.42, 0, 0.5, 0, body, 1, 1.05, 0.95);
    const head = sph(0.34, 0, 1.1, 0, body, 1.15, 0.9, 1);
    const screen = new THREE.Mesh(d.add(new THREE.CapsuleGeometry(0.18, 0.2, 4, 10)), mat(0x0b2a3a, { roughness: 0.2 })); screen.rotation.z = Math.PI / 2; screen.position.set(0, 1.12, 0.3); g.add(screen);
    for (const s of [-1, 1]) sph(0.065, s * 0.12, 1.14, 0.36, glow);
    smile(1.06, 0.38, 0.09);
    const stem = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 6)), trim); stem.position.set(0, 1.5, 0); g.add(stem);
    sph(0.08, 0, 1.66, 0, mat(0xffd23f, { emissive: 0xffa000, emissiveIntensity: 0.9 }));
    for (const s of [-1, 1]) { const w = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.17, 0.17, 0.14, 16)), trim); w.rotation.z = Math.PI / 2; w.position.set(s * 0.34, 0.17, 0); w.castShadow = true; g.add(w); }
    sph(0.14, 0, 0.55, 0.38, glow);
    arm(-1, 0x5ec8ff, false); arm(1, 0x5ec8ff, true);
    void head;
  } else if (kind === 'duck') {
    const yellow = mat(0xffd84a), orange = mat(0xff9a3c), hat = mat(0x6a5cff);
    sph(0.4, 0, 0.42, 0, yellow, 1, 0.95, 1.1);
    sph(0.3, 0, 1.0, 0.06, yellow);
    sph(0.12, 0, 0.94, 0.34, orange, 1.5, 0.55, 1.3);
    eyes(1.06, 0.24, 0.12, 0.06);
    const cap = new THREE.Mesh(d.add(new THREE.ConeGeometry(0.2, 0.3, 14)), hat); cap.position.set(0, 1.36, 0.02); cap.castShadow = true; g.add(cap);
    sph(0.06, 0, 1.54, 0.02, mat(0xffffff));
    sph(0.12, 0, 0.5, -0.4, yellow, 0.9, 0.7, 1.4);
    for (const s of [-1, 1]) { const f = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 10)), orange); f.position.set(s * 0.16, 0.03, 0.12); g.add(f); }
    arm(-1, 0xffd84a, false, 0.7); arm(1, 0xffd84a, true, 0.7);
  } else if (kind === 'bear') {
    const fur = mat(0xb06a3a, { roughness: 0.85 }), cream = mat(0xffe7c8, { roughness: 0.85 }), crown = mat(0xffd23f, { metalness: 0.6, roughness: 0.3 });
    sph(0.44, 0, 0.46, 0, fur, 1, 1.05, 1);
    sph(0.3, 0, 0.5, 0.26, cream, 1, 1, 0.6);
    sph(0.34, 0, 1.12, 0, fur);
    sph(0.15, 0, 1.04, 0.28, cream, 1.2, 0.9, 0.9);
    sph(0.055, 0, 1.08, 0.4, dark);
    eyes(1.2, 0.26, 0.13, 0.055);
    for (const s of [-1, 1]) { sph(0.12, s * 0.24, 1.42, -0.02, fur); sph(0.07, s * 0.24, 1.42, 0.05, cream); }
    const c = new THREE.Mesh(d.add(new THREE.CylinderGeometry(0.2, 0.17, 0.14, 5)), crown); c.position.set(0, 1.5, 0); c.castShadow = true; g.add(c);
    arm(-1, 0xb06a3a, false); arm(1, 0xb06a3a, true);
  } else if (kind === 'fox') {
    const fur = mat(0xf08a24, { roughness: 0.75 }), cream = mat(0xfff1d6, { roughness: 0.8 });
    sph(0.38, 0, 0.42, 0, fur, 1, 1.05, 1);
    sph(0.26, 0, 0.38, 0.22, cream, 1, 1, 0.7);
    sph(0.3, 0, 0.98, 0, fur);
    sph(0.14, 0, 0.9, 0.24, cream, 1.2, 0.9, 0.9);
    sph(0.05, 0, 0.94, 0.33, dark);
    eyes(1.04, 0.22, 0.1, 0.05);
    for (const s of [-1, 1]) { const ear = new THREE.Mesh(d.add(new THREE.ConeGeometry(0.1, 0.26, 10)), fur); ear.position.set(s * 0.17, 1.3, -0.02); ear.rotation.z = -s * 0.25; g.add(ear); }
    const tail = sph(0.2, 0, 0.3, -0.42, fur, 0.8, 0.8, 1.6); tail.rotation.x = -0.5;
    arm(-1, 0xf08a24, false, 0.66); arm(1, 0xf08a24, true, 0.66);
  } else {
    // toy block buddy
    const m1 = mat(0xff5d8f), m2 = mat(0x3ec6ff);
    const b = new THREE.Mesh(d.add(new THREE.BoxGeometry(0.7, 0.7, 0.7)), m1); b.position.y = 0.4; b.castShadow = true; g.add(b);
    const t = new THREE.Mesh(d.add(new THREE.BoxGeometry(0.5, 0.5, 0.5)), m2); t.position.y = 1.0; t.castShadow = true; g.add(t);
    eyes(1.04, 0.26, 0.11, 0.055); smile(0.94, 0.27, 0.08);
    arm(-1, 0xff5d8f, false, 0.6); arm(1, 0xff5d8f, true, 0.6);
  }
  if (kind !== 'robot') smile(kind === 'duck' ? 0.84 : kind === 'bear' ? 1.0 : 0.88, kind === 'duck' ? 0.4 : 0.3, 0.07);
  return g;
}
