import * as THREE from 'three';

const ARENA_HALF = 39;
const LERP_SPEED = 0.18; // remote player interpolation

// Palette for remote wizards (cycles by actor number)
const PLAYER_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x1abc9c, 0xe91e63, 0xff6b35];

export function remoteColor(actorNr) {
  return PLAYER_COLORS[actorNr % PLAYER_COLORS.length];
}

export class Player {
  constructor(scene, isLocal = false, color = 0x9b59b6) {
    this.scene   = scene;
    this.isLocal = isLocal;
    this.id      = null;
    this.health  = 100;

    this.position = new THREE.Vector3(
      (Math.random() - 0.5) * 24,
      0.75,
      (Math.random() - 0.5) * 24
    );
    this.velocity = new THREE.Vector3();
    this.rotation = 0; // Y-axis yaw

    // Interpolation targets (remote players only)
    this.targetPosition = this.position.clone();
    this.targetRotation = 0;

    // Hit-flash state
    this.hitFlashTimer = 0;
    this._bodyColor    = color;

    this._buildMesh(color);
    scene.add(this.group);
  }

  _buildMesh(color) {
    this.group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.85, 1.4, 0.85);
    this._bodyMat = new THREE.MeshStandardMaterial({ color });
    this.bodyMesh = new THREE.Mesh(bodyGeo, this._bodyMat);
    this.group.add(this.bodyMesh);

    // Robe trim (slightly wider, lower half)
    const trimGeo = new THREE.BoxGeometry(0.95, 0.6, 0.95);
    const trimMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.4) });
    const trim = new THREE.Mesh(trimGeo, trimMat);
    trim.position.y = -0.42;
    this.group.add(trim);

    // Wizard hat
    const hatGeo = new THREE.ConeGeometry(0.38, 0.82, 8);
    const hatMat = new THREE.MeshStandardMaterial({ color: 0x1a0033 });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 1.11;
    this.group.add(hat);

    // Hat brim
    const brimGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.08, 12);
    const brim = new THREE.Mesh(brimGeo, hatMat);
    brim.position.y = 0.74;
    this.group.add(brim);

    // Eyes
    const eyeGeo = new THREE.SphereGeometry(0.07, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-0.22, 0.22].forEach(x => {
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(x, 0.18, 0.44);
      this.group.add(eye);
    });

    // Wand (small stick on right side)
    const wandGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
    const wandMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
    const wand = new THREE.Mesh(wandGeo, wandMat);
    wand.rotation.z = Math.PI / 6;
    wand.position.set(0.56, 0.1, 0.0);
    this.group.add(wand);

    // Name-tag placeholder position (unused but group exists)
    this.group.position.copy(this.position);
  }

  update(delta) {
    if (this.isLocal) {
      this.position.x = clamp(this.position.x, -ARENA_HALF, ARENA_HALF);
      this.position.z = clamp(this.position.z, -ARENA_HALF, ARENA_HALF);
      this.position.y = 0.75;
    } else {
      // Smooth remote interpolation
      this.position.lerp(this.targetPosition, LERP_SPEED);
      this.rotation += (this.targetRotation - this.rotation) * LERP_SPEED;
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotation;

    // Hit flash
    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= delta;
      this._bodyMat.color.setHex(this.hitFlashTimer > 0 ? 0xff2222 : this._bodyColor);
      if (this.hitFlashTimer <= 0) {
        this._bodyMat.color.setHex(this._bodyColor);
      }
    }
  }

  /** Returns true when dead. */
  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hitFlashTimer = 0.28;
    return this.health <= 0;
  }

  respawn() {
    this.health = 100;
    this.position.set(
      (Math.random() - 0.5) * 24,
      0.75,
      (Math.random() - 0.5) * 24
    );
    this.velocity.set(0, 0, 0);
    this.hitFlashTimer = 0;
    this._bodyMat.color.setHex(this._bodyColor);
  }

  remove() {
    this.scene.remove(this.group);
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function darken(hex, amount) {
  const r = ((hex >> 16) & 0xff) * (1 - amount);
  const g = ((hex >>  8) & 0xff) * (1 - amount);
  const b = ((hex)       & 0xff) * (1 - amount);
  return (r << 16) | (g << 8) | b;
}
