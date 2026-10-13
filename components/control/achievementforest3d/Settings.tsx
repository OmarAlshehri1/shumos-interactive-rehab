"use client";
import { useEffect, useState } from "react";
import type { Config } from "@/lib/achievementforest/config";
import { LIMITS } from "@/lib/achievementforest/config";
import { PROFILE_KEY, validProjectionProfile, type ProjectionProfile } from "@/lib/projection/calibration";
import styles from "./control.module.css";

/** Saved WALL profiles from this browser (never throws: storage may be blocked). A profile is a layout record, not an alignment proof. */
function loadWallProfiles(): ProjectionProfile[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter(validProjectionProfile).filter((p: ProjectionProfile) => p.surface === "WALL") : [];
  } catch {
    return [];
  }
}

export function Settings({ config, set }: { config: Config; set: (c: Partial<Config>) => void }) {
  const [profiles, setProfiles] = useState<ProjectionProfile[]>([]);
  useEffect(() => { queueMicrotask(() => setProfiles(loadWallProfiles())); }, []);
  const check = (key: keyof Config, label: string) => (
    <label className={styles.check}>
      <input type="checkbox" data-testid={`af-opt-${String(key)}`} checked={config[key] as boolean} onChange={(e) => set({ [key]: e.target.checked } as Partial<Config>)} />
      {label}
    </label>
  );
  return (
    <details className={styles.opts} data-testid="af-options">
      <summary>خيارات إضافية (الصوت، الأداء، العرض)</summary>
      <div className={styles.optGrid}>
        {check("sound", "الأصوات")}
        {check("music", "موسيقى هادئة")}
        {check("voice", "الصوت المنطوق")}
        {check("cinematic", "حركة كاميرا هادئة")}
        {check("reducedMotion", "تقليل الحركة")}
        {check("reducedEffects", "تقليل المؤثرات")}
        {check("highContrast", "تباين عالٍ للنصوص")}
        {check("minimalHud", "واجهة مبسّطة على العرض")}
        <div className={styles.field}>
          <label>مستوى الصوت</label>
          <input type="range" data-testid="af-opt-volume" min={LIMITS.volume[0]} max={LIMITS.volume[1]} step={0.05} value={config.volume} onChange={(e) => set({ volume: Number(e.target.value) })} />
        </div>
        <div className={styles.field}>
          <label>جودة الرسم</label>
          <select data-testid="af-opt-quality" value={config.quality} onChange={(e) => set({ quality: e.target.value as Config["quality"] })}>
            <option value="high">عالية (أجهزة العرض القوية)</option>
            <option value="balanced">متوازنة</option>
            <option value="low">منخفضة (أجهزة أضعف)</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>ملف إسقاط جداري محفوظ</label>
          <select data-testid="af-opt-profile" value={config.proj.name ?? ""} onChange={(e) => { const p = profiles.find((x) => x.name === e.target.value); set({ proj: { name: p ? p.name.slice(0, 60) : null, inset: p ? p.safeInsetPercent : config.proj.inset } }); }}>
            <option value="">بدون (المشهد لا يحتاج معايرة)</option>
            {profiles.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
          </select>
          <p className={styles.note}>الملف يحدّد الهامش الآمن للنصوص فقط؛ ليس إثباتًا لمحاذاة الإسقاط.</p>
        </div>
        <div className={styles.field}>
          <label>الهامش الآمن للنصوص: {config.proj.inset}٪</label>
          <input type="range" data-testid="af-opt-inset" min={LIMITS.inset[0]} max={LIMITS.inset[1]} step={1} value={config.proj.inset} onChange={(e) => set({ proj: { ...config.proj, inset: Number(e.target.value) } })} />
        </div>
      </div>
    </details>
  );
}
