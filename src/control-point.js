/**
 * Control point mode rules (pure logic, no DOM or network). One zone in the courtyard: a team standing
 * alone in it pushes the capture bar its way, rivals in the zone freeze the bar, and a team that has
 * fully captured the point earns a point per second while it has a wizard on it and no rival does.
 * Leaving the point empty or letting a rival onto it stops the scoring (the capture itself stays).
 * The bot host runs this and the others mirror it.
 */
export const CONTROL_POINT = { x: 0, z: 0, radius: 7 }; // the courtyard around the fountain
export const CP_POINTS_TO_WIN = 100;

// The courtyard's ring wall (see scene.js): inner face at ±16.5, outer face at ±19.5, and a gate 4.4 wide in
// the middle of each side. Bots have no pathfinding, so they get a waypoint through the nearest gate.
const WALL_INNER = 16.5;
const GATE_APPROACH = 22;  // in front of a gate, just past the bushes that flank it
const GATE_LINE = 1.2;     // this close to a gate's centre line counts as lined up with it
const GATE_INSIDE = 14;    // walk through to here, then straight for the point

/**
 * Where a bot at (x, z) should walk next to reach the control point: null when it can go straight there
 * (inside the courtyard), else a spot in front of the nearest gate, or just through it once lined up.
 */
export function controlPointWaypoint(x, z) {
  const ax = Math.abs(x);
  const az = Math.abs(z);
  if (Math.max(ax, az) < WALL_INNER) return null;
  const onXSide = ax >= az; // outside the east or west wall (else north or south)
  const side = Math.sign(onXSide ? x : z) || 1;
  const along = onXSide ? z : x;
  const dist = Math.abs(along) <= GATE_LINE ? GATE_INSIDE : GATE_APPROACH;
  return onXSide ? { x: side * dist, z: 0 } : { x: 0, z: side * dist };
}

const CAPTURE_RATE = 0.2;        // fraction of the bar per second for one wizard
const CAPTURE_RATE_EXTRA = 0.08; // added per extra wizard (up to 3 count)

/** control runs from -1 (Blue holds it) to +1 (Red holds it). */
export function newControlPoint() {
  return { control: 0, points: [0, 0], contested: false };
}

export function stepControlPoint(cp, delta, blueInside, redInside) {
  cp.contested = blueInside > 0 && redInside > 0;
  if (!cp.contested && (blueInside > 0 || redInside > 0)) {
    const dir = blueInside > 0 ? -1 : 1;
    const n = Math.min(3, blueInside || redInside);
    const rate = CAPTURE_RATE + CAPTURE_RATE_EXTRA * (n - 1);
    cp.control = Math.max(-1, Math.min(1, cp.control + dir * rate * delta));
  }
  if (cp.control <= -1 && blueInside > 0 && redInside === 0) cp.points[0] += delta;
  else if (cp.control >= 1 && redInside > 0 && blueInside === 0) cp.points[1] += delta;
}

/** 'Blue 62%', 'Contested!' or 'Point neutral', given Blue/Red names. */
export function controlPointStatus(cp, names) {
  if (cp.contested) return 'Contested!';
  if (cp.control === 0) return 'Point neutral';
  return `${names[cp.control < 0 ? 0 : 1]} ${Math.round(Math.abs(cp.control) * 100)}%`;
}
