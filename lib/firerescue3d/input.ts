import { clamp, type Input } from './engine';
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
    aimX: Axis;
    aimY: Axis;
    waterButton: number;
    brakeButton: number;
}
export const emptyAxis = (): Axis => ({ index: -1, rest: -1, pressed: 1, center: 0, min: -1, max: 1, deadZone: 0.1, inverted: false });
export const DEFAULT_MAPPING: Mapping = { version: 1, deviceIndex: 0, steering: emptyAxis(), throttle: emptyAxis(), brake: emptyAxis(), aimX: emptyAxis(), aimY: emptyAxis(), waterButton: -1, brakeButton: -1 };
export function sanitizeMapping(raw: unknown): Mapping | null {
    try {
        const r = raw as Mapping;
        if (!r || r.version !== 1 || !Number.isInteger(r.deviceIndex) || r.deviceIndex < 0 || r.deviceIndex > 15)
            return null;
        for (const key of ['steering', 'throttle', 'brake', 'aimX', 'aimY'] as const) {
            const a = r[key];
            if (!a || !Number.isInteger(a.index) || a.index < -1 || a.index > 31 || ![a.rest, a.pressed, a.center, a.min, a.max, a.deadZone].every(Number.isFinite) || a.min >= a.max || a.center <= a.min || a.center >= a.max || a.deadZone < 0 || a.deadZone > 0.8 || typeof a.inverted !== 'boolean' || Math.abs(a.rest - a.pressed) < 0.01)
                return null;
        }
        if (![r.waterButton, r.brakeButton].every(v => Number.isInteger(v) && v >= -1 && v <= 63))
            return null;
        return { version: 1, deviceIndex: r.deviceIndex, steering: { ...r.steering }, throttle: { ...r.throttle }, brake: { ...r.brake }, aimX: { ...r.aimX }, aimY: { ...r.aimY }, waterButton: r.waterButton, brakeButton: r.brakeButton };
    }
    catch {
        return null;
    }
}
export function axisValue(axes: readonly number[], a: Axis, pedal = false): number {
    const raw = axes[a.index];
    if (a.index < 0 || !Number.isFinite(raw))
        return 0;
    if (pedal) {
        const v = clamp((raw - a.rest) / (a.pressed - a.rest), 0, 1);
        return a.inverted ? 1 - v : v;
    }
    const v = (raw - a.center) / (raw < a.center ? a.center - a.min : a.max - a.center);
    const dead = Math.abs(v) < a.deadZone ? 0 : Math.sign(v) * (Math.abs(v) - a.deadZone) / (1 - a.deadZone);
    return clamp(dead * (a.inverted ? -1 : 1), -1, 1);
}
/** Called only on the authoritative Control device. No cross-device hardware relay or HID/force-feedback claim. */
export function sampleGamepad(pad: Pick<Gamepad, 'axes' | 'buttons' | 'connected'> | null, m: Mapping): Input | null {
    if (!pad?.connected || !sanitizeMapping(m))
        return null;
    if (['steering', 'throttle', 'brake', 'aimX', 'aimY'].some(k => { const i = m[k as 'steering'].index; return i >= 0 && !Number.isFinite(pad.axes[i]); }))
        return null;
    const button = (i: number) => i >= 0 ? (pad.buttons[i]?.value ?? 0) : 0;
    return { steering: axisValue(pad.axes, m.steering), throttle: axisValue(pad.axes, m.throttle, true), brake: Math.max(axisValue(pad.axes, m.brake, true), button(m.brakeButton)), aimX: axisValue(pad.axes, m.aimX), aimY: axisValue(pad.axes, m.aimY), water: button(m.waterButton) > 0.5 };
}
/** Optional normalized hand pointer. The shared runtime already supplies x/y in [0,1]; never a clinical angle. */
export function handAim(x: number, y: number, aim: {
    x: number;
    y: number;
}, fresh: boolean): Partial<Input> | null { return fresh && Number.isFinite(x) && Number.isFinite(y) ? { aimX: clamp(((x * 2 - 1) - aim.x) * 3, -1, 1), aimY: clamp(((1 - y * 2) - aim.y) * 3, -1, 1), steering: 0, throttle: 0, brake: 0 } : null; }
export const MAPPING_STORAGE_KEY = 'shumos.fireRescue.mapping.v1';
