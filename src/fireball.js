import * as THREE from 'three';

const SPEED     = 22;
const LIFETIME  = 2.4;
const HIT_DIST  = 1.1;
const MAX_COUNT = 40;

const PARTICLE_COUNT = 1500;
const FLASH_COUNT    = 8;
const IMPACT_SPARKS  = 22;

export const SPELL_CONFIG = {
  fire:      { damage: 15 },
  ice:       { damage: 20 },
  lightning: { damage: 20 },
  air:       { damage: 20 },
  earth:     { damage: 18 },
};

// Per-spell look: glow colour/size, trail colours, trail rate and how the trail particles move
const SPELL_VFX = {
  fire:      { glow: 0xff5a1a, glowSize: 1.0,  trail: [0xff6a10, 0xffc04a], streak: 0xff7a1a, rate: 90, life: 0.35, drift: 0.6,  rise: 0.6 },
  ice:       { glow: 0x3aa6ff, glowSize: 0.85, trail: [0x9fdcff, 0x3aa6ff], streak: 0x7fd0ff, rate: 70, life: 0.45, drift: 0.25, rise: 0 },
  lightning: { glow: 0xffe23a, glowSize: 1.1,  trail: [0xfff6b0, 0xffd400], streak: 0xffe866, rate: 60, life: 0.2,  drift: 1.6,  rise: 0 },
  air:       { glow: 0x7fe3ff, glowSize: 0.9,  trail: [0xd6f7ff, 0x6fd8f5], streak: 0xaef0ff, rate: 60, life: 0.4,  drift: 1.1,  rise: 0.2 },
  earth:     { glow: 0x9a6a30, glowSize: 0.6,  trail: [0x8a6436, 0x5d4126], streak: 0x8a6436, rate: 55, life: 0.5,  drift: 0.35, rise: -1.2 },
};

const _forward = new THREE.Vector3(0, 0, 1);
const _color = new THREE.Color();

function makeGlowTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

// Normal alpha blending: additive washes out to white against the bright sky
function translucent(params) {
  return { transparent: true, depthWrite: false, ...params };
}

// A jagged closed loop around the bolt's axis; a few variants are swapped each frame to make it crackle
function makeBoltGeometry() {
  const pts = [];
  const segments = 9;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const r0 = 0.22 + Math.random() * 0.22;
    const r1 = 0.22 + Math.random() * 0.22;
    pts.push(
      new THREE.Vector3(Math.cos(a0) * r0, Math.sin(a0) * r0, (Math.random() - 0.5) * 0.5),
      new THREE.Vector3(Math.cos(a1) * r1, Math.sin(a1) * r1, (Math.random() - 0.5) * 0.5),
    );
  }
  return new THREE.BufferGeometry().setFromPoints(pts);
}

/** One draw call for every trail and impact particle; each fades out through its vertex alpha. */
class ParticlePool {
  constructor(scene, texture) {
    this.positions = new Float32Array(PARTICLE_COUNT * 3);
    this.colors = new Float32Array(PARTICLE_COUNT * 4);
    this.base = new Float32Array(PARTICLE_COUNT * 3);
    this.velocity = new Float32Array(PARTICLE_COUNT * 3);
    this.life = new Float32Array(PARTICLE_COUNT);
    this.maxLife = new Float32Array(PARTICLE_COUNT);
    this.next = 0;

    const geometry = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage);
    this.colorAttr = new THREE.BufferAttribute(this.colors, 4).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', this.posAttr);
    geometry.setAttribute('color', this.colorAttr);

    this.points = new THREE.Points(geometry, new THREE.PointsMaterial(translucent({
      size: 0.32, map: texture, vertexColors: true, sizeAttenuation: true,
    })));
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  emit(x, y, z, vx, vy, vz, hex, life) {
    const i = this.next;
    this.next = (this.next + 1) % PARTICLE_COUNT;
    const j = i * 3;
    _color.setHex(hex);
    this.positions[j] = x; this.positions[j + 1] = y; this.positions[j + 2] = z;
    this.velocity[j] = vx; this.velocity[j + 1] = vy; this.velocity[j + 2] = vz;
    this.base[j] = _color.r; this.base[j + 1] = _color.g; this.base[j + 2] = _color.b;
    this.life[i] = this.maxLife[i] = life;
  }

  update(delta) {
    const damping = Math.max(0, 1 - delta * 3);
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (this.life[i] <= 0) continue;
      const j = i * 3;
      this.life[i] -= delta;
      const fade = Math.max(0, this.life[i] / this.maxLife[i]);
      this.positions[j] += this.velocity[j] * delta;
      this.positions[j + 1] += this.velocity[j + 1] * delta;
      this.positions[j + 2] += this.velocity[j + 2] * delta;
      this.velocity[j] *= damping; this.velocity[j + 1] *= damping; this.velocity[j + 2] *= damping;
      const c = i * 4;
      this.colors[c] = this.base[j];
      this.colors[c + 1] = this.base[j + 1];
      this.colors[c + 2] = this.base[j + 2];
      this.colors[c + 3] = fade;
    }
    this.posAttr.needsUpdate = true;
    this.colorAttr.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.colors.fill(0);
    this.colorAttr.needsUpdate = true;
  }
}

export class FireballManager {
  constructor(scene) {
    this.scene     = scene;
    this.fireballs = [];

    const glowTex = makeGlowTexture();
    this.particles = new ParticlePool(scene, glowTex);

    // Shared geometry and materials: projectiles only create cheap Object3D wrappers per shot
    this.res = {
      glow: Object.fromEntries(Object.entries(SPELL_VFX).map(([spell, vfx]) => [
        spell, new THREE.SpriteMaterial(translucent({ map: glowTex, color: vfx.glow, opacity: 0.85 })),
      ])),
      streakGeo: new THREE.CylinderGeometry(0, 0.12, 1.8, 8, 1, true).translate(0, 0.9, 0).rotateX(-Math.PI / 2),
      streak: Object.fromEntries(Object.entries(SPELL_VFX).map(([spell, vfx]) => [
        spell, new THREE.MeshBasicMaterial(translucent({ color: vfx.streak, opacity: 0.5 })),
      ])),
      sphere: new THREE.SphereGeometry(1, 10, 8),
      fireCore: new THREE.MeshBasicMaterial({ color: 0xfff1c4 }),
      fireShell: new THREE.MeshBasicMaterial(translucent({ color: 0xff5a10, opacity: 0.85 })),
      shard: new THREE.OctahedronGeometry(0.16, 0),
      iceCore: new THREE.MeshBasicMaterial({ color: 0xe6f7ff }),
      iceShell: new THREE.MeshBasicMaterial(translucent({ color: 0x3aa6ff, opacity: 0.55 })),
      bolts: [makeBoltGeometry(), makeBoltGeometry(), makeBoltGeometry()],
      boltMat: new THREE.LineBasicMaterial({ color: 0xffe866 }),
      boltCore: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      ring: new THREE.TorusGeometry(0.24, 0.035, 6, 24),
      ringMat: new THREE.MeshBasicMaterial(translucent({ color: 0x9feaff, opacity: 0.85, side: THREE.DoubleSide })),
      rock: new THREE.DodecahedronGeometry(0.2, 0),
      rockMat: new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 1, flatShading: true }),
    };

    this.flashes = Array.from({ length: FLASH_COUNT }, () => {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial(translucent({ map: glowTex, opacity: 0 })));
      sprite.visible = false;
      scene.add(sprite);
      return { sprite, t: 0, duration: 0.2 };
    });
    this.nextFlash = 0;
  }

  spawn(position, direction, ownerId, spell = 'fire') {
    if (this.fireballs.length >= MAX_COUNT) this._remove(0);

    const kind = SPELL_VFX[spell] ? spell : 'fire';
    const cfg = SPELL_CONFIG[kind];
    const dir = direction.clone().normalize();

    const group = new THREE.Group();
    group.position.copy(position);
    group.quaternion.setFromUnitVectors(_forward, dir);
    const parts = this._buildBody(kind, group);

    const glow = new THREE.Sprite(this.res.glow[kind]);
    glow.scale.setScalar(SPELL_VFX[kind].glowSize);
    group.add(glow);
    group.add(new THREE.Mesh(this.res.streakGeo, this.res.streak[kind]));
    this.scene.add(group);

    this.fireballs.push({ mesh: group, glow, parts, dir, ownerId, lifetime: LIFETIME, spell: kind, cfg, emitCarry: 0 });
  }

  _buildBody(kind, group) {
    const r = this.res;
    const add = (geo, mat, scale = 1) => {
      const m = new THREE.Mesh(geo, mat);
      m.scale.setScalar(scale);
      group.add(m);
      return m;
    };
    if (kind === 'ice') {
      const core = add(r.shard, r.iceCore);
      core.scale.set(0.8, 0.8, 2.6);
      const shell = add(r.shard, r.iceShell);
      shell.scale.set(1.4, 1.4, 3.4);
      return { spin: [core, shell] };
    }
    if (kind === 'lightning') {
      add(r.sphere, r.boltCore, 0.08);
      const bolt = new THREE.LineSegments(r.bolts[0], r.boltMat);
      group.add(bolt);
      return { bolt };
    }
    if (kind === 'air') {
      add(r.sphere, r.ringMat, 0.07);
      const a = add(r.ring, r.ringMat);
      const b = add(r.ring, r.ringMat, 0.7);
      b.rotation.x = Math.PI / 2;
      return { rings: [a, b] };
    }
    if (kind === 'earth') {
      return { rock: add(r.rock, r.rockMat) };
    }
    add(r.sphere, r.fireCore, 0.1);
    return { shell: add(r.sphere, r.fireShell, 0.2) };
  }

  _animate(fb, delta) {
    const t = fb.lifetime;
    const { parts } = fb;
    if (fb.spell === 'fire') {
      parts.shell.scale.setScalar(0.2 + 0.035 * Math.sin(t * 40) + 0.02 * Math.sin(t * 67));
      fb.glow.scale.setScalar(SPELL_VFX.fire.glowSize * (0.9 + 0.12 * Math.sin(t * 31)));
    } else if (fb.spell === 'ice') {
      for (const m of parts.spin) m.rotation.z += delta * 9;
    } else if (fb.spell === 'lightning') {
      parts.bolt.geometry = this.res.bolts[Math.floor(Math.random() * this.res.bolts.length)];
      parts.bolt.rotation.z = Math.random() * Math.PI * 2;
      fb.glow.scale.setScalar(SPELL_VFX.lightning.glowSize * (0.75 + Math.random() * 0.5));
    } else if (fb.spell === 'air') {
      parts.rings[0].rotation.z += delta * 14;
      parts.rings[1].rotation.y += delta * 18;
    } else if (fb.spell === 'earth') {
      parts.rock.rotation.x += delta * 11;
      parts.rock.rotation.y += delta * 7;
    }
  }

  _emitTrail(fb, delta) {
    const vfx = SPELL_VFX[fb.spell];
    fb.emitCarry += vfx.rate * delta;
    const p = fb.mesh.position;
    while (fb.emitCarry >= 1) {
      fb.emitCarry -= 1;
      const jitter = 0.12;
      this.particles.emit(
        p.x + (Math.random() - 0.5) * jitter,
        p.y + (Math.random() - 0.5) * jitter,
        p.z + (Math.random() - 0.5) * jitter,
        -fb.dir.x * 1.5 + (Math.random() - 0.5) * vfx.drift,
        -fb.dir.y * 1.5 + (Math.random() - 0.5) * vfx.drift + vfx.rise,
        -fb.dir.z * 1.5 + (Math.random() - 0.5) * vfx.drift,
        vfx.trail[Math.random() < 0.5 ? 0 : 1],
        vfx.life * (0.7 + Math.random() * 0.6),
      );
    }
  }

  /** The impact burst on its own, for effects that aren't projectiles (ultimates). */
  burst(position, spell) {
    this._impact(position, spell);
  }

  _impact(position, spell) {
    const vfx = SPELL_VFX[spell];
    for (let i = 0; i < IMPACT_SPARKS; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 2.5 + Math.random() * 3.5;
      this.particles.emit(
        position.x, position.y, position.z,
        Math.sin(phi) * Math.cos(theta) * speed,
        Math.cos(phi) * speed + 1,
        Math.sin(phi) * Math.sin(theta) * speed,
        vfx.trail[i % 2],
        0.3 + Math.random() * 0.25,
      );
    }
    const flash = this.flashes[this.nextFlash];
    this.nextFlash = (this.nextFlash + 1) % FLASH_COUNT;
    flash.sprite.material.color.setHex(vfx.glow);
    flash.sprite.position.copy(position);
    flash.sprite.scale.setScalar(0.4);
    flash.sprite.material.opacity = 1;
    flash.sprite.visible = true;
    flash.t = 0;
  }

  _updateFlashes(delta) {
    for (const flash of this.flashes) {
      if (!flash.sprite.visible) continue;
      flash.t += delta;
      const k = flash.t / flash.duration;
      if (k >= 1) { flash.sprite.visible = false; continue; }
      flash.sprite.scale.setScalar(0.4 + 2.2 * k);
      flash.sprite.material.opacity = 1 - k;
    }
  }

  update(delta, targets, simulatedOwners, onHit, colliders) {
    this.particles.update(delta);
    this._updateFlashes(delta);

    for (let i = this.fireballs.length - 1; i >= 0; i--) {
      const fb = this.fireballs[i];
      fb.lifetime -= delta;
      if (fb.lifetime <= 0) { this._remove(i); continue; }

      fb.mesh.position.addScaledVector(fb.dir, SPEED * delta);
      this._animate(fb, delta);
      this._emitTrail(fb, delta);
      const p = fb.mesh.position;

      // ── World collision ────────────────────────────────────────────────────
      if (colliders) {
        // Arena walls
        if (Math.abs(p.x) >= colliders.arenaSize - 0.4 ||
            Math.abs(p.z) >= colliders.arenaSize - 0.4) {
          this._remove(i, true, true); continue;
        }
        // Tree trunks (cylinder check in XZ plane)
        let hitTree = false;
        for (const tree of colliders.trees) {
          if (tree.maxY !== undefined && p.y >= tree.maxY) continue;
          const dx = p.x - tree.x, dz = p.z - tree.z;
          if (dx * dx + dz * dz < tree.radius * tree.radius) { hitTree = true; break; }
        }
        if (hitTree) { this._remove(i, true, true); continue; }
        let hitBox = false;
        for (const box of colliders.boxes || []) {
          if (p.y < box.maxY && p.x > box.xMin && p.x < box.xMax && p.z > box.zMin && p.z < box.zMax) { hitBox = true; break; }
        }
        if (hitBox) { this._remove(i, true, true); continue; }
      }

      // Only the owner's client decides damage; everyone else just shows the projectile stopping on contact
      const simulated = simulatedOwners.has(fb.ownerId);
      for (const [id, player] of targets) {
        if (id === fb.ownerId) continue;
        if (p.distanceTo(player.position) < HIT_DIST) {
          if (simulated) onHit(fb.ownerId, id, fb.cfg.damage, fb.spell, fb.dir);
          this._remove(i, true);
          break;
        }
      }
    }
  }

  _remove(index, impact = false, hitSolid = false) {
    const fb = this.fireballs[index];
    if (impact) {
      // Solids are only detected once the projectile is inside them; back the burst out to the surface
      const at = hitSolid ? fb.mesh.position.clone().addScaledVector(fb.dir, -0.4) : fb.mesh.position;
      this._impact(at, fb.spell);
    }
    this.scene.remove(fb.mesh);
    this.fireballs.splice(index, 1);
  }

  clear() {
    this.fireballs.forEach(fb => this.scene.remove(fb.mesh));
    this.fireballs = [];
    this.particles.clear();
  }
}
