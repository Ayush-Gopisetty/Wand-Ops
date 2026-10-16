import * as THREE from 'three';

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

// Drawn in a separate pass after a depth clear so the wand never clips into walls
export const FIRST_PERSON_LAYER = 1;

// Local frame: origin at the hand, forward is -Z, scope on top with its eyepiece facing the player (+Z)
export const WAND_SCOPE_HEIGHT = 0.17;

export function createFirstPersonWand() {
  const group = new THREE.Group();

  const wandMat = new THREE.MeshStandardMaterial({ color: 0x5b341c, roughness: 0.72 });
  const wand = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.055, 0.92, 8), wandMat);
  wand.rotation.x = -Math.PI / 2;
  wand.position.z = -0.36;
  group.add(wand);

  const gripMat = new THREE.MeshStandardMaterial({ color: 0x2b170d, roughness: 0.85 });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.065, 0.2, 8), gripMat);
  grip.rotation.x = -Math.PI / 2;
  grip.position.z = 0.02;
  group.add(grip);

  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0xffb347,
    emissive: 0xff7a18,
    emissiveIntensity: 0.9,
    roughness: 0.25,
    metalness: 0.1,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), crystalMat);
  crystal.position.z = -0.88;
  group.add(crystal);

  const scopeMat = new THREE.MeshStandardMaterial({
    color: 0x2b2f39,
    roughness: 0.38,
    metalness: 0.72,
  });
  // Open-ended tubes need their inner wall drawn so the view through the scope stays clean
  const scopeInnerMat = scopeMat.clone();
  scopeInnerMat.side = THREE.DoubleSide;
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x8edcff,
    emissive: 0x2e8bc0,
    emissiveIntensity: 0.35,
    roughness: 0.08,
    metalness: 0.15,
    transparent: true,
    opacity: 0.35,
  });

  const scopeY = WAND_SCOPE_HEIGHT;
  const scopeFront = -0.53;
  const scopeRear = -0.07;

  const scopeMount = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.16), scopeMat);
  scopeMount.position.set(0, 0.055, -0.3);
  group.add(scopeMount);

  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.095, scopeRear - scopeFront, 16, 1, true), scopeInnerMat);
  scopeTube.rotation.x = -Math.PI / 2;
  scopeTube.position.set(0, scopeY, (scopeFront + scopeRear) / 2);
  group.add(scopeTube);

  const scopeRingGeo = new THREE.TorusGeometry(0.097, 0.016, 10, 24);
  const frontRing = new THREE.Mesh(scopeRingGeo, scopeMat);
  frontRing.position.set(0, scopeY, scopeFront);
  group.add(frontRing);

  const rearRing = new THREE.Mesh(scopeRingGeo, scopeMat);
  rearRing.position.set(0, scopeY, scopeRear);
  group.add(rearRing);

  const lensGeo = new THREE.CircleGeometry(0.08, 24);
  const frontLens = new THREE.Mesh(lensGeo, glassMat);
  frontLens.rotation.y = Math.PI;
  frontLens.position.set(0, scopeY, scopeFront - 0.005);
  group.add(frontLens);

  const eyepieceLen = 0.12;
  const eyepiece = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.085, eyepieceLen, 16, 1, true), scopeInnerMat);
  eyepiece.rotation.x = Math.PI / 2;
  eyepiece.position.set(0, scopeY, scopeRear + eyepieceLen / 2);
  group.add(eyepiece);

  const rearLens = new THREE.Mesh(lensGeo, glassMat.clone());
  rearLens.material.opacity = 0.18;
  rearLens.position.set(0, scopeY, scopeRear + 0.01);
  group.add(rearLens);

  group.traverse((node) => {
    if (node.isMesh) node.layers.set(FIRST_PERSON_LAYER);
  });

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

// Low-poly wizard. Local frame: feet at y = -0.75 (the player's position sits 0.75 above the ground)
// and the front faces -Z, the same way rotation is applied to players and bots.
export function createWizardModel(color = getSkinConfig(DEFAULT_SKIN_ID).body, options = {}) {
  const {
    includeNameTag = true,
    name = 'Wizard',
    accent = getSkinConfig(DEFAULT_SKIN_ID).accent,
  } = options;
  const group = new THREE.Group();
  const add = (geometry, material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };

  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const trimMat = new THREE.MeshStandardMaterial({ color: darken(color, 0.4), roughness: 0.85 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, emissive: accent, emissiveIntensity: 0.25, roughness: 0.5 });
  const hatMat = new THREE.MeshStandardMaterial({ color: 0x1a0033, roughness: 0.75 });
  const faceMat = new THREE.MeshStandardMaterial({ color: 0x241a33, roughness: 0.9 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff3c4 });
  const beardMat = new THREE.MeshStandardMaterial({ color: 0xe4e0ea, roughness: 0.95 });
  const gloveMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 });
  const scopeMat = new THREE.MeshStandardMaterial({ color: 0x2b2f39, roughness: 0.42, metalness: 0.58 });

  // Robe: flared toward the hem, with a darker hem band and an accent sash
  const bodyMesh = add(new THREE.CylinderGeometry(0.27, 0.5, 1.3, 12), bodyMat, 0, -0.1, 0);
  const trimMesh = add(new THREE.CylinderGeometry(0.515, 0.52, 0.14, 12), trimMat, 0, -0.68, 0);
  add(new THREE.CylinderGeometry(0.345, 0.36, 0.1, 12), accentMat, 0, 0.12, 0);
  add(new THREE.SphereGeometry(0.29, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat, 0, 0.54, 0); // shoulders

  // Head in the hat's shadow: dark face, glowing eyes, long beard
  add(new THREE.SphereGeometry(0.22, 12, 10), faceMat, 0, 0.78, 0);
  [-0.085, 0.085].forEach((x) => add(new THREE.SphereGeometry(0.045, 8, 6), eyeMat, x, 0.8, -0.19));
  const beard = add(new THREE.ConeGeometry(0.16, 0.46, 10), beardMat, 0, 0.53, -0.24);
  beard.rotation.x = Math.PI;

  // Hat: brim, accent band, then a crown whose tip bends backward
  const brimMesh = add(new THREE.CylinderGeometry(0.5, 0.52, 0.06, 18), hatMat, 0, 0.97, 0);
  add(new THREE.CylinderGeometry(0.315, 0.32, 0.09, 14), accentMat, 0, 1.04, 0);
  const hatMesh = add(new THREE.CylinderGeometry(0.17, 0.31, 0.46, 14), hatMat, 0, 1.23, 0);
  const tip = add(new THREE.ConeGeometry(0.17, 0.46, 14), hatMat, 0, 1.6, 0.07);
  tip.rotation.x = 0.45;

  // Arms: the right reaches forward holding the wand, the left hangs slightly forward
  const sleeveGeo = new THREE.CylinderGeometry(0.085, 0.12, 0.48, 8);
  const handGeo = new THREE.SphereGeometry(0.075, 8, 6);
  const addArm = (side, pitch, roll) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.3, 0.46, 0);
    shoulder.rotation.set(pitch, 0, roll);
    const sleeve = new THREE.Mesh(sleeveGeo, bodyMat);
    sleeve.position.y = -0.24;
    const hand = new THREE.Mesh(handGeo, gloveMat);
    hand.position.y = -0.5;
    shoulder.add(sleeve, hand);
    group.add(shoulder);
  };
  addArm(1, 1.15, 0.12);
  addArm(-1, 0.35, -0.18);

  // Wand in the right hand pointing forward, with the small scope and an accent crystal at the tip
  const wandGroup = new THREE.Group();
  wandGroup.position.set(0.36, 0.25, -0.5);
  wandGroup.rotation.x = -0.12;
  group.add(wandGroup);
  const wandMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.72, 8), woodMat);
  wandMesh.rotation.x = -Math.PI / 2;
  wandMesh.position.z = -0.24;
  const scopeTube = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.26, 12), scopeMat);
  scopeTube.rotation.x = -Math.PI / 2;
  scopeTube.position.set(0, 0.1, -0.2);
  const scopeMount = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.08), scopeMat);
  scopeMount.position.set(0, 0.05, -0.2);
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), accentMat);
  crystal.position.z = -0.64;
  wandGroup.add(wandMesh, scopeTube, scopeMount, crystal);

  let nameTag = null;
  if (includeNameTag) {
    nameTag = createNameTag(name);
    group.add(nameTag);
  }

  group.userData = {
    bodyMat,
    trimMat,
    accentMat,
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
    this._accentMat = this.group.userData.accentMat;
    this._hatMat = this.group.userData.hatMat;
    this.bodyMesh = this.group.userData.bodyMesh;
    this.nameTag = this.group.userData.nameTag;
    this.group.position.copy(this.position);
  }

  update(delta) {
    if (this.isLocal) {
      if (this.burnTimer > 0) this.burnTimer -= delta;
      if (this.slowTimer > 0) this.slowTimer -= delta;
      if (this.silenceTimer > 0) this.silenceTimer -= delta;
      if (this.groundedTimer > 0) this.groundedTimer -= delta;
    } else {
      this.position.lerp(this.targetPosition, LERP_SPEED);
      // Turn the short way round: a raw difference across ±π (or an unwrapped yaw) spins nearly a full circle
      const diff = this.targetRotation - this.rotation;
      this.rotation += Math.atan2(Math.sin(diff), Math.cos(diff)) * LERP_SPEED;
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
    this._accentMat.color.setHex(skin.accent);
    this._accentMat.emissive.setHex(skin.accent);
  }

  respawn(spawnPoint = null) {
    this.health = 100;
    if (spawnPoint) {
      this.position.set(spawnPoint[0], 0.75, spawnPoint[1]);
    } else {
      this.position.set((Math.random() - 0.5) * 24, 0.75, (Math.random() - 0.5) * 24);
    }
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
