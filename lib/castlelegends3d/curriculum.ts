export type Mode = 'hands' | 'legs' | 'combined';
export type Side = 'right' | 'left' | 'bilateral';
export type Limb = 'rightArm' | 'leftArm' | 'rightLeg' | 'leftLeg';
export interface Exercise { id:string; name:string; mode:Mode; limbs:Limb[]; pose:'raise'|'open'|'reach'|'center'|'step'|'hold'; mat?:boolean }
export const EXERCISES:Exercise[] = [
 {id:'right-raise',name:'ارفع الذراع اليمنى براحة',mode:'hands',limbs:['rightArm'],pose:'raise'},
 {id:'left-raise',name:'ارفع الذراع اليسرى براحة',mode:'hands',limbs:['leftArm'],pose:'raise'},
 {id:'both-raise',name:'ارفع الذراعين براحة',mode:'hands',limbs:['rightArm','leftArm'],pose:'raise'},
 {id:'arms-open',name:'افتح الذراعين إلى الخارج',mode:'hands',limbs:['rightArm','leftArm'],pose:'open'},
 {id:'arms-center',name:'قرّب الذراعين نحو المنتصف',mode:'hands',limbs:['rightArm','leftArm'],pose:'center'},
 {id:'right-reach',name:'مدّ الذراع اليمنى إلى الأمام',mode:'hands',limbs:['rightArm'],pose:'reach'},
 {id:'left-reach',name:'مدّ الذراع اليسرى إلى الأمام',mode:'hands',limbs:['leftArm'],pose:'reach'},
 {id:'arm-hold',name:'حافظ على وضع ذراع مريح بدعم المعالج',mode:'hands',limbs:['rightArm','leftArm'],pose:'hold'},
 {id:'feet-open',name:'حرّك القدمين بعيدًا قليلًا',mode:'legs',limbs:['rightLeg','leftLeg'],pose:'open'},
 {id:'feet-center',name:'أعد القدمين إلى وضع مريح',mode:'legs',limbs:['rightLeg','leftLeg'],pose:'center'},
 {id:'right-step',name:'حرّك القدم اليمنى إلى الخارج',mode:'legs',limbs:['rightLeg'],pose:'step'},
 {id:'left-step',name:'حرّك القدم اليسرى إلى الخارج',mode:'legs',limbs:['leftLeg'],pose:'step'},
 {id:'mat-right',name:'حرّك القدم اليمنى نحو هدف الحصيرة',mode:'legs',limbs:['rightLeg'],pose:'step',mat:true},
 {id:'mat-left',name:'حرّك القدم اليسرى نحو هدف الحصيرة',mode:'legs',limbs:['leftLeg'],pose:'step',mat:true},
 {id:'mixed-open',name:'افتح الذراعين وحرّك القدمين قليلًا',mode:'combined',limbs:['rightArm','leftArm','rightLeg','leftLeg'],pose:'open'},
 {id:'cross-right',name:'ارفع الذراع اليمنى وحرّك القدم اليسرى',mode:'combined',limbs:['rightArm','leftLeg'],pose:'raise'},
 {id:'cross-left',name:'ارفع الذراع اليسرى وحرّك القدم اليمنى',mode:'combined',limbs:['leftArm','rightLeg'],pose:'raise'},
 {id:'mixed-center',name:'مدّ الذراعين وأعد القدمين إلى المنتصف',mode:'combined',limbs:['rightArm','leftArm','rightLeg','leftLeg'],pose:'center'},
];
export type EnemyKind = 'forest'|'golem'|'crystal'|'knight'|'guardian'|'boss';
export const ENEMIES:Record<EnemyKind,{name:string;color:number;scale:number}> = {
 forest:{name:'حارس الغابة',color:0x78a989,scale:1.2},golem:{name:'عملاق الحجر',color:0x8998a2,scale:1.5},
 crystal:{name:'حارس البلّور',color:0x81d9ed,scale:1.35},knight:{name:'فارس الظلال',color:0x555c94,scale:1.25},
 guardian:{name:'حارس القلعة القديم',color:0xcdb27c,scale:1.65},boss:{name:'ملك البلّور القديم',color:0x877bd1,scale:2.1}
};
export interface Stage {name:string; chapter:string; biome:'forest'|'river'|'gate'|'crystal'|'temple'|'fortress'|'approach'|'interior'|'throne'; enemies:EnemyKind[]; phases:number; sky:number; fog:number; accent:number; reward:string; attack:string}
export const STAGES:Stage[] = [
 {name:'درب الغابة المسحورة',chapter:'الصحوة',biome:'forest',enemies:['forest'],phases:1,sky:0xadc7ce,fog:0xa0b7b5,accent:0xd2eabd,reward:'حصلت على شعلة البداية',attack:'ضربة السيف المضيء'},
 {name:'جسر النهر',chapter:'الصحوة',biome:'river',enemies:['forest','golem'],phases:1,sky:0xb3cfdb,fog:0xa8c5cc,accent:0x84d8df,reward:'استعدت جوهرة النهر',attack:'موجة النهر'},
 {name:'بوابة الغابة',chapter:'الصحوة',biome:'gate',enemies:['guardian'],phases:2,sky:0x7e9fa4,fog:0x7b9395,accent:0xe4c478,reward:'فُتحت بوابة الغابة',attack:'سيف الفجر'},
 {name:'وادي البلّور',chapter:'مملكة البلّور',biome:'crystal',enemies:['crystal','golem'],phases:1,sky:0x707aa6,fog:0x69759d,accent:0x83e3fa,reward:'أضأت بلّورة الوادي',attack:'انفجار البلّور'},
 {name:'المعبد القديم',chapter:'مملكة البلّور',biome:'temple',enemies:['knight','crystal','knight'],phases:1,sky:0x9d939c,fog:0x8e8292,accent:0xe6be78,reward:'اكتشفت ختم المعبد',attack:'شعاع المعبد'},
 {name:'حصن المملكة',chapter:'مملكة البلّور',biome:'fortress',enemies:['golem','guardian'],phases:2,sky:0x687789,fog:0x667589,accent:0x98d9f0,reward:'أعدت نور المملكة',attack:'مطرقة الرعد'},
 {name:'الطريق إلى القلعة',chapter:'القلعة الأخيرة',biome:'approach',enemies:['knight','crystal','guardian'],phases:1,sky:0xc2af9b,fog:0xb5a69c,accent:0xffda9c,reward:'وصلت إلى القلعة',attack:'سيف الشمس'},
 {name:'داخل القلعة',chapter:'القلعة الأخيرة',biome:'interior',enemies:['knight','guardian'],phases:2,sky:0x323342,fog:0x424051,accent:0xe5c99e,reward:'فتحت أبواب قاعة العرش',attack:'دوامة النجوم'},
 {name:'قاعة العرش',chapter:'القلعة الأخيرة',biome:'throne',enemies:['boss'],phases:3,sky:0x242337,fog:0x373249,accent:0xafa3ff,reward:'أنت بطل أسطورة قلعة شموس',attack:'نور شموس العظيم'},
];
