import * as THREE from 'three';
import { getGroundY, moveWithCollisions, pointInSolid } from './collision.js';

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

const _toTarget = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _strafe = new THREE.Vector3();
const _move = new THREE.Vector3();
const _probe = new THREE.Vector3();
const _stepDelta = new THREE.Vector3();
const _aim = new THREE.Vector3();

// Samples the shot path against the same solids fireballs collide with
function hasLineOfSight(from, to, colliders) {
  if (!colliders) return true;
  const steps = Math.ceil(from.distanceTo(to) / 0.4);
  for (let i = 1; i < steps; i++) {
    if (pointInSolid(_probe.lerpVectors(from, to, i / steps), colliders)) return false;
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
    this._blocked = false;
    this._blockedFor = 0;
    // Height the bot is really standing at; its visible y eases up toward this, so stairs are judged against it
    this._supportY = player.position.y;
  }

  update(delta, target) {
    if (!target) return null;

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
        this._detourTimer = 0.9;
        this._detourDir = Math.random() > 0.5 ? 1 : -1;
        this._blockedFor = 0;
      }
    } else {
      this._blockedFor = 0;
    }

    // Frozen by a Frost Nova: no walking (the bot still turns to face you and settles on the floor)
    if (this.player.freezeTimer > 0) _move.set(0, 0, 0);
    if (_move.lengthSq() > 0.0001) {
      if (this._detourTimer > 0) {
        this._detourTimer -= delta;
        _move.set(-_forward.z, 0, _forward.x).multiplyScalar(this._detourDir).addScaledVector(_forward, 0.35);
      }
      _move.normalize();
      _stepDelta.copy(_move).multiplyScalar(BOT_MOVE_SPEED * delta);
      moveWithCollisions(this.player.position, _stepDelta, this.colliders, Math.max(this.player.position.y, this._supportY));

      // Pinned against cover: collision push-out makes the bot jitter in place, so judge
      // progress over a short window and sidestep around the obstacle when it stalls
      this._windowTime += delta;
      if (this._windowTime >= 0.5) {
        const net = Math.hypot(this.player.position.x - this._windowStart.x, this.player.position.z - this._windowStart.z);
        if (this._detourTimer <= 0 && net < BOT_MOVE_SPEED * this._windowTime * 0.25) {
          this._detourTimer = 0.9;
          this._detourDir = Math.random() > 0.5 ? 1 : -1;
        }
        this._windowStart.copy(this.player.position);
        this._windowTime = 0;
      }
    }

    const targetY = getGroundY(this.player.position.x, this.player.position.z, this.player.position.y, this.colliders, Math.max(this.player.position.y, this._supportY));
    this._supportY = targetY;
    const maxStep = BOT_CLIMB_SPEED * delta;
    this.player.position.y += clamp(targetY - this.player.position.y, -maxStep, maxStep);

    if (this.player.slowTimer > 0 || this.player.silenceTimer > 0) return null;
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
