export const TURN_AND_GO_REGISTRATION = {
  id: 'turn-and-go-3d',
  nameAr: 'تحدي الدوران',
  nameEn: 'Turn & Go',
  shortDescriptionAr: 'مسار مضيء على الأرض حول أقماع العلاج الحقيقية: يمشي الطفل ويدور ويتوقف عند العلامات ويجمع النجوم. يؤكّد المعالج كل نجمة، ويضبط شكل المسار على الأقماع الموضوعة فعلًا.',
  focusTagsAr: ['حركة القدمين والمشي', 'التوازن والثبات', 'تحكّم يدوي'],
  /** Typed tags read by the unified library when it provides them (see lib/games/library/skillTags.ts on the integrated tree). */
  activitySkills: ['feet', 'balance'],
  status: 'ready',
  surfaceType: 'FLOOR',
  route: '/control/turn-and-go-3d',
  sensorCompatible: false,
} as const;

/**
 * Feature flag. Development: on unless NEXT_PUBLIC_TURN_AND_GO_3D=false.
 * Production: opt-in with NEXT_PUBLIC_TURN_AND_GO_3D=true. Rollback = unset it and redeploy.
 */
export const TURN_AND_GO_ENABLED =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_TURN_AND_GO_3D !== 'false'
    : process.env.NEXT_PUBLIC_TURN_AND_GO_3D === 'true';
