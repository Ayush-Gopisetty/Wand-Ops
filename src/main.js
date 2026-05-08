import * as THREE from 'three';
import { createScene } from './scene.js';
import { Player, remoteColor, createFirstPersonWand } from './player.js';
import { Controls } from './controls.js';
import { FireballManager } from './fireball.js';
import { NetworkManager } from './network.js';
import { UIManager } from './ui.js';
import { SimpleBotController } from './bot.js';

const MOVE_SPEED = 9;
const SLOW_FACTOR = 0.3;
const MOUSE_SENS = 0.0022;
const PITCH_MIN = -1.4;
const PITCH_MAX = 1.4;
const DEFAULT_FOV = 72;
const ADS_FOV = 44;
const SHOOT_COOLDOWN = 0.5;
const NET_TICK = 1 / 13;
const EYE_HEIGHT = 1.5;
const JUMP_VELOCITY = 8;
const GRAVITY = 22;
const GROUND_Y = 0.75;
const BOT_ID = 9001;
const BOT_COLOR = 0xffd166;

let scene, camera, renderer;
let localPlayer;
let firstPersonWand;
const remotePlayers = new Map();
let trainingBot = null;
let trainingBotAI = null;

let controls, fireballs, network, ui, colliders;
const scores = new Map();
const playerNames = new Map();

let cameraYaw = 0;
let cameraPitch = 0;
let shootTimer = 0;
let netTimer = 0;
let localActorId = -1;
let aimBlend = 0;
let localPlayerName = 'Wizard';

let playerVelocityY = 0;
let isGrounded = true;
let selectedSpell = 'fire';

const _moveDir = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _knockbackVel = new THREE.Vector3();
const _wandBasePos = new THREE.Vector3(0.46, -0.42, -0.78);
const _wandAimPos = new THREE.Vector3(0.08, -0.22, -0.48);

const clock = new THREE.Clock();

function ensureScoreEntry(actorNr) {
  if (!scores.has(actorNr)) scores.set(actorNr, { kills: 0, deaths: 0, assists: 0 });
  return scores.get(actorNr);
}

function sanitizePlayerName(value) {
  const cleaned = (value || '').replace(/\s+/g, ' ').trim().slice(0, 18);
  return cleaned || 'Wizard';
}

function getPlayerLabel(actorNr, isLocal = false) {
  if (isLocal || actorNr === localActorId) return '⚔ You';
  if (actorNr === BOT_ID) return 'Training Bot';
  return playerNames.get(actorNr) || `Wizard ${actorNr}`;
}

function updateLocalKDA() {
  const localScore = localActorId >= 0
    ? ensureScoreEntry(localActorId)
    : { kills: 0, deaths: 0, assists: 0 };
  ui.setKDA(localScore.kills, localScore.deaths, localScore.assists);
}

function refreshScoreboard() {
  ui.updateScoreboard(scores, localActorId, getPlayerLabel);
}

function hasHumanOpponents() {
  for (const actorNr of remotePlayers.keys()) {
    if (actorNr !== BOT_ID) return true;
  }
  return false;
}

function updateDisplayedPlayerCount() {
  const baseCount = network ? network.getPlayerCount() : 1;
  ui.setPlayerCount(baseCount + (trainingBot ? 1 : 0));
}

function spawnTrainingBot() {
  if (trainingBot || localActorId < 0 || hasHumanOpponents()) return;
  const bot = new Player(scene, true, BOT_COLOR);
  bot.id = BOT_ID;
  bot.setName('Training Bot');
  bot.position.set(10, GROUND_Y, 8);
  bot.group.position.copy(bot.position);
  trainingBot = bot;
  trainingBotAI = new SimpleBotController(bot, colliders);
  ensureScoreEntry(BOT_ID);
  playerNames.set(BOT_ID, 'Training Bot');
  refreshScoreboard();
  ui.addKillEntry('Training Bot joined the arena.');
  updateDisplayedPlayerCount();
}

function removeTrainingBot(reason = '') {
  if (!trainingBot) return;
  trainingBot.remove();
  trainingBot = null;
  trainingBotAI = null;
  scores.delete(BOT_ID);
  playerNames.delete(BOT_ID);
  refreshScoreboard();
  if (reason) ui.addKillEntry(reason);
  updateDisplayedPlayerCount();
}

function refreshTrainingBotState() {
  if (hasHumanOpponents()) {
    removeTrainingBot('Training Bot left for a live match.');
    return;
  }
  spawnTrainingBot();
}

function getCombatTargets() {
  const targets = new Map(remotePlayers);
  targets.set(localActorId, localPlayer);
  if (trainingBot) targets.set(BOT_ID, trainingBot);
  return targets;
}

function getSimulatedOwners() {
  const owners = new Set([localActorId]);
  if (trainingBot) owners.add(BOT_ID);
  return owners;
}

function handleDefeat(killerId, victimId, killerLabel, victimLabel) {
  ensureScoreEntry(killerId).kills++;
  ensureScoreEntry(victimId).deaths++;
  refreshScoreboard();
  updateLocalKDA();
  if (killerId === localActorId) {
    ui.addKillEntry(`You defeated ${victimLabel}!`);
  } else if (victimId === localActorId) {
    ui.addKillEntry(`${killerLabel} defeated you!`);
  }
}

function handleRemoteHitDefeat(actorNr) {
  localPlayer.respawn();
  network.sendRespawn();
  ui.setHealth(localPlayer.health);
  ui.addKillEntry(`${getPlayerLabel(actorNr)} defeated you!`);
}

function init() {
  const canvas = document.getElementById('game-canvas');
  const playerNameInput = document.getElementById('player-name-input');
  const playCard = document.getElementById('lo-play-card');
  ({ scene, camera, renderer, colliders } = createScene(canvas));
  scene.add(camera);
  camera.fov = DEFAULT_FOV;
  camera.updateProjectionMatrix();

  const storedName = localStorage.getItem('wand-ops-player-name');
  localPlayerName = sanitizePlayerName(storedName);
  playerNameInput.value = localPlayerName;
  const loPlayerNameEl = document.getElementById('lo-player-name');
  if (loPlayerNameEl) loPlayerNameEl.textContent = localPlayerName.toUpperCase();

  controls = new Controls();
  ui = new UIManager();
  fireballs = new FireballManager(scene);

  localPlayer = new Player(scene, true, 0x9b59b6);
  localPlayer.setName(localPlayerName);
  localPlayer.group.visible = false;
  firstPersonWand = createFirstPersonWand();
  camera.add(firstPersonWand);

  playerNameInput.addEventListener('click', (e) => e.stopPropagation());
  playerNameInput.addEventListener('keydown', (e) => e.stopPropagation());
  playerNameInput.addEventListener('input', () => {
    localPlayerName = sanitizePlayerName(playerNameInput.value);
    if (playerNameInput.value !== localPlayerName) playerNameInput.value = localPlayerName;
    localStorage.setItem('wand-ops-player-name', localPlayerName);
    localPlayer.setName(localPlayerName);
    if (loPlayerNameEl) loPlayerNameEl.textContent = localPlayerName.toUpperCase();
    if (localActorId >= 0) {
      playerNames.set(localActorId, localPlayerName);
      refreshScoreboard();
      network.sendPlayerName(localActorId, localPlayerName);
    }
  });

  document.querySelectorAll('.spell-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedSpell = btn.dataset.spell;
      document.querySelectorAll('.spell-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ui.setSpell(selectedSpell);
    });
  });
  ui.setSpell(selectedSpell);

  network = new NetworkManager({
    onConnected(actorNr) {
      localActorId = actorNr;
      localPlayer.id = actorNr;
      playerNames.set(actorNr, localPlayerName);
      scores.set(actorNr, { kills: 0, deaths: 0, assists: 0 });
      updateLocalKDA();
      refreshTrainingBotState();
      refreshScoreboard();
      network.sendPlayerName(actorNr, localPlayerName);
      ui.setOverlayStatus('Click to play');
    },

    onPlayerJoin(actorNr) {
      if (actorNr === localActorId) return;
      if (remotePlayers.has(actorNr)) return;
      const player = new Player(scene, false, remoteColor(actorNr));
      player.id = actorNr;
      player.setName(`Wizard ${actorNr}`);
      remotePlayers.set(actorNr, player);
      playerNames.set(actorNr, `Wizard ${actorNr}`);
      scores.set(actorNr, { kills: 0, deaths: 0, assists: 0 });
      refreshTrainingBotState();
      updateDisplayedPlayerCount();
      refreshScoreboard();
      if (localActorId >= 0) {
        const mine = scores.get(localActorId);
        if (mine) network.sendScoreUpdate(localActorId, mine.kills, mine.deaths);
        network.sendPlayerName(localActorId, localPlayerName);
      }
    },

    onPlayerLeave(actorNr) {
      const player = remotePlayers.get(actorNr);
      if (!player) return;
      player.remove();
      remotePlayers.delete(actorNr);
      scores.delete(actorNr);
      playerNames.delete(actorNr);
      refreshTrainingBotState();
      updateDisplayedPlayerCount();
      refreshScoreboard();
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

    onKill({ killerId, victimId }) {
      ensureScoreEntry(killerId).kills++;
      ensureScoreEntry(victimId).deaths++;
      refreshScoreboard();
      updateLocalKDA();
    },

    onScoreUpdate({ actorNr, kills, deaths }) {
      if (actorNr === localActorId) return;
      scores.set(actorNr, { kills, deaths, assists: scores.get(actorNr)?.assists ?? 0 });
      refreshScoreboard();
    },

    onPlayerName({ actorNr, name }) {
      const cleanName = sanitizePlayerName(name);
      playerNames.set(actorNr, cleanName);
      const player = remotePlayers.get(actorNr);
      if (player) player.setName(cleanName);
      refreshScoreboard();
    },

    onRespawn(actorNr) {
      const p = remotePlayers.get(actorNr);
      if (p) {
        p.health = 100;
        p.burnTimer = 0;
        p.slowTimer = 0;
        p.silenceTimer = 0;
        p.hitFlashTimer = 0;
      }
    },

    onConnectionFailed(reason) {
      ui.setOverlayStatus(`Multiplayer unavailable — ${reason}. Click to play solo.`);
      localActorId = 1;
      localPlayer.id = 1;
      playerNames.set(1, localPlayerName);
      ensureScoreEntry(localActorId);
      updateLocalKDA();
      refreshTrainingBotState();
      refreshScoreboard();
    },

    onHit(actorNr, data) {
      if (data.targetId === localActorId) {
        const dead = localPlayer.takeDamage(data.damage);
        ui.addDamageNumber(data.damage, 'taken');
        localPlayer.applySpellEffect(data.sp || 'fire');

        if (data.sp === 'air' && data.kx !== undefined) {
          _knockbackVel.set(data.kx, 0, data.kz).normalize().multiplyScalar(30);
        }

        ui.setHealth(localPlayer.health);
        if (dead) handleRemoteHitDefeat(actorNr);
      } else {
        const target = remotePlayers.get(data.targetId);
        if (target) {
          target.takeDamage(data.damage);
          if (actorNr === localActorId) ui.addDamageNumber(data.damage, 'dealt');
        }
      }
    },
  });

  network.connect();

  ui.showOverlay(true);
  ui.setHealth(100);
  updateDisplayedPlayerCount();
  ui.setKDA(0, 0, 0);
  refreshScoreboard();

  playCard.addEventListener('click', (e) => {
    e.stopPropagation();
    controls.requestLock();
  });

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) {
      ui.showOverlay(false);
    } else {
      ui.showOverlay(true);
      ui.hideScoreboard();
      ui.setOverlayStatus(localActorId >= 0 ? 'Paused — click to resume' : 'Connecting…');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      e.preventDefault();
      if (!document.pointerLockElement) return;
      ui.toggleScoreboard();
    }
  });

  clock.start();
  loop();
}

// ── Dynamic ground height (ramps + platforms) ─────────────────────────────────
function getGroundY(x, z) {
  let y = GROUND_Y;
  if (!colliders) return y;
  for (const p of colliders.platforms || []) {
    if (x >= p.xMin && x <= p.xMax && z >= p.zMin && z <= p.zMax)
      y = Math.max(y, p.y);
  }
  for (const r of colliders.ramps || []) {
    if (x >= r.xMin && x <= r.xMax && z >= r.zMin && z <= r.zMax) {
      const a = r.axis === 'z' ? z : x;
      const t = (a - r.axisStart) / (r.axisEnd - r.axisStart);
      y = Math.max(y, r.yStart + t * (r.yEnd - r.yStart));
    }
  }
  return y;
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);
  const delta = Math.min(clock.getDelta(), 0.05);
  update(delta);
  updateCamera();
  renderer.render(scene, camera);
}

function update(delta) {
  if (!controls.isLocked || localActorId < 0) return;
  aimBlend = THREE.MathUtils.lerp(aimBlend, controls.isAiming ? 1 : 0, 1 - Math.exp(-delta * 14));

  const { dx, dy } = controls.consumeMouseDelta();
  cameraYaw -= dx * MOUSE_SENS;
  cameraPitch = clamp(cameraPitch - dy * MOUSE_SENS, PITCH_MIN, PITCH_MAX);

  localPlayer.rotation = cameraYaw;

  _moveDir.set(0, 0, 0);
  if (controls.isDown('KeyW') || controls.isDown('ArrowUp')) _moveDir.z -= 1;
  if (controls.isDown('KeyS') || controls.isDown('ArrowDown')) _moveDir.z += 1;
  if (controls.isDown('KeyA') || controls.isDown('ArrowLeft')) _moveDir.x -= 1;
  if (controls.isDown('KeyD') || controls.isDown('ArrowRight')) _moveDir.x += 1;

  if (_moveDir.lengthSq() > 0) {
    _moveDir.normalize().applyAxisAngle(_yAxis, cameraYaw);
    const speed = localPlayer.slowTimer > 0 ? MOVE_SPEED * SLOW_FACTOR : MOVE_SPEED;
    localPlayer.position.addScaledVector(_moveDir, speed * delta);
  }

  if (colliders) {
    const PR = 0.45;
    const bound = colliders.arenaSize - PR;
    localPlayer.position.x = clamp(localPlayer.position.x, -bound, bound);
    localPlayer.position.z = clamp(localPlayer.position.z, -bound, bound);
    for (const tree of colliders.trees) {
      const dxTree = localPlayer.position.x - tree.x;
      const dzTree = localPlayer.position.z - tree.z;
      const distSq = dxTree * dxTree + dzTree * dzTree;
      const minDist = tree.radius + PR;
      if (distSq < minDist * minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        localPlayer.position.x += (dxTree / dist) * overlap;
        localPlayer.position.z += (dzTree / dist) * overlap;
      }
    }
    for (const box of (colliders.boxes || [])) {
      if (localPlayer.position.y >= box.maxY - 0.3) continue; // on top — don't block
      const px = localPlayer.position.x, pz = localPlayer.position.z;
      if (px > box.xMin && px < box.xMax && pz > box.zMin && pz < box.zMax) {
        const dxMin = px - box.xMin, dxMax = box.xMax - px;
        const dzMin = pz - box.zMin, dzMax = box.zMax - pz;
        const minD = Math.min(dxMin, dxMax, dzMin, dzMax);
        if      (minD === dxMin) localPlayer.position.x = box.xMin - PR;
        else if (minD === dxMax) localPlayer.position.x = box.xMax + PR;
        else if (minD === dzMin) localPlayer.position.z = box.zMin - PR;
        else                     localPlayer.position.z = box.zMax + PR;
      }
    }
  }

  if (_knockbackVel.lengthSq() > 0.01) {
    localPlayer.position.addScaledVector(_knockbackVel, delta);
    _knockbackVel.multiplyScalar(Math.max(0, 1 - delta * 7));
  }

  if (controls.consumeJump() && isGrounded && localPlayer.groundedTimer <= 0) {
    playerVelocityY = JUMP_VELOCITY;
    isGrounded = false;
  }
  playerVelocityY -= GRAVITY * delta;
  localPlayer.position.y += playerVelocityY * delta;
  const groundY = getGroundY(localPlayer.position.x, localPlayer.position.z);
  if (localPlayer.position.y <= groundY) {
    localPlayer.position.y = groundY;
    playerVelocityY = 0;
    isGrounded = true;
  }

  if (localPlayer.burnTimer > 0) {
    const dead = localPlayer.takeDamage(localPlayer.burnDps * delta);
    ui.setHealth(localPlayer.health);
    if (dead) {
      localPlayer.respawn();
      ui.setHealth(localPlayer.health);
    }
  }

  ui.setEffect(
    localPlayer.burnTimer > 0 ? 'burn' :
    localPlayer.slowTimer > 0 ? 'slow' :
    localPlayer.silenceTimer > 0 ? 'silence' :
    localPlayer.groundedTimer > 0 ? 'ground' : null
  );

  shootTimer -= delta;
  if (controls.consumeClick() && shootTimer <= 0 && localPlayer.silenceTimer <= 0) {
    shootTimer = SHOOT_COOLDOWN;
    castFireball();
  }

  if (trainingBot && trainingBotAI) {
    const botShot = trainingBotAI.update(delta, localPlayer);
    if (botShot) fireballs.spawn(botShot.position, botShot.direction, BOT_ID, botShot.spell);
  }

  localPlayer.update(delta);
  if (trainingBot) trainingBot.update(delta);
  remotePlayers.forEach((p) => p.update(delta));

  fireballs.update(delta, getCombatTargets(), getSimulatedOwners(), (ownerId, targetId, damage, spell, dir) => {
    if (ownerId === localActorId) {
      network.sendHit(targetId, damage, spell, spell === 'air' ? dir : null);
      const target = targetId === BOT_ID ? trainingBot : remotePlayers.get(targetId);
      if (!target) return;

      const dead = target.takeDamage(damage);
      ui.addDamageNumber(damage, 'dealt');
      if (!dead) return;

      target.respawn();
      if (targetId !== BOT_ID) {
        network.sendKill(localActorId, targetId);
        const mine = scores.get(localActorId);
        network.sendScoreUpdate(localActorId, mine.kills + 1, mine.deaths);
      } else {
        handleDefeat(localActorId, targetId, 'You', 'Training Bot');
      }
      return;
    }

    if (ownerId === BOT_ID && targetId === localActorId) {
      const dead = localPlayer.takeDamage(damage);
      ui.addDamageNumber(damage, 'taken');
      localPlayer.applySpellEffect(spell);
      ui.setHealth(localPlayer.health);
      if (!dead) return;

      localPlayer.respawn();
      ui.setHealth(localPlayer.health);
      handleDefeat(BOT_ID, localActorId, 'Training Bot', 'you');
    }
  }, colliders);

  netTimer += delta;
  if (netTimer >= NET_TICK) {
    netTimer = 0;
    network.sendPosition(localPlayer.position, localPlayer.rotation);
    updateDisplayedPlayerCount();
  }
}

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

  if (firstPersonWand) {
    const sway = controls.isLocked ? clock.elapsedTime : 0;
    const moving = _moveDir.lengthSq() > 0 ? 1 - aimBlend * 0.85 : 0;
    firstPersonWand.position.lerpVectors(_wandBasePos, _wandAimPos, aimBlend);
    firstPersonWand.position.x += Math.sin(sway * 7.5) * 0.012 * moving;
    firstPersonWand.position.y += Math.cos(sway * 15) * 0.01 * moving;
    firstPersonWand.rotation.set(
      THREE.MathUtils.lerp(-0.22, -0.06, aimBlend) + Math.sin(sway * 8.5) * 0.015 * moving,
      THREE.MathUtils.lerp(Math.PI + 0.2, Math.PI + 0.04, aimBlend),
      THREE.MathUtils.lerp(-0.04, -0.015, aimBlend)
    );
  }

  camera.fov = THREE.MathUtils.lerp(DEFAULT_FOV, ADS_FOV, aimBlend);
  camera.updateProjectionMatrix();
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

init();
