import * as THREE from 'three';

const SPEED     = 22;
const LIFETIME  = 2.4;
const HIT_DIST  = 1.1;
const MAX_COUNT = 40;

export const SPELL_CONFIG = {
  fire:      { damage: 15, outerColor: 0xff4400, coreColor: 0xffaa00 },
  ice:       { damage: 20, outerColor: 0x44aaff, coreColor: 0xaaddff },
  lightning: { damage: 20, outerColor: 0xffee00, coreColor: 0xffffff },
  air:       { damage: 20, outerColor: 0x99eeff, coreColor: 0xffffff },
  earth:     { damage: 18, outerColor: 0x8b5e14, coreColor: 0x4a7c3f },
};

const _geo     = new THREE.SphereGeometry(0.22, 7, 7);
const _coreGeo = new THREE.SphereGeometry(0.1,  5, 5);

export class FireballManager {
  constructor(scene) {
    this.scene     = scene;
    this.fireballs = [];
  }

  spawn(position, direction, ownerId, spell = 'fire') {
    if (this.fireballs.length >= MAX_COUNT) this._remove(0);

    const cfg  = SPELL_CONFIG[spell] ?? SPELL_CONFIG.fire;
    const mesh = new THREE.Mesh(_geo, new THREE.MeshBasicMaterial({ color: cfg.outerColor }));
    mesh.position.copy(position);

    const core = new THREE.Mesh(_coreGeo, new THREE.MeshBasicMaterial({ color: cfg.coreColor }));
    mesh.add(core);
    this.scene.add(mesh);

    this.fireballs.push({ mesh, dir: direction.clone().normalize(), ownerId, lifetime: LIFETIME, spell, cfg });
  }

  update(delta, targets, localActorId, onHit, colliders) {
    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i];
      fb.lifetime -= delta;
      if (fb.lifetime <= 0) { this._remove(i); continue; }

      // Animate colour per spell type
      const t = 0.5 + 0.5 * Math.sin(fb.lifetime * 30);
      if (fb.spell === 'fire') {
        fb.mesh.material.color.setRGB(1, 0.27 + 0.27 * t, 0);
      } else if (fb.spell === 'ice') {
        fb.mesh.material.color.setRGB(0.27, 0.67 + 0.13 * t, 1);
      } else if (fb.spell === 'lightning') {
        fb.mesh.material.color.setRGB(1, 0.93 + 0.07 * t, t * 0.5);
      } else if (fb.spell === 'air') {
        fb.mesh.material.color.setRGB(0.6 + 0.3 * t, 0.9 + 0.1 * t, 1);
        fb.mesh.scale.setScalar(1 + 0.15 * Math.sin(fb.lifetime * 18));
      } else if (fb.spell === 'earth') {
        fb.mesh.material.color.setRGB(0.54 + 0.1 * t, 0.36 + 0.08 * t, 0.08);
      }

      fb.mesh.position.addScaledVector(fb.dir, SPEED * delta);
      const p = fb.mesh.position;

      // ── World collision ────────────────────────────────────────────────────
      if (colliders) {
        // Arena walls
        if (Math.abs(p.x) >= colliders.arenaSize - 0.4 ||
            Math.abs(p.z) >= colliders.arenaSize - 0.4) {
          this._remove(i); continue;
        }
        // Tree trunks (cylinder check in XZ plane)
        let hitTree = false;
        for (const tree of colliders.trees) {
          const dx = p.x - tree.x, dz = p.z - tree.z;
          if (dx * dx + dz * dz < tree.radius * tree.radius) { hitTree = true; break; }
        }
        if (hitTree) { this._remove(i); continue; }
      }

      if (fb.ownerId !== localActorId) continue;
      for (const [id, player] of targets) {
        if (id === fb.ownerId) continue;
        if (fb.mesh.position.distanceTo(player.position) < HIT_DIST) {
          onHit(fb.ownerId, id, fb.cfg.damage, fb.spell, fb.dir);
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
