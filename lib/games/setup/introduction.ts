import type { GameId } from "@/lib/games/registry";
import type { AnySessionState } from "@/lib/realtime/types";
export const GAME_INSTRUCTIONS: Record<
  GameId,
  {
    goal: string;
    cue: "reach" | "feet" | "drive" | "mirror" | "flight" | "build";
  }
> = {
  "turn-and-go-3d": { goal: "اتبع النجوم حول الأقماع بتوجيه المعالج.", cue: "feet" },
  "foot-maze-3d": { goal: "اتبع الطريق المضيء إلى الوجهة بتوجيه المعالج.", cue: "feet" },
  "rhythm-steps-3d": { goal: "اتبع علامات الأقدام على إيقاع الألوان بتوجيه المعالج.", cue: "feet" },
  "body-sequence-3d": { goal: "اتبع ترتيب العلامات بتوجيه المعالج.", cue: "feet" },
  "ocean-wonders-3d": { goal: "أنجز تمرينك مع المعالج، وشاهد عالم المحيط ينمو مع كل إنجاز.", cue: "build" },
  "achievement-city-3d": { goal: "أنجز تمرينك مع المعالج، وشاهد مدينتك تكبر مع كل إنجاز.", cue: "build" },
  "balance-bridge-3d": {goal:"امشِ على الطريق المضيء، واتبع العلامات بتوجيه المعالج.",cue:"feet"},
  "shumos-castle-legends-3d": {
    goal: "قلّد الحركة المعروضة بهدوء، ثم انتظر تأكيد الأخصائي.",
    cue: "mirror",
  },
  "balloon-quest": {
    goal: "المس البالون باللون المطلوب، واجمع البالونات.",
    cue: "reach",
  },
  "follow-the-footsteps": {
    goal: "اتبع الأحجار المضيئة خطوةً خطوة، بتوجيه الأخصائي.",
    cue: "feet",
  },
  "bubble-pop-wall": {
    goal: "المس العالم المضيء أو وجّهه برفق، ثم ثبّت الحركة عندما يُطلب منك.",
    cue: "reach",
  },
  "space-pilot": {
    goal: "وجّه المركبة عبر الحلقات، وابتعد عن الصخور.",
    cue: "flight",
  },
  "color-chase": {
    goal: "اختر اللون المطلوب وتحرك إليه بتوجيه الأخصائي.",
    cue: "feet",
  },
  "build-quest-3d": {
    goal: "طابق القطعة مع مكانها لتكمل البناء.",
    cue: "build",
  },
  "runner-quest-3d": {
    goal: "اختر المسار الآمن، وارفع القدم عند الحاجز بتوجيه الأخصائي.",
    cue: "feet",
  },
  "mirror-quest-3d": {
    goal: "قلّد حركة الشخصية، وثبّت الوضعية بلطف.",
    cue: "mirror",
  },
  "safe-hex-arena-3d": {
    goal: "انتقل إلى البلاطة المضيئة عندما يوجّهك الأخصائي.",
    cue: "feet",
  },
  "fire-rescue-3d": {
    goal: "قد السيارة إلى مكان الإنقاذ، ثم وجّه الماء إلى الهدف.",
    cue: "drive",
  },
  "blooming-world-3d": {
    goal: "المس المناطق المضيئة لتُزهر الحديقة.",
    cue: "reach",
  },
  "harvest-valley-3d": {
    goal: "وجّه الآلة عبر صفوف الحقل لتجمع المحصول.",
    cue: "drive",
  },
  "pearl-voyage-3d": {
    goal: "وجّه القارب، وتوقف عند الأسماك لتكتشفها.",
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
