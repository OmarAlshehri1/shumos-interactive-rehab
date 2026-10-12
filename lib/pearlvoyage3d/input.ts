import { clamp, type Input } from './engine';

/**
 * Steering wheel, accelerator/brake pedals and a standard-Gamepad fallback. Nothing here assumes a specific
 * product: every axis is configured by the therapist (index, rest/pressed or centre/min/max, dead zone,
 * inversion). Sampled only on the authoritative Control device and fed into the same reducer as manual input.
 * Physical compatibility is NOT claimed until real hardware is tested.
 */
export interface Axis {
    index: number;
    rest: number;
    pressed: number;
    center: number;
    min: number;
    max: number;
    deadZone: number;
    inverted: boolean;
}
export interface Mapping {
    version: 1;
    deviceIndex: number;
    steering: Axis;
    throttle: Axis;
    brake: Axis;
    holdButton: number;
    brakeButton: number;
    /** inputs older than this are treated as disconnected and pause the boat safely */
    freshMs: number;
}
export const emptyAxis = (): Axis => ({ index: -1, rest: -1, pressed: 1, center: 0, min: -1, max: 1, deadZone: 0.08, inverted: false });
export const DEFAULT_MAPPING: Mapping = { version: 1, deviceIndex: 0, steering: emptyAxis(), throttle: emptyAxis(), brake: emptyAxis(), holdButton: -1, brakeButton: -1, freshMs: 500 };
/** the standard Gamepad layout: left stick X steers, right trigger accelerates, left trigger brakes, A holds */
export const STANDARD_GAMEPAD_MAPPING: Mapping = { ...DEFAULT_MAPPING, steering: { ...emptyAxis(), index: 0 }, throttle: { ...emptyAxis(), index: -1 }, brake: { ...emptyAxis(), index: -1 }, holdButton: 0, brakeButton: 6 };
export function sanitizeMapping(raw: unknown): Mapping | null {
    try {
        const r = raw as Mapping;
        if (!r || r.version !== 1 || !Number.isInteger(r.deviceIndex) || r.deviceIndex < 0 || r.deviceIndex > 15) return null;
        for (const key of ['steering', 'throttle', 'brake'] as const) {
            const a = r[key];
            if (!a || !Number.isInteger(a.index) || a.index < -1 || a.index > 31 || ![a.rest, a.pressed, a.center, a.min, a.max, a.deadZone].every(Number.isFinite) || a.min >= a.max || a.center <= a.min || a.center >= a.max || a.deadZone < 0 || a.deadZone > 0.8 || typeof a.inverted !== 'boolean' || Math.abs(a.rest - a.pressed) < 0.01) return null;
        }
        if (![r.holdButton, r.brakeButton].every(v => Number.isInteger(v) && v >= -1 && v <= 63) || !Number.isFinite(r.freshMs) || r.freshMs < 100 || r.freshMs > 2000) return null;
        return { version: 1, deviceIndex: r.deviceIndex, steering: { ...r.steering }, throttle: { ...r.throttle }, brake: { ...r.brake }, holdButton: r.holdButton, brakeButton: r.brakeButton, freshMs: r.freshMs };
    }
    catch {
        return null;
    }
}
export function axisValue(axes: readonly number[], a: Axis, pedal = false): number {
    const raw = axes[a.index];
    if (a.index < 0 || !Number.isFinite(raw)) return 0;
    if (pedal) {
        const v = clamp((raw - a.rest) / (a.pressed - a.rest), 0, 1);
        return a.inverted ? 1 - v : v;
    }
    const v = (raw - a.center) / (raw < a.center ? a.center - a.min : a.max - a.center);
    const dead = Math.abs(v) < a.deadZone ? 0 : Math.sign(v) * (Math.abs(v) - a.deadZone) / (1 - a.deadZone);
    return clamp(dead * (a.inverted ? -1 : 1), -1, 1);
}
/** returns null when the device is gone or a configured axis is not reporting, which the engine treats as a safe pause */
export function sampleGamepad(pad: Pick<Gamepad, 'axes' | 'buttons' | 'connected'> | null, m: Mapping, control: 'wheel' | 'pedal' | 'wheel-pedal'): Input | null {
    if (!pad?.connected || !sanitizeMapping(m)) return null;
    const needed = control === 'wheel' ? [m.steering] : control === 'pedal' ? [m.throttle, m.brake] : [m.steering, m.throttle, m.brake];
    if (needed.some(a => a.index >= 0 && !Number.isFinite(pad.axes[a.index]))) return null;
    const button = (i: number) => i >= 0 ? (pad.buttons[i]?.value ?? 0) : 0;
    const wheel = control !== 'pedal';
    const pedals = control !== 'wheel';
    return {
        steering: wheel ? axisValue(pad.axes, m.steering) : 0,
        throttle: pedals ? axisValue(pad.axes, m.throttle, true) : 0,
        brake: pedals ? Math.max(axisValue(pad.axes, m.brake, true), button(m.brakeButton)) : button(m.brakeButton),
        hold: button(m.holdButton) > 0.5,
    };
}
export const MAPPING_STORAGE_KEY = 'shumos.pearlVoyage.mapping.v1';
