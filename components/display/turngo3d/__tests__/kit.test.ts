import { describe, expect, it } from 'vitest';
import type * as THREE from 'three';
import { balloonGeometry, blobGeometry, coneParts, flowerHeadGeometry, houseGeometry, lampPostGeometry, lanternGeometry, mushroomGeometry, palmGeometry, ribbonGeometry, rockGeometry, shellGeometry, starGeometry, stemGeometry, treeGeometry, wingGeometry } from '../kit';
import { sampleSpline } from '@/lib/turngo3d/courses';

const finite = (g: THREE.BufferGeometry) => {
  const p = g.getAttribute('position').array as ArrayLike<number>;
  for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) return false;
  return p.length > 0;
};

describe('procedural geometry kit', () => {
  const builders: Record<string, () => THREE.BufferGeometry> = {
    star: () => starGeometry(0.6, 0.28, 0.16), tree: () => treeGeometry(1, 0x8bd35a, 0x2f7d32), palm1: () => palmGeometry(1), palm2: () => palmGeometry(2), flower: () => flowerHeadGeometry(), stem: () => stemGeometry(0.4),
    mushroom: () => mushroomGeometry(), lantern: () => lanternGeometry(), house: () => houseGeometry(1, 1, 1, 0xffffff, 0xff0000), balloon: () => balloonGeometry(), rock: () => rockGeometry(3), shell: () => shellGeometry(),
    lamp: () => lampPostGeometry(), blob: () => blobGeometry(0.4, 7, 2, 0.75, 0.3), wing: () => wingGeometry(), cone: () => coneParts().body, band: () => coneParts().band, base: () => coneParts().base,
    ribbon: () => ribbonGeometry(sampleSpline([[0, 0], [2, 1], [4, -1]]), 2, 0.02, 2, 2),
  };
  for (const [name, build] of Object.entries(builders)) it(`${name}: every vertex is finite`, () => expect(finite(build())).toBe(true));
});
