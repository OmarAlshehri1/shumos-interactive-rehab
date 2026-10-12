/** Reuses Fire Rescue calibration and normalized wheel/pedal mapping. No independent transport. */
export {DEFAULT_MAPPING,sanitizeMapping,axisValue,emptyAxis,type Mapping,type Axis} from '@/lib/firerescue3d/input';
import {sampleGamepad,type Mapping} from '@/lib/firerescue3d/input';
import type {Input,Mode} from './engine';
export function sampleDriving(pad:Pick<Gamepad,'axes'|'buttons'|'connected'>|null,m:Mapping,mode:Mode='COMBINED'):Input|null{const s=sampleGamepad(pad,m);if(!s||(mode!=='PEDAL'&&m.steering.index<0)||(mode!=='STEERING'&&m.throttle.index<0))return null;return s?{steering:s.steering,throttle:s.throttle,brake:s.brake}:null;}
export const MAPPING_STORAGE_KEY='shumos.harvestValley.mapping.v1';
