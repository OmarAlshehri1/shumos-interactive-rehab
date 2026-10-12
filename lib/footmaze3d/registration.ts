export const FOOT_MAZE_REGISTRATION = {
  id: 'foot-maze-3d',
  nameAr: 'متاهة القدمين',
  nameEn: 'Foot Maze',
  shortDescriptionAr: 'متاهة مضيئة على الأرض: يمشي الطفل في الممرات، يختار الطريق عند المفترقات، ويقف وينتظر حين يمرّ حارس ودود، ثم يتابع حتى الوجهة. يؤكّد المعالج كل وصول.',
  focusTagsAr: ['حركة القدمين والمشي', 'التوازن والثبات', 'التخطيط الحركي'],
  /** Typed tags read by the unified library when it provides them (see lib/games/library/skillTags.ts on the integrated tree). */
  activitySkills: ['feet', 'balance', 'planning'],
  status: 'ready',
  surfaceType: 'FLOOR',
  route: '/control/foot-maze-3d',
  sensorCompatible: false,
} as const;

/**
 * Feature flag. Development: on unless NEXT_PUBLIC_FOOT_MAZE_3D=false.
 * Production: opt-in with NEXT_PUBLIC_FOOT_MAZE_3D=true. Rollback = unset it and redeploy.
 */
export const FOOT_MAZE_ENABLED =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_FOOT_MAZE_3D !== 'false'
    : process.env.NEXT_PUBLIC_FOOT_MAZE_3D === 'true';
