import * as THREE from 'three';
import { getGroundY, moveWithCollisions, pointInSolid } from './collision.js';
import { PICKUP_RADIUS } from './pickups.js';

const BOT_MOVE_SPEED = 5.8;
const BOT_STRAFE_SPEED = 0.9;
const BOT_EYE_HEIGHT = 1.5;
const BOT_FIRE_COOLDOWN_MIN = 0.9;
const BOT_FIRE_COOLDOWN_MAX = 1.45;
const BOT_DESIRED_MIN_DIST = 8;
const BOT_DESIRED_MAX_DIST = 15;
const BOT_CLIMB_SPEED = 6;
// A target crouched behind low cover still shows its head; fireballs hit within 1.1 of the body centre
const BOT_HEAD_AIM = 0.7;
// Shot still blocked this long at close range: stop strafing in place and step around the cover
const BOT_BLOCKED_REPOSITION = 0.75;
// Walking to a potion: aim well inside the pickup radius so the bot actually lands on it
const BOT_SEEK_STOP = PICKUP_RADIUS * 0.4;
// Holding the control point (anchor = { x, z, radius }): when idle, settle near the middle; when
// fighting, head back once this close to the ring's edge, so strafing never carries the bot out of it
const BOT_ANCHOR_IDLE_FRACTION = 0.55; // clear of the fountain basin in the middle
const BOT_ANCHOR_FIGHT_MARGIN = 2;
// Only break off a fight for a potion when the enemy is at least this far away
const BOT_SEEK_FIGHT_DIST = 7;
const BOT_DETOUR_SECONDS = 0.9;
const BOT_WAYPOINT_STOP = 0.8;

const _toTarget = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _strafe = new THREE.Vector3();
const _move = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _stepDelta = new THREE.Vector3();
const _aim = new THREE.Vector3();
const _goal = new THREE.Vector3();
const _intended = new THREE.Vector3();

// Samples the shot path against the same solids fireballs collide with
function hasLineOfSight(from, to, colliders) {
  if (!colliders) return true;
  const steps = Math.ceil(from.distanceTo(to) / 0.4);
  for (let i = 1; i < steps; i++) {
    if (pointInSolid(_probe.lerpVectors(from, to, i / steps), colliders)) return false;
  }
  return true;
}

/**
 * True when a bot could walk straight from `from` to (x, z) on its own floor: nothing solid on the way
 * at body height. Used to skip potions behind walls, which a bot would only walk into.
 */
export function hasClearWalk(from, x, z, colliders) {
  if (!colliders) return true;
  const steps = Math.ceil(Math.hypot(x - from.x, z - from.z) / 0.5);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (pointInSolid(_probe.set(from.x + (x - from.x) * t, from.y, from.z + (z - from.z) * t), colliders)) return false;
  }
  return true;
}

export class SimpleBotController {
  constructor(player, colliders) {
    this.player = player;
    this.colliders = colliders;
    this._cooldown = 0.8;
    this._strafeDir = Math.random() > 0.5 ? 1 : -1;
    this._strafeTimer = 1.8;
    this._windowStart = player.position.clone();
    this._windowTime = 0;
    this._detourTimer = 0;
    this._detourDir = 1;
    this._detourAxis = new THREE.Vector3(0, 0, -1); // the direction the detour steps around
    this._blocked = false;
    this._blockedFor = 0;
    this.anchor = null;
    this.anchorVia = null; // a waypoint (e.g. a gate) on the way to the anchor, when it can't walk straight there
    this.seek = null;
    // Height the bot is really standing at; its visible y eases up toward this, so stairs are judged against it
    this._supportY = player.position.y;
  }

  /**
   * Sets _goal to the unit direction toward `point` and returns true, or returns false once the bot is
   * within `stop` of it.
   */
  _towards(point, stop) {
    const dx = point.x - this.player.position.x;
    const dz = point.z - this.player.position.z;
    const d = Math.hypot(dx, dz);
    if (d <= stop) return false;
    _goal.set(dx / d, 0, dz / d);
    return true;
  }

  // Sets _goal toward the control point (through its waypoint first), or returns false once there
  _towardsAnchor(fighting) {
    if (this.anchorVia) return this._towards(this.anchorVia, BOT_WAYPOINT_STOP);
    const r = this.anchor.radius;
    return this._towards(this.anchor, fighting ? r - BOT_ANCHOR_FIGHT_MARGIN : r * BOT_ANCHOR_IDLE_FRACTION);
  }

  _startDetour(axis) {
    this._detourTimer = BOT_DETOUR_SECONDS;
    this._detourDir = Math.random() > 0.5 ? 1 : -1;
    this._detourAxis.copy(axis).setY(0).normalize();
  }

  /**
   * Walks one step along _move. While a detour runs, steps sideways around the detour axis instead.
   * Progress is judged over a short window (collision push-out makes a pinned bot jitter in place), and
   * a stall starts a detour around the direction the bot was trying to go.
   */
  _moveAlong(delta) {
    _intended.copy(_move).normalize();
    if (this._detourTimer > 0) {
      this._detourTimer -= delta;
      const a = this._detourAxis;
      _move.set(-a.z, 0, a.x).multiplyScalar(this._detourDir).addScaledVector(a, 0.35);
    }
    _move.normalize();
    _stepDelta.copy(_move).multiplyScalar(BOT_MOVE_SPEED * delta);
    moveWithCollisions(this.player.position, _stepDelta, this.colliders, Math.max(this.player.position.y, this._supportY));

    this._windowTime += delta;
    if (this._windowTime >= 0.5) {
      const net = Math.hypot(this.player.position.x - this._windowStart.x, this.player.position.z - this._windowStart.z);
      if (this._detourTimer <= 0 && net < BOT_MOVE_SPEED * this._windowTime * 0.25) this._startDetour(_intended);
      this._windowStart.copy(this.player.position);
      this._windowTime = 0;
    }
  }

  _resetProgressWindow() {
    this._windowStart.copy(this.player.position);
    this._windowTime = 0;
  }

  _settleHeight(delta) {
    const targetY = getGroundY(this.player.position.x, this.player.position.z, this.player.position.y, this.colliders, Math.max(this.player.position.y, this._supportY));
    this._supportY = targetY;
    const maxStep = BOT_CLIMB_SPEED * delta;
    this.player.position.y += clamp(targetY - this.player.position.y, -maxStep, maxStep);
  }

  update(delta, target) {
    // `seek` is a potion the bot wants; `anchor` is the control point it holds (both are {x, z} or null)
    if (!target) {
      const going = this.player.freezeTimer <= 0 && (this.seek
        ? this._towards(this.seek, BOT_SEEK_STOP)
        : this.anchor && this._towardsAnchor(false));
      if (going) {
        _move.copy(_goal);
        this._moveAlong(delta);
        this.player.rotation = Math.atan2(-_move.x, -_move.z);
      } else {
        this._resetProgressWindow(); // standing still on purpose is not a stall
      }
      this._settleHeight(delta);
      return null;
    }

    this._cooldown -= delta;
    this._strafeTimer -= delta;
    if (this._strafeTimer <= 0) {
      this._strafeDir *= -1;
      this._strafeTimer = 1.6 + Math.random() * 1.4;
    }

    _toTarget.subVectors(target.position, this.player.position);
    const dist = _toTarget.length();
    if (dist > 0.001) _toTarget.multiplyScalar(1 / dist);

    this.player.rotation = Math.atan2(-_toTarget.x, -_toTarget.z);

    _forward.copy(_toTarget);
    _strafe.set(-_forward.z, 0, _forward.x).multiplyScalar(this._strafeDir * BOT_STRAFE_SPEED);
    _move.copy(_strafe);

    // Keep closing in while cover blocks the shot instead of idling at preferred range
    if (dist > BOT_DESIRED_MAX_DIST || (this._blocked && dist > BOT_DESIRED_MIN_DIST)) {
      _move.addScaledVector(_forward, 1.05);
    } else if (dist < BOT_DESIRED_MIN_DIST) {
      _move.addScaledVector(_forward, -0.9);
    }

    // Strafing alone rarely clears low cover at close range, so after a moment sidestep around it
    if (this._blocked && dist <= BOT_DESIRED_MIN_DIST + 1) {
      this._blockedFor += delta;
      if (this._blockedFor > BOT_BLOCKED_REPOSITION && this._detourTimer <= 0) {
        this._startDetour(_forward); // step around the cover between us and the enemy
        this._blockedFor = 0;
      }
    } else {
      this._blockedFor = 0;
    }

    // A potion (when the enemy isn't close) or the control point overrides the fighting footwork:
    // the bot walks there and still shoots on the way. On the point it fights freely until it nears the edge.
    if (this.seek && dist > BOT_SEEK_FIGHT_DIST) {
      if (this._towards(this.seek, BOT_SEEK_STOP)) _move.copy(_goal);
    } else if (this.anchor) {
      if (this._towardsAnchor(true)) _move.copy(_goal);
    }

    // Frozen by a Frost Nova: no walking (the bot still turns to face you and settles on the floor)
    if (this.player.freezeTimer > 0) _move.set(0, 0, 0);
    if (_move.lengthSq() > 0.0001) this._moveAlong(delta);
    else this._resetProgressWindow();

    this._settleHeight(delta);

    if (this.player.slowTimer > 0 || this.player.silenceTimer > 0) {
      // No sight check runs while it can't shoot, so don't keep acting on the last one
      this._blocked = false;
      return null;
    }
    if (dist > 18) this._blocked = false;
    if (this._cooldown > 0 || dist > 18) return null;

    const spawnPos = this.player.position.clone()
      .add(new THREE.Vector3(0, BOT_EYE_HEIGHT, 0))
      .addScaledVector(_forward, 0.65);
    // Aim at the body; if low cover hides it, try the head poking over the top
    _aim.copy(target.position);
    this._blocked = !hasLineOfSight(spawnPos, _aim, this.colliders);
    if (this._blocked) {
      _aim.y += BOT_HEAD_AIM;
      this._blocked = !hasLineOfSight(spawnPos, _aim, this.colliders);
    }
    if (this._blocked) {
      this._cooldown = 0.25;
      return null;
    }
    this._cooldown = BOT_FIRE_COOLDOWN_MIN + Math.random() * (BOT_FIRE_COOLDOWN_MAX - BOT_FIRE_COOLDOWN_MIN);

    // Aim from the eye at the clear point (body centre, or head over cover); a level shot from eye height passes overhead
    return {
      position: spawnPos,
      direction: _aim.clone().sub(spawnPos).normalize(),
      spell: 'fire',
    };
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
