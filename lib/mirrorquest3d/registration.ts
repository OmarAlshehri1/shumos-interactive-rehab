export const MIRROR_QUEST_REGISTRATION={id:'mirror-quest-3d',nameAr:'المرآة السحرية',nameEn:'Mirror Quest 3D',shortDescriptionAr:'قلّد صديقك في استوديو ثلاثي الأبعاد، بحركات هادئة يوجّهها المعالج.',focusTagsAr:['تقليد الحركة','تحكّم يدوي'],status:'ready',surfaceType:'WALL',route:'/control/mirror-quest-3d',sensorCompatible:false} as const;
/** Production remains opt-in until release validation passes. */
export const MIRROR_QUEST_ENABLED=process.env.NODE_ENV==='development'?process.env.NEXT_PUBLIC_MIRROR_QUEST_3D!=='false':process.env.NEXT_PUBLIC_MIRROR_QUEST_3D==='true';
