import type { NormalizedFlightInput } from './simulation';
import type { FlightDifficulty } from './missions';

export const MAX_HEADING = Math.PI / 3; // Absolute maximum: ±60° relative to the course.
export const MAX_PITCH = .3;
export const INPUT_DEADZONE = .06;
export const FLIGHT_STEP = 1 / 120;
export interface FlightSettings {
  sensitivity: number; maxTurnRate: number; encounterSpacing: number;
  horizontalLimit: number; verticalLimit: number; headingLimit: number;
  course: number; guidance: number; reducedCamera: number;
}
export interface WorldFlightPose { x: number; y: number; z: number; yaw: number; pitch: number; bank: number; controlX: number; controlY: number }
export const flightDefaults = (difficulty: FlightDifficulty): FlightSettings => ({ sensitivity: 1, maxTurnRate: difficulty === 'LOW' ? 30 : difficulty === 'HIGH' ? 60 : 45, encounterSpacing: difficulty === 'HIGH' ? 4 : 5, horizontalLimit: difficulty === 'LOW' ? 32 : difficulty === 'HIGH' ? 48 : 40, verticalLimit: difficulty === 'LOW' ? 12 : difficulty === 'HIGH' ? 20 : 16, headingLimit: difficulty === 'LOW' ? 35 : difficulty === 'HIGH' ? 60 : 45, course: 0, guidance: difficulty === 'HIGH' ? 1 : 2, reducedCamera: 0 });
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
export function normalizeFlightSettings(patch: Partial<FlightSettings> = {}, difficulty: FlightDifficulty = 'MEDIUM'): FlightSettings {
  const base = flightDefaults(difficulty);
  const value = (key: keyof FlightSettings, a: number, b: number) => typeof patch[key] === 'number' && Number.isFinite(patch[key]) ? clamp(patch[key]!, a, b) : base[key];
  return { sensitivity: value('sensitivity', .5, 2), maxTurnRate: value('maxTurnRate', 15, 75), encounterSpacing: value('encounterSpacing', 4, 10), horizontalLimit: value('horizontalLimit', 32, 64), verticalLimit: value('verticalLimit', 12, 28), headingLimit: value('headingLimit', 20, 60), course: Math.round(value('course',0,1)), guidance: Math.round(value('guidance',0,2)), reducedCamera: Math.round(value('reducedCamera',0,1)) };
}
export function isFlightSettings(value: unknown): value is FlightSettings {
  if (!value || typeof value !== 'object') return false;
  const v = value as FlightSettings, normalized = normalizeFlightSettings(v);
  return (Object.keys(normalized) as (keyof FlightSettings)[]).every(key => Number.isFinite(v[key]) && v[key] === normalized[key]);
}
/** Configured route, independent of input and objectives. Neutral follows this course. */
export function courseAt(z: number, settings: Pick<FlightSettings,'course'>) {
  const phase = -z * Math.PI * 2 / 1600, x = settings.course ? 12 * Math.sin(phase) : 0;
  const slope = settings.course ? 12 * Math.PI * 2 / 1600 * Math.cos(phase) : 0;
  return { x, y: 0, yaw: Math.atan(slope) };
}
export const initialFlightPose = (): WorldFlightPose => ({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, bank: 0, controlX: .5, controlY: .5 });
export function isWorldFlightPose(value: unknown): value is WorldFlightPose {
  if (!value || typeof value !== 'object') return false;
  const v = value as WorldFlightPose;
  return ['x','y','z','yaw','pitch','bank','controlX','controlY'].every(key => Number.isFinite(v[key as keyof WorldFlightPose])) && Math.abs(v.x) <= 76 && Math.abs(v.y) <= 28 && v.z <= 0 && Math.abs(v.yaw) <= MAX_HEADING + .05 && Math.abs(v.pitch) <= MAX_PITCH + 1e-8 && Math.abs(v.bank) <= .3 && v.controlX >= 0 && v.controlX <= 1 && v.controlY >= 0 && v.controlY <= 1;
}
/** Static game mapping: no low-pass, time averaging, calibration or sensor transport. */
export function steeringAxis(value: number, sensitivity: number): number {
  const axis = clamp(value, -1, 1);
  return Math.abs(axis) <= INPUT_DEADZONE ? 0 : clamp(Math.sign(axis) * (Math.abs(axis) - INPUT_DEADZONE) / (1 - INPUT_DEADZONE) * sensitivity, -1, 1);
}
const approach = (from: number, to: number, limit: number) => from + clamp(to - from, -limit, limit);
export function forwardDirection(yaw: number, pitch: number) { return { x: Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) }; }
/** Integrates outward speed analytically through a soft boundary zone. Never
 * teleports/clamps to a wall. Inward movement has the full available velocity. */
export function boundedTravel(position: number, velocity: number, limit: number, zone: number, dt: number) {
  if (velocity === 0) return position;
  const sign = Math.sign(velocity), clearance = Math.max(0, limit - sign * position), travel = Math.abs(velocity) * dt;
  const unrestrained = Math.max(0, clearance - zone);
  if (travel <= unrestrained) return position + velocity * dt;
  const remaining = clearance - unrestrained;
  return position + sign * (unrestrained + remaining * (1 - Math.exp(-(travel - unrestrained) / zone)));
}
/** Physical pose response, not a filter on the accepted pointer. */
export function advanceFlight(pose: WorldFlightPose, input: NormalizedFlightInput, settings: FlightSettings, speed: number, dt: number): void {
  pose.controlX = clamp(input.x, 0, 1); pose.controlY = clamp(input.y, 0, 1);
  const course = courseAt(pose.z,settings), heading = settings.headingLimit * Math.PI / 180;
  const targetYaw = course.yaw + steeringAxis((pose.controlX - .5) * 2, settings.sensitivity) * heading;
  const targetPitch = steeringAxis((.5 - pose.controlY) * 2, settings.sensitivity) * MAX_PITCH;
  const rate = settings.maxTurnRate * Math.PI / 180, oldYaw = pose.yaw, oldPitch = pose.pitch;
  const yaw = approach(oldYaw, targetYaw, rate * dt), pitch = approach(oldPitch, targetPitch, rate * .7 * dt);
  const direction = forwardDirection((oldYaw + yaw) / 2,(oldPitch + pitch) / 2);
  const dz = direction.z * speed * dt, nextCourse = courseAt(pose.z + dz, settings);
  const relativeX = pose.x - course.x, courseShift = nextCourse.x - course.x;
  const x = nextCourse.x + boundedTravel(relativeX, direction.x * speed - courseShift / dt, settings.horizontalLimit, Math.min(settings.horizontalLimit * .5, Math.max(8, speed / rate * .45)), dt);
  const y = boundedTravel(pose.y, direction.y * speed, settings.verticalLimit, Math.min(settings.verticalLimit * .25, Math.max(3,speed / rate * .10)), dt);
  // Match effective travel orientation at a boundary, so the camera does not
  // look away while lateral speed is safely reduced. Free-space rate is unchanged.
  const effectiveYaw = Math.atan2(x-pose.x,-dz), effectivePitch = Math.atan2(y-pose.y,Math.hypot(x-pose.x,dz));
  const constrainedX = Math.abs(x-(pose.x+direction.x*speed*dt))>1e-8;
  const constrainedY = Math.abs(y-(pose.y+direction.y*speed*dt))>1e-8;
  pose.yaw = constrainedX ? effectiveYaw : yaw; pose.pitch = constrainedY ? effectivePitch : pitch;
  pose.x = x; pose.y = y; pose.z += dz;
  pose.bank = approach(pose.bank, clamp(-(pose.yaw-oldYaw)/(dt*rate)*.28,-.28,.28),1.2*dt);
}
export function pointerForHeading(yaw: number, pitch: number, sensitivity: number, headingLimit = 45): NormalizedFlightInput {
  const inverse = (axis: number) => Math.abs(axis) < 1e-9 ? 0 : Math.sign(axis) * (INPUT_DEADZONE + Math.min(1, Math.abs(axis) / sensitivity) * (1 - INPUT_DEADZONE));
  return { x: .5 + inverse(yaw / (headingLimit*Math.PI/180)) / 2, y: .5 - inverse(pitch / MAX_PITCH) / 2 };
}
