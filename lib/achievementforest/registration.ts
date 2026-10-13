import { INTERACTIVE_REWARDS } from '@/lib/achievementcity/registration';
export { INTERACTIVE_REWARDS };
export const ACHIEVEMENT_FOREST_REGISTRATION = {
 id: 'achievement-forest-3d', nameAr: 'غابة الإنجازات', nameEn: 'Achievement Forest 3D',
 shortDescriptionAr: 'مع كل تمرين يؤكّده المعالج، تنمو حديقة صغيرة إلى غابة ساحرة ثم مملكة طبيعة مضيئة. ثلاثة مستويات في عالم واحد متصل.',
 focusTagsAr: ['مكافأة بصرية للتمرين', 'تأكيد المعالج'], status: 'ready', surfaceType: 'WALL',
 route: '/control/achievement-forest-3d', sensorCompatible: false,
} as const;
export const ACHIEVEMENT_FOREST_ENABLED = process.env.NODE_ENV === 'development' ? process.env.NEXT_PUBLIC_ACHIEVEMENT_FOREST_3D !== 'false' : process.env.NEXT_PUBLIC_ACHIEVEMENT_FOREST_3D === 'true';
