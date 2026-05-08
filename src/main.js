import * as THREE from 'three';
import { createScene } from './scene.js';
import {
  Player,
  remoteColor,
  createFirstPersonWand,
  applyFirstPersonWandSkin,
  createWizardModel,
  PLAYER_SKINS,
  DEFAULT_SKIN_ID,
  getSkinConfig,
} from './player.js';
import { Controls } from './controls.js';
import { FireballManager } from './fireball.js';
import { NetworkManager } from './network.js';
import { UIManager } from './ui.js';
import { SimpleBotController } from './bot.js';
import { createSupabaseClient } from './lib/supabase.js';
import {
  EMPTY_LIFETIME_STATS,
  fetchLifetimeStats,
  incrementLifetimeStats,
  normalizeLifetimeStats,
} from './lib/lifetime-stats.js';

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
const WEAPON_STATS = {
  fire: {
    name: 'Fire Wand',
    damage: 88,
    speed: 74,
    control: 52,
    impact: 70,
  },
  ice: {
    name: 'Ice Wand',
    damage: 60,
    speed: 68,
    control: 90,
    impact: 46,
  },
  lightning: {
    name: 'Lightning Wand',
    damage: 72,
    speed: 96,
    control: 62,
    impact: 58,
  },
  air: {
    name: 'Air Wand',
    damage: 42,
    speed: 82,
    control: 78,
    impact: 92,
  },
  earth: {
    name: 'Earth Wand',
    damage: 84,
    speed: 44,
    control: 66,
    impact: 95,
  },
};

let scene, camera, renderer;
let localPlayer;
let firstPersonWand;
let previewScene, previewCamera, previewRenderer, previewModel;
const remotePlayers = new Map();
let trainingBot = null;
let trainingBotAI = null;
let supabase = null;

let controls, fireballs, network, ui, colliders;
const scores = new Map();
const playerNames = new Map();
const playerSkins = new Map();

let cameraYaw = 0;
let cameraPitch = 0;
let shootTimer = 0;
let netTimer = 0;
let localActorId = -1;
let aimBlend = 0;
let localPlayerName = 'Wizard';
let localSkinId = DEFAULT_SKIN_ID;
let isGuestMode = false;
let authSession = null;
let playerVelocityY = 0;
let isGrounded = true;
let selectedSpell = 'fire';
let lifetimeStats = { ...EMPTY_LIFETIME_STATS };
let pendingLifetimeDelta = { ...EMPTY_LIFETIME_STATS };
let lifetimeFlushPromise = null;

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

function sanitizeSkinId(value) {
  return value && value in PLAYER_SKINS ? value : DEFAULT_SKIN_ID;
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

function updateLifetimeStatsUi() {
  const killsEl = document.getElementById('lifetime-kills');
  const deathsEl = document.getElementById('lifetime-deaths');
  const kdEl = document.getElementById('lifetime-kd');
  const damageEl = document.getElementById('lifetime-damage');
  const noteEl = document.getElementById('lifetime-stats-note');
  const kdRatio = lifetimeStats.deaths > 0
    ? (lifetimeStats.kills / lifetimeStats.deaths).toFixed(2)
    : lifetimeStats.kills.toFixed(2);

  if (killsEl) killsEl.textContent = String(lifetimeStats.kills);
  if (deathsEl) deathsEl.textContent = String(lifetimeStats.deaths);
  if (kdEl) kdEl.textContent = kdRatio;
  if (damageEl) damageEl.textContent = String(Math.round(lifetimeStats.damage_dealt));
  if (noteEl) {
    noteEl.textContent = authSession?.user
      ? 'Signed-in lifetime stats are saved to Supabase.'
      : 'Sign in with Google to save lifetime stats.';
  }
}

function mergeLifetimeStats(delta) {
  Object.keys(EMPTY_LIFETIME_STATS).forEach((key) => {
    lifetimeStats[key] += Number(delta[key] || 0);
  });
  updateLifetimeStatsUi();
}

function isZeroLifetimeDelta(delta) {
  return Object.keys(EMPTY_LIFETIME_STATS).every((key) => !delta[key]);
}

async function flushLifetimeStats() {
  if (lifetimeFlushPromise || !supabase || !authSession?.user) return;
  if (isZeroLifetimeDelta(pendingLifetimeDelta)) return;

  const delta = { ...pendingLifetimeDelta };
  pendingLifetimeDelta = { ...EMPTY_LIFETIME_STATS };

  lifetimeFlushPromise = incrementLifetimeStats(supabase, delta)
    .then((row) => {
      lifetimeStats = normalizeLifetimeStats(row);
      updateLifetimeStatsUi();
    })
    .catch((error) => {
      console.warn('Failed to persist lifetime stats:', error);
      Object.keys(EMPTY_LIFETIME_STATS).forEach((key) => {
        pendingLifetimeDelta[key] += Number(delta[key] || 0);
      });
    })
    .finally(() => {
      lifetimeFlushPromise = null;
      if (!isZeroLifetimeDelta(pendingLifetimeDelta)) flushLifetimeStats();
    });

  await lifetimeFlushPromise;
}

function queueLifetimeStats(delta) {
  if (isGuestMode || !authSession?.user) return;
  mergeLifetimeStats(delta);

  Object.keys(EMPTY_LIFETIME_STATS).forEach((key) => {
    pendingLifetimeDelta[key] += Number(delta[key] || 0);
  });
  flushLifetimeStats();
}

async function loadLifetimeStats(session) {
  authSession = session;
  if (!supabase || !session?.user) {
    lifetimeStats = { ...EMPTY_LIFETIME_STATS };
    pendingLifetimeDelta = { ...EMPTY_LIFETIME_STATS };
    updateLifetimeStatsUi();
    return;
  }

  try {
    lifetimeStats = await fetchLifetimeStats(supabase, session.user.id);
  } catch (error) {
    console.warn('Failed to load lifetime stats:', error);
    lifetimeStats = { ...EMPTY_LIFETIME_STATS };
  }
  pendingLifetimeDelta = { ...EMPTY_LIFETIME_STATS };
  updateLifetimeStatsUi();
}

function setAuthStatus(message = '', type = '') {
  const statusEl = document.getElementById('auth-status-text');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = 'lo-auth-status';
  if (type) statusEl.classList.add(type);
}

function toggleAuthModal(visible) {
  const backdrop = document.getElementById('auth-modal-backdrop');
  if (!backdrop) return;
  backdrop.hidden = !visible;
  if (!visible) setAuthStatus('');
}

function setGuestMode(enabled) {
  isGuestMode = enabled;
  localStorage.setItem('wand-ops-guest-mode', enabled ? 'true' : 'false');
  if (enabled) {
    pendingLifetimeDelta = { ...EMPTY_LIFETIME_STATS };
    lifetimeStats = { ...EMPTY_LIFETIME_STATS };
  }
  updateLifetimeStatsUi();
}

function updateAuthUi(session) {
  const signInBtn = document.getElementById('auth-signin-btn');
  const signOutBtn = document.getElementById('auth-signout-btn');
  const userBadge = document.getElementById('auth-user-badge');
  const email = session?.user?.email || '';
  const showGuest = !session && isGuestMode;

  if (signInBtn) signInBtn.hidden = Boolean(session);
  if (signOutBtn) signOutBtn.hidden = !session;
  if (userBadge) {
    userBadge.hidden = !session && !showGuest;
    userBadge.textContent = session ? (email || 'Signed In') : 'Guest';
  }
}

async function setupSupabaseAuth() {
  const signInBtn = document.getElementById('auth-signin-btn');
  const signOutBtn = document.getElementById('auth-signout-btn');
  const closeBtn = document.getElementById('auth-close-btn');
  const backdrop = document.getElementById('auth-modal-backdrop');
  const googleBtn = document.getElementById('auth-google-btn');
  const guestBtn = document.getElementById('auth-guest-btn');

  try {
    supabase = createSupabaseClient();
  } catch (error) {
    supabase = null;
    if (signInBtn) signInBtn.title = 'Supabase environment variables are missing';
  }

  signInBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAuthModal(true);
  });

  signOutBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await flushLifetimeStats();
    const { error } = await supabase.auth.signOut();
    if (error) {
      setAuthStatus(error.message, 'error');
      toggleAuthModal(true);
    }
  });

  closeBtn?.addEventListener('click', () => toggleAuthModal(false));
  backdrop?.addEventListener('click', () => toggleAuthModal(false));
  googleBtn?.addEventListener('click', async () => {
    if (!supabase) {
      setAuthStatus('Supabase auth is not configured in this environment.', 'error');
      return;
    }
    googleBtn.disabled = true;
    setAuthStatus('Redirecting to Google…');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (error) {
      setAuthStatus(error.message || 'Google sign-in failed.', 'error');
      googleBtn.disabled = false;
    }
  });

  guestBtn?.addEventListener('click', () => {
    setGuestMode(true);
    updateAuthUi(null);
    toggleAuthModal(false);
  });

  if (!supabase) {
    updateLifetimeStatsUi();
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (!error) {
    if (data.session) setGuestMode(false);
    updateAuthUi(data.session);
    await loadLifetimeStats(data.session);
  } else {
    updateLifetimeStatsUi();
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session) setGuestMode(false);
    updateAuthUi(session);
    await loadLifetimeStats(session);
    if (session) toggleAuthModal(false);
  });
}

function updateWeaponStats(spell) {
  const stats = WEAPON_STATS[spell] || WEAPON_STATS.fire;
  const nameEl = document.getElementById('weapon-stats-name');
  if (nameEl) nameEl.textContent = stats.name;

  const entries = [
    ['stat-damage', stats.damage],
    ['stat-speed', stats.speed],
    ['stat-control', stats.control],
    ['stat-impact', stats.impact],
  ];

  entries.forEach(([id, value]) => {
    const bar = document.getElementById(id);
    if (bar) bar.style.width = `${value}%`;
  });
}

function syncSkinPicker(skinId) {
  document.querySelectorAll('.lo-skin-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.skin === skinId);
  });
}

function applyHomepageSkinPreview(skinId) {
  const skin = getSkinConfig(skinId);
  const avatar = document.querySelector('.lo-avatar-oval');
  const statusDot = document.querySelector('.lo-status-dot');
  const pageTitle = document.querySelector('.lo-page-title');

  if (avatar) {
    avatar.style.borderColor = hexToRgba(skin.accent, 0.35);
    avatar.style.boxShadow = `0 0 28px ${hexToRgba(skin.glow, 0.18)}`;
  }
  if (statusDot) {
    statusDot.style.background = `#${skin.accent.toString(16).padStart(6, '0')}`;
    statusDot.style.boxShadow = `0 0 10px ${hexToRgba(skin.glow, 0.85)}`;
  }
  if (pageTitle) {
    pageTitle.style.textShadow = `0 0 28px ${hexToRgba(skin.glow, 0.22)}`;
  }
  if (previewModel?.userData?.bodyMat && previewModel?.userData?.trimMat) {
    previewModel.userData.bodyMat.color.setHex(skin.body);
    previewModel.userData.trimMat.color.setHex(darkenHex(skin.body, 0.4));
  }
}

function setLocalSkin(skinId, shouldBroadcast = true) {
  localSkinId = sanitizeSkinId(skinId);
  localPlayer.setSkin(localSkinId);
  applyFirstPersonWandSkin(firstPersonWand, localSkinId);
  playerSkins.set(localActorId, localSkinId);
  localStorage.setItem('wand-ops-player-skin', localSkinId);
  applyHomepageSkinPreview(localSkinId);
  syncSkinPicker(localSkinId);
  if (shouldBroadcast && localActorId >= 0) {
    network.sendPlayerSkin(localActorId, localSkinId);
  }
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
  playerSkins.set(BOT_ID, DEFAULT_SKIN_ID);
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
  playerSkins.delete(BOT_ID);
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
  if (killerId === localActorId) queueLifetimeStats({ kills: 1 });
  if (victimId === localActorId) queueLifetimeStats({ deaths: 1 });
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
  queueLifetimeStats({ deaths: 1 });
  ui.addKillEntry(`${getPlayerLabel(actorNr)} defeated you!`);
}

function init() {
  const canvas = document.getElementById('game-canvas');
  const heroPreviewCanvas = document.getElementById('hero-preview-canvas');
  const playerNameInput = document.getElementById('player-name-input');
  const playCard = document.getElementById('lo-play-card');
  const skinButtons = [...document.querySelectorAll('.lo-skin-btn')];
  ({ scene, camera, renderer, colliders } = createScene(canvas));
  scene.add(camera);
  camera.fov = DEFAULT_FOV;
  camera.updateProjectionMatrix();

  const storedName = localStorage.getItem('wand-ops-player-name');
  const storedSkin = localStorage.getItem('wand-ops-player-skin');
  isGuestMode = localStorage.getItem('wand-ops-guest-mode') === 'true';
  localPlayerName = sanitizePlayerName(storedName);
  localSkinId = sanitizeSkinId(storedSkin);
  playerNameInput.value = localPlayerName;
  const loPlayerNameEl = document.getElementById('lo-player-name');
  if (loPlayerNameEl) loPlayerNameEl.textContent = localPlayerName.toUpperCase();

  controls = new Controls();
  ui = new UIManager();
  fireballs = new FireballManager(scene);
  setupSupabaseAuth();
  updateLifetimeStatsUi();

  if (heroPreviewCanvas) {
    previewScene = new THREE.Scene();
    previewCamera = new THREE.PerspectiveCamera(28, 200 / 260, 0.1, 100);
    previewCamera.position.set(0, 0.95, 4.2);
    previewCamera.lookAt(0, 0.75, 0);

    previewRenderer = new THREE.WebGLRenderer({
      canvas: heroPreviewCanvas,
      alpha: true,
      antialias: true,
    });
    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    previewRenderer.setClearColor(0x000000, 0);

    const keyLight = new THREE.DirectionalLight(0xf8eaff, 2.9);
    keyLight.position.set(2.8, 3.4, 4.4);
    previewScene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x74b9ff, 1.4);
    rimLight.position.set(-2.4, 2.2, -3.2);
    previewScene.add(rimLight);

    const fillLight = new THREE.AmbientLight(0xffffff, 1.65);
    previewScene.add(fillLight);

    const floorGlow = new THREE.Mesh(
      new THREE.CircleGeometry(1.35, 32),
      new THREE.MeshBasicMaterial({
        color: 0x6f5cff,
        transparent: true,
        opacity: 0.16,
      }),
    );
    floorGlow.rotation.x = -Math.PI / 2;
    floorGlow.position.set(0, -0.98, 0);
    previewScene.add(floorGlow);

    previewModel = createWizardModel(getSkinConfig(localSkinId).body, {
      includeNameTag: false,
    });
    previewModel.scale.setScalar(1.18);
    previewModel.position.set(0, -0.18, 0);
    previewModel.rotation.y = -0.58;
    previewScene.add(previewModel);
    updateHeroPreviewSize();
  }

  localPlayer = new Player(scene, true, getSkinConfig(localSkinId).body);
  localPlayer.setName(localPlayerName);
  localPlayer.setSkin(localSkinId);
  localPlayer.group.visible = false;
  firstPersonWand = createFirstPersonWand();
  camera.add(firstPersonWand);
  applyFirstPersonWandSkin(firstPersonWand, localSkinId);
  applyHomepageSkinPreview(localSkinId);
  syncSkinPicker(localSkinId);

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

  skinButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      setLocalSkin(btn.dataset.skin);
    });
  });

  document.querySelectorAll('.spell-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedSpell = btn.dataset.spell;
      document.querySelectorAll('.spell-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      ui.setSpell(selectedSpell);
      updateWeaponStats(selectedSpell);
    });
  });
  ui.setSpell(selectedSpell);
  updateWeaponStats(selectedSpell);

  network = new NetworkManager({
    onConnected(actorNr) {
      localActorId = actorNr;
      localPlayer.id = actorNr;
      playerNames.set(actorNr, localPlayerName);
      playerSkins.set(actorNr, localSkinId);
      scores.set(actorNr, { kills: 0, deaths: 0, assists: 0 });
      updateLocalKDA();
      refreshTrainingBotState();
      refreshScoreboard();
      network.sendPlayerName(actorNr, localPlayerName);
      network.sendPlayerSkin(actorNr, localSkinId);
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
      playerSkins.set(actorNr, DEFAULT_SKIN_ID);
      scores.set(actorNr, { kills: 0, deaths: 0, assists: 0 });
      refreshTrainingBotState();
      updateDisplayedPlayerCount();
      refreshScoreboard();
      if (localActorId >= 0) {
        const mine = scores.get(localActorId);
        if (mine) network.sendScoreUpdate(localActorId, mine.kills, mine.deaths);
        network.sendPlayerName(localActorId, localPlayerName);
        network.sendPlayerSkin(localActorId, localSkinId);
      }
    },

    onPlayerLeave(actorNr) {
      const player = remotePlayers.get(actorNr);
      if (!player) return;
      player.remove();
      remotePlayers.delete(actorNr);
      scores.delete(actorNr);
      playerNames.delete(actorNr);
      playerSkins.delete(actorNr);
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

    onPlayerSkin({ actorNr, skinId }) {
      const cleanSkin = sanitizeSkinId(skinId);
      playerSkins.set(actorNr, cleanSkin);
      const player = remotePlayers.get(actorNr);
      if (player) player.setSkin(cleanSkin);
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
      playerSkins.set(1, localSkinId);
      ensureScoreEntry(localActorId);
      updateLocalKDA();
      refreshTrainingBotState();
      refreshScoreboard();
    },

    onHit(actorNr, data) {
      if (data.targetId === localActorId) {
        const dead = localPlayer.takeDamage(data.damage);
        ui.addDamageNumber(data.damage, 'taken');
        queueLifetimeStats({ damage_taken: data.damage });
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

  window.addEventListener('resize', updateHeroPreviewSize);

  clock.start();
  loop();
}

function getGroundY(x, z) {
  let y = GROUND_Y;
  if (!colliders) return y;
  for (const p of colliders.platforms || []) {
    if (x >= p.xMin && x <= p.xMax && z >= p.zMin && z <= p.zMax) y = Math.max(y, p.y);
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

let _fpsFrames = 0, _fpsAccum = 0;

function loop() {
  requestAnimationFrame(loop);
  const delta = Math.min(clock.getDelta(), 0.05);
  _fpsFrames++;
  _fpsAccum += delta;
  if (_fpsAccum >= 0.5) {
    const fpsEl = document.getElementById('fps-counter');
    if (fpsEl) fpsEl.textContent = `${Math.round(_fpsFrames / _fpsAccum)} FPS`;
    _fpsFrames = 0;
    _fpsAccum = 0;
  }
  update(delta);
  updateCamera();
  renderer.render(scene, camera);
  renderHeroPreview(delta);
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
    const pr = 0.45;
    const bound = colliders.arenaSize - pr;
    localPlayer.position.x = clamp(localPlayer.position.x, -bound, bound);
    localPlayer.position.z = clamp(localPlayer.position.z, -bound, bound);
    for (const tree of colliders.trees) {
      const dxTree = localPlayer.position.x - tree.x;
      const dzTree = localPlayer.position.z - tree.z;
      const distSq = dxTree * dxTree + dzTree * dzTree;
      const minDist = tree.radius + pr;
      if (distSq < minDist * minDist && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        localPlayer.position.x += (dxTree / dist) * overlap;
        localPlayer.position.z += (dzTree / dist) * overlap;
      }
    }
    for (const box of colliders.boxes || []) {
      if (localPlayer.position.y >= box.maxY - 0.3) continue;
      const px = localPlayer.position.x;
      const pz = localPlayer.position.z;
      if (px > box.xMin && px < box.xMax && pz > box.zMin && pz < box.zMax) {
        const dxMin = px - box.xMin;
        const dxMax = box.xMax - px;
        const dzMin = pz - box.zMin;
        const dzMax = box.zMax - pz;
        const minD = Math.min(dxMin, dxMax, dzMin, dzMax);
        if (minD === dxMin) localPlayer.position.x = box.xMin - pr;
        else if (minD === dxMax) localPlayer.position.x = box.xMax + pr;
        else if (minD === dzMin) localPlayer.position.z = box.zMin - pr;
        else localPlayer.position.z = box.zMax + pr;
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
      queueLifetimeStats({ deaths: 1 });
      localPlayer.respawn();
      ui.setHealth(localPlayer.health);
    }
  }

  ui.setEffect(
    localPlayer.burnTimer > 0 ? 'burn'
      : localPlayer.slowTimer > 0 ? 'slow'
        : localPlayer.silenceTimer > 0 ? 'silence'
          : localPlayer.groundedTimer > 0 ? 'ground'
            : null
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
      queueLifetimeStats({ damage_dealt: damage });
      if (!dead) return;

      target.respawn();
      if (targetId !== BOT_ID) {
        queueLifetimeStats({ kills: 1 });
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
      queueLifetimeStats({ damage_taken: damage });
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
  queueLifetimeStats({ spells_cast: 1 });
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

function updateHeroPreviewSize() {
  const previewCanvas = document.getElementById('hero-preview-canvas');
  if (!previewRenderer || !previewCamera || !previewCanvas) return;
  const rect = previewCanvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  previewRenderer.setSize(width, height, false);
  previewCamera.aspect = width / height;
  previewCamera.updateProjectionMatrix();
}

function renderHeroPreview(delta) {
  if (!previewRenderer || !previewScene || !previewCamera || !previewModel) return;
  previewModel.rotation.y += delta * 0.55;
  previewModel.position.y = -0.18 + Math.sin(clock.elapsedTime * 1.8) * 0.035;
  previewRenderer.render(previewScene, previewCamera);
}

function hexToRgba(hex, alpha) {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function darkenHex(hex, amount) {
  const r = Math.max(0, Math.round(((hex >> 16) & 0xff) * (1 - amount)));
  const g = Math.max(0, Math.round(((hex >> 8) & 0xff) * (1 - amount)));
  const b = Math.max(0, Math.round((hex & 0xff) * (1 - amount)));
  return (r << 16) | (g << 8) | b;
}

init();
