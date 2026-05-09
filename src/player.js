import * as THREE from 'three';

const ARENA_HALF = 39;
const LERP_SPEED = 0.18;

const PLAYER_COLORS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x1abc9c, 0xe91e63, 0xff6b35];

export const PLAYER_SKINS = {
  amethyst: { name: 'Amethyst', body: 0x9b59b6, accent: 0xffb347, glow: 0xff7a18, price: 0, unlockByDefault: true },
  ember:    { name: 'Ember',    body: 0xd35400, accent: 0xffc36b, glow: 0xff6a00, price: 12, unlockByDefault: false },
  tide:     { name: 'Tide',     body: 0x2980b9, accent: 0x8edcff, glow: 0x2e8bc0, price: 16, unlockByDefault: false },
  verdant:  { name: 'Verdant',  body: 0x27ae60, accent: 0xb6ff8d, glow: 0x4ecb71, price: 20, unlockByDefault: false },
  storm:    { name: 'Storm',    body: 0x5d6d7e, accent: 0xd6dbff, glow: 0x7d8cff, price: 24, unlockByDefault: false },
};

export const DEFAULT_SKIN_ID = 'amethyst';
export const DEFAULT_UNLOCKED_SKIN_IDS = Object.entries(PLAYER_SKINS)
  .filter(([, skin]) => skin.unlockByDefault)
  .map(([skinId]) => skinId);

export function remoteColor(actorNr) {
  return PLAYER_COLORS[actorNr % PLAYER_COLORS.length];
}

export function getSkinConfig(skinId = DEFAULT_SKIN_ID) {
  return PLAYER_SKINS[skinId] || PLAYER_SKINS[DEFAULT_SKIN_ID];
}

export function createFirstPersonWand() {
  const group = new THREE.Group();

  const wandGeo = new THREE.CylinderGeometry(0.045, 0.055, 0.82, 8);
  const wandMat = new THREE.MeshStandardMaterial({ color: 0x5b341c, roughness: 0.72 });
  const wand = new THREE.Mesh(wandGeo, wandMat);
  wand.rotation.z = Math.PI * 0.42;
  wand.rotation.x = Math.PI * 0.06;
  wand.position.set(0.42, -0.34, -0.72);
  group.add(wand);

  const gripGeo = new THREE.CylinderGeometry(0.055, 0.06, 0.2, 8);
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x2b170d, roughness: 0.85 });
  const grip = new THREE.Mesh(gripGeo, gripMat);
  grip.rotation.z = wand.rotation.z;
  grip.rotation.x = wand.rotation.x;
  grip.position.copy(wand.position).add(new THREE.Vector3(-0.09, -0.11, 0.07));
  group.add(grip);

  const crystalGeo = new THREE.OctahedronGeometry(0.07, 0);
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xff7a18,
    emissiveIntensity: 0.9,
    roughness: 0.25,
    metalness: 0.1,
  });
  const crystal = new THREE.Mesh(crystalGeo, crystalMat);
  crystal.position.copy(wand.position).add(new THREE.Vector3(0.22, 0.29, -0.04));
  group.add(crystal);

  const scopeMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f39,
    roughness: 0.38,
    metalness: 0.72,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8edcff,
    emissive: 0x2e8bc0,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.72,
  });

  const scopeMountGeo = new THREE.BoxGeometry(0.06, 0.15, 0.12);
  const scopeMount = new THREE.Mesh(scopeMountGeo, scopeMat);
  scopeMount.position.copy(wand.position).add(new THREE.Vector3(-0.02, 0.12, 0.02));
  scopeMount.rotation.z = wand.rotation.z;
  scopeMount.rotation.x = wand.rotation.x;
  group.add(scopeMount);

  const scopeTubeGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.34, 12);
  const scopeTube = new THREE.Mesh(scopeTubeGeo, scopeMat);
  scopeTube.position.copy(wand.position).add(new THREE.Vector3(0.02, 0.2, -0.02));
  scopeTube.rotation.z = wand.rotation.z;
  scopeTube.rotation.x = wand.rotation.x;
  group.add(scopeTube);

  const scopeRingGeo = new THREE.TorusGeometry(0.052, 0.012, 8, 18);
  const frontRing = new THREE.Mesh(scopeRingGeo, scopeMat);
  frontRing.position.copy(scopeTube.position).add(new THREE.Vector3(0.12, 0.14, -0.02));
  frontRing.rotation.y = Math.PI / 2;
  frontRing.rotation.z = wand.rotation.z;
  frontRing.rotation.x = wand.rotation.x;
  group.add(frontRing);

  const rearRing = frontRing.clone();
  rearRing.position.copy(scopeTube.position).add(new THREE.Vector3(-0.12, -0.14, 0.02));
  group.add(rearRing);

  const lensGeo = new THREE.CircleGeometry(0.047, 20);
  const frontLens = new THREE.Mesh(lensGeo, glassMat);
  frontLens.position.copy(scopeTube.position).add(new THREE.Vector3(0.118, 0.135, -0.018));
  frontLens.rotation.y = -Math.PI / 2;
  frontLens.rotation.z = wand.rotation.z;
  frontLens.rotation.x = wand.rotation.x;
  group.add(frontLens);

  group.userData = { crystal, frontLens };
  applyFirstPersonWandSkin(group, DEFAULT_SKIN_ID);
  return group;
}

export function applyFirstPersonWandSkin(wandGroup, skinId) {
  if (!wandGroup?.userData) return;
  const skin = getSkinConfig(skinId);
  const { crystal, frontLens } = wandGroup.userData;
  if (crystal?.material) {
    crystal.material.color.setHex(skin.accent);
    crystal.material.emissive.setHex(skin.glow);
  }
  if (frontLens?.material) {
    frontLens.material.color.setHex(skin.accent);
    frontLens.material.emissive.setHex(skin.glow);
  }
}

export function createWizardModel(color = getSkinConfig(DEFAULT_SKIN_ID).body, options = {}) {
  const { includeNameTag = true, name = 'Wizard' } = options;
  const group = new THREE.Group();

  const bodyGeo = new THREE.BoxGeometry(0.85, 1.4, 0.85);
  const bodyMat = new THREE.MeshStandardMaterial({ color });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  group.add(bodyMesh);

  const trimGeo = new THREE.BoxGeometry(0.95, 0.6, 0.95);
  const trimMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.4) });
  const trimMesh = new THREE.Mesh(trimGeo, trimMat);
  trimMesh.position.y = -0.42;
  group.add(trimMesh);

  const hatMat = new THREE.MeshStandardMaterial({ color: 0x1a0033 });
  const hatGeo = new THREE.ConeGeometry(0.38, 0.82, 8);
  const hatMesh = new THREE.Mesh(hatGeo, hatMat);
  hatMesh.position.y = 1.11;
  group.add(hatMesh);

  const brimGeo = new THREE.CylinderGeometry(0.54, 0.54, 0.08, 12);
  const brimMesh = new THREE.Mesh(brimGeo, hatMat);
  brimMesh.position.y = 0.74;
  group.add(brimMesh);

  const eyeGeo = new THREE.SphereGeometry(0.07, 6, 6);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  [-0.22, 0.22].forEach((x) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(x, 0.18, 0.44);
    group.add(eye);
  });

  const wandGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.7, 6);
  const wandMat = new THREE.MeshStandardMaterial({ color: 0x8b4513 });
  const wandMesh = new THREE.Mesh(wandGeo, wandMat);
  wandMesh.rotation.z = Math.PI / 6;
  wandMesh.position.set(0.56, 0.1, 0.0);
  group.add(wandMesh);

  let nameTag = null;
  if (includeNameTag) {
    nameTag = createNameTag(name);
    group.add(nameTag);
  }

  group.userData = {
    bodyMat,
    trimMat,
    hatMat,
    bodyMesh,
    trimMesh,
    hatMesh,
    brimMesh,
    wandMesh,
    nameTag,
  };

  return group;
}

function createNameTag(text = 'Wizard') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const texture = new THREE.CanvasTexture(canvas);

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, 2.35, 0);
  sprite.scale.set(2.9, 0.72, 1);
  sprite.renderOrder = 10;
  sprite.userData = { canvas, texture };

  updateNameTag(sprite, text);
  return sprite;
}

function updateNameTag(sprite, text) {
  const { canvas, texture } = sprite.userData;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = 'rgba(9, 8, 18, 0.72)';
  roundRect(ctx, 8, 10, canvas.width - 16, canvas.height - 20, 18);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  roundRect(ctx, 8, 10, canvas.width - 16, canvas.height - 20, 18);
  ctx.stroke();

  ctx.fillStyle = '#f8f0ff';
  ctx.font = '700 26px Cinzel, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 1);
  texture.needsUpdate = true;
}

export class Player {
  constructor(scene, isLocal = false, color = 0x9b59b6) {
    this.scene = scene;
    this.isLocal = isLocal;
    this.id = null;
    this.health = 100;
    this.skinId = DEFAULT_SKIN_ID;

    this.position = new THREE.Vector3(
      (Math.random() - 0.5) * 24,
      0.75,
      (Math.random() - 0.5) * 24
    );
    this.velocity = new THREE.Vector3();
    this.rotation = 0;

    this.targetPosition = this.position.clone();
    this.targetRotation = 0;

    this.hitFlashTimer = 0;
    this._bodyColor = color;
    this.name = 'Wizard';

    this.burnTimer = 0;
    this.burnDps = 0;
    this.slowTimer = 0;
    this.silenceTimer = 0;
    this.groundedTimer = 0;

    this._buildMesh(color);
    scene.add(this.group);
  }

  _buildMesh(color) {
    this.group = createWizardModel(color, { includeNameTag: true, name: this.name });
    this._bodyMat = this.group.userData.bodyMat;
    this._trimMat = this.group.userData.trimMat;
    this._hatMat = this.group.userData.hatMat;
    this.bodyMesh = this.group.userData.bodyMesh;
    this.nameTag = this.group.userData.nameTag;
    this.group.position.copy(this.position);
  }

  update(delta) {
    if (this.isLocal) {
      this.position.x = clamp(this.position.x, -ARENA_HALF, ARENA_HALF);
      this.position.z = clamp(this.position.z, -ARENA_HALF, ARENA_HALF);
      if (this.burnTimer > 0) this.burnTimer -= delta;
      if (this.slowTimer > 0) this.slowTimer -= delta;
      if (this.silenceTimer > 0) this.silenceTimer -= delta;
      if (this.groundedTimer > 0) this.groundedTimer -= delta;
    } else {
      this.position.lerp(this.targetPosition, LERP_SPEED);
      this.rotation += (this.targetRotation - this.rotation) * LERP_SPEED;
    }

    this.group.position.copy(this.position);
    this.group.rotation.y = this.rotation;

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer -= delta;
      this._bodyMat.color.setHex(this.hitFlashTimer > 0 ? 0xff2222 : this._bodyColor);
    }
  }

  applySpellEffect(spell) {
    if (spell === 'fire') {
      this.burnTimer = 3;
      this.burnDps = 5;
    } else if (spell === 'ice') {
      this.slowTimer = 3;
    } else if (spell === 'lightning') {
      this.silenceTimer = 2;
    } else if (spell === 'earth') {
      this.groundedTimer = 3;
    }
  }

  takeDamage(amount) {
    this.health = Math.max(0, this.health - amount);
    this.hitFlashTimer = 0.28;
    return this.health <= 0;
  }

  setName(name) {
    this.name = name;
    if (this.nameTag) updateNameTag(this.nameTag, name);
  }

  setSkin(skinId) {
    const skin = getSkinConfig(skinId);
    this.skinId = skinId in PLAYER_SKINS ? skinId : DEFAULT_SKIN_ID;
    this._bodyColor = skin.body;
    this._bodyMat.color.setHex(skin.body);
    this._trimMat.color.setHex(darken(skin.body, 0.4));
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
    this.burnTimer = 0;
    this.slowTimer = 0;
    this.silenceTimer = 0;
    this.groundedTimer = 0;
    this._bodyMat.color.setHex(this._bodyColor);
  }

  remove() {
    this.scene.remove(this.group);
  }
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function darken(hex, amount) {
  const r = ((hex >> 16) & 0xff) * (1 - amount);
  const g = ((hex >> 8) & 0xff) * (1 - amount);
  const b = (hex & 0xff) * (1 - amount);
  return (r << 16) | (g << 8) | b;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
