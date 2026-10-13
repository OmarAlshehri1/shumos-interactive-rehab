"use client";
import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { LibraryLaunchControls } from "@/components/control/library/launch/LibraryLaunchBoundary";
import Image from "next/image";
import Link from "next/link";
import { GAME_REGISTRY, type GameId } from "@/lib/games/registry";
import { realGameThumbnail } from "@/components/control/library/realGameThumbnails";
import { projectionLabel } from "@/components/control/library/presentation";
import { PatientContextBanner } from "@/components/control/patients/PatientContextBanner";
import { GAME_INSTRUCTIONS } from "@/lib/games/setup/introduction";
import styles from "./controlSetup.module.css";
const GameContext = createContext<GameId | null>(null);
export const useControlGameId = () => useContext(GameContext);
/** One Control-only surface. Native game providers, commands and Display themes remain owned by their games. */
export function ControlGameFrame({ children }: { children: ReactNode }) {
  const path = usePathname();
  const game = GAME_REGISTRY.find((g) => g.route === path);
  if (!game) return <>{children}</>;
  const thumbnail = realGameThumbnail(game.id);
  return (
    <GameContext.Provider value={game.id}>
      <div className={styles.frame} data-control-game={game.id} dir="rtl">
        <nav className={styles.nav}>
          <Link href="/control">الرئيسية</Link>
          <Link href="/control/activities">مكتبة الأنشطة</Link>
          <a href="/display" target="_blank" rel="noopener">
            فتح العرض ↗
          </a>
        </nav>
        <header className={styles.header}>
          {thumbnail && (
            <Image
              src={thumbnail}
              width={176}
              height={99}
              alt={`صورة من ${game.nameAr}`}
            />
          )}
          <div>
            <span className={styles.brand}>SHUMOS CARE</span>
            <h1>{game.nameAr}</h1>
            <small lang="en" dir="ltr">
              {game.nameEn}
            </small>
            <p>{GAME_INSTRUCTIONS[game.id].goal}</p>
            <span className={styles.badge}>
              {projectionLabel(game.surfaceType)}
            </span>
            <span className={styles.badge}>تحكم المعالج متاح</span>
          </div>
        </header>
        <LibraryLaunchControls />
        <PatientContextBanner />
        <div className={styles.native}>{children}</div>
      </div>
    </GameContext.Provider>
  );
}
