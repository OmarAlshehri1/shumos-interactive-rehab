import type { Made } from './builders1';
import * as v from './builders1';
import * as c from './builders2';
import * as d from './builders3';

/** Milestone id -> builder. Builders are created lazily the first time the world needs them. */
export const MAKERS: Record<string, () => Made> = {
  cottage1: v.cottage1, path: v.villagePath, cottage2: v.cottage2, farm: v.farm, garden: v.garden, market: v.market, playground: v.playground, fountain: v.fountain, houses: v.houses, festival: v.festival,
  roads: c.roads, apartments: c.apartments, school: c.school, hospital: c.hospital, mall: c.mall, park: c.park, bridge: c.bridge, port: c.port, districts: c.districts, airport: c.airport, clocktower: c.clocktower,
  towers: d.towers, landmark: d.landmark, stadium: d.stadium, metro: d.metro, port2: d.port2, parks: d.parks, bridge2: d.bridge2, skyline: d.skyline, airport2: d.airport2, waterfront: d.waterfront, lights: d.lights,
};
