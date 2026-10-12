"use client";
import Link from "next/link";
import Image from "next/image";
import type { GameDefinition } from "@/lib/games/registry";
import { GAME_THUMBNAILS } from "./gameThumbnails";
import { projectionLabel } from "./presentation";
import styles from "./library.module.css";
import { gameSkillTags } from "@/lib/games/library/skillTags";
import {
  launchHref,
  type RequestedInput,
} from "@/lib/games/library/capabilities";
import { realGameThumbnail } from "./realGameThumbnails";
function ProjectionIcon({ surface }: { surface: unknown }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {surface === "BOTH" ? (
        <>
          <rect x="2.5" y="2" width="11" height="8" rx="1.5" />
          <path d="M3 14h10M8 11v3" />
        </>
      ) : surface === "WALL" ? (
        <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      ) : surface === "FLOOR" ? (
        <path d="M8 2v8m-3-3 3 3 3-3M3 13h10" />
      ) : (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M6 6a2 2 0 1 1 3 2L8 9m0 2h.01" />
        </>
      )}
    </svg>
  );
}
/** One canonical registry entry and launch route; this card is also shared by the therapist Home preview. */
export function GameCard({
  game,
  onSelect,
  input,
}: {
  game: GameDefinition;
  onSelect?: () => void;
  input?: RequestedInput;
}) {
  const Thumbnail = GAME_THUMBNAILS[game.id],
    asset = realGameThumbnail(game.id);
  return (
    <Link
      href={launchHref(game.route, input ?? "MANUAL")}
      onClick={onSelect}
      className={styles.card}
      data-game-card={game.id}
    >
      <div className={styles.cardThumbnail}>
        {asset ? (
          <Image
            unoptimized
            src={asset}
            sizes="(max-width: 650px) 100vw, (max-width: 1000px) 50vw, 33vw"
            alt={`مشهد من ${game.nameAr}`}
            width={640}
            height={360}
            loading="lazy"
          />
        ) : (
          Thumbnail && <Thumbnail />
        )}
        <span className={styles.projection} data-projection={game.surfaceType}>
          <ProjectionIcon surface={game.surfaceType} />
          {projectionLabel(game.surfaceType)}
        </span>
      </div>
      <div className={styles.cardBody}>
        <div>
          <h3 className={styles.cardTitle}>{game.nameAr}</h3>
          <span className={styles.cardEnglish} lang="en" dir="ltr">
            {game.nameEn}
          </span>
        </div>
        <div className={styles.tags}>
          {gameSkillTags(game).map((tag) => (
            <span key={tag} className={styles.tag}>
              {tag}
            </span>
          ))}
        </div>
        <span className={styles.launch}>
          بدء النشاط
          <span aria-hidden="true" className={styles.launchArrow}>
            ←
          </span>
        </span>
      </div>
    </Link>
  );
}
