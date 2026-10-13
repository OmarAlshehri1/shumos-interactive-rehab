import type { GameId, SurfaceType } from '@/lib/games/registry';
export type RequestedInput = 'HAND' | 'FOOT' | 'JOYSTICK' | 'DRIVING' | 'MANUAL';
export type LaunchMode = 'MANUAL' | 'RIGHT_HAND' | 'LEFT_HAND' | 'DUAL_HAND' | 'RIGHT_FOOT' | 'LEFT_FOOT' | 'DUAL_FOOT' | 'RIGHT_JOYSTICK' | 'LEFT_JOYSTICK' | 'DUAL_JOYSTICK' | 'STEERING' | 'PEDAL' | 'COMBINED';
export const MODE_NAMES: Record<LaunchMode, string> = {MANUAL:'تحكم المعالج اليدوي',RIGHT_HAND:'اليد اليمنى',LEFT_HAND:'اليد اليسرى',DUAL_HAND:'اليدان',RIGHT_FOOT:'القدم اليمنى',LEFT_FOOT:'القدم اليسرى',DUAL_FOOT:'القدمان',RIGHT_JOYSTICK:'عصا التحكم اليمنى',LEFT_JOYSTICK:'عصا التحكم اليسرى',DUAL_JOYSTICK:'عصا التحكم معًا',STEERING:'المقود',PEDAL:'الدواسة فقط',COMBINED:'المقود والدواسات'};
export const REQUEST_MODES: Record<RequestedInput, readonly LaunchMode[]> = {MANUAL:['MANUAL'],HAND:['RIGHT_HAND','LEFT_HAND','DUAL_HAND'],FOOT:['RIGHT_FOOT','LEFT_FOOT','DUAL_FOOT'],JOYSTICK:['RIGHT_JOYSTICK','LEFT_JOYSTICK','DUAL_JOYSTICK'],DRIVING:['STEERING','PEDAL','COMBINED']};
/** Owner targets are browsing membership, never adapter certification. */
export const DEVICE_GAMES: Record<Exclude<RequestedInput,'MANUAL'>, readonly GameId[]> = {
 HAND:['shumos-castle-legends-3d','balloon-quest','bubble-pop-wall','space-pilot','build-quest-3d','mirror-quest-3d','blooming-world-3d'],
 FOOT:['body-sequence-3d','rhythm-steps-3d','foot-maze-3d','turn-and-go-3d','balance-bridge-3d','shumos-castle-legends-3d','balloon-quest','follow-the-footsteps','color-chase','runner-quest-3d','mirror-quest-3d','safe-hex-arena-3d','blooming-world-3d'],
 JOYSTICK:['balloon-quest','bubble-pop-wall','space-pilot','build-quest-3d','mirror-quest-3d','blooming-world-3d'],
 DRIVING:['fire-rescue-3d','harvest-valley-3d','pearl-voyage-3d'],
};
export const TARGET_PROJECTION: Record<GameId, SurfaceType> = {'ocean-wonders-3d':'WALL','achievement-city-3d':'WALL','body-sequence-3d':'FLOOR','rhythm-steps-3d':'FLOOR','foot-maze-3d':'FLOOR','turn-and-go-3d':'FLOOR','balance-bridge-3d':'FLOOR','shumos-castle-legends-3d':'WALL','balloon-quest':'BOTH','follow-the-footsteps':'FLOOR','bubble-pop-wall':'WALL','space-pilot':'WALL','color-chase':'FLOOR','build-quest-3d':'WALL','runner-quest-3d':'BOTH','mirror-quest-3d':'WALL','safe-hex-arena-3d':'FLOOR','fire-rescue-3d':'WALL','blooming-world-3d':'BOTH','harvest-valley-3d':'WALL','pearl-voyage-3d':'WALL'};
/**
 * Activity categories are independent of the input device: a game's category describes WHAT it is, not which sensor it may use.
 * INTERACTIVE_REWARDS (ألعاب التحفيز التفاعلي): visual reward games driven by the therapist's confirmation of a real exercise.
 * Extensible: future reward games add their id here.
 */
export type ActivityCategory = 'INTERACTIVE_REWARDS';
export const ACTIVITY_CATEGORY_GAMES: Record<ActivityCategory, readonly GameId[]> = {
 INTERACTIVE_REWARDS:['achievement-city-3d','ocean-wonders-3d'],
};
export function requestedInput(value: string | null): RequestedInput {return value && Object.hasOwn(REQUEST_MODES,value) ? value as RequestedInput : 'MANUAL';}
export function launchHref(route: string, input: RequestedInput): string {return `${route}?input=${input}`;}
export interface HandReadiness {connected:boolean;centered:boolean;pointerAt:number|null;deviceId:string|null;}
/** Freshness, neutral calibration, role and different device identities must all pass. */
export function handModeReady(mode:LaunchMode, right:HandReadiness, left:HandReadiness, now:number):boolean {
 const ready=(h:HandReadiness)=>h.connected&&h.centered&&h.deviceId!==null&&h.pointerAt!==null&&Number.isFinite(h.pointerAt)&&now-h.pointerAt>=0&&now-h.pointerAt<=250;
 return mode==='RIGHT_HAND'?ready(right):mode==='LEFT_HAND'?ready(left):mode==='DUAL_HAND'?ready(right)&&ready(left)&&right.deviceId!==left.deviceId:false;
}
/** Gamepad timestamps use the document's monotonic clock. Unassigned axes are not a calibrated device. */
export function drivingDeviceReady(pad: Pick<Gamepad,'connected'|'timestamp'|'axes'> | null,indices:readonly number[],now:number):boolean {
 return !!pad?.connected&&Number.isFinite(pad.timestamp)&&pad.timestamp>0&&now-pad.timestamp>=0&&now-pad.timestamp<=500&&indices.every(i=>Number.isInteger(i)&&i>=0&&i<pad.axes.length&&Number.isFinite(pad.axes[i]));
}
