export const SAFE_HEX_ARENA_REGISTRATION = {
  id: 'safe-hex-arena-3d',
  nameAr: 'الأرض الآمنة',
  nameEn: 'Safe Hex Arena 3D',
  shortDescriptionAr: 'أرضية سداسية ملوّنة تُعرض على الأرض: تتحوّل بعض البلاطات إلى تحذير، ويقود المعالج الطفل بهدوء إلى بلاطة آمنة قريبة.',
  focusTagsAr: ['انتقال وتوازن بمساعدة', 'تحكّم يدوي'],
  status: 'ready',
  surfaceType: 'FLOOR',
  route: '/control/safe-hex-arena-3d',
  sensorCompatible: false,
} as const;

/**
 * Feature flag. Development: on unless NEXT_PUBLIC_SAFE_HEX_ARENA_3D=false.
 * Production: opt-in with NEXT_PUBLIC_SAFE_HEX_ARENA_3D=true. Rollback = unset it and redeploy.
 */
export const SAFE_HEX_ARENA_ENABLED =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_SAFE_HEX_ARENA_3D !== 'false'
    : process.env.NEXT_PUBLIC_SAFE_HEX_ARENA_3D === 'true';
