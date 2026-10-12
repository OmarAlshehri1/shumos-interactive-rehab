/**
 * Follow the Footsteps 3D (اتبع الخطوات): the Enchanted Forest.
 * The canonical game id `follow-the-footsteps` is unchanged: the legacy game stays internally as the rollback path and
 * the 3D engine is selected per session by its record tag (`engine: "fp3"`) and, for Control, by this feature flag.
 */
export const FOOTSTEPS_3D_NAME_EN = 'Follow the Footsteps 3D';
export const FOOTSTEPS_3D_DESCRIPTION_AR = 'خطوات كبيرة على أحجار مضيئة في غابة سحرية: يضيء الحجر التالي، ويؤكد المعالج كل خطوة بهدوء وبلا استعجال.';

/**
 * Feature flag. Development: on unless NEXT_PUBLIC_FOOTSTEPS_3D=false. Production: opt-in with NEXT_PUBLIC_FOOTSTEPS_3D=true.
 * Rollback = unset it and redeploy: the original game is served again.
 */
export const FOOTSTEPS_3D_ENABLED =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_FOOTSTEPS_3D !== 'false'
    : process.env.NEXT_PUBLIC_FOOTSTEPS_3D === 'true';
