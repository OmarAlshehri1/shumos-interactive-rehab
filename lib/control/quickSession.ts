import { GAME_REGISTRY, type GameDefinition, type SurfaceType } from "@/lib/games/registry";

export interface QuickSessionLaunch {
  childFirstName: string;
  patientId: null;
  game: GameDefinition;
}

export function gamesForQuickSessionSurface(surface: SurfaceType): readonly GameDefinition[] {
  return GAME_REGISTRY.filter((game) => game.surfaceType === surface);
}

export function createQuickSessionLaunch(childFirstName: string, game: GameDefinition): QuickSessionLaunch {
  return { childFirstName: childFirstName.trim(), patientId: null, game };
}
