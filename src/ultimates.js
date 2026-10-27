import * as THREE from 'three';

/**
 * Ultimate abilities: one per spell, unlocked by filling the ultimate meter.
 * Gameplay (who gets hit) is decided in main.js on the caster's client, like regular spells;
 * this module holds the tuning and the visuals every client plays.
 */
export const ULTIMATES = {
  fire:      { name: 'Meteor',          icon: '☄️', damage: 45, radius: 5, delay: 1, range: 45 },
  ice:       { name: 'Frost Nova',      icon: '❄️', damage: 20, radius: 8 },
  lightning: { name: 'Chain Lightning', icon: '⚡', damage: 30, range: 35, jump: 10, maxTargets: 3, cone: 0.95 },
  air:       { name: 'Cyclone',         icon: '🌪️', damage: 15, radius: 7, launch: 15 },
  earth:     { name: 'Stone Wall',      icon: '🪨', width: 7, depth: 0.9, height: 3.2, distance: 3.5, duration: 6 },
};

// Meter fill: dealing 300 damage fills it, a kill adds a chunk, and taking hits fills it slowly
export const ULT_CHARGE = { perDamage: 1 / 300, perKill: 0.15, perDamageTaken: 0.3 / 300 };

export const ULT_MAX_DAMAGE = Math.max(...Object.values(ULTIMATES).map((u) => u.damage || 0));

function dispose(object) {
  object.traverse((o) => {
    o.geometry?.dispose();
    // Shared materials (the castle stone) belong to the scene, not the effect
    if (o.material && !o.userData.sharedMaterial) [].concat(o.material).forEach((m) => m.dispose());
  });
}

const _up = new THREE.Vector3(0, 1, 0);
const _segDir = new THREE.Vector3();
const _jitter = new THREE.Vector3();

const glowMaterial = (color, opacity = 0.9) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
});

export class UltimateFx {
  constructor(scene, stoneMaterial) {
    this.scene = scene;
    this.stoneMaterial = stoneMaterial;
    this.effects = [];
  }

  /** `tick(t, delta)` runs every frame with t going 0 → 1 over `life`; `onEnd` runs once when it finishes. */
  _add(object, life, tick, onEnd) {
    this.scene.add(object);
    this.effects.push({ object, life, age: 0, tick, onEnd });
  }

  update(delta) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.age += delta;
      e.tick?.(Math.min(1, e.age / e.life), delta);
      if (e.age < e.life) continue;
      this.scene.remove(e.object);
      dispose(e.object);
      this.effects.splice(i, 1);
      e.onEnd?.();
    }
  }

  /** A flat shockwave ring expanding across the ground. */
  shockwave(center, radius, color, life = 0.6) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 64), glowMaterial(color));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(center.x, center.y + 0.08, center.z);
    this._add(ring, life, (t) => {
      ring.scale.setScalar(0.4 + t * radius);
      ring.material.opacity = 0.9 * (1 - t);
    });
  }

  nova(center, radius) {
    this.shockwave(center, radius, 0x9fe3ff, 0.55);
    this.shockwave(center, radius * 0.7, 0xe8fbff, 0.4);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), glowMaterial(0xbdeeff, 0.35));
    dome.position.set(center.x, center.y, center.z);
    this._add(dome, 0.5, (t) => {
      dome.scale.setScalar(0.5 + t * radius);
      dome.material.opacity = 0.35 * (1 - t);
    });
  }

  /** Warning circle on the ground, then a burning rock falls onto it; `onImpact` fires as it lands. */
  meteor(point, delay, radius, onImpact) {
    const warn = new THREE.Mesh(new THREE.RingGeometry(radius * 0.9, radius, 64), glowMaterial(0xff5a1a, 0.7));
    warn.rotation.x = -Math.PI / 2;
    warn.position.set(point.x, point.y + 0.06, point.z);
    this._add(warn, delay, (t) => {
      warn.material.opacity = 0.35 + 0.45 * Math.abs(Math.sin(t * Math.PI * 6));
    });

    const rock = new THREE.Group();
    rock.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 0), new THREE.MeshBasicMaterial({ color: 0x5a2410 })));
    rock.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 1), glowMaterial(0xff7a1a, 0.45)));
    const start = new THREE.Vector3(point.x + 6, point.y + 34, point.z + 4);
    rock.position.copy(start);
    this._add(rock, delay, (t, delta) => {
      rock.position.lerpVectors(start, point, t * t);
      rock.rotation.x += 12 * delta;
      rock.rotation.y += 8 * delta;
    }, () => {
      this.shockwave(point, radius, 0xff7a1a, 0.5);
      this.shockwave(point, radius * 0.6, 0xffd27a, 0.35);
      onImpact?.();
    });
  }

  /**
   * Crackling bolt through `points` (caster first), re-jittered every frame. Built from thin
   * cylinders rather than a line: WebGL draws lines one pixel wide, which barely shows.
   */
  chain(points) {
    const segs = 7;
    const corners = [];
    for (let i = 0; i < points.length - 1; i++) {
      for (let s = 0; s < segs; s++) corners.push({ a: points[i], b: points[i + 1], f: s / segs, still: s === 0 });
    }
    corners.push({ a: points[points.length - 1], b: points[points.length - 1], f: 0, still: true });
    const coreMat = glowMaterial(0xffffff, 1);
    const glowMat = glowMaterial(0xffe14a, 0.45);
    const rod = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true);
    const group = new THREE.Group();
    const pieces = corners.slice(1).map(() => {
      const core = new THREE.Mesh(rod, coreMat);
      const glow = new THREE.Mesh(rod, glowMat);
      group.add(core, glow);
      return { core, glow };
    });
    const pts = corners.map(() => new THREE.Vector3());
    const jitter = () => {
      corners.forEach((c, i) => {
        pts[i].lerpVectors(c.a, c.b, c.f);
        if (!c.still) pts[i].add(_jitter.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5));
      });
      pieces.forEach(({ core, glow }, i) => {
        const from = pts[i], to = pts[i + 1];
        _segDir.subVectors(to, from);
        const len = _segDir.length() || 0.001;
        _segDir.divideScalar(len);
        core.position.addVectors(from, to).multiplyScalar(0.5);
        core.quaternion.setFromUnitVectors(_up, _segDir);
        core.scale.set(0.035, len, 0.035);
        glow.position.copy(core.position);
        glow.quaternion.copy(core.quaternion);
        glow.scale.set(0.13, len, 0.13);
      });
    };
    jitter();
    this._add(group, 0.45, (t) => {
      jitter();
      coreMat.opacity = 1 - t * t;
      glowMat.opacity = 0.45 * (1 - t);
    });
    for (const p of points.slice(1)) this.shockwave({ x: p.x, y: p.y - 1, z: p.z }, 1.6, 0xfff27a, 0.35);
  }

  cyclone(center, radius) {
    const group = new THREE.Group();
    group.position.set(center.x, center.y - 0.7, center.z);
    for (let i = 0; i < 4; i++) {
      const torus = new THREE.Mesh(new THREE.TorusGeometry(1 + i * 0.45, 0.06, 6, 40), glowMaterial(0xc8f6ff, 0.7));
      torus.rotation.x = Math.PI / 2;
      torus.position.y = i * 0.9;
      group.add(torus);
    }
    this._add(group, 0.8, (t, delta) => {
      group.rotation.y += 21 * delta;
      group.scale.set(1 + t * 1.5, 1 + t * 2, 1 + t * 1.5);
      group.children.forEach((c) => { c.material.opacity = 0.7 * (1 - t); });
    });
    this.shockwave(center, radius, 0x9fefff, 0.45);
  }

  /**
   * A stone slab that rises out of the ground, stands for `duration` seconds, then sinks.
   * `onRisen` fires once it's fully up, `onSinking` as it starts going down, `onEnd` when it's gone.
   */
  wall(box, floorY, height, duration, { onRisen, onSinking, onEnd } = {}) {
    const w = box.xMax - box.xMin;
    const d = box.zMax - box.zMin;
    // Same stone as the castle walls, so it reads as part of the arena
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, height, d), this.stoneMaterial);
    slab.userData.sharedMaterial = true;
    const x = (box.xMin + box.xMax) / 2;
    const z = (box.zMin + box.zMax) / 2;
    const up = floorY + height / 2;
    const rise = 0.25 / duration;
    const sink = 1 - 0.4 / duration;
    slab.position.set(x, up - height, z);
    let phase = 'rising';
    this._add(slab, duration, (t) => {
      const k = t < rise ? t / rise : t > sink ? 1 - (t - sink) / (1 - sink) : 1;
      slab.position.y = up - height * (1 - k);
      if (phase === 'rising' && t >= rise) { phase = 'up'; onRisen?.(); }
      if (phase === 'up' && t > sink) { phase = 'sinking'; onSinking?.(); }
    }, onEnd);
    this.shockwave({ x, y: floorY + 0.7, z }, 4, 0xb08a5a, 0.4);
  }
}
