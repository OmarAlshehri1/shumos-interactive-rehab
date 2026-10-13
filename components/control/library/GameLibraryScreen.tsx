"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { GAME_REGISTRY } from "@/lib/games/registry";
import { ControlNav } from "@/components/control/nav/ControlNav";
import { PatientContextBanner } from "@/components/control/patients/PatientContextBanner";
import { GameCard } from "./GameCard";
import { InteractionIcon } from "./InteractionIcon";
import {
  LIBRARY_FILTERS,
  filteredGames,
  libraryFilter,
  type LibraryFilter,
} from "@/lib/games/library/filters";
import { librarySections } from "./presentation";
import styles from "./library.module.css";
export function GameLibraryScreen() {
  return (
    <Suspense
      fallback={
        <main className={styles.library} dir="rtl">
          <div className={styles.inner}>جاري تحميل الأنشطة…</div>
        </main>
      }
    >
      <Library />
    </Suspense>
  );
}
function Library() {
  const query = useSearchParams(),
    router = useRouter(),
    selected = libraryFilter(query.get("filter") ?? query.get("input")),
    games = filteredGames(GAME_REGISTRY, selected);
  const select = (filter: LibraryFilter) => {
    const next = new URLSearchParams(query.toString());
    next.delete("input");
    if (filter === "ALL") next.delete("filter");
    else next.set("filter", filter);
    router.replace(`/control/activities${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  };
  return (
    <main dir="rtl" lang="ar" className={styles.library}>
      <div className={styles.inner}>
        <ControlNav active="library" />
        <header className={styles.header}>
          <div>
            <h1>مكتبة الأنشطة</h1>
            <span>{GAME_REGISTRY.length} نشاطًا · اختر تجربة تناسب جلستك</span>
          </div>
          <span className={styles.count}>{games.length} نشاط</span>
        </header>
        <PatientContextBanner />
        <nav className={styles.categories} aria-label="تصفية الأنشطة">
          {LIBRARY_FILTERS.map((f) => (
            <button
              type="button"
              className={styles.category}
              key={f.id}
              aria-pressed={selected === f.id}
              onClick={() => select(f.id)}
              data-library-filter={f.id}
            >
              <InteractionIcon name={f.icon} />
              {f.label}
              <small>{filteredGames(GAME_REGISTRY, f.id).length}</small>
            </button>
          ))}
        </nav>
        {(selected === "ALL"
          ? librarySections(GAME_REGISTRY)
          : librarySections(GAME_REGISTRY).filter((s) => s.input === selected)
        ).map((section) => (
          <section
            key={section.id}
            className={styles.deviceSection}
            data-library-section={section.input}
            data-library-filter-selected={selected}
            aria-label={section.title}
          >
            <header className={styles.deviceHeader}>
              <InteractionIcon name={section.icon} />
              <h2>{section.title}</h2>
              <span>{section.games.length} أنشطة</span>
            </header>
            <div className={styles.gameGrid}>
              {section.games.map((game) => (
                <GameCard key={game.id} game={game} input={section.input} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
