/**
 * Shared world collision for the local player and the bots: wall/pillar push-out,
 * stair/ramp support and ground height. All of it is pure 2D-footprint logic over
 * the `colliders` object built in scene.js.
 */

export const PLAYER_RADIUS = 0.45;
export const GROUND_Y = 0.75;
export const PLATFORM_STEP_UP = 2;
// The boundary wall in scene.js is centred on the arena edge and 1.2 thick, so its inner face is 0.6 in
const BOUNDARY_WALL_HALF = 0.6;

// Thinnest solid is 0.6 across and push-out sends you to the nearest face, so one step must
// stay well under 0.3 or a fast frame (low fps, knockback) ejects you out the far side.
const MAX_STEP = 0.15;
// Extra headroom so floating-point and gravity settling never flicker a staircase on and off
const RAMP_STEP_SLACK = 0.1;

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

function rampSurfaceY(r, x, z) {
  const a = r.axis === 'z' ? z : x;
  let t = (a - r.axisStart) / (r.axisEnd - r.axisStart);
  // Snap to the top of the physical step underfoot so players can't sink into the stone
  if (r.steps) t = Math.ceil(clamp(t, 0, 1) * r.steps) / r.steps;
  return r.yStart + t * (r.yEnd - r.yStart);
}

// How far below a ramp's surface feet may be and still count as being on it: one step
function rampReach(r) {
  return Math.abs(r.yEnd - r.yStart) / (r.steps || 1) + RAMP_STEP_SLACK;
}

const inFootprint = (r, x, z) => x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax;

/**
 * Height of the floor under (x, z) for something whose feet are at currentY.
 * A ramp only supports you when you're within a step of its surface, so walking up to the
 * side of a staircase at ground level no longer snaps you onto whichever step is overhead.
 * `rampFeetY` is the height used for that stair check when it differs from currentY: a bot's
 * visible height eases up behind where it is really standing, so it passes where it's heading.
 */
export function getGroundY(x, z, currentY, colliders, rampFeetY = currentY) {
  let y = GROUND_Y;
  if (!colliders) return y;
  for (const p of colliders.platforms || []) {
    // Platforms far above the player (e.g. the gate lintel) are overhead, not floor
    if (currentY < p.y - PLATFORM_STEP_UP) continue;
    if (x >= p.xMin && x <= p.xMax && z >= p.zMin && z <= p.zMax) y = Math.max(y, p.y);
  }
  for (const r of colliders.ramps || []) {
    if (!inFootprint(r, x, z)) continue;
    const surface = rampSurfaceY(r, x, z);
    if (rampFeetY < surface - rampReach(r)) continue;
    y = Math.max(y, surface);
  }
  return y;
}

/** True when (x, z) is over a staircase or ramp. */
export function isOverRamp(x, z, colliders) {
  if (!colliders) return false;
  for (const r of colliders.ramps || []) if (inFootprint(r, x, z)) return true;
  return false;
}

/** Push `position` out of walls, pillars, the arena edge and the sides of staircases. */
export function resolveSolids(position, colliders, rampFeetY = position.y) {
  if (!colliders) return;
  const pr = PLAYER_RADIUS;

  const bound = colliders.arenaSize - BOUNDARY_WALL_HALF - pr;
  position.x = clamp(position.x, -bound, bound);
  position.z = clamp(position.z, -bound, bound);

  for (const tree of colliders.trees) {
    if (tree.maxY !== undefined && position.y >= tree.maxY - 0.3) continue;
    const dx = position.x - tree.x;
    const dz = position.z - tree.z;
    const distSq = dx * dx + dz * dz;
    const minDist = tree.radius + pr;
    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      position.x += (dx / dist) * overlap;
      position.z += (dz / dist) * overlap;
    }
  }

  // Treat the rect as solid out to the player's radius: stop at pr from its face and slide along
  // it. Only pushing out once the centre is inside made a wall run snap back and forth every frame.
  // Returns the nearest point on the rect to the player's centre.
  const pushOutOfRect = (xMin, xMax, zMin, zMax, probe) => {
    const qx = clamp(position.x, xMin, xMax);
    const qz = clamp(position.z, zMin, zMax);
    const dx = position.x - qx;
    const dz = position.z - qz;
    const distSq = dx * dx + dz * dz;
    if (probe) return { qx, qz, distSq };
    if (distSq >= pr * pr) return null;
    if (distSq > 1e-8) {
      const scale = pr / Math.sqrt(distSq);
      position.x = qx + dx * scale;
      position.z = qz + dz * scale;
    } else {
      // Centre is inside the rect: leave through the nearest face
      const dxMin = position.x - xMin;
      const dxMax = xMax - position.x;
      const dzMin = position.z - zMin;
      const dzMax = zMax - position.z;
      const minD = Math.min(dxMin, dxMax, dzMin, dzMax);
      if (minD === dxMin) position.x = xMin - pr;
      else if (minD === dxMax) position.x = xMax + pr;
      else if (minD === dzMin) position.z = zMin - pr;
      else position.z = zMax + pr;
    }
    return null;
  };

  for (const box of colliders.boxes || []) {
    if (position.y >= box.maxY - 0.3) continue;
    pushOutOfRect(box.xMin, box.xMax, box.zMin, box.zMax);
  }

  // A staircase is solid below its surface: you enter from the low end (surface is one step up)
  // or arrive from above, never by walking through its side.
  for (const r of colliders.ramps || []) {
    const { qx, qz, distSq } = pushOutOfRect(r.xMin, r.xMax, r.zMin, r.zMax, true);
    if (distSq >= pr * pr) continue;
    // Judge the step at the footprint point nearest the player, so the open low end stays open
    if (rampFeetY >= rampSurfaceY(r, qx, qz) - rampReach(r)) continue;
    pushOutOfRect(r.xMin, r.xMax, r.zMin, r.zMax);
  }
}

/**
 * Move `position` by `delta` (a Vector3, x/z used), resolving collisions in sub-steps so a long
 * step can't skip over a thin wall. With a zero delta it still resolves overlaps once.
 */
export function moveWithCollisions(position, delta, colliders, rampFeetY = position.y) {
  const dist = Math.hypot(delta.x, delta.z);
  const steps = colliders ? Math.max(1, Math.ceil(dist / MAX_STEP)) : 1;
  const sx = delta.x / steps;
  const sz = delta.z / steps;
  for (let i = 0; i < steps; i++) {
    position.x += sx;
    position.z += sz;
    resolveSolids(position, colliders, rampFeetY);
  }
}
