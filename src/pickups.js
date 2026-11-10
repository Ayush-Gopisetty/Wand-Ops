/**
 * Potion pickups: tuning and spawn-spot picking (pure logic, no DOM or network). The bot host decides
 * what spawns where and when; everyone else mirrors it.
 */
import { GROUND_Y, getGroundY, pointInSolid } from './collision.js';

export const PICKUP_TYPES = [
  { id: 'health', label: 'Health potion', color: 0xe5384f, heal: 40 },
];

export const PICKUP_MIN = 2;         // the host tops the map up to this straight away
export const PICKUP_MAX = 4;         // never more than this at once
export const PICKUP_INTERVAL = 12;   // seconds between new potions while below the max
export const PICKUP_RADIUS = 1.5;    // walk this close to grab one
export const PICKUP_SPACING = 14;    // minimum distance between two potions
const SPOT_MARGIN = 1.1;             // keep this far from walls, pillars and cover
const MAP_LIMIT = 46;                // stay inside the arena walls
const HIGH_GROUND_CHANCE = 0.35;     // how often a potion goes on a raised platform instead
const MIN_PLATFORM_Y = 2.5;          // low cover blocks are jumped onto, not climbed to
const MIN_PLATFORM_SIZE = 3;         // narrow ledges are too fiddly to stand on
const PLATFORM_EDGE = 0.8;           // keep this far from a platform's edge

// Probe the spot and a ring around it, near and far, so thin walls can't hide between the samples
const OFFSETS = [[0, 0]];
for (const r of [SPOT_MARGIN / 2, SPOT_MARGIN]) {
  for (let i = 0; i < 8; i++) OFFSETS.push([Math.cos((i * Math.PI) / 4) * r, Math.sin((i * Math.PI) / 4) * r]);
}

function clearOfSolids(x, z, y, colliders) {
  const probe = { x: 0, y, z: 0 };
  for (const [dx, dz] of OFFSETS) {
    probe.x = x + dx;
    probe.z = z + dz;
    if (pointInSolid(probe, colliders)) return false;
  }
  return true;
}

// Platforms worth putting a potion on: wall tops, tower tops and the big raised platforms
function highGroundPlatforms(colliders) {
  return (colliders.platforms || []).filter((p) => p.y >= MIN_PLATFORM_Y
    && Math.min(p.xMax - p.xMin, p.zMax - p.zMin) >= MIN_PLATFORM_SIZE);
}

// A random open spot { x, z, y } (y is the standing height): either flat ground away from walls, cover,
// platforms and stairs, or the top of a raised platform clear of its low walls. Never closer than
// PICKUP_SPACING to another potion. Null if the map is too crowded to find one.
export function pickSpot(colliders, existing, rand = Math.random) {
  const platforms = highGroundPlatforms(colliders);
  for (let attempt = 0; attempt < 80; attempt++) {
    let x, z, y;
    if (platforms.length && rand() < HIGH_GROUND_CHANCE) {
      const p = platforms[Math.floor(rand() * platforms.length)];
      x = p.xMin + PLATFORM_EDGE + rand() * (p.xMax - p.xMin - PLATFORM_EDGE * 2);
      z = p.zMin + PLATFORM_EDGE + rand() * (p.zMax - p.zMin - PLATFORM_EDGE * 2);
      y = p.y;
      // This must be the top surface here: not a stair or a higher platform over the same spot
      if (getGroundY(x, z, y + 0.5, colliders) !== y) continue;
      if (!clearOfSolids(x, z, y + 0.5, colliders)) continue;
    } else {
      x = (rand() * 2 - 1) * MAP_LIMIT;
      z = (rand() * 2 - 1) * MAP_LIMIT;
      y = GROUND_Y;
      // Flat ground at every height means no platform, ramp or stair sits over this spot
      if (getGroundY(x, z, 10, colliders) !== GROUND_Y || getGroundY(x, z, 0, colliders) !== GROUND_Y) continue;
      if (!clearOfSolids(x, z, 1, colliders)) continue;
    }
    if (existing.some((o) => Math.hypot(o.x - x, o.z - z) < PICKUP_SPACING)) continue;
    return { x: +x.toFixed(2), z: +z.toFixed(2), y };
  }
  return null;
}
