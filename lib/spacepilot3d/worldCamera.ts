import { courseAt, forwardDirection, type FlightSettings, type WorldFlightPose } from './worldFlight';

/** Visual damping only. Never writes to accepted poses or input. Stable world-up. */
export class WorldChaseCamera {
  private yaw = 0;
  private pitch = 0;
  private initialized = false;
  reset() { this.initialized = false; }
  update(pose: WorldFlightPose, dt: number, reduced = false, settings?: FlightSettings) {
    const course = settings ? courseAt(pose.z,settings).yaw : 0, limit = (settings?.headingLimit ?? 60)*Math.PI/180;
    const targetYaw = course + Math.max(-limit,Math.min(limit,pose.yaw-course));
    const targetPitch = pose.pitch * (reduced ? .35 : 1);
    if (!this.initialized) { this.yaw = targetYaw; this.pitch = targetPitch; this.initialized = true; }
    const alpha = dt > 0 && dt <= .25 ? 1 - Math.exp(-dt / (reduced ? .45 : .16)) : 0;
    this.yaw += (targetYaw - this.yaw) * alpha;
    this.yaw = Math.max(course-limit,Math.min(course+limit,this.yaw));
    this.pitch += (targetPitch - this.pitch) * alpha;
    const f = forwardDirection(this.yaw, this.pitch), right = { x: Math.cos(this.yaw), z: Math.sin(this.yaw) };
    return { position: { x: pose.x - f.x * 9 - right.x * 1.4, y: pose.y - f.y * 9 + 5.7, z: pose.z - f.z * 9 - right.z * 1.4 }, target: { x: pose.x + f.x * 20, y: pose.y + f.y * 20 - 5.8, z: pose.z + f.z * 20 }, yaw: this.yaw, pitch: this.pitch, fov: reduced ? 54 : 50 };
  }
}
