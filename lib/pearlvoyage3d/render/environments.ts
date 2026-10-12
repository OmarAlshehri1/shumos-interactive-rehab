import type { EnvId } from '../stages';

/** art direction per level. Every parameter here changes the look; the geometry differs per environment too. */
export interface EnvStyle {
    id: EnvId;
    sky: { turbidity: number; rayleigh: number; mie: number; mieG: number; elevation: number; azimuth: number; exposure: number };
    sunColor: string;
    sunIntensity: number;
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    fog: string;
    fogDensity: number;
    water: { deep: string; mid: string; shallow: string; sand: string; amp: number; foam: string; clarity: number };
    zenith: string;
    horizon: string;
    cloudTint: string;
    cloudCount: number;
    mountain: { color: string; far: string; height: number; count: number };
    palm: { count: number; frond: [string, string]; trunk: string };
    sand: [string, string];
    rock: [string, string];
    grass: [string, string];
    coralBoost: number;
}
export const ENV_STYLES: Record<EnvId, EnvStyle> = {
    'pearl-beach': {
        id: 'pearl-beach', sky: { turbidity: 2.6, rayleigh: 1.4, mie: 0.004, mieG: 0.8, elevation: 40, azimuth: 338, exposure: 0.62 }, sunColor: '#fff4dc', sunIntensity: 3.3, hemiSky: '#bfe8ff', hemiGround: '#e8d2a8', hemiIntensity: 1.5,
        fog: '#bfe2ee', fogDensity: 0.00135, water: { deep: '#0a8fb0', mid: '#12b8c4', shallow: '#4fe6d0', sand: '#f1dfb4', amp: 0.3, foam: '#ffffff', clarity: 1 }, zenith: '#2f86d8', horizon: '#cfeaf2', cloudTint: '#ffffff', cloudCount: 15,
        mountain: { color: '#6e9a8a', far: '#9ec3cc', height: 55, count: 5 }, palm: { count: 1, frond: ['#1f7a3d', '#79c64a'], trunk: '#9b7650' }, sand: ['#f2e2b6', '#e2c48b'], rock: ['#8d7a66', '#b59c7d'], grass: ['#3f9a47', '#8bcf57'], coralBoost: 0.8,
    },
    'coral-bay': {
        id: 'coral-bay', sky: { turbidity: 3.2, rayleigh: 1.9, mie: 0.005, mieG: 0.82, elevation: 46, azimuth: 22, exposure: 0.6 }, sunColor: '#fff0d6', sunIntensity: 3.1, hemiSky: '#a8e4ff', hemiGround: '#d9bf9a', hemiIntensity: 1.55,
        fog: '#bfe8ea', fogDensity: 0.0015, water: { deep: '#04788f', mid: '#0caeb8', shallow: '#33e8c4', sand: '#ecd9ac', amp: 0.38, foam: '#ffffff', clarity: 1.25 }, zenith: '#1668d8', horizon: '#bfe8ea', cloudTint: '#fffaf2', cloudCount: 18,
        mountain: { color: '#4f7f94', far: '#8fb7cc', height: 85, count: 6 }, palm: { count: 1, frond: ['#13703f', '#5cc060'], trunk: '#8c6a47' }, sand: ['#f0dcae', '#dcb97c'], rock: ['#7b6d62', '#a89484'], grass: ['#2f8d4a', '#6fcb5d'], coralBoost: 2.2,
    },
    'golden-archipelago': {
        id: 'golden-archipelago', sky: { turbidity: 5.2, rayleigh: 2.6, mie: 0.008, mieG: 0.86, elevation: 13, azimuth: 342, exposure: 0.68 }, sunColor: '#ffd9a0', sunIntensity: 3.4, hemiSky: '#ffd7b0', hemiGround: '#cfa070', hemiIntensity: 1.35,
        fog: '#f0cfa8', fogDensity: 0.0014, water: { deep: '#0b6f9c', mid: '#0f9bb5', shallow: '#52d9c0', sand: '#f4d9a0', amp: 0.34, foam: '#fff6df', clarity: 1.05 }, zenith: '#3f78c8', horizon: '#ffd9ae', cloudTint: '#ffd6b0', cloudCount: 20,
        mountain: { color: '#6b6a8c', far: '#b79aa0', height: 120, count: 7 }, palm: { count: 1, frond: ['#1b6a3a', '#9ad04a'], trunk: '#8a6240' }, sand: ['#f3d9a0', '#d9ae6c'], rock: ['#8a6f5e', '#c49a72'], grass: ['#37873f', '#9ac852'], coralBoost: 1,
    },
};
export const SEABED_Y = -2.6;
