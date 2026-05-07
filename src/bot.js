import * as THREE from 'three';

const BOT_MOVE_SPEED = 5.8;
const BOT_STRAFE_SPEED = 0.9;
const BOT_EYE_HEIGHT = 1.5;
const BOT_FIRE_COOLDOWN_MIN = 0.9;
const BOT_FIRE_COOLDOWN_MAX = 1.45;
const BOT_DESIRED_MIN_DIST = 8;
const BOT_DESIRED_MAX_DIST = 15;
const PLAYER_RADIUS = 0.45;

const _toTarget = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _strafe = new THREE.Vector3();
const _move = new THREE.Vector3();

export class SimpleBotController {
  constructor(player, colliders) {
    this.player = player;
    this.colliders = colliders;
    this._cooldown = 0.8;
    this._strafeDir = Math.random() > 0.5 ? 1 : -1;
    this._strafeTimer = 1.8;
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

    if (dist > BOT_DESIRED_MAX_DIST) {
      _move.addScaledVector(_forward, 1.05);
    } else if (dist < BOT_DESIRED_MIN_DIST) {
      _move.addScaledVector(_forward, -0.9);
    }

    if (_move.lengthSq() > 0.0001) {
      _move.normalize();
      this.player.position.addScaledVector(_move, BOT_MOVE_SPEED * delta);
      resolveGroundCollision(this.player.position, this.colliders);
    }

    if (this.player.slowTimer > 0 || this.player.silenceTimer > 0) return null;
    if (this._cooldown > 0 || dist > 18) return null;

    this._cooldown = BOT_FIRE_COOLDOWN_MIN + Math.random() * (BOT_FIRE_COOLDOWN_MAX - BOT_FIRE_COOLDOWN_MIN);
    const spawnPos = this.player.position.clone()
      .add(new THREE.Vector3(0, BOT_EYE_HEIGHT, 0))
      .addScaledVector(_forward, 0.65);

    return {
      position: spawnPos,
      direction: _forward.clone(),
      spell: 'fire',
    };
  }
}

function resolveGroundCollision(position, colliders) {
  if (!colliders) return;

  const bound = colliders.arenaSize - PLAYER_RADIUS;
  position.x = clamp(position.x, -bound, bound);
  position.z = clamp(position.z, -bound, bound);

  for (const tree of colliders.trees) {
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
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
