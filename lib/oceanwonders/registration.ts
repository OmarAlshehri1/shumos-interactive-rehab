export const OCEAN_WONDERS_REGISTRATION = {
  id: 'ocean-wonders-3d',
  nameAr: 'عالم المحيط',
  nameEn: 'Ocean Wonders 3D',
  shortDescriptionAr:
    'مكافأة بصرية لتمرين حقيقي يختاره المعالج: كل مرة يؤكّد فيها المعالج إنجازًا ينمو عالم المحيط وتظهر فيه كائنات ومعالم جديدة، من حديقة مرجانية هادئة إلى محيط أسطوري مضيء. ثلاثة مستويات متصلة، وتأكيد يدوي أو بذراع تحكم يحملها المعالج.',
  focusTagsAr: ['مكافأة بصرية للتمرين', 'تأكيد المعالج'],
  status: 'ready',
  surfaceType: 'WALL',
  route: '/control/ocean-wonders-3d',
  sensorCompatible: false,
} as const;

/**
 * Feature flag. Development: on unless NEXT_PUBLIC_OCEAN_WONDERS_3D=false.
 * Production: opt-in with NEXT_PUBLIC_OCEAN_WONDERS_3D=true. Rollback = unset it and redeploy.
 */
export const OCEAN_WONDERS_ENABLED =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_OCEAN_WONDERS_3D !== 'false'
    : process.env.NEXT_PUBLIC_OCEAN_WONDERS_3D === 'true';
