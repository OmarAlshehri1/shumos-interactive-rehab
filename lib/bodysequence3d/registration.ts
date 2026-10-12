export const BODY_SEQUENCE_REGISTRATION = {
  id: 'body-sequence-3d',
  nameAr: 'تحدي الجسم الذكي',
  nameEn: 'Body Sequence',
  shortDescriptionAr: 'ممرّات مضيئة كبيرة على الأرض وتعليمات واضحة لكل قدم: يتعلّم الطفل تمييز اليمين من اليسار، وتبديل القدمين، وتذكّر ترتيب قصير من الحركات. يؤكّد المعالج كل حركة، والمستوى الأول ممرّان فقط وبقية المستويات ثلاثة ممرّات على الأكثر.',
  focusTagsAr: ['حركة القدمين والمشي', 'التناسق بين الأطراف'],
  /** Typed tags read by the unified library when it provides them (see lib/games/library/skillTags.ts on the integrated tree). */
  activitySkills: ['feet', 'coordination'],
  status: 'ready',
  surfaceType: 'FLOOR',
  route: '/control/body-sequence-3d',
  sensorCompatible: false,
} as const;

/**
 * Feature flag. Development: on unless NEXT_PUBLIC_BODY_SEQUENCE_3D=false.
 * Production: opt-in with NEXT_PUBLIC_BODY_SEQUENCE_3D=true. Rollback = unset it and redeploy.
 */
export const BODY_SEQUENCE_ENABLED =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_BODY_SEQUENCE_3D !== 'false'
    : process.env.NEXT_PUBLIC_BODY_SEQUENCE_3D === 'true';
