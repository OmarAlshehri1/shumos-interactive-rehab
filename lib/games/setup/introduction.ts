import type { GameId } from "@/lib/games/registry";
import type { AnySessionState } from "@/lib/realtime/types";
export const GAME_INSTRUCTIONS: Record<
  GameId,
  {
    goal: string;
    cue: "reach" | "feet" | "drive" | "mirror" | "flight" | "build";
  }
> = {
  "turn-and-go-3d": { goal: "يسير الطفل حول الأقماع باتجاه النجوم ونقاط التوقف.", cue: "feet" },
  "foot-maze-3d": { goal: "يتبع الطفل ممر المتاهة المضيء للوصول إلى الهدف.", cue: "feet" },
  "rhythm-steps-3d": { goal: "يخطو الطفل على العلامات وفق الإيقاع والإشارات المعروضة.", cue: "feet" },
  "body-sequence-3d": { goal: "ينفّذ الطفل تسلسل خطوات القدمين على العلامات بالترتيب المطلوب.", cue: "feet" },
  "achievement-forest-3d": { goal: "ينفّذ الطفل تمرين الأخصائي وتنمو الغابة مع كل إنجاز مؤكد.", cue: "build" },
  "ocean-wonders-3d": { goal: "ينفّذ الطفل تمرين الأخصائي ويزداد عالم المحيط مع كل إنجاز مؤكد.", cue: "build" },
  "achievement-city-3d": { goal: "ينفّذ الطفل تمرين الأخصائي وتُبنى المدينة مع كل إنجاز مؤكد.", cue: "build" },
  "balance-bridge-3d": {goal:"يتبع الطفل نقاط الطريق ويثبت قدمه عند علامات التوقف.",cue:"feet"},
  "shumos-castle-legends-3d": {
    goal: "يقلّد الطفل حركات الأطراف المعروضة لهزيمة الأعداء والتقدم نحو القلعة.",
    cue: "mirror",
  },
  "balloon-quest": {
    goal: "يلمس الطفل البالونات باللون المطلوب قبل خروجها من مساحة اللعب.",
    cue: "reach",
  },
  "follow-the-footsteps": {
    goal: "يتبع الطفل الأحجار المضيئة بالترتيب، مع تأكيد الأخصائي لكل خطوة.",
    cue: "feet",
  },
  "bubble-pop-wall": {
    goal: "يوجّه الطفل المؤشر نحو الأهداف ويثبت الحركة لتفعيلها.",
    cue: "reach",
  },
  "space-pilot": {
    goal: "يوجّه الطفل المركبة عبر الحلقات ويتجنب عوائق مسار الطيران.",
    cue: "flight",
  },
  "color-chase": {
    goal: "ينتقل الطفل إلى اللون المطلوب ويثبت قدمه بتوجيه الأخصائي.",
    cue: "feet",
  },
  "build-quest-3d": {
    goal: "يختار الطفل القطع ويضعها في أماكنها لإكمال البناء.",
    cue: "build",
  },
  "runner-quest-3d": {
    goal: "يغيّر الطفل المسار ويرفع قدمه لتجاوز العوائق وجمع النجوم.",
    cue: "feet",
  },
  "mirror-quest-3d": {
    goal: "يقلّد الطفل وضعية الشخصية ويثبت الأطراف المطلوبة حتى يكتمل التطابق.",
    cue: "mirror",
  },
  "safe-hex-arena-3d": {
    goal: "ينتقل الطفل بين البلاطات المضيئة ويتجنب البلاطات التي ستختفي.",
    cue: "feet",
  },
  "fire-rescue-3d": {
    goal: "يوجّه الطفل سيارة الإطفاء ثم يصوّب الماء نحو الحريق.",
    cue: "drive",
  },
  "blooming-world-3d": {
    goal: "يحرّك الطفل قدميه نحو أهداف الحديقة الأرضية ويؤكد الأخصائي الإزهار خلال ثانيتين.",
    cue: "reach",
  },
  "harvest-valley-3d": {
    goal: "يوجّه الطفل آلة الحصاد عبر الصفوف لجمع المحصول.",
    cue: "drive",
  },
  "pearl-voyage-3d": {
    goal: "يوجّه الطفل القارب إلى محطات اكتشاف الكائنات البحرية.",
    cue: "drive",
  },
};
/** Read only actual native configuration, never a URL filter or inferred hardware capability. */
export function participationCue(session: AnySessionState): string {
  const s = session as unknown as Record<string, unknown>,
    meta = s[s.engine as string] as
      { payload?: string; snapshot?: string; state?: unknown } | undefined;
  let raw: Record<string, unknown> = s;
  try {
    raw =
      meta?.payload || meta?.snapshot
        ? JSON.parse(meta.payload ?? meta.snapshot!)
        : ((meta?.state as Record<string, unknown>) ?? s);
    if (raw.state && typeof raw.state === "object")
      raw = raw.state as Record<string, unknown>;
  } catch {
    return "حرّك الجسم كما يوجّهك الأخصائي؛ هو من يؤكد المشاركة.";
  }
  const cfg = (raw.config ?? raw.settings ?? s.config ?? {}) as Record<
      string,
      unknown
    >,
    mode = String(
      cfg.inputMode ??
        cfg.control ??
        raw.inputMode ??
        cfg.inputSource ??
        cfg.source ??
        cfg.mode ??
        cfg.input ??
        "MANUAL",
    );
  if (
    cfg.inputSource === "simulated" ||
    cfg.input === "simulated" ||
    mode === "simulated"
  )
    return "اتبع توجيه الأخصائي؛ هذا الوضع يستخدم محاكاة، وليس قياسًا لحركتك.";
  if (mode.includes("HAND") || mode === "sensor" || mode === "hand")
    return "حرّك يدك بهدوء لتوجيه المؤشر؛ يستطيع الأخصائي مساعدتك.";
  if (["gamepad", "JOYSTICK"].includes(mode))
    return "حرّك عصا التحكم بلطف؛ يُساعدك الأخصائي عند الحاجة.";
  if (mode.includes("FOOT"))
    return "حرّك القدم المطلوبة بتوجيه الأخصائي؛ يؤكد الأخصائي الحركة الآمنة.";
  if (
    ["wheel", "wheel-pedal", "STEERING", "COMBINED", "steering-only"].includes(
      mode,
    )
  )
    return mode === "steering-only" ||
      mode === "STEERING" ||
      (mode === "wheel" &&
        (cfg.mode === "steering-only" ||
          cfg.mode === "auto-throttle" ||
          cfg.mode === "therapist-throttle" ||
          cfg.autoDrive === true))
      ? "لف المقود بلطف؛ يتولى الأخصائي أو الوضع الآلي التقدّم."
      : "لف المقود بلطف، واضغط الدواسة عند توجيه الأخصائي.";
  if (["pedal", "PEDAL", "pedal-only"].includes(mode))
    return "اضغط الدواسة بلطف؛ يُساعدك الأخصائي في التوجيه.";
  return "اتبع توجيه الأخصائي؛ هو من يؤكد الحركة ويتحكم باللعبة.";
}
