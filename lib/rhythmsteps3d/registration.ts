export const RHYTHM_STEPS_REGISTRATION = {
  id: 'rhythm-steps-3d',
  nameAr: 'نبض الألوان',
  nameEn: 'Rhythm Steps 3D',
  shortDescriptionAr: 'ممرّ نيون على الأرض: تتجه أهداف ملوّنة نحو مربعات الطفل الأربعة، وتُظهر رموز القدم اليمنى واليسرى أو القدمين معًا. يؤكّد المعالج كل حركة، والإيقاع قابل للضبط.',
  focusTagsAr: ['خطوات وألوان', 'قدم واحدة وقدمان', 'تحكّم يدوي'],
  status: 'ready',
  surfaceType: 'FLOOR',
  route: '/control/rhythm-steps-3d',
  sensorCompatible: false,
} as const;

/**
 * Feature flag. Development: on unless NEXT_PUBLIC_RHYTHM_STEPS_3D=false.
 * Production: opt-in with NEXT_PUBLIC_RHYTHM_STEPS_3D=true. Rollback = unset it and redeploy.
 */
export const RHYTHM_STEPS_ENABLED =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_RHYTHM_STEPS_3D !== 'false'
    : process.env.NEXT_PUBLIC_RHYTHM_STEPS_3D === 'true';
