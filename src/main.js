import * as THREE from 'three';
import { createScene }    from './scene.js';
import { Player, remoteColor } from './player.js';
import { Controls }       from './controls.js';
import { FireballManager } from './fireball.js';
import { NetworkManager } from './network.js';
import { UIManager }      from './ui.js';

// ── Tuning constants ─────────────────────────────────────────────────────────
const MOVE_SPEED       = 9;
const SLOW_FACTOR      = 0.3;    // movement multiplier while iced
const MOUSE_SENS       = 0.0022;
const PITCH_MIN        = -1.4;
const PITCH_MAX        =  1.4;
const SHOOT_COOLDOWN   = 0.5;
const NET_TICK         = 1 / 13;
const EYE_HEIGHT       = 1.5;
const JUMP_VELOCITY    = 8;
const GRAVITY          = 22;
const GROUND_Y         = 0.75;

// ── Module-level state ───────────────────────────────────────────────────────
let scene, camera, renderer;
let localPlayer;
const remotePlayers = new Map();

let controls, fireballs, network, ui;

let cameraYaw   = 0;
let cameraPitch = 0.25;
let shootTimer  = 0;
let netTimer    = 0;
let localActorId = -1;

let playerVelocityY = 0;
let isGrounded      = true;
let selectedSpell   = 'fire';

const _moveDir = new THREE.Vector3();
const _yAxis   = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _lookAt  = new THREE.Vector3();

const clock = new THREE.Clock();

// ── Bootstrap ─────────────────────────────────────────────────────────────────
function init() {
  const canvas = document.getElementById('game-canvas');
  ({ scene, camera, renderer } = createScene(canvas));

  controls  = new Controls();
  ui        = new UIManager();
  fireballs = new FireballManager(scene);

  localPlayer = new Player(scene, true, 0x9b59b6);
  localPlayer.group.visible = false;

  // ── Spell picker ──────────────────────────────────────────────────────────
  document.querySelectorAll('.spell-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      selectedSpell = btn.dataset.spell;
      document.querySelectorAll('.spell-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      ui.setSpell(selectedSpell);
    });
  });
  ui.setSpell(selectedSpell);

  // ── Network callbacks ──────────────────────────────────────────────────────
  network = new NetworkManager({

    onConnected(actorNr) {
      localActorId   = actorNr;
      localPlayer.id = actorNr;
      ui.setOverlayStatus('Click to play');
    },

    onPlayerJoin(actorNr) {
      if (actorNr === localActorId) return;
      if (remotePlayers.has(actorNr)) return;
      const player = new Player(scene, false, remoteColor(actorNr));
      player.id    = actorNr;
      remotePlayers.set(actorNr, player);
      ui.setPlayerCount(remotePlayers.size + 1);
    },

    onPlayerLeave(actorNr) {
      const player = remotePlayers.get(actorNr);
      if (!player) return;
      player.remove();
      remotePlayers.delete(actorNr);
      ui.setPlayerCount(remotePlayers.size + 1);
    },

    onPosition(actorNr, data) {
      const p = remotePlayers.get(actorNr);
      if (p) {
        p.targetPosition.set(data.x, data.y, data.z);
        p.targetRotation = data.r;
      }
    },

    onFireball(actorNr, data) {
      const pos = new THREE.Vector3(data.px, data.py, data.pz);
      const dir = new THREE.Vector3(data.dx, data.dy, data.dz);
      fireballs.spawn(pos, dir, actorNr, data.sp || 'fire');
    },

    onHit(actorNr, data) {
      if (data.targetId === localActorId) {
        const dead = localPlayer.takeDamage(data.damage);
        localPlayer.applySpellEffect(data.sp || 'fire');
        ui.setHealth(localPlayer.health);
        if (dead) {
          localPlayer.respawn();
          ui.setHealth(localPlayer.health);
          ui.addKillEntry(`Wizard ${actorNr} defeated you!`);
        }
      } else {
        const target = remotePlayers.get(data.targetId);
        if (target) target.takeDamage(data.damage);
      }
    },
  });

  network.connect();

  ui.showOverlay(true);
  ui.setHealth(100);
  ui.setPlayerCount(1);

  document.getElementById('overlay').addEventListener('click', () => {
    controls.requestLock();
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) {
      ui.showOverlay(false);
    } else {
      ui.showOverlay(true);
      ui.setOverlayStatus(localActorId >= 0 ? 'Paused — click to resume' : 'Connecting…');
    }
  });

  clock.start();
  loop();
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);
  const delta = Math.min(clock.getDelta(), 0.05);
  update(delta);
  renderer.render(scene, camera);
}

// ── Per-frame update ──────────────────────────────────────────────────────────
function update(delta) {
  if (!controls.isLocked || localActorId < 0) return;

  // ── Camera yaw / pitch ────────────────────────────────────────────────────
  const { dx, dy } = controls.consumeMouseDelta();
  cameraYaw   -= dx * MOUSE_SENS;
  cameraPitch  = clamp(cameraPitch - dy * MOUSE_SENS, PITCH_MIN, PITCH_MAX);

  localPlayer.rotation = cameraYaw;

  // ── WASD movement ─────────────────────────────────────────────────────────
  _moveDir.set(0, 0, 0);
  if (controls.isDown('KeyW') || controls.isDown('ArrowUp'))    _moveDir.z -= 1;
  if (controls.isDown('KeyS') || controls.isDown('ArrowDown'))  _moveDir.z += 1;
  if (controls.isDown('KeyA') || controls.isDown('ArrowLeft'))  _moveDir.x -= 1;
  if (controls.isDown('KeyD') || controls.isDown('ArrowRight')) _moveDir.x += 1;

  if (_moveDir.lengthSq() > 0) {
    _moveDir.normalize().applyAxisAngle(_yAxis, cameraYaw);
    const speed = localPlayer.slowTimer > 0 ? MOVE_SPEED * SLOW_FACTOR : MOVE_SPEED;
    localPlayer.position.addScaledVector(_moveDir, speed * delta);
  }

  // ── Jump + gravity ────────────────────────────────────────────────────────
  if (controls.consumeJump() && isGrounded) {
    playerVelocityY = JUMP_VELOCITY;
    isGrounded = false;
  }
  playerVelocityY -= GRAVITY * delta;
  localPlayer.position.y += playerVelocityY * delta;
  if (localPlayer.position.y <= GROUND_Y) {
    localPlayer.position.y = GROUND_Y;
    playerVelocityY = 0;
    isGrounded = true;
  }

  // ── Burn DoT ──────────────────────────────────────────────────────────────
  if (localPlayer.burnTimer > 0) {
    const dead = localPlayer.takeDamage(localPlayer.burnDps * delta);
    ui.setHealth(localPlayer.health);
    if (dead) { localPlayer.respawn(); ui.setHealth(localPlayer.health); }
  }

  // ── Status effect HUD ─────────────────────────────────────────────────────
  ui.setEffect(
    localPlayer.burnTimer    > 0 ? 'burn'    :
    localPlayer.slowTimer    > 0 ? 'slow'    :
    localPlayer.silenceTimer > 0 ? 'silence' : null
  );

  // ── Shooting (blocked while silenced) ────────────────────────────────────
  shootTimer -= delta;
  if (controls.consumeClick() && shootTimer <= 0 && localPlayer.silenceTimer <= 0) {
    shootTimer = SHOOT_COOLDOWN;
    castFireball();
  }

  // ── Update players ────────────────────────────────────────────────────────
  localPlayer.update(delta);
  remotePlayers.forEach(p => p.update(delta));

  // ── Fireball simulation + hit detection ──────────────────────────────────
  fireballs.update(delta, remotePlayers, localActorId, (ownerId, targetId, damage, spell) => {
    if (ownerId !== localActorId) return;
    network.sendHit(targetId, damage, spell);
    const target = remotePlayers.get(targetId);
    if (target) {
      const dead = target.takeDamage(damage);
      if (dead) ui.addKillEntry(`You defeated Wizard ${targetId}!`);
    }
  });

  // ── Network position broadcast ────────────────────────────────────────────
  netTimer += delta;
  if (netTimer >= NET_TICK) {
    netTimer = 0;
    network.sendPosition(localPlayer.position, localPlayer.rotation);
    ui.setPlayerCount(network.getPlayerCount());
  }

  updateCamera();
}

// ── Spawn a spell projectile ──────────────────────────────────────────────────
function castFireball() {
  _forward.set(
    -Math.sin(cameraYaw) * Math.cos(cameraPitch),
    Math.sin(cameraPitch),
    -Math.cos(cameraYaw) * Math.cos(cameraPitch)
  );

  const spawnPos = localPlayer.position.clone()
    .add(new THREE.Vector3(0, EYE_HEIGHT, 0))
    .addScaledVector(_forward, 0.5);

  fireballs.spawn(spawnPos, _forward.clone(), localActorId, selectedSpell);
  network.sendFireball(spawnPos, _forward, selectedSpell);
}

// ── First-person camera ───────────────────────────────────────────────────────
function updateCamera() {
  camera.position.set(
    localPlayer.position.x,
    localPlayer.position.y + EYE_HEIGHT,
    localPlayer.position.z
  );

  _lookAt.set(
    localPlayer.position.x - Math.sin(cameraYaw) * Math.cos(cameraPitch),
    localPlayer.position.y + EYE_HEIGHT + Math.sin(cameraPitch),
    localPlayer.position.z - Math.cos(cameraYaw) * Math.cos(cameraPitch)
  );
  camera.lookAt(_lookAt);
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

init();
