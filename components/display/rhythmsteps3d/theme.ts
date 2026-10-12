import * as THREE from 'three';

/**
 * Stage environments. Every stage keeps the same four target colours (those carry the instruction); only the
 * atmosphere around the lanes changes: sky, glow accents and which decorative structures appear.
 */
export interface Theme {
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  /** Glow accents used by pillars, grid, particles and the vanishing-point flare. */
  accentA: string;
  accentB: string;
  accentC: string;
  /** 0..1 amounts of optional structures. */
  gates: number;
  prisms: number;
  columns: number;
}

export const STAGE_THEMES: readonly Theme[] = [
  { skyTop: '#05051a', skyMid: '#1a0b45', skyHorizon: '#a02bd6', accentA: '#18e0ff', accentB: '#ff3df2', accentC: '#4a6bff', gates: 0, prisms: 0, columns: 0 },
  { skyTop: '#07061f', skyMid: '#210c4d', skyHorizon: '#e02fb4', accentA: '#33e8ff', accentB: '#ff4bd8', accentC: '#7a52ff', gates: 0, prisms: 0, columns: 0 },
  { skyTop: '#03102a', skyMid: '#0b2a66', skyHorizon: '#21c9ff', accentA: '#27f0ff', accentB: '#c24dff', accentC: '#3a7bff', gates: 0, prisms: 0, columns: 0.4 },
  { skyTop: '#0b0424', skyMid: '#2a0d68', skyHorizon: '#9b5bff', accentA: '#25ddff', accentB: '#ff45e6', accentC: '#8a63ff', gates: 1, prisms: 0, columns: 0 },
  { skyTop: '#14031e', skyMid: '#42095a', skyHorizon: '#ff4fd2', accentA: '#ff9a3d', accentB: '#ff2fd0', accentC: '#7d4cff', gates: 1, prisms: 0, columns: 0.3 },
  { skyTop: '#031c24', skyMid: '#12356a', skyHorizon: '#2fe6d4', accentA: '#2cf5e0', accentB: '#a455ff', accentC: '#3a8cff', gates: 1, prisms: 0, columns: 0.5 },
  { skyTop: '#0b0420', skyMid: '#3b1766', skyHorizon: '#ffb52e', accentA: '#ffc83a', accentB: '#ff4bd0', accentC: '#7a54ff', gates: 0.5, prisms: 1, columns: 0.6 },
  { skyTop: '#050a28', skyMid: '#12409a', skyHorizon: '#45f0ff', accentA: '#40f4ff', accentB: '#ffc83a', accentC: '#5a7bff', gates: 0.5, prisms: 1, columns: 0.8 },
  { skyTop: '#0b0218', skyMid: '#450c78', skyHorizon: '#ffd34a', accentA: '#ffd34a', accentB: '#ff3df2', accentC: '#26e8ff', gates: 1, prisms: 1, columns: 1 },
];

export interface ThemeColors {
  skyTop: THREE.Color;
  skyMid: THREE.Color;
  skyHorizon: THREE.Color;
  accentA: THREE.Color;
  accentB: THREE.Color;
  accentC: THREE.Color;
  gates: number;
  prisms: number;
  columns: number;
}

export const toColors = (t: Theme): ThemeColors => ({
  skyTop: new THREE.Color(t.skyTop), skyMid: new THREE.Color(t.skyMid), skyHorizon: new THREE.Color(t.skyHorizon),
  accentA: new THREE.Color(t.accentA), accentB: new THREE.Color(t.accentB), accentC: new THREE.Color(t.accentC),
  gates: t.gates, prisms: t.prisms, columns: t.columns,
});

/** Moves `cur` toward `to` by fraction `f` (colours in place, amounts too). */
export function easeTheme(cur: ThemeColors, to: ThemeColors, f: number): void {
  for (const k of ['skyTop', 'skyMid', 'skyHorizon', 'accentA', 'accentB', 'accentC'] as const) cur[k].lerp(to[k], f);
  for (const k of ['gates', 'prisms', 'columns'] as const) cur[k] += (to[k] - cur[k]) * f;
}
