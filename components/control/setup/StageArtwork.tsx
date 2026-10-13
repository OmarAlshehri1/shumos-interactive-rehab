"use client";
import Image from "next/image";
import type { GameId } from "@/lib/games/registry";
const DISTINCT: Partial<Record<GameId, string>> = {
  "balance-bridge-3d": "balance",
  "space-pilot": "space",
  "turn-and-go-3d": "turn",
  "foot-maze-3d": "maze",
};
/** Stage captures where available; the fallback is explicitly a representative gameplay capture. */
export function StageArtwork({
  gameId,
  index,
  fallback,
}: {
  gameId: GameId | null;
  index: number;
  fallback?: string;
}) {
  const family =
    gameId === "body-sequence-3d" && [0, 1, 3].includes(index)
      ? "body"
      : gameId === "rhythm-steps-3d" && [4, 8].includes(index)
        ? "rhythm"
        : gameId
          ? DISTINCT[gameId]
          : undefined;
  const src = family
    ? `/control-stage-previews/${family}/${index + 1}.webp`
    : fallback;
  if (!src) return null;
  return (
    <figure style={{ margin: 0, width: "100%" }}>
      <Image
        src={src}
        width={480}
        height={270}
        sizes="(max-width:650px) 30vw, 320px"
        alt={family ? `معاينة المرحلة ${index + 1}` : "صورة تمثيلية من النشاط"}
        style={{
          width: "100%",
          height: "auto",
          aspectRatio: "16/9",
          objectFit: "cover",
          borderRadius: 9,
        }}
      />
      <figcaption style={{ fontSize: 10, color: "#657d85" }}>
        {family ? "معاينة المرحلة" : "صورة تمثيلية من النشاط"}
      </figcaption>
    </figure>
  );
}
