import { segmentDistanceSquared, SHIP_CAPSULES, type Point3 } from './collision';
import type { WorldFlightPose } from './worldFlight';

/** Inverse Ry(-yaw) Rx(pitch) Rz(bank), matching the rendered ship exactly. */
function local(point: Point3, pose: WorldFlightPose) {
  const dx = point.x - pose.x, dy = point.y - pose.y, dz = point.z - pose.z;
  const x = Math.cos(pose.yaw) * dx + Math.sin(pose.yaw) * dz, z = -Math.sin(pose.yaw) * dx + Math.cos(pose.yaw) * dz;
  const y = Math.cos(pose.pitch) * dy + Math.sin(pose.pitch) * z, zz = -Math.sin(pose.pitch) * dy + Math.cos(pose.pitch) * z;
  return { x: Math.cos(pose.bank) * x + Math.sin(pose.bank) * y, y: -Math.sin(pose.bank) * x + Math.cos(pose.bank) * y, z: zz };
}
/** Sweeps world translation AND orientation against the existing hull capsules.
 * Subdivided angular arcs get a conservative sagitta allowance (<0.0001 world units at normal
 * 120Hz steps), avoiding high-speed tunneling without an oversized ship sphere.
 */
export function sweptWorldIntersection(object: Point3, radius: number, before: WorldFlightPose, after: WorldFlightPose): boolean {
  const broad = { ax: object.x, ay: object.y, az: object.z, bx: object.x, by: object.y, bz: object.z, radius: 0 };
  if (segmentDistanceSquared(before.x,before.y,before.z,after.x,after.y,after.z,broad) > (radius + 3) ** 2) return false;
  const angle = Math.abs(after.yaw-before.yaw) + Math.abs(after.pitch-before.pitch) + Math.abs(after.bank-before.bank);
  const divisions = Math.max(1, Math.ceil(angle / .004));
  const pose = { ...before };
  let from = local(object, before);
  for (let i = 1; i <= divisions; i++) {
    const t = i / divisions;
    for (const key of ['x','y','z','yaw','pitch','bank'] as const) pose[key] = before[key] + (after[key] - before[key]) * t;
    const to = local(object, pose), sagitta = Math.max(Math.hypot(from.x,from.y,from.z),Math.hypot(to.x,to.y,to.z)) * (angle / divisions) ** 2 / 8;
    for (const capsule of SHIP_CAPSULES) if (segmentDistanceSquared(from.x,from.y,from.z,to.x,to.y,to.z,capsule) <= (radius + capsule.radius + sagitta) ** 2 + 1e-10) return true;
    from = to;
  }
  return false;
}
