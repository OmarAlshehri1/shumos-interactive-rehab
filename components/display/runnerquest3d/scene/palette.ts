import type { StageSpec } from "@/lib/runnerquest3d/types";

export interface Palette {
  skyTop: number; skyBottom: number; fog: number; fogNear: number; fogFar: number;
  grassA: string; grassB: string; hemiSky: number; hemiGround: number; sun: number; sunI: number; hemiI: number;
  crown: number; pine: number; hill: number; hillFar: number; water: number; exposure: number;
}

const base: Palette = {
  skyTop: 0x4aa3f0, skyBottom: 0xd9f1ff, fog: 0xcfe9f7, fogNear: 55, fogFar: 190,
  grassA: "#4fa84a", grassB: "#6cc15a", hemiSky: 0xcfe8ff, hemiGround: 0x6b8a4a, sun: 0xfff2d6, sunI: 2.6, hemiI: 1.15,
  crown: 0x3f9a45, pine: 0x2d7d4f, hill: 0x5fae67, hillFar: 0x8cc4a8, water: 0x53b7e8, exposure: 1.0,
};

const THEMES: Record<StageSpec["theme"], Partial<Palette>> = {
  meadow: {},
  garden: { grassA: "#54b34f", grassB: "#7ad064", crown: 0x4cae52, skyBottom: 0xe5f6ff },
  trail: { skyTop: 0x5fa8e6, skyBottom: 0xf1ecd1, fog: 0xe5ead3, grassA: "#5ea04a", grassB: "#86b957", sun: 0xffe7b8, crown: 0x6aa046 },
  lake: { skyTop: 0x3c97ea, skyBottom: 0xcdeeff, fog: 0xbfe6f6, grassA: "#45a655", grassB: "#62c168", water: 0x39b1e8 },
  forest: { skyTop: 0x3f8fcf, skyBottom: 0xcde8d9, fog: 0xb7d8c4, grassA: "#2f8a49", grassB: "#47a35a", crown: 0x2d8744, pine: 0x1f6b43, hillFar: 0x74b095, fogNear: 40, fogFar: 150, sunI: 2.2 },
  sunset: { skyTop: 0x7c8fe0, skyBottom: 0xffd2a1, fog: 0xf6d9bd, grassA: "#79a845", grassB: "#a2c05a", sun: 0xffc27a, sunI: 2.4, crown: 0xc29a3c, pine: 0x5b7f3d, hill: 0x8fa85a, hillFar: 0xd6a98f, hemiSky: 0xffe0bd, exposure: 1.02 },
  summit: { skyTop: 0x2f86e8, skyBottom: 0xe6f6ff, fog: 0xdcefff, grassA: "#5aa95a", grassB: "#7cc477", hill: 0x6fb883, hillFar: 0xa8cfe0, sunI: 2.8 },
  river: { skyTop: 0x3aa0e0, skyBottom: 0xd0f2f0, fog: 0xc3eae6, grassA: "#43a867", grassB: "#62c27f", water: 0x2fb9d8, crown: 0x3c9d57 },
  festival: { skyTop: 0x6f8fe8, skyBottom: 0xffe3b6, fog: 0xfbe6c4, grassA: "#69b552", grassB: "#92d062", sun: 0xffd9a0, sunI: 2.5, crown: 0x56ac58, hillFar: 0xe3b9a0, hemiSky: 0xfff0d6 },
};

export function paletteFor(theme: StageSpec["theme"]): Palette {
  return { ...base, ...THEMES[theme] };
}
