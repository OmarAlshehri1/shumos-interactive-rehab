"use client";
import { useEffect, useState } from "react";
import { ControlNav } from "@/components/control/nav/ControlNav";
import {
  defaultProjection,
  PROFILE_KEY,
  validProjectionProfile,
  type ProjectionProfile,
} from "@/lib/projection/calibration";
import styles from "./visit.module.css";
export function ProjectionCalibrationScreen() {
  const [profile, setProfile] = useState<ProjectionProfile>(defaultProjection),
    [profiles, setProfiles] = useState<ProjectionProfile[]>([]),
    [message, setMessage] = useState("");
  const load = () => {
    try {
      const raw = JSON.parse(localStorage.getItem(PROFILE_KEY) ?? "[]");
      setProfiles(Array.isArray(raw) ? raw.filter(validProjectionProfile) : []);
    } catch {
      setProfiles([]);
    }
  };
  useEffect(() => {
    void Promise.resolve().then(load);
  }, []);
  const save = () => {
    const next = {
      ...profile,
      id: profile.id === "default" ? crypto.randomUUID() : profile.id,
      updatedAt: Date.now(),
    };
    if (!validProjectionProfile(next)) {
      setMessage("أكمل الاسم والقياسات الصحيحة.");
      return;
    }
    try {
      const saved = [...profiles.filter((p) => p.id !== next.id), next];
      localStorage.setItem(PROFILE_KEY, JSON.stringify(saved));
      setProfiles(saved);
      setProfile(next);
      setMessage("حُفظ الملف محليًا. يمكن تحميله أو تصديره لحاسوب العرض.");
    } catch {
      setMessage("تعذّر التخزين في هذا المتصفح. يمكنك تصدير الملف.");
    }
  };
  const exportProfile = () => {
    const blob = new Blob([JSON.stringify(profile, null, 2)], {
        type: "application/json",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `shumos-projection-${profile.surface.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <main dir="rtl" lang="ar" className={styles.page}>
      <div className={styles.content}>
        <ControlNav active="home" />
        <header className={styles.header}>
          <h1>معايرة الإسقاط</h1>
          <p>
            ملف مشترك قابل لإعادة الاستخدام للعرض الجداري والأرضي · معايرة تخطيط
            برمجية.
          </p>
        </header>
        <section className={styles.card}>
          <div className={styles.fields}>
            <label className={styles.field}>
              اسم الملف
              <input
                maxLength={100}
                value={profile.name}
                onChange={(e) =>
                  setProfile({ ...profile, name: e.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              السطح
              <select
                value={profile.surface}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    surface: e.target.value as ProjectionProfile["surface"],
                  })
                }
              >
                <option value="FLOOR">الأرضية</option>
                <option value="WALL">الجدار</option>
              </select>
            </label>
            <label className={styles.field}>
              الاتجاه
              <select
                value={profile.rotation}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    rotation: Number(
                      e.target.value,
                    ) as ProjectionProfile["rotation"],
                  })
                }
              >
                {[0, 90, 180, 270].map((r) => (
                  <option key={r} value={r}>
                    {r}°
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              حدود الأمان ({profile.safeInsetPercent}٪)
              <input
                type="range"
                min="3"
                max="20"
                value={profile.safeInsetPercent}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    safeInsetPercent: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className={styles.field}>
              حجم الهدف ({profile.targetPercent}٪)
              <input
                type="range"
                min="2"
                max="20"
                value={profile.targetPercent}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    targetPercent: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className={styles.field}>
              تباعد الأهداف ({profile.spacingPercent}٪)
              <input
                type="range"
                min="10"
                max="35"
                value={profile.spacingPercent}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    spacingPercent: Number(e.target.value),
                  })
                }
              />
            </label>
            <label className={styles.field}>
              عرض المنطقة المقاس بالشريط (سم)
              <input
                type="number"
                min="1"
                max="2000"
                value={profile.measuredWidthCm ?? ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    measuredWidthCm: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </label>
            <label className={styles.field}>
              ارتفاع / طول المنطقة المقاس (سم)
              <input
                type="number"
                min="1"
                max="2000"
                value={profile.measuredHeightCm ?? ""}
                onChange={(e) =>
                  setProfile({
                    ...profile,
                    measuredHeightCm: e.target.value
                      ? Number(e.target.value)
                      : null,
                  })
                }
              />
            </label>
          </div>
          <ProjectionGrid profile={profile} />
          <p className={styles.muted}>
            {profile.surface === "FLOOR"
              ? "قِس عرض وطول المنطقة على الأرض، وحدد حدودًا خالية من العوائق وتحت إشراف المعالج."
              : "حاذِ حدود الشاشة مع الجدار، وقِس العرض والارتفاع وحدد منطقة وصول مناسبة للطفل."}{" "}
            اضبط التركيز وتصحيح الانحراف من جهاز الإسقاط نفسه. الأبعاد هنا
            إرشادية ولا تضمن دقة السنتيمتر.
          </p>
          <p className={styles.muted}>
            هذه الشبكة فقط تستهلك الملف حاليًا. لا تتغير تخطيطات الألعاب القائمة
            تلقائيًا. افتح المعايرة على حاسوب العرض واعرض الشبكة بكامل الشاشة.
          </p>
          <div className={styles.options}>
            <button
              className={`${styles.button} ${styles.primary}`}
              onClick={save}
            >
              حفظ الملف
            </button>
            <button className={styles.button} onClick={exportProfile}>
              تصدير JSON
            </button>
            <button
              className={styles.button}
              onClick={() => {
                setProfile(defaultProjection());
                setMessage("");
              }}
            >
              ملف جديد
            </button>
            <button
              className={styles.button}
              onClick={() =>
                void document
                  .querySelector("[data-projection-grid]")
                  ?.requestFullscreen()
                  .catch(() =>
                    setMessage("تعذّر ملء الشاشة. افتح الصفحة على جهاز العرض."),
                  )
              }
            >
              عرض الشبكة بكامل الشاشة
            </button>
          </div>
          <label className={styles.field}>
            استيراد ملف على هذا الجهاز
            <input
              type="file"
              accept="application/json"
              onChange={async (e) => {
                try {
                  const file = e.target.files?.[0];
                  if (!file || file.size > 10000) throw Error();
                  const raw = JSON.parse(await file.text());
                  if (!validProjectionProfile(raw)) throw Error();
                  setProfile(raw);
                  setMessage(
                    "تم تحميل الملف. اضغط حفظ للاحتفاظ به على هذا الجهاز.",
                  );
                } catch {
                  setMessage("ملف غير صالح.");
                }
              }}
            />
          </label>
          <p className={styles.muted} role="status">
            {message}
          </p>
        </section>
        <section className={styles.card}>
          <h2>الملفات المحفوظة على هذا الجهاز</h2>
          {profiles.length === 0 && (
            <p className={styles.muted}>
              لم تُحفظ ملفات بعد. النقل بين الأجهزة يتم بالتصدير والاستيراد.
            </p>
          )}
          {profiles.map((p) => (
            <button
              key={p.id}
              className={styles.patient}
              onClick={() => setProfile(p)}
            >
              {p.name} · {p.surface === "WALL" ? "جداري" : "أرضي"}
              <span>تحميل ←</span>
            </button>
          ))}
        </section>
      </div>
    </main>
  );
}
function ProjectionGrid({ profile: p }: { profile: ProjectionProfile }) {
  return (
    <div
      data-projection-grid
      style={{
        position: "relative",
        aspectRatio: "16 / 10",
        width: "100%",
        backgroundColor: "#102b3b",
        backgroundImage:
          "linear-gradient(#95cace22 1px,transparent 1px),linear-gradient(90deg,#95cace22 1px,transparent 1px)",
        backgroundSize: "10% 10%",
        borderRadius: 12,
        overflow: "hidden",
      }}
      aria-label="شبكة حدود الإسقاط"
    >
      <div
        style={{
          position: "absolute",
          inset: `${p.safeInsetPercent}%`,
          border: "3px dashed #6ce0d0",
          transform: `rotate(${p.rotation}deg)`,
        }}
      >
        {[
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [0, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ].map(([x, y], i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: `${50 + x * p.spacingPercent}%`,
              top: `${50 + y * p.spacingPercent}%`,
              width: `${p.targetPercent}%`,
              aspectRatio: "1",
              borderRadius: "50%",
              border: "2px solid #ffe19b",
              background: "#ffe19b55",
              transform: "translate(-50%,-50%)",
            }}
          />
        ))}
      </div>
      <strong
        style={{
          position: "absolute",
          top: 10,
          left: 14,
          color: "white",
          fontSize: 12,
        }}
      >
        {p.surface} · {p.rotation}° · حدود آمنة مقترحة
      </strong>
    </div>
  );
}
