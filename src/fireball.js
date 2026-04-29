import * as THREE from 'three';

const SPEED     = 22;       // units/s
const LIFETIME  = 2.4;      // seconds
const DAMAGE    = 25;
const HIT_DIST  = 1.1;      // hit-sphere radius
const MAX_COUNT = 40;

// Shared geometry + material — never recreated
const _geo = new THREE.SphereGeometry(0.22, 7, 7);
const _mat = new THREE.MeshBasicMaterial({ color: 0xff6600 });
const _coreMat = new THREE.MeshBasicMaterial({ color: 0xffee00 });
const _coreGeo = new THREE.SphereGeometry(0.1, 5, 5);

export class FireballManager {
  constructor(scene) {
    this.scene     = scene;
    this.fireballs = [];   // { mesh, glow, dir, ownerId, lifetime }
  }

  /**
   * Spawn a fireball.
   * @param {THREE.Vector3} position  World-space origin
   * @param {THREE.Vector3} direction Normalised direction
   * @param {number}        ownerId   Actor number of shooter
   */
  spawn(position, direction, ownerId) {
    // Pool: remove oldest when full
    if (this.fireballs.length >= MAX_COUNT) this._remove(0);

    const mesh = new THREE.Mesh(_geo, _mat.clone()); // clone mat for per-fireball state
    mesh.position.copy(position);

    // Bright inner core
    const core = new THREE.Mesh(_coreGeo, _coreMat);
    mesh.add(core);

    this.scene.add(mesh);

    this.fireballs.push({
      mesh,
      dir: direction.clone().normalize(),
      ownerId,
      lifetime: LIFETIME,
    });
  }

  /**
   * Update all fireballs and check hits.
   * @param {number}  delta          Seconds since last frame
   * @param {Map}     targets        Map<actorNr, Player> — players to check hits against
   * @param {number}  localActorId   Local actor's ID
   * @param {Function} onHit         (ownerId, targetId, damage) → void
   */
  update(delta, targets, localActorId, onHit) {
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i];
      fb.lifetime -= delta;

      if (fb.lifetime <= 0) { this._remove(i); continue; }

      // Animate colour (flicker orange → yellow)
      const flicker = 0.5 + 0.5 * Math.sin(fb.lifetime * 30);
      fb.mesh.material.color.setRGB(1, 0.35 + 0.35 * flicker, 0);

      // Move
      fb.mesh.position.addScaledVector(fb.dir, SPEED * delta);

      // Hit detection (only for fireballs owned by the local player —
      // remote-owned hits are resolved on the shooter's client)
      if (fb.ownerId !== localActorId) continue;

      for (const [id, player] of targets) {
        if (id === fb.ownerId) continue;
        if (fb.mesh.position.distanceTo(player.position) < HIT_DIST) {
          onHit(fb.ownerId, id, DAMAGE);
          this._remove(i);
          break;
        }
      }
    }
  }

  _remove(index) {
    this.scene.remove(this.fireballs[index].mesh);
    this.fireballs.splice(index, 1);
  }

  clear() {
    this.fireballs.forEach(fb => this.scene.remove(fb.mesh));
    this.fireballs = [];
  }
}
