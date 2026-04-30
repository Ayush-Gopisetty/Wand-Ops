import * as THREE from 'three';
import { createScene }    from './scene.js';
import { Player, remoteColor } from './player.js';
import { Controls }       from './controls.js';
import { FireballManager } from './fireball.js';
import { NetworkManager } from './network.js';
import { UIManager }      from './ui.js';

// ── Tuning constants ─────────────────────────────────────────────────────────
const MOVE_SPEED       = 9;      // units / second
const MOUSE_SENS       = 0.0022; // radians per pixel
const PITCH_MIN        = -0.15;  // camera tilt limits
const PITCH_MAX        = 0.55;
const SHOOT_COOLDOWN   = 0.5;    // seconds between shots
const NET_TICK         = 1 / 13; // position broadcast interval (~13 Hz)
const CAM_DIST         = 6;      // third-person camera distance
const CAM_HEIGHT       = 2.2;
const JUMP_VELOCITY    = 8;      // upward speed on jump (units/s)
const GRAVITY          = 22;     // downward acceleration (units/s²)
const GROUND_Y         = 0.75;   // floor height

// ── Module-level state ───────────────────────────────────────────────────────
let scene, camera, renderer;
let localPlayer;
const remotePlayers = new Map(); // actorNr → Player

let controls, fireballs, network, ui;

let cameraYaw   = 0; // horizontal orbit
let cameraPitch = 0.25;
let shootTimer  = 0;
let netTimer    = 0;
let localActorId = -1; // set once Photon assigns an actor number

let playerVelocityY = 0;
let isGrounded      = true;

// Pre-allocated vectors — avoids GC pressure in the game loop
const _moveDir = new THREE.Vector3();
const _yAxis   = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _lookAt  = new THREE.Vector3();

const clock = new THREE.Clock();

// ── Bootstrap ─────────────────────────────────────────────────────────────────
function init() {
  const canvas = document.getElementById('game-canvas');
  ({ scene, camera, renderer } = createScene(canvas));

  controls = new Controls();
  ui       = new UIManager();
  fireballs = new FireballManager(scene);

  // Local player exists immediately (we spawn it before knowing actor ID)
  localPlayer = new Player(scene, true, 0x9b59b6);

  // ── Network callbacks ──────────────────────────────────────────────────────
  network = new NetworkManager({

    onConnected(actorNr) {
      localActorId    = actorNr;
      localPlayer.id  = actorNr;
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
      fireballs.spawn(pos, dir, actorNr);
    },

    onHit(actorNr, data) {
      // actorNr is the shooter; data.targetId is who was hit
      if (data.targetId === localActorId) {
        const dead = localPlayer.takeDamage(data.damage);
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

  // Start network connection immediately (happens in background)
  network.connect();

  // Show overlay; clicking it locks the pointer
  ui.showOverlay(true);
  ui.setHealth(100);
  ui.setPlayerCount(1);

  // Pointer lock on click (controls.js also handles this, belt-and-suspenders)
  document.getElementById('overlay').addEventListener('click', () => {
    controls.requestLock();
  });

  // Hide overlay when pointer locks; show it again when unlocked (ESC)
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
  const delta = Math.min(clock.getDelta(), 0.05); // cap at 50 ms

  update(delta);
  renderer.render(scene, camera);
}

// ── Per-frame update ──────────────────────────────────────────────────────────
function update(delta) {
  // Block all gameplay logic until pointer is locked AND connected
  if (!controls.isLocked || localActorId < 0) return;

  // ── Camera yaw / pitch from mouse ─────────────────────────────────────────
  const { dx, dy } = controls.consumeMouseDelta();
  cameraYaw   -= dx * MOUSE_SENS;
  cameraPitch  = clamp(cameraPitch - dy * MOUSE_SENS, PITCH_MIN, PITCH_MAX);

  // Player faces the direction the camera is looking (yaw only)
  localPlayer.rotation = cameraYaw;

  // ── WASD movement (relative to camera yaw) ────────────────────────────────
  _moveDir.set(0, 0, 0);
  if (controls.isDown('KeyW') || controls.isDown('ArrowUp'))    _moveDir.z -= 1;
  if (controls.isDown('KeyS') || controls.isDown('ArrowDown'))  _moveDir.z += 1;
  if (controls.isDown('KeyA') || controls.isDown('ArrowLeft'))  _moveDir.x -= 1;
  if (controls.isDown('KeyD') || controls.isDown('ArrowRight')) _moveDir.x += 1;

  if (_moveDir.lengthSq() > 0) {
    _moveDir.normalize().applyAxisAngle(_yAxis, cameraYaw);
    localPlayer.position.addScaledVector(_moveDir, MOVE_SPEED * delta);
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

  // ── Shooting ─────────────────────────────────────────────────────────────
  shootTimer -= delta;
  if (controls.consumeClick() && shootTimer <= 0) {
    shootTimer = SHOOT_COOLDOWN;
    castFireball();
  }

  // ── Update local & remote players ─────────────────────────────────────────
  localPlayer.update(delta);
  remotePlayers.forEach(p => p.update(delta));

  // ── Fireball simulation + hit detection ──────────────────────────────────
  fireballs.update(delta, remotePlayers, localActorId, (ownerId, targetId, damage) => {
    // We are authoritative for our own fireballs
    if (ownerId !== localActorId) return;

    network.sendHit(targetId, damage);

    const target = remotePlayers.get(targetId);
    if (target) {
      const dead = target.takeDamage(damage);
      if (dead) ui.addKillEntry(`You defeated Wizard ${targetId}!`);
    }
  });

  // ── Network position broadcast (throttled) ────────────────────────────────
  netTimer += delta;
  if (netTimer >= NET_TICK) {
    netTimer = 0;
    network.sendPosition(localPlayer.position, localPlayer.rotation);
    ui.setPlayerCount(network.getPlayerCount());
  }

  // ── Camera follow ─────────────────────────────────────────────────────────
  updateCamera();
}

// ── Spawn a fireball from the local player ────────────────────────────────────
function castFireball() {
  // Forward direction in world space
  _forward.set(-Math.sin(cameraYaw), 0, -Math.cos(cameraYaw));

  // Spawn slightly in front of and above the player (wand tip)
  const spawnPos = localPlayer.position.clone()
    .add(new THREE.Vector3(0, 0.7, 0))
    .addScaledVector(_forward, 0.9);

  fireballs.spawn(spawnPos, _forward.clone(), localActorId);
  network.sendFireball(spawnPos, _forward);
}

// ── Third-person camera positioning ──────────────────────────────────────────
function updateCamera() {
  // Camera orbits around the player at (cameraYaw, cameraPitch)
  const sinY = Math.sin(cameraYaw);
  const cosY = Math.cos(cameraYaw);

  const camX = localPlayer.position.x + sinY * CAM_DIST;
  const camZ = localPlayer.position.z + cosY * CAM_DIST;
  const camY = localPlayer.position.y + CAM_HEIGHT + cameraPitch * 4;

  camera.position.set(camX, camY, camZ);

  // Look at the player's upper body
  _lookAt.copy(localPlayer.position).setY(localPlayer.position.y + 1.0);
  camera.lookAt(_lookAt);
}

// ── Utility ───────────────────────────────────────────────────────────────────
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// ── Start ─────────────────────────────────────────────────────────────────────
init();
