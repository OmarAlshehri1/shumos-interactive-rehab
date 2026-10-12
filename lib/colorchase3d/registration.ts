/**
 * Color Chase 3D (مطاردة الألوان): The Lost Colors, a magical garden that regains its colors.
 * The canonical game id `color-chase` is unchanged: the original game stays internally as the rollback path and the 3D
 * engine is selected per session by its record tag (`engine: "cc3"`) and, for Control, by this feature flag.
 */
export const COLOR_CHASE_3D_NAME_EN = 'Color Chase 3D';
export const COLOR_CHASE_3D_SUBTITLE_AR = 'عالم الألوان المفقودة';
export const COLOR_CHASE_3D_DESCRIPTION_AR = 'عالم الألوان المفقودة: يختار الطفل المنطقة الملوّنة المطلوبة على الأرض، فتعود الألوان إلى الحديقة السحرية خطوةً بعد خطوة، بلا استعجال.';

/**
 * Feature flag. Development: on unless NEXT_PUBLIC_COLOR_CHASE_3D=false. Production: opt-in with NEXT_PUBLIC_COLOR_CHASE_3D=true.
 * Rollback = unset it and redeploy: the original game is served again.
 */
export const COLOR_CHASE_3D_ENABLED =
  process.env.NODE_ENV === 'development'
    ? process.env.NEXT_PUBLIC_COLOR_CHASE_3D !== 'false'
    : process.env.NEXT_PUBLIC_COLOR_CHASE_3D === 'true';
