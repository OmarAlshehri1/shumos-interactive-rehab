import type { Made } from './kit';
import * as a from './builders1';
import * as b from './builders2';
import * as c from './builders3';

/** Milestone id -> builder. Builders are created lazily the first time the world needs them. */
export const MAKERS: Record<string, () => Made> = {
  coral1: a.coral1, plants: a.plants, fish1: a.fish1, coral2: a.coral2, anemones: a.anemones, school1: a.school1, shells: a.shells, reef1: a.reef1, garden2: a.garden2, bloom: a.bloom,
  bigreef: b.bigreef, turtle: b.turtle, dolphins: b.dolphins, cave: b.caveBuild, school2: b.school2, ship: b.shipBuild, arch: b.archBuild, glow1: b.glow1, kelp: b.kelpForest, friend: b.friend, panorama: b.panorama,
  whale: c.whale, palace: c.palaceBuild, giants: c.giants, school3: c.school3, magic: c.magic, arches2: c.arches2, pearls: c.pearls, glow2: c.glow2, dance: c.dance, landmark: c.landmark, finale: c.finale,
};
