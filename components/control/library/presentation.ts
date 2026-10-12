import type {GameDefinition} from '@/lib/games/registry';
import {DEVICE_GAMES, TARGET_PROJECTION, type RequestedInput} from '@/lib/games/library/capabilities';
export const INTERACTION_SECTIONS=[
 {id:'hand-sensors',input:'HAND',title:'حساسات اليد',english:'Hand Sensors',icon:'hand',description:'اكتشاف وتوجيه بحركة اليد، مع تحكم المعالج المتاح دائمًا.'},
 {id:'foot-sensors',input:'FOOT',title:'حساسات القدم',english:'Foot Sensors',icon:'foot',description:'مسارات وألوان وتجارب للحركة بمساعدة المعالج.'},
 {id:'handheld',input:'JOYSTICK',title:'عصي التحكم',english:'Handheld Joysticks',icon:'controller',description:'تجارب تستهدف التحكم بعصي اليد؛ توافر المحوّل يُراجع داخل النشاط.'},
 {id:'steering',input:'DRIVING',title:'المقود والدواسات',english:'Steering Wheel & Pedals',icon:'wheel',description:'رحلات قيادة وحصاد وإبحار، بمشاركة تناسب الطفل.'},
] as const satisfies readonly {id:string;input:Exclude<RequestedInput,'MANUAL'>;title:string;english:string;icon:'hand'|'foot'|'controller'|'wheel';description:string}[];
export function librarySections(games:readonly GameDefinition[]){return INTERACTION_SECTIONS.map(section=>({...section,games:DEVICE_GAMES[section.input].flatMap(id=>{const game=games.find(g=>g.id===id);return game?[game]:[];})}));}
export function projectionLabel(surface:unknown){return surface==='BOTH'?'جداري وأرضي':surface==='WALL'?'جداري':surface==='FLOOR'?'أرضي':'العرض غير محدد';}
export function projectionNotice(game:Pick<GameDefinition,'id'|'surfaceType'>){return TARGET_PROJECTION[game.id]==='BOTH'&&game.surfaceType!=='BOTH'?`${game.surfaceType==='WALL'?'العرض الأرضي':'العرض الجداري'} بانتظار التنفيذ`:null;}
export function hardwareNotice(game:Pick<GameDefinition,'id'>,input?:RequestedInput){
 if(input==='JOYSTICK')return 'محوّل عصي التحكم الفعلي غير متاح بعد';
 if(input==='FOOT')return 'حساسات القدم: محاكاة فقط · العتاد بانتظار التحقق';
 if(['fire-rescue-3d','harvest-valley-3d','pearl-voyage-3d'].includes(game.id))return 'المقود والدواسات بانتظار التحقق';
 if(game.id==='mirror-quest-3d')return 'الحساسات الفعلية بانتظار التحقق';
 return input==='HAND'?'راجع اتصال اليد ومعايرتها داخل النشاط':null;
}
/** The integrated Runner now uses shared Display/history; retain the canonical registration without repeating its old local-preview description. */
export function libraryDescription(game:Pick<GameDefinition,'id'|'shortDescriptionAr'>){return game.id==='runner-quest-3d'?'رحلة على الجدار أو الأرض بتوجيه المعالج، بلا قفز ولا وقت محدد. حساسات القدم الفعلية بانتظار التحقق.':game.shortDescriptionAr;}
