export interface Point3 { readonly x: number; readonly y: number; readonly z: number }
export interface ShipCapsule { readonly ax: number; readonly ay: number; readonly az: number; readonly bx: number; readonly by: number; readonly bz: number; readonly radius: number }

// Forward is -Z. Exhaust and cosmetic upgrades are excluded. These capsules
// match the hull, thin wings and two engine pods rather than a giant ship sphere.
export const SHIP_CAPSULES: readonly ShipCapsule[] = [
  { ax: 0, ay: 0, az: -1.7, bx: 0, by: 0, bz: 0.85, radius: 0.45 },
  { ax: -2.1, ay: -0.08, az: 0.8, bx: 2.1, by: -0.08, bz: 0.8, radius: 0.16 },
  { ax: -0.95, ay: 0, az: -0.3, bx: -0.95, by: 0, bz: 1.3, radius: 0.32 },
  { ax: 0.95, ay: 0, az: -0.3, bx: 0.95, by: 0, bz: 1.3, radius: 0.32 },
];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** Closest distance between two finite segments, including degenerate points. */
export function segmentDistanceSquared(px: number, py: number, pz: number, qx: number, qy: number, qz: number, capsule: ShipCapsule): number {
  const dx = qx - px, dy = qy - py, dz = qz - pz;
  const ex = capsule.bx - capsule.ax, ey = capsule.by - capsule.ay, ez = capsule.bz - capsule.az;
  const rx = px - capsule.ax, ry = py - capsule.ay, rz = pz - capsule.az;
  const a = dx * dx + dy * dy + dz * dz, e = ex * ex + ey * ey + ez * ez;
  const b = dx * ex + dy * ey + dz * ez, c = dx * rx + dy * ry + dz * rz, f = ex * rx + ey * ry + ez * rz;
  let s = 0, t = 0;
  if (a <= 1e-12 && e <= 1e-12) return rx * rx + ry * ry + rz * rz;
  if (a <= 1e-12) t = clamp01(f / e);
  else if (e <= 1e-12) s = clamp01(-c / a);
  else {
    const denominator = a * e - b * b;
    s = denominator > 1e-12 ? clamp01((b * f - c * e) / denominator) : 0;
    t = (b * s + f) / e;
    if (t < 0) { t = 0; s = clamp01(-c / a); }
    else if (t > 1) { t = 1; s = clamp01((b - c) / a); }
  }
  const x = rx + dx * s - ex * t, y = ry + dy * s - ey * t, z = rz + dz * s - ez * t;
  return x * x + y * y + z * z;
}

/** Object sphere swept relative to the translating, unbanked ship. No allocations. */
export function sweptShipIntersection(objectX: number, objectY: number, fromZ: number, toZ: number, radius: number, fromShipX: number, fromShipY: number, toShipX: number, toShipY: number): boolean {
  if (Math.min(fromZ, toZ) > 3 + radius || Math.max(fromZ, toZ) < -3 - radius) return false;
  for (const capsule of SHIP_CAPSULES) {
    const combinedRadius = capsule.radius + radius;
    if (segmentDistanceSquared(objectX - fromShipX, objectY - fromShipY, fromZ, objectX - toShipX, objectY - toShipY, toZ, capsule) <= combinedRadius * combinedRadius + 1e-10) return true;
  }
  return false;
}
