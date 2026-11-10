/**
 * Control point mode rules (pure logic, no DOM or network). One zone in the courtyard: a team standing
 * alone in it pushes the capture bar its way, rivals in the zone freeze the bar, and a team that fully
 * holds the point earns a point per second. The bot host runs this and the others mirror it.
 */
export const CONTROL_POINT = { x: 0, z: 0, radius: 7 }; // the courtyard around the fountain
export const CP_POINTS_TO_WIN = 100;

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
  if (cp.control <= -1) cp.points[0] += delta;
  else if (cp.control >= 1) cp.points[1] += delta;
}

/** 'Blue 62%', 'Contested!' or 'Point neutral', given Blue/Red names. */
export function controlPointStatus(cp, names) {
  if (cp.contested) return 'Contested!';
  if (cp.control === 0) return 'Point neutral';
  return `${names[cp.control < 0 ? 0 : 1]} ${Math.round(Math.abs(cp.control) * 100)}%`;
}
