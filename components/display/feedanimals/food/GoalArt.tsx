"use client";

import { Food } from "@/lib/feedanimals";
import { BambooCluster } from "./BambooCluster";
import { BananaBunch } from "./BananaBunch";
import { CarrotPatch } from "./CarrotPatch";
import { LeafyTree } from "./LeafyTree";
import { WatermelonPatch } from "./WatermelonPatch";

interface GoalArtProps {
  food: Food;
  celebrating?: boolean;
}

/**
 * SAFARI ANIMAL ADVENTURE — the path mechanic's own destination-art
 * dispatcher, one full-scene "goal" illustration per food (task's "upgrade
 * remaining goal art to the same clarity as Stage 1's banana"). Mirrors
 * AnimalWalker.tsx's role for animals.
 */
export function GoalArt({ food, celebrating = false }: GoalArtProps) {
  switch (food) {
    case Food.CARROT:
      return <CarrotPatch celebrating={celebrating} />;
    case Food.BAMBOO:
      return <BambooCluster celebrating={celebrating} />;
    case Food.WATERMELON:
      return <WatermelonPatch celebrating={celebrating} />;
    case Food.LEAVES:
      return <LeafyTree celebrating={celebrating} />;
    case Food.BANANA:
    default:
      return <BananaBunch celebrating={celebrating} />;
  }
}
