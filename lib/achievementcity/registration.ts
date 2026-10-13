/** Library category identifier. Extensible: future reward games (e.g. a forest or an ocean) add their id to ACTIVITY_CATEGORY_GAMES. */
export const INTERACTIVE_REWARDS = 'INTERACTIVE_REWARDS' as const;

export const ACHIEVEMENT_CITY_REGISTRATION = {
  id: 'achievement-city-3d',
  nameAr: 'مدينة الإنجازات',
  nameEn: 'Achievement City',
  shortDescriptionAr:
    'مكافأة بصرية لتمرين حقيقي يختاره المعالج: كل مرة يؤكّد فيها المعالج إنجازًا يبني الطفل جزءًا جديدًا من مدينة ثلاثية الأبعاد، من قرية خضراء جميلة إلى مدينة كبرى مضيئة. ثلاثة مستويات متصلة، وتأكيد يدوي أو بذراع تحكم يحملها المعالج.',
  focusTagsAr: ['مكافأة بصرية للتمرين', 'تأكيد المعالج'],
  status: 'ready',
  surfaceType: 'WALL',
  route: '/control/achievement-city-3d',
  sensorCompatible: false,
} as const;

/**
 * Feature flag. Development: on unless NEXT_PUBLIC_ACHIEVEMENT_CITY_3D=false.
 * Production: opt-in with NEXT_PUBLIC_ACHIEVEMENT_CITY_3D=true. Rollback = unset it and redeploy.
 */
export const ACHIEVEMENT_CITY_ENABLED =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_ACHIEVEMENT_CITY_3D !== 'false'
    : process.env.NEXT_PUBLIC_ACHIEVEMENT_CITY_3D === 'true';
