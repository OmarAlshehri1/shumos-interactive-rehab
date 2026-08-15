const DATE_FORMATTER = new Intl.DateTimeFormat("ar", { day: "numeric", month: "long", year: "numeric" });
const TIME_FORMATTER = new Intl.DateTimeFormat("ar", { hour: "numeric", minute: "2-digit", hour12: true });

/** SESSION HISTORY TASK — "15 أغسطس 2026" — always from the STORED timestamp, never derived from the current browser time (see the task's "Date / time" requirement). */
export function formatSessionDate(timestamp: number): string {
  return DATE_FORMATTER.format(new Date(timestamp));
}

/** "6:42 م" */
export function formatSessionTime(timestamp: number): string {
  return TIME_FORMATTER.format(new Date(timestamp));
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;
const YEAR_MS = 365 * DAY_MS;

/** آخر نشاط — a coarse, human relative-time chip ("قبل يومين"). Purely a freshness signal, not a precise measurement — see the task's "keep it simple." */
export function formatRelativeArabic(timestamp: number, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - timestamp);

  if (diffMs < MINUTE_MS) return "الآن";
  if (diffMs < HOUR_MS) {
    const minutes = Math.floor(diffMs / MINUTE_MS);
    return `قبل ${minutes} ${minutes === 1 ? "دقيقة" : "دقائق"}`;
  }
  if (diffMs < DAY_MS) {
    const hours = Math.floor(diffMs / HOUR_MS);
    return `قبل ${hours} ${hours === 1 ? "ساعة" : "ساعات"}`;
  }
  if (diffMs < MONTH_MS) {
    const days = Math.floor(diffMs / DAY_MS);
    return days === 1 ? "أمس" : `قبل ${days} أيام`;
  }
  if (diffMs < YEAR_MS) {
    const months = Math.floor(diffMs / MONTH_MS);
    return `قبل ${months} ${months === 1 ? "شهر" : "أشهر"}`;
  }
  const years = Math.floor(diffMs / YEAR_MS);
  return `قبل ${years} ${years === 1 ? "سنة" : "سنوات"}`;
}
