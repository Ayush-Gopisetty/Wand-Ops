import * as THREE from 'three';

const BOT_MOVE_SPEED = 5.8;
const BOT_STRAFE_SPEED = 0.9;
const BOT_EYE_HEIGHT = 1.5;
const BOT_FIRE_COOLDOWN_MIN = 0.9;
const BOT_FIRE_COOLDOWN_MAX = 1.45;
const BOT_DESIRED_MIN_DIST = 8;
const BOT_DESIRED_MAX_DIST = 15;
const PLAYER_RADIUS = 0.45;
const GROUND_Y = 0.75;
const BOT_CLIMB_SPEED = 6;
const PLATFORM_STEP_UP = 2;

const _toTarget = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _strafe = new THREE.Vector3();
const _move = new THREE.Vector3();
const _probe = new THREE.Vector3();

// Samples the shot path against the same solids fireballs collide with
function hasLineOfSight(from, to, colliders) {
  if (!colliders) return true;
  const steps = Math.ceil(from.distanceTo(to) / 0.4);
  for (let i = 1; i < steps; i++) {
    _probe.lerpVectors(from, to, i / steps);
    for (const box of colliders.boxes || []) {
      if (_probe.y < box.maxY && _probe.x > box.xMin && _probe.x < box.xMax && _probe.z > box.zMin && _probe.z < box.zMax) return false;
    }
    for (const tree of colliders.trees) {
      if (tree.maxY !== undefined && _probe.y >= tree.maxY) continue;
      const dx = _probe.x - tree.x, dz = _probe.z - tree.z;
      if (dx * dx + dz * dz < tree.radius * tree.radius) return false;
    }
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

    if (_move.lengthSq() > 0.0001) {
      if (this._detourTimer > 0) {
        this._detourTimer -= delta;
        _move.set(-_forward.z, 0, _forward.x).multiplyScalar(this._detourDir).addScaledVector(_forward, 0.35);
      }
      _move.normalize();
      this.player.position.addScaledVector(_move, BOT_MOVE_SPEED * delta);
      resolveCollisions(this.player.position, this.colliders);

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

    const targetY = getGroundY(this.player.position.x, this.player.position.z, this.player.position.y, this.colliders);
    const maxStep = BOT_CLIMB_SPEED * delta;
    this.player.position.y += clamp(targetY - this.player.position.y, -maxStep, maxStep);

    if (this.player.slowTimer > 0 || this.player.silenceTimer > 0) return null;
    if (dist > 18) this._blocked = false;
    if (this._cooldown > 0 || dist > 18) return null;

    const spawnPos = this.player.position.clone()
      .add(new THREE.Vector3(0, BOT_EYE_HEIGHT, 0))
      .addScaledVector(_forward, 0.65);
    this._blocked = !hasLineOfSight(spawnPos, target.position, this.colliders);
    if (this._blocked) {
      this._cooldown = 0.25;
      return null;
    }
    this._cooldown = BOT_FIRE_COOLDOWN_MIN + Math.random() * (BOT_FIRE_COOLDOWN_MAX - BOT_FIRE_COOLDOWN_MIN);

    // Aim from the eye at the target's body centre; a level shot from eye height passes overhead
    return {
      position: spawnPos,
      direction: target.position.clone().sub(spawnPos).normalize(),
      spell: 'fire',
    };
  }
}

function resolveCollisions(position, colliders) {
  if (!colliders) return;

  const bound = colliders.arenaSize - PLAYER_RADIUS;
  position.x = clamp(position.x, -bound, bound);
  position.z = clamp(position.z, -bound, bound);

  for (const tree of colliders.trees) {
    if (tree.maxY !== undefined && position.y >= tree.maxY - 0.3) continue;
    const dx = position.x - tree.x;
    const dz = position.z - tree.z;
    const distSq = dx * dx + dz * dz;
    const minDist = tree.radius + PLAYER_RADIUS;
    if (distSq < minDist * minDist && distSq > 0.0001) {
      const dist = Math.sqrt(distSq);
      const overlap = minDist - dist;
      position.x += (dx / dist) * overlap;
      position.z += (dz / dist) * overlap;
    }
  }

  for (const box of colliders.boxes || []) {
    if (position.y >= box.maxY - 0.3) continue;
    const px = position.x;
    const pz = position.z;
    if (px > box.xMin && px < box.xMax && pz > box.zMin && pz < box.zMax) {
      const dxMin = px - box.xMin;
      const dxMax = box.xMax - px;
      const dzMin = pz - box.zMin;
      const dzMax = box.zMax - pz;
      const minD = Math.min(dxMin, dxMax, dzMin, dzMax);
      if (minD === dxMin) position.x = box.xMin - PLAYER_RADIUS;
      else if (minD === dxMax) position.x = box.xMax + PLAYER_RADIUS;
      else if (minD === dzMin) position.z = box.zMin - PLAYER_RADIUS;
      else position.z = box.zMax + PLAYER_RADIUS;
    }
  }
}

function getGroundY(x, z, currentY, colliders) {
  let y = GROUND_Y;
  if (!colliders) return y;
  for (const p of colliders.platforms || []) {
    if (currentY < p.y - PLATFORM_STEP_UP) continue;
    if (x >= p.xMin && x <= p.xMax && z >= p.zMin && z <= p.zMax) y = Math.max(y, p.y);
  }
  for (const r of colliders.ramps || []) {
    if (x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax) {
      const a = r.axis === 'z' ? z : x;
      let t = (a - r.axisStart) / (r.axisEnd - r.axisStart);
      if (r.steps) t = Math.ceil(clamp(t, 0, 1) * r.steps) / r.steps;
      y = Math.max(y, r.yStart + t * (r.yEnd - r.yStart));
    }
  }
  return y;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
