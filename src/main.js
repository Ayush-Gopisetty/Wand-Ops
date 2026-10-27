import { inject } from '@vercel/analytics';
import * as THREE from 'three';
import { createScene } from './scene.js';
import {
  Player,
  remoteColor,
  createFirstPersonWand,
  applyFirstPersonWandSkin,
  FIRST_PERSON_LAYER,
  WAND_SCOPE_HEIGHT,
  createWizardModel,
  applySkinToModel,
  PLAYER_SKINS,
  DEFAULT_SKIN_ID,
  DEFAULT_UNLOCKED_SKIN_IDS,
  getSkinConfig,
} from './player.js';
import { Controls } from './controls.js';
import { FireballManager, SPELL_CONFIG } from './fireball.js';
import { NetworkManager } from './network.js';
import { UIManager } from './ui.js';
import { SimpleBotController } from './bot.js';
import { SoundManager } from './audio.js';
import { WIZARD_NEWS } from './news.js';
import { applySeasonalLogo } from './season.js';
import { version as APP_VERSION } from '../package.json';
import { GROUND_Y, getGroundY as groundYAt, isOverRamp, moveWithCollisions } from './collision.js';
import { injectSpeedInsights } from '@vercel/speed-insights';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import { createFirebaseServices } from './lib/firebase.js';
import {
  EMPTY_LIFETIME_STATS,
  EMPTY_PLAYER_PROFILE,
  fetchLifetimeStats,
  fetchPlayerProfile,
  incrementLifetimeStats,
  normalizeLifetimeStats,
  savePlayerProfile,
} from './lib/lifetime-stats.js';

inject();

const MOVE_SPEED = 9;
const SLOW_FACTOR = 0.3;
const MOUSE_SENS = 0.0022;
const PITCH_MIN = -1.4;
const PITCH_MAX = 1.4;
const DEFAULT_FOV = 72;
const ADS_FOV = 44;
const SETTINGS_KEY = 'wand-ops-settings';
const DEFAULT_SETTINGS = { sensitivity: 1, fov: DEFAULT_FOV, showFps: true, volume: 0.7, muted: false };
const sound = new SoundManager();
const CHAT_MAX_LEN = 120;
const CHAT_HISTORY = 50;
const CHAT_COOLDOWN_MS = 800;
const HUD_CHAT_LINES = 8;
const HUD_CHAT_FADE_MS = 8000;
const SHOOT_COOLDOWN = 0.5;
const NET_TICK = 1 / 13;
// Incoming hits can't claim more than the strongest spell does
const MAX_HIT_DAMAGE = Math.max(...Object.values(SPELL_CONFIG).map((s) => s.damage));
const NAME_SEND_DELAY_MS = 400;
const EYE_HEIGHT = 1.5;
const JUMP_VELOCITY = 8;
const GRAVITY = 22;
// Seconds a defeated human spends on the death screen before re-entering play
const RESPAWN_DELAY = 3;
// Kills this close together chain into a multi-kill
const MULTI_KILL_WINDOW_MS = 4000;
const MULTI_KILL_TITLES = ['', '', 'Double Kill', 'Triple Kill', 'Quad Kill'];
const STREAK_TITLES = { 3: 'Wizard Spree', 5: 'Arcane Rampage', 7: 'Unstoppable Sorcery', 10: 'Archmage' };
const BOT_IDS = [9001, 9002];
const BOT_SPAWNS = [[0, 20], [0, -20]];
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
const GUEST_PROFILE_KEY = 'wand-ops-guest-profile';
const DAILY_QUEST_TEMPLATES = [
  { id: 'kills-3', metric: 'kills', label: 'Get 3 kills', target: 3, reward: 8 },
  { id: 'kills-6', metric: 'kills', label: 'Get 6 kills', target: 6, reward: 14 },
  { id: 'damage-400', metric: 'damage_dealt', label: 'Deal 400 damage', target: 400, reward: 7 },
  { id: 'damage-900', metric: 'damage_dealt', label: 'Deal 900 damage', target: 900, reward: 14 },
  { id: 'casts-12', metric: 'spells_cast', label: 'Cast 12 spells', target: 12, reward: 6 },
  { id: 'casts-25', metric: 'spells_cast', label: 'Cast 25 spells', target: 25, reward: 12 },
];

let scene, camera, renderer;
let localPlayer;
let firstPersonWand;
let previewScene, previewCamera, previewRenderer, previewModel;
const remotePlayers = new Map();
const bots = new Map(); // id -> { player, ai, name }; ai is set only on the bot host
const BOT_GAMER_TAGS = [
  'xX_HexLord_Xx', 'NoScopeMerlin', 'FrostByte', 'Gandalf_Main', 'spellsl1nger',
  'ManaBurnt', 'xXArcaneXx', 'CritWizard99', 'pyro_kid07', 'LagWizard',
  'ImOnlyLvl3', 'quickscopeqt', 'Sir_Fizzle', 'DarkMageOP', 'sweatyM4ge',
  'cast_n_blast', 'EzSpellz', 'MrMagicMissile', 'TheRealWizzard', 'NotABot_42',
  'icykicks', 'Hexagon_Joe', 'CrispyCaster', 'zap_zap_zap', 'Owlbear_Andy',
  'SpellCheck404', 'oneshot_oliver', 'BigStaffEnergy', 'm0rgana', 'tilted_tom',
];

function pickBotGamerTag() {
  const taken = new Set([localPlayerName, ...playerNames.values()].map((n) => (n || '').toLowerCase()));
  const options = BOT_GAMER_TAGS.filter((tag) => !taken.has(tag.toLowerCase()));
  return options[Math.floor(Math.random() * options.length)] || 'Wizard';
}

const isBotId = (id) => BOT_IDS.includes(id);
let firebaseServices = null;

let controls, fireballs, network, ui, colliders;
let settings = { ...DEFAULT_SETTINGS };
const scores = new Map();
const killStreaks = new Map(); // actorNr -> kills since their last death
let localMultiKills = 0;
let localLastKillAt = 0;
let lastHitOnMe = null; // { id, spell, at } so a burn-out can still name who lit you up
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
let coinCount = 0;
let lifetimeStats = { ...EMPTY_LIFETIME_STATS };
let pendingLifetimeDelta = { ...EMPTY_LIFETIME_STATS };
let lifetimeFlushPromise = null;
let ownedSkinIds = new Set(DEFAULT_UNLOCKED_SKIN_IDS);
let dailyQuestState = createDailyQuestState();

const _moveDir = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _forward = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
const _killCamTarget = new THREE.Vector3();
// Head height on another wizard's model, measured from their position
const KILL_CAM_HEAD_Y = 0.9;
const KILL_CAM_FOV = 55;
// Set while the death screen holds the camera where you fell, turned toward whoever got you
let killCam = null; // { pos, look, targetId }
const _knockbackVel = new THREE.Vector3();
const _stepDelta = new THREE.Vector3();
const _wandBasePos = new THREE.Vector3(0.3, -0.34, -0.64);
// Centers the scope on the view; at this distance the eyepiece lines up with the scope overlay circle
const _wandAimPos = new THREE.Vector3(0, -WAND_SCOPE_HEIGHT, -0.5);
const WAND_HIP_ROT = { x: 0.06, y: 0.08, z: -0.1 };

const clock = new THREE.Clock();
let scopeOverlayEl = null;
let crosshairEl = null;

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

function getTodayQuestKey() {
  return new Date().toLocaleDateString('en-CA', {
    timeZone: 'America/Chicago',
  });
}

function createDailyQuestState(dateKey = getTodayQuestKey()) {
  const seedBase = dateKey.split('-').reduce((sum, part) => sum + Number(part || 0), 0);
  const quests = [];
  for (let offset = 0; offset < 3; offset++) {
    const template = DAILY_QUEST_TEMPLATES[(seedBase + offset * 2) % DAILY_QUEST_TEMPLATES.length];
    if (quests.some((quest) => quest.id === template.id)) continue;
    quests.push({
      ...template,
      progress: 0,
      completed: false,
      claimed: false,
    });
  }

  while (quests.length < 3) {
    const template = DAILY_QUEST_TEMPLATES[quests.length];
    quests.push({
      ...template,
      progress: 0,
      completed: false,
      claimed: false,
    });
  }

  return { dateKey, quests };
}

function normalizeDailyQuestState(rawState) {
  const todayKey = getTodayQuestKey();
  if (!rawState || rawState.dateKey !== todayKey || !Array.isArray(rawState.quests)) {
    return createDailyQuestState(todayKey);
  }

  return {
    dateKey: todayKey,
    quests: rawState.quests
      .map((quest) => {
        const template = DAILY_QUEST_TEMPLATES.find((candidate) => candidate.id === quest.id);
        if (!template) return null;
        const progress = Math.max(0, Number(quest.progress || 0));
        const completed = progress >= template.target || Boolean(quest.completed);
        return {
          ...template,
          progress: Math.min(template.target, progress),
          completed,
          claimed: completed && Boolean(quest.claimed),
        };
      })
      .filter(Boolean),
  };
}

function readGuestProfile() {
  try {
    const raw = JSON.parse(localStorage.getItem(GUEST_PROFILE_KEY) || '{}');
    const ownedSkins = Array.isArray(raw.owned_skins)
      ? raw.owned_skins.map(sanitizeSkinId)
      : [...DEFAULT_UNLOCKED_SKIN_IDS];
    const selectedSkinId = sanitizeSkinId(raw.selected_skin_id || localStorage.getItem('wand-ops-player-skin'));

    return {
      owned_skins: [...new Set([...DEFAULT_UNLOCKED_SKIN_IDS, ...ownedSkins])],
      selected_skin_id: selectedSkinId,
      daily_quests: normalizeDailyQuestState(raw.daily_quests),
    };
  } catch (error) {
    return {
      ...EMPTY_PLAYER_PROFILE,
      owned_skins: [...DEFAULT_UNLOCKED_SKIN_IDS],
      selected_skin_id: sanitizeSkinId(localStorage.getItem('wand-ops-player-skin')),
      daily_quests: createDailyQuestState(),
    };
  }
}

function writeGuestProfile() {
  localStorage.setItem(GUEST_PROFILE_KEY, JSON.stringify({
    owned_skins: [...ownedSkinIds],
    selected_skin_id: localSkinId,
    daily_quests: dailyQuestState,
  }));
}

function getPlayerLabel(actorNr, isLocal = false) {
  if (isLocal || actorNr === localActorId) return '⚔ You';
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

// Bots fill the lobby to 3 combatants: 1 human -> 2 bots, 2 humans -> 1 bot, 3+ humans -> none
function getDesiredBotCount() {
  const humans = 1 + remotePlayers.size;
  return humans <= 2 ? 3 - humans : 0;
}

// The lowest-numbered human runs the bots; everyone else mirrors them from EV_BOT_STATE
function isBotHost() {
  if (localActorId < 0) return false;
  for (const actorNr of remotePlayers.keys()) {
    if (actorNr < localActorId) return false;
  }
  return true;
}

function updateDisplayedPlayerCount() {
  const baseCount = network ? network.getPlayerCount() : 1;
  ui.setPlayerCount(baseCount + bots.size);
  const lobbyOnline = document.getElementById('lobby-online');
  if (lobbyOnline && localActorId >= 0) {
    lobbyOnline.textContent = `${baseCount + bots.size} online`;
  }
}

function readGuestCoins() {
  const value = Number(localStorage.getItem('wand-ops-guest-coins') || localStorage.getItem('wand-ops-coins') || 0);
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function writeGuestCoins(value) {
  localStorage.setItem('wand-ops-guest-coins', String(value));
}

function ownsSkin(skinId) {
  return ownedSkinIds.has(sanitizeSkinId(skinId));
}

function getCurrentUserId(session = authSession) {
  return session?.user?.uid || null;
}

function updateCoinUi() {
  const coinEl = document.getElementById('coin-count');
  if (coinEl) coinEl.textContent = String(coinCount);
}

function updateSkinSaveNote() {
  const noteEl = document.getElementById('shop-signedin-note');
  if (noteEl) {
    noteEl.textContent = authSession?.user
      ? 'Purchases and equipped skins are saved to your account.'
      : 'Guest purchases stay on this browser. Sign in to save them to your account.';
  }
}

function renderSkinShop() {
  document.querySelectorAll('.lo-skin-btn').forEach((btn) => {
    const skinId = sanitizeSkinId(btn.dataset.skin);
    const skin = getSkinConfig(skinId);
    const priceEl = btn.querySelector('.lo-skin-price');
    const actionEl = btn.querySelector('.lo-skin-action');
    const unlocked = ownsSkin(skinId);
    const equipped = localSkinId === skinId;

    btn.classList.toggle('active', equipped);
    btn.classList.toggle('owned', unlocked);
    btn.classList.toggle('locked', !unlocked);
    btn.dataset.rarity = skin.rarity;
    if (priceEl) priceEl.textContent = skin.price > 0 ? `${skin.price} coins` : 'Free';
    if (actionEl) {
      actionEl.textContent = equipped ? 'Equipped' : unlocked ? 'Equip' : `Buy ${skin.price}`;
    }
  });

  updateSkinSaveNote();
}

function renderDailyQuests() {
  const listEl = document.getElementById('daily-quest-list');
  if (!listEl) return;


  listEl.innerHTML = dailyQuestState.quests.map((quest) => {
    const progress = Math.min(quest.target, quest.progress);
    const progressPct = Math.round((progress / quest.target) * 100);
    const buttonLabel = quest.claimed ? 'Claimed' : quest.completed ? `Claim ${quest.reward}` : `${progress}/${quest.target}`;
    const disabled = quest.claimed || !quest.completed ? 'disabled' : '';

    return `
      <div class="lo-quest-item">
        <div>
          <div class="lo-quest-title">${quest.label}</div>
          <div class="lo-quest-meta">Reward: ${quest.reward} coins</div>
          <div class="lo-quest-progress-track">
            <div class="lo-quest-progress-fill" style="width:${progressPct}%"></div>
          </div>
        </div>
        <button class="lo-quest-claim" type="button" data-quest-id="${quest.id}" ${disabled}>${buttonLabel}</button>
      </div>
    `;
  }).join('');

  listEl.querySelectorAll('.lo-quest-claim').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      claimDailyQuest(button.dataset.questId);
    });
  });
}

function awardCoins(amount) {
  const earned = Math.max(0, Math.floor(amount));
  coinCount = Math.max(0, coinCount + earned);
  if (authSession?.user) queueLifetimeStats({ coins: earned });
  else writeGuestCoins(coinCount);
  updateCoinUi();
}

async function persistProfile() {
  const profile = {
    owned_skins: [...ownedSkinIds],
    selected_skin_id: localSkinId,
    daily_quests: dailyQuestState,
  };
  const userId = getCurrentUserId();

  if (firebaseServices?.db && userId && !isGuestMode) {
    try {
      await savePlayerProfile(firebaseServices.db, userId, profile);
    } catch (error) {
      console.warn('Failed to persist player profile:', error);
    }
    return;
  }

  writeGuestProfile();
}

function progressDailyQuests(metric, amount = 1) {
  let changed = false;
  dailyQuestState = normalizeDailyQuestState(dailyQuestState);

  dailyQuestState = {
    ...dailyQuestState,
    quests: dailyQuestState.quests.map((quest) => {
      if (quest.metric !== metric || quest.claimed) return quest;
      const nextProgress = Math.min(quest.target, quest.progress + amount);
      if (nextProgress === quest.progress) return quest;
      changed = true;
      return {
        ...quest,
        progress: nextProgress,
        completed: nextProgress >= quest.target,
      };
    }),
  };

  if (!changed) return;
  renderDailyQuests();
  persistProfile();
}

function claimDailyQuest(questId) {
  let reward = 0;
  let changed = false;
  const nextState = normalizeDailyQuestState(dailyQuestState);

  dailyQuestState = {
    ...nextState,
    quests: nextState.quests.map((quest) => {
      if (quest.id !== questId || quest.claimed || !quest.completed) return quest;
      reward = quest.reward;
      changed = true;
      return { ...quest, claimed: true };
    }),
  };

  if (!changed) return;
  awardCoins(reward);
  sound.questReward();
  renderDailyQuests();
  persistProfile();
}

async function buySkin(skinId) {
  const cleanSkin = sanitizeSkinId(skinId);
  const skin = getSkinConfig(cleanSkin);
  if (ownsSkin(cleanSkin) || skin.price <= 0) {
    ownedSkinIds.add(cleanSkin);
    setLocalSkin(cleanSkin);
    renderSkinShop();
    await persistProfile();
    return;
  }
  if (coinCount < skin.price) {
    const noteEl = document.getElementById('shop-signedin-note');
    if (noteEl) {
      noteEl.textContent = `${skin.name} costs ${skin.price} coins. You have ${coinCount}. Earn coins from kills and quests.`;
      clearTimeout(buySkin.noteTimer);
      buySkin.noteTimer = setTimeout(updateSkinSaveNote, 3000);
    }
    sound.cantAfford();
    return;
  }

  coinCount -= skin.price;
  if (authSession?.user) queueLifetimeStats({ coins: -skin.price });
  else writeGuestCoins(coinCount);

  ownedSkinIds.add(cleanSkin);
  setLocalSkin(cleanSkin);
  updateCoinUi();
  sound.purchase();
  renderSkinShop();
  await persistProfile();
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
      ? 'Lifetime stats are saved to your account.'
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
  const userId = getCurrentUserId();
  if (lifetimeFlushPromise || !firebaseServices?.db || !userId) return;
  if (isZeroLifetimeDelta(pendingLifetimeDelta)) return;

  const delta = { ...pendingLifetimeDelta };
  pendingLifetimeDelta = { ...EMPTY_LIFETIME_STATS };

  lifetimeFlushPromise = incrementLifetimeStats(firebaseServices.db, userId, delta)
    .then((row) => {
      lifetimeStats = normalizeLifetimeStats(row);
      coinCount = lifetimeStats.coins;
      updateCoinUi();
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
  if (!firebaseServices?.db || !session?.user) {
    lifetimeStats = { ...EMPTY_LIFETIME_STATS };
    pendingLifetimeDelta = { ...EMPTY_LIFETIME_STATS };
    coinCount = readGuestCoins();
    const guestProfile = readGuestProfile();
    ownedSkinIds = new Set(guestProfile.owned_skins);
    dailyQuestState = guestProfile.daily_quests;
    localSkinId = ownsSkin(guestProfile.selected_skin_id) ? guestProfile.selected_skin_id : DEFAULT_SKIN_ID;
    updateCoinUi();
    updateLifetimeStatsUi();
    renderDailyQuests();
    renderSkinShop();
    return;
  }

  try {
    const userId = getCurrentUserId(session);
    const [stats, profile] = await Promise.all([
      fetchLifetimeStats(firebaseServices.db, userId),
      fetchPlayerProfile(firebaseServices.db, userId),
    ]);
    lifetimeStats = stats;
    ownedSkinIds = new Set([...DEFAULT_UNLOCKED_SKIN_IDS, ...profile.owned_skins.map(sanitizeSkinId)]);
    dailyQuestState = normalizeDailyQuestState(profile.daily_quests);
    localSkinId = ownsSkin(profile.selected_skin_id) ? sanitizeSkinId(profile.selected_skin_id) : DEFAULT_SKIN_ID;
    coinCount = lifetimeStats.coins;
  } catch (error) {
    console.warn('Failed to load lifetime stats:', error);
    lifetimeStats = { ...EMPTY_LIFETIME_STATS };
    coinCount = 0;
    ownedSkinIds = new Set(DEFAULT_UNLOCKED_SKIN_IDS);
    dailyQuestState = createDailyQuestState();
    localSkinId = DEFAULT_SKIN_ID;
  }
  pendingLifetimeDelta = { ...EMPTY_LIFETIME_STATS };
  updateCoinUi();
  updateLifetimeStatsUi();
  renderDailyQuests();
  renderSkinShop();
  if (localPlayer && firstPersonWand) {
    setLocalSkin(localSkinId, false);
  }
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
  backdrop.style.display = visible ? 'flex' : 'none';
  if (!visible) setAuthStatus('');
}

function renderWizardNews() {
  const list = document.getElementById('news-list');
  if (!list) return;
  list.replaceChildren(...WIZARD_NEWS.map(({ tag, title, body }) => {
    const item = document.createElement('li');
    item.className = 'lo-news-item';
    const tagEl = document.createElement('span');
    tagEl.className = tag === 'update' ? 'lo-news-tag update' : 'lo-news-tag';
    tagEl.textContent = tag === 'update' ? 'Update' : 'New';
    const titleEl = document.createElement('div');
    titleEl.className = 'lo-news-title';
    titleEl.textContent = title;
    const bodyEl = document.createElement('div');
    bodyEl.className = 'lo-news-desc';
    bodyEl.textContent = body;
    item.append(tagEl, titleEl, bodyEl);
    return item;
  }));
}

function closeAuthModal() {
  toggleAuthModal(false);
}

// ── Settings ─────────────────────────────────────────────────────────────────
function loadSettings() {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { saved = {}; }
  return {
    sensitivity: clamp(Number(saved.sensitivity) || DEFAULT_SETTINGS.sensitivity, 0.2, 3),
    fov: clamp(Number(saved.fov) || DEFAULT_SETTINGS.fov, 60, 100),
    showFps: saved.showFps === undefined ? DEFAULT_SETTINGS.showFps : Boolean(saved.showFps),
    volume: Number.isFinite(Number(saved.volume)) && saved.volume !== null && saved.volume !== undefined
      ? clamp(Number(saved.volume), 0, 1)
      : DEFAULT_SETTINGS.volume,
    muted: Boolean(saved.muted),
  };
}

function applySettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  const fpsEl = document.getElementById('fps-counter');
  if (fpsEl) fpsEl.style.display = settings.showFps ? '' : 'none';
  sound.setVolume(settings.volume, settings.muted);
  const vol = document.getElementById('setting-volume');
  const mute = document.getElementById('setting-mute');
  const volOut = document.getElementById('setting-volume-value');
  if (vol) vol.value = Math.round(settings.volume * 100);
  if (mute) mute.checked = settings.muted;
  if (volOut) volOut.textContent = settings.muted ? 'Muted' : `${Math.round(settings.volume * 100)}%`;
  const sens = document.getElementById('setting-sens');
  const fov = document.getElementById('setting-fov');
  const fps = document.getElementById('setting-fps');
  if (sens) sens.value = settings.sensitivity;
  if (fov) fov.value = settings.fov;
  if (fps) fps.checked = settings.showFps;
  const sensOut = document.getElementById('setting-sens-value');
  const fovOut = document.getElementById('setting-fov-value');
  if (sensOut) sensOut.textContent = `${settings.sensitivity.toFixed(1)}×`;
  if (fovOut) fovOut.textContent = `${settings.fov}°`;
}

// ── Lobby panels (help / settings / chat) ────────────────────────────────────
function closeModals() {
  document.querySelectorAll('.lo-modal-backdrop').forEach((m) => { m.hidden = true; });
}

function openModal(id) {
  closeModals();
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.hidden = false;
  modal.querySelector('[data-close-modal]')?.focus();
}

// ── Chat ─────────────────────────────────────────────────────────────────────
function sanitizeChat(text) {
  return String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, CHAT_MAX_LEN);
}

function addHudChatLine(name, text, mine) {
  const log = document.getElementById('hud-chat-log');
  if (!log) return;
  const line = document.createElement('div');
  line.className = mine ? 'hud-chat-line mine' : 'hud-chat-line';
  const nameEl = document.createElement('span');
  nameEl.className = 'hud-chat-name';
  nameEl.textContent = name;
  line.append(nameEl, document.createTextNode(text));
  log.appendChild(line);
  while (log.children.length > HUD_CHAT_LINES) log.firstElementChild.remove();
  setTimeout(() => line.classList.add('faded'), HUD_CHAT_FADE_MS);
}

function addChatMessage(actorNr, rawText) {
  const text = sanitizeChat(rawText);
  if (!text) return;
  const mine = actorNr === localActorId;
  const name = mine ? localPlayerName : getPlayerLabel(actorNr);
  addHudChatLine(name, text, mine);

  const log = document.getElementById('chat-log');
  if (!log) return;
  log.querySelector('.lo-chat-empty')?.remove();
  const row = document.createElement('div');
  row.className = mine ? 'lo-chat-msg mine' : 'lo-chat-msg';
  const nameEl = document.createElement('span');
  nameEl.className = 'lo-chat-name';
  nameEl.textContent = name;
  row.append(nameEl, document.createTextNode(text));
  log.appendChild(row);
  while (log.children.length > CHAT_HISTORY) log.firstElementChild.remove();
  log.scrollTop = log.scrollHeight;

  if (mine) return;
  const chatOpen = !document.getElementById('chat-modal')?.hidden;
  if (!chatOpen) document.getElementById('chat-unread')?.removeAttribute('hidden');
}

// Shared by the lobby panel and the in-game box so the cooldown applies to both
let lastChatAt = 0;
function sendChatMessage(rawText) {
  const text = sanitizeChat(rawText);
  const now = performance.now();
  if (!text || now - lastChatAt < CHAT_COOLDOWN_MS) return false;
  lastChatAt = now;
  addChatMessage(localActorId, text);
  network.sendChat(text);
  return true;
}

function openHudChat() {
  const form = document.getElementById('hud-chat-form');
  if (!form || !form.hidden) return;
  form.hidden = false;
  document.getElementById('hud-chat')?.classList.add('open');
  // Release held movement keys: their keyups will go to the input, not the game
  controls.clearInput();
  controls.typing = true;
  document.getElementById('hud-chat-input')?.focus();
}

function closeHudChat() {
  const form = document.getElementById('hud-chat-form');
  if (!form || form.hidden) return;
  form.hidden = true;
  document.getElementById('hud-chat')?.classList.remove('open');
  const input = document.getElementById('hud-chat-input');
  if (input) {
    input.value = '';
    input.blur();
  }
  controls.typing = false;
  controls.clearInput();
}

function updateChatNote() {
  const note = document.getElementById('chat-note');
  if (!note) return;
  note.textContent = network?.isOnline()
    ? 'Messages go to everyone in this match. Be kind.'
    : "You're playing offline, so only you can see these messages.";
}

function setupTopBar() {
  document.getElementById('nav-shop-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeModals();
    const picker = document.querySelector('.lo-skin-picker');
    if (!picker) return;
    picker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    picker.classList.remove('lo-flash');
    void picker.offsetWidth; // restart the animation on repeat clicks
    picker.classList.add('lo-flash');
  });

  document.getElementById('nav-help-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openModal('help-modal');
  });

  document.getElementById('nav-settings-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    applySettings();
    openModal('settings-modal');
  });

  document.getElementById('nav-chat-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    updateChatNote();
    openModal('chat-modal');
    document.getElementById('chat-unread')?.setAttribute('hidden', '');
    document.getElementById('chat-input')?.focus();
  });

  document.querySelectorAll('.lo-modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModals();
    });
    // Keep typing in panel fields away from the game's key handlers (Space, Tab, WASD)
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModals();
      e.stopPropagation();
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.pointerLockElement) closeModals();
  });
  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModals();
    });
  });

  document.getElementById('setting-sens')?.addEventListener('input', (e) => {
    settings.sensitivity = clamp(Number(e.target.value), 0.2, 3);
    applySettings();
  });
  document.getElementById('setting-fov')?.addEventListener('input', (e) => {
    settings.fov = clamp(Number(e.target.value), 60, 100);
    applySettings();
  });
  document.getElementById('setting-fps')?.addEventListener('change', (e) => {
    settings.showFps = e.target.checked;
    applySettings();
  });
  document.getElementById('setting-volume')?.addEventListener('input', (e) => {
    settings.volume = clamp(Number(e.target.value) / 100, 0, 1);
    applySettings();
  });
  // Play a sample on release so the new level can be heard
  document.getElementById('setting-volume')?.addEventListener('change', () => sound.uiClick());
  document.getElementById('setting-mute')?.addEventListener('change', (e) => {
    settings.muted = e.target.checked;
    applySettings();
  });

  // Soft click for every lobby button; capture phase so handlers that stop propagation still get one
  document.getElementById('overlay')?.addEventListener('click', (e) => {
    if (e.target.closest('button, .lo-play-card')) sound.uiClick();
  }, true);
  document.getElementById('settings-reset-btn')?.addEventListener('click', () => {
    settings = { ...DEFAULT_SETTINGS };
    applySettings();
  });

  document.getElementById('chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('chat-input');
    if (input && sendChatMessage(input.value)) input.value = '';
  });

  // In-game chat: Enter opens the box, Enter sends, Esc cancels
  const hudInput = document.getElementById('hud-chat-input');
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !document.pointerLockElement || controls.typing) return;
    e.preventDefault();
    openHudChat();
  });
  hudInput?.addEventListener('keydown', (e) => {
    // Keep typed keys away from the game's movement, jump and scoreboard handlers
    e.stopPropagation();
    if (e.key === 'Escape') closeHudChat();
  });
  hudInput?.addEventListener('keyup', (e) => e.stopPropagation());
  document.getElementById('hud-chat-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const empty = !sanitizeChat(hudInput?.value);
    if (empty || sendChatMessage(hudInput?.value)) closeHudChat();
  });

  const log = document.getElementById('chat-log');
  if (log && !log.children.length) {
    const empty = document.createElement('div');
    empty.className = 'lo-chat-empty';
    empty.textContent = 'No messages yet.';
    log.appendChild(empty);
  }

  applySettings();
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

async function setupFirebaseAuth() {
  const signInBtn = document.getElementById('auth-signin-btn');
  const signOutBtn = document.getElementById('auth-signout-btn');
  const closeBtn = document.getElementById('auth-close-btn');
  const backdrop = document.getElementById('auth-modal-backdrop');
  const googleBtn = document.getElementById('auth-google-btn');
  const guestBtn = document.getElementById('auth-guest-btn');

  // Startup should always land on the main menu. Auth stays opt-in.
  toggleAuthModal(false);

  try {
    firebaseServices = createFirebaseServices();
  } catch (error) {
    firebaseServices = null;
    if (signInBtn) signInBtn.title = "Sign-in isn't available right now";
  }

  signInBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleAuthModal(true);
  });

  signOutBtn?.addEventListener('click', async (e) => {
    e.stopPropagation();
    await flushLifetimeStats();
    if (!firebaseServices) return;
    try {
      await signOut(firebaseServices.auth);
    } catch (error) {
      setAuthStatus(error.message, 'error');
      toggleAuthModal(true);
    }
  });

  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAuthModal();
  });
  backdrop?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeAuthModal();
  });
  googleBtn?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!firebaseServices) {
      setAuthStatus("Sign-in isn't available right now. You can still play as a guest.", 'error');
      return;
    }

    googleBtn.disabled = true;
    setAuthStatus('Opening Google sign-in...');

    try {
      const result = await signInWithPopup(firebaseServices.auth, firebaseServices.googleProvider);
      const session = result?.user ? { user: result.user } : null;
      if (session) {
        setGuestMode(false);
        updateAuthUi(session);
        closeAuthModal();
        await loadLifetimeStats(session);
      } else {
        closeAuthModal();
      }
      setAuthStatus('');
    } catch (error) {
      setAuthStatus(error.message || 'Google sign-in failed.', 'error');
    } finally {
      googleBtn.disabled = false;
    }
  });

  guestBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    setGuestMode(true);
    updateAuthUi(null);
    closeAuthModal();
  });

  if (!firebaseServices) {
    updateAuthUi(null);
    updateLifetimeStatsUi();
    return;
  }

  const initialUser = firebaseServices.auth.currentUser;
  const initialSession = initialUser ? { user: initialUser } : null;
  if (initialSession) setGuestMode(false);
  updateAuthUi(initialSession);
  await loadLifetimeStats(initialSession);

  onAuthStateChanged(firebaseServices.auth, async (user) => {
    const session = user ? { user } : null;
    googleBtn.disabled = false;
    if (session) setGuestMode(false);
    updateAuthUi(session);
    await loadLifetimeStats(session);
    if (session) closeAuthModal();
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

  if (avatar) {
    avatar.style.borderColor = hexToRgba(skin.accent, 0.35);
    avatar.style.boxShadow = `0 0 28px ${hexToRgba(skin.glow, 0.18)}`;
  }
  if (statusDot) {
    statusDot.style.background = `#${skin.accent.toString(16).padStart(6, '0')}`;
    statusDot.style.boxShadow = `0 0 10px ${hexToRgba(skin.glow, 0.85)}`;
  }
  if (previewModel?.userData?.bodyMat) applySkinToModel(previewModel.userData, skinId);
}

function setLocalSkin(skinId, shouldBroadcast = true) {
  const cleanSkin = sanitizeSkinId(skinId);
  if (!ownsSkin(cleanSkin)) return;
  localSkinId = cleanSkin;
  localPlayer.setSkin(localSkinId);
  applyFirstPersonWandSkin(firstPersonWand, localSkinId);
  playerSkins.set(localActorId, localSkinId);
  localStorage.setItem('wand-ops-player-skin', localSkinId);
  applyHomepageSkinPreview(localSkinId);
  syncSkinPicker(localSkinId);
  updateSkinSaveNote();
  if (shouldBroadcast && localActorId >= 0) {
    network.sendPlayerSkin(localActorId, localSkinId);
  }
}

function pickBotSkin() {
  const skins = Object.keys(PLAYER_SKINS);
  return skins[Math.floor(Math.random() * skins.length)];
}

function addBot(id, name, simulate, position = null, skinId = DEFAULT_SKIN_ID) {
  const player = new Player(scene, simulate, getSkinConfig(skinId).body);
  player.id = id;
  player.setName(name);
  player.setSkin(skinId);
  if (position) {
    player.position.copy(position);
  } else {
    const [sx, sz] = BOT_SPAWNS[BOT_IDS.indexOf(id)];
    player.position.set(sx, GROUND_Y, sz);
  }
  player.targetPosition.copy(player.position);
  player.group.position.copy(player.position);
  bots.set(id, { player, ai: simulate ? new SimpleBotController(player, colliders) : null, name });
  ensureScoreEntry(id);
  playerNames.set(id, name);
  playerSkins.set(id, player.skinId);
  refreshScoreboard();
  ui.addKillEntry(`${name} joined the arena.`);
  updateDisplayedPlayerCount();
}

function removeBot(id) {
  const bot = bots.get(id);
  if (!bot) return;
  bot.player.remove();
  bots.delete(id);
  scores.delete(id);
  playerNames.delete(id);
  playerSkins.delete(id);
  refreshScoreboard();
  ui.addKillEntry(`${bot.name} left the arena.`);
  updateDisplayedPlayerCount();
}

function refreshBots() {
  if (localActorId < 0) return;
  const host = isBotHost();
  // Host hand-off: the new host takes over simulating the bots it was mirroring
  for (const bot of bots.values()) {
    if (host && !bot.ai) {
      bot.player.isLocal = true;
      bot.ai = new SimpleBotController(bot.player, colliders);
    } else if (!host && bot.ai) {
      bot.player.isLocal = false;
      bot.player.targetPosition.copy(bot.player.position);
      bot.ai = null;
    }
  }
  if (!host) return;
  const desired = getDesiredBotCount();
  BOT_IDS.forEach((id, i) => {
    if (i < desired && !bots.has(id)) addBot(id, pickBotGamerTag(), true, null, pickBotSkin());
    else if (i >= desired && bots.has(id)) removeBot(id);
  });
}

function sendBotState() {
  network.sendBotState([...bots].map(([id, { player, name }]) => [
    id,
    +player.position.x.toFixed(2),
    +player.position.y.toFixed(2),
    +player.position.z.toFixed(2),
    +player.rotation.toFixed(3),
    name,
    player.skinId,
  ]));
}

// Bots leave the local player alone while they're in the menu
function getNearestHuman(position) {
  let nearest = controls.isLocked && !localPlayer.isRespawning ? localPlayer : null;
  let best = nearest ? localPlayer.position.distanceToSquared(position) : Infinity;
  for (const player of remotePlayers.values()) {
    if (player.isRespawning) continue;
    const d = player.position.distanceToSquared(position);
    if (d < best) { best = d; nearest = player; }
  }
  return nearest;
}

// Random pick among the 3 spawn points farthest from everyone else, so respawns are safe but not predictable
function pickSpawnPoint(self) {
  const others = [localPlayer, ...remotePlayers.values(), ...[...bots.values()].map((b) => b.player)]
    .filter((p) => p && p !== self);
  const ranked = colliders.spawnPoints
    .map((pt) => {
      let nearest = Infinity;
      for (const o of others) nearest = Math.min(nearest, Math.hypot(o.position.x - pt[0], o.position.z - pt[1]));
      return { pt, nearest };
    })
    .sort((a, b) => b.nearest - a.nearest);
  return ranked[Math.floor(Math.random() * Math.min(3, ranked.length))].pt;
}

function getCombatTarget(id) {
  return remotePlayers.get(id) || bots.get(id)?.player || null;
}

// Players waiting out a respawn are left out, so spells pass straight through them
function getCombatTargets() {
  const targets = new Map();
  remotePlayers.forEach((player, id) => { if (!player.isRespawning) targets.set(id, player); });
  if (!localPlayer.isRespawning) targets.set(localActorId, localPlayer);
  bots.forEach((bot, id) => targets.set(id, bot.player));
  return targets;
}

function getSimulatedOwners() {
  const owners = new Set([localActorId]);
  bots.forEach((bot, id) => { if (bot.ai) owners.add(id); });
  return owners;
}

function getMinimapPlayers() {
  const players = [];
  if (localPlayer) {
    players.push({
      x: localPlayer.position.x,
      z: localPlayer.position.z,
      isLocal: true,
    });
  }

  remotePlayers.forEach((player) => {
    if (player.isRespawning) return;
    const skin = getSkinConfig(player.skinId);
    players.push({
      x: player.position.x,
      z: player.position.z,
      color: `#${skin.body.toString(16).padStart(6, '0')}`,
    });
  });

  // Drawn exactly like human players so the minimap doesn't give bots away
  bots.forEach(({ player }) => {
    players.push({
      x: player.position.x,
      z: player.position.z,
      color: `#${getSkinConfig(player.skinId).body.toString(16).padStart(6, '0')}`,
    });
  });

  return players;
}

// Tracks kill streaks and multi-kills for everyone, and announces the ones worth shouting about
function recordStreak(killerId, victimId) {
  const ended = killStreaks.get(victimId) || 0;
  killStreaks.set(victimId, 0);
  const streak = (killStreaks.get(killerId) || 0) + 1;
  killStreaks.set(killerId, streak);

  if (ended >= 3 && victimId !== localActorId) {
    const who = killerId === localActorId ? 'You' : getPlayerLabel(killerId);
    ui.addKillEntry(`${who} ended ${getPlayerLabel(victimId)}'s ${ended}-kill streak!`, 'streak');
  }

  if (killerId !== localActorId) {
    if (STREAK_TITLES[streak]) ui.addKillEntry(`${getPlayerLabel(killerId)} is on a ${STREAK_TITLES[streak]}!`, 'streak');
    return;
  }

  const now = performance.now();
  localMultiKills = now - localLastKillAt <= MULTI_KILL_WINDOW_MS ? localMultiKills + 1 : 1;
  localLastKillAt = now;
  const multiTitle = localMultiKills >= 2 ? MULTI_KILL_TITLES[Math.min(localMultiKills, 4)] : '';
  const streakTitle = STREAK_TITLES[streak] || '';
  if (!multiTitle && !streakTitle) return;
  ui.showStreakCallout(multiTitle || streakTitle, multiTitle && streakTitle ? streakTitle : `${streak} kill streak`);
  sound.streak(Math.max(localMultiKills - 1, streakTitle ? Math.ceil(streak / 3) : 0));
}

// Every way the local player can go down ends here: the death screen covers the respawn wait
function handleLocalDeath(killerId = null, spell = null, verb = 'by') {
  const killer = killerId != null ? getCombatTarget(killerId) : null;
  ui.showDeathScreen({
    killer: killerId != null ? getPlayerLabel(killerId) : null,
    verb,
    spell,
    killerHp: killer?.health,
    streakEnded: killStreaks.get(localActorId) || 0,
  });
  killStreaks.set(localActorId, 0);
  localMultiKills = 0;
  lastHitOnMe = null;
  sound.death();

  // Freeze the view where you fell, still facing the way you were looking; updateCamera turns it to the killer
  killCam = killer ? {
    pos: camera.position.clone(),
    look: camera.position.clone().add(camera.getWorldDirection(new THREE.Vector3())),
    targetId: killerId,
  } : null;

  localPlayer.respawn(pickSpawnPoint(localPlayer));
  localPlayer.respawnTimer = RESPAWN_DELAY;
  _knockbackVel.set(0, 0, 0);
  playerVelocityY = 0;
  network.sendRespawn();
  ui.setHealth(localPlayer.health);
}

function handleDefeat(killerId, victimId, killerLabel, victimLabel) {
  ensureScoreEntry(killerId).kills++;
  ensureScoreEntry(victimId).deaths++;
  recordStreak(killerId, victimId);
  if (killerId === localActorId) queueLifetimeStats({ kills: 1 });
  if (killerId === localActorId) awardCoins(1);
  if (killerId === localActorId) progressDailyQuests('kills', 1);
  if (victimId === localActorId) queueLifetimeStats({ deaths: 1 });
  refreshScoreboard();
  updateLocalKDA();
  if (killerId === localActorId) {
    ui.addKillEntry(`You defeated ${victimLabel}!`);
  } else if (victimId === localActorId) {
    ui.addKillEntry(`${killerLabel} defeated you!`);
  }
}

// Runs on the bot host for hits landed by a bot's fireball
function handleBotHit(botId, targetId, damage, spell, dir) {
  if (isBotId(targetId)) return;
  network.sendHit(targetId, damage, spell, spell === 'air' ? dir : null, botId);
  if (targetId === localActorId) {
    if (localPlayer.isRespawning) return;
    const dead = localPlayer.takeDamage(damage);
    sound.hurt(damage);
    ui.addDamageNumber(damage, 'taken');
    queueLifetimeStats({ damage_taken: damage });
    localPlayer.applySpellEffect(spell);
    lastHitOnMe = { id: botId, spell, at: performance.now() };
    ui.setHealth(localPlayer.health);
    if (!dead) return;
    handleLocalDeath(botId, spell);
  } else {
    const target = remotePlayers.get(targetId);
    if (!target || target.isRespawning || !target.takeDamage(damage)) return;
    target.health = 100;
    target.respawnTimer = RESPAWN_DELAY;
  }
  handleDefeat(botId, targetId, getPlayerLabel(botId), getPlayerLabel(targetId));
  network.sendKill(botId, targetId);
}

function handleRemoteHitDefeat(actorNr, spell) {
  handleLocalDeath(actorNr, spell);
  queueLifetimeStats({ deaths: 1 });
  ui.addKillEntry(`${getPlayerLabel(actorNr)} defeated you!`);
}

function init() {
  // Initialize Vercel Speed Insights
  injectSpeedInsights();

  const canvas = document.getElementById('game-canvas');
  const heroPreviewCanvas = document.getElementById('hero-preview-canvas');
  const playerNameInput = document.getElementById('player-name-input');
  const playCard = document.getElementById('lo-play-card');
  crosshairEl = document.getElementById('crosshair');
  scopeOverlayEl = document.getElementById('scope-overlay');
  const skinButtons = [...document.querySelectorAll('.lo-skin-btn')];
  ({ scene, camera, renderer, colliders } = createScene(canvas));
  scene.add(camera);
  // Three.js layers filter lights too, so the wand pass needs the scene's lights
  scene.traverse((obj) => { if (obj.isLight) obj.layers.enable(FIRST_PERSON_LAYER); });
  settings = loadSettings();
  camera.fov = settings.fov;
  camera.updateProjectionMatrix();

  const storedName = localStorage.getItem('wand-ops-player-name');
  isGuestMode = localStorage.getItem('wand-ops-guest-mode') === 'true';
  const guestProfile = readGuestProfile();
  localPlayerName = sanitizePlayerName(storedName);
  ownedSkinIds = new Set(guestProfile.owned_skins);
  dailyQuestState = guestProfile.daily_quests;
  localSkinId = ownsSkin(guestProfile.selected_skin_id)
    ? guestProfile.selected_skin_id
    : DEFAULT_SKIN_ID;
  coinCount = readGuestCoins();
  playerNameInput.value = localPlayerName;

  controls = new Controls();
  ui = new UIManager();
  fireballs = new FireballManager(scene);
  toggleAuthModal(false);
  setupFirebaseAuth();
  setupTopBar();
  updateLifetimeStatsUi();
  updateCoinUi();
  renderDailyQuests();
  renderSkinShop();

  if (heroPreviewCanvas) {
    previewScene = new THREE.Scene();
    // Frames the whole model (about 2.6 tall from boots to hat tip) with room for the oval mask
    previewCamera = new THREE.PerspectiveCamera(28, 200 / 260, 0.1, 100);
    previewCamera.position.set(0, 1.0, 7.1);
    previewCamera.lookAt(0, 0.42, 0);

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
    previewModel.rotation.y = Math.PI - 0.58; // the model's front faces -Z; start three-quarters toward the camera
    previewScene.add(previewModel);
    updateHeroPreviewSize();
  }

  localPlayer = new Player(scene, true, getSkinConfig(localSkinId).body);
  localPlayer.respawn(pickSpawnPoint(localPlayer));
  localPlayer.setName(localPlayerName);
  localPlayer.setSkin(localSkinId);
  localPlayer.group.visible = false;
  firstPersonWand = createFirstPersonWand();
  camera.add(firstPersonWand);
  applyFirstPersonWandSkin(firstPersonWand, localSkinId);
  applyHomepageSkinPreview(localSkinId);
  renderSkinShop();

  playerNameInput.addEventListener('click', (e) => e.stopPropagation());
  playerNameInput.addEventListener('keydown', (e) => e.stopPropagation());
  let nameSendTimer = null;
  playerNameInput.addEventListener('input', () => {
    localPlayerName = sanitizePlayerName(playerNameInput.value);
    if (playerNameInput.value !== localPlayerName) playerNameInput.value = localPlayerName;
    localStorage.setItem('wand-ops-player-name', localPlayerName);
    localPlayer.setName(localPlayerName);
    if (localActorId >= 0) {
      playerNames.set(localActorId, localPlayerName);
      refreshScoreboard();
      // Send once typing pauses rather than per keystroke, which would trip other players' rate limit
      clearTimeout(nameSendTimer);
      nameSendTimer = setTimeout(() => network.sendPlayerName(localActorId, localPlayerName), NAME_SEND_DELAY_MS);
    }
  });

  skinButtons.forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const skinId = btn.dataset.skin;
      if (ownsSkin(skinId)) {
        setLocalSkin(skinId);
        renderSkinShop();
        await persistProfile();
        return;
      }
      await buySkin(skinId);
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
      refreshBots();
      refreshScoreboard();
      network.sendPlayerName(actorNr, localPlayerName);
      network.sendPlayerSkin(actorNr, localSkinId);
      ui.setOverlayStatus('Ready');
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
      refreshBots();
      updateDisplayedPlayerCount();
      refreshScoreboard();
      if (localActorId >= 0) {
        const mine = scores.get(localActorId);
        if (mine) network.sendScoreUpdate(localActorId, mine.kills, mine.deaths);
        network.sendPlayerName(localActorId, localPlayerName);
        network.sendPlayerSkin(localActorId, localSkinId);
      }
      if (isBotHost()) {
        sendBotState();
        bots.forEach((_, id) => {
          const s = scores.get(id);
          if (s) network.sendScoreUpdate(id, s.kills, s.deaths);
        });
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
      refreshBots();
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
      fireballs.spawn(pos, dir, isBotId(data.o) ? data.o : actorNr, data.sp || 'fire');
    },

    onKill({ killerId, victimId }) {
      ensureScoreEntry(killerId).kills++;
      ensureScoreEntry(victimId).deaths++;
      recordStreak(killerId, victimId);
      const bot = bots.get(victimId);
      if (bot) {
        if (bot.ai) bot.player.respawn(pickSpawnPoint(bot.player));
        else bot.player.health = 100;
      }
      refreshScoreboard();
      updateLocalKDA();
    },

    onChat(actorNr, { m }) {
      addChatMessage(actorNr, m);
    },

    onBotState(actorNr, { b }) {
      if (isBotHost() || !Array.isArray(b)) return;
      // Only the bot host (lowest-numbered player) may drive the bots
      for (const id of remotePlayers.keys()) if (id < actorNr) return;
      const seen = new Set();
      for (const [id, x, y, z, r, rawName, rawSkin] of b) {
        if (!isBotId(id)) continue;
        seen.add(id);
        const name = sanitizePlayerName(rawName);
        const skinId = sanitizeSkinId(rawSkin);
        let bot = bots.get(id);
        if (!bot) {
          addBot(id, name, false, new THREE.Vector3(x, y, z), skinId);
          bot = bots.get(id);
        } else if (bot.name !== name) {
          bot.name = name;
          bot.player.setName(name);
          playerNames.set(id, name);
          refreshScoreboard();
        }
        if (bot.player.skinId !== skinId) {
          bot.player.setSkin(skinId);
          playerSkins.set(id, skinId);
        }
        bot.player.targetPosition.set(x, y, z);
        bot.player.targetRotation = r;
      }
      for (const id of [...bots.keys()]) {
        if (!seen.has(id)) removeBot(id);
      }
    },

    onScoreUpdate({ actorNr, kills, deaths }) {
      if (actorNr === localActorId) return;
      scores.set(actorNr, { kills, deaths, assists: scores.get(actorNr)?.assists ?? 0 });
      refreshScoreboard();
    },

    onPlayerName(sender, { actorNr, name }) {
      if (actorNr !== sender) return; // players may only rename themselves
      const cleanName = sanitizePlayerName(name);
      playerNames.set(actorNr, cleanName);
      const player = remotePlayers.get(actorNr);
      if (player) player.setName(cleanName);
      refreshScoreboard();
    },

    onPlayerSkin(sender, { actorNr, skinId }) {
      if (actorNr !== sender) return;
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
        p.respawnTimer = RESPAWN_DELAY;
      }
    },

    onConnectionFailed(reason) {
      ui.setOverlayStatus(`Solo mode · ${reason}`);
      localActorId = 1;
      localPlayer.id = 1;
      playerNames.set(1, localPlayerName);
      playerSkins.set(1, localSkinId);
      ensureScoreEntry(localActorId);
      updateLocalKDA();
      refreshBots();
      refreshScoreboard();
    },

    onHit(actorNr, data) {
      const damage = clamp(Number(data.damage) || 0, 0, MAX_HIT_DAMAGE);
      if (data.targetId === localActorId) {
        // A hit already in flight when we went down shouldn't kill us twice
        if (localPlayer.isRespawning) return;
        const dead = localPlayer.takeDamage(damage);
        sound.hurt(damage);
        ui.addDamageNumber(damage, 'taken');
        queueLifetimeStats({ damage_taken: damage });
        localPlayer.applySpellEffect(data.sp || 'fire');
        lastHitOnMe = { id: isBotId(data.by) ? data.by : actorNr, spell: data.sp || 'fire', at: performance.now() };

        if (data.sp === 'air' && Number.isFinite(data.kx) && Number.isFinite(data.kz)) {
          _knockbackVel.set(data.kx, 0, data.kz).normalize().multiplyScalar(30);
        }

        ui.setHealth(localPlayer.health);
        if (dead) handleRemoteHitDefeat(isBotId(data.by) ? data.by : actorNr, data.sp || 'fire');
      } else {
        const target = getCombatTarget(data.targetId);
        if (target && !target.isRespawning) {
          target.takeDamage(damage);
          if (actorNr === localActorId) ui.addDamageNumber(damage, 'dealt');
        }
      }
    },
  });

  network.connect();

  const footerVersion = document.getElementById('footer-version');
  if (footerVersion) footerVersion.textContent = `V${APP_VERSION}`;
  renderWizardNews();
  applySeasonalLogo();

  const footerCopy = document.getElementById('footer-copy');
  if (footerCopy) footerCopy.textContent = `© ${new Date().getFullYear()} Blue Wizard Digital`;

  ui.showOverlay(true);
  ui.setHealth(100);
  updateDisplayedPlayerCount();
  ui.setKDA(0, 0, 0);
  refreshScoreboard();

  playCard.addEventListener('click', (e) => {
    e.stopPropagation();
    controls.requestLock();
  });

  // Show the controls card for the first few seconds of each match; Tab brings the strip back later
  const controlsCard = document.getElementById('controls-card');
  let controlsCardShown = false;
  let controlsCardTimer = 0;
  const hideControlsCard = () => {
    clearTimeout(controlsCardTimer);
    controlsCard?.classList.remove('is-visible');
  };

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement) {
      ui.showOverlay(false);
      if (controlsCard && !controlsCardShown) {
        controlsCardShown = true;
        controlsCard.classList.add('is-visible');
        controlsCardTimer = setTimeout(hideControlsCard, 9000);
      }
    } else {
      ui.showOverlay(true);
      ui.hideScoreboard();
      closeHudChat();
      ui.setOverlayStatus(localActorId >= 0 ? 'Paused — click to resume' : 'Connecting…');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Tab') {
      // Only claim Tab in-game, so it still moves focus between lobby fields
      if (!document.pointerLockElement) return;
      e.preventDefault();
      hideControlsCard();
      ui.showScoreboard();
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.code === 'Tab') ui.hideScoreboard();
  });
  // A missed keyup (e.g. alt-tabbing away) would otherwise leave the scoreboard stuck open
  window.addEventListener('blur', () => ui.hideScoreboard());

  window.addEventListener('resize', updateHeroPreviewSize);

  clock.start();
  loop();
}

function getGroundY(x, z, currentY) {
  return groundYAt(x, z, currentY, colliders);
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
  updateCamera(delta);
  if (ui && colliders) ui.renderMinimap(getMinimapPlayers(), colliders.arenaSize, localPlayer?.rotation || 0);
  renderer.render(scene, camera);
  renderFirstPersonPass();
  renderHeroPreview(delta);
}

function renderFirstPersonPass() {
  // A color background forces a full clear on render, which would wipe the world pass
  const background = scene.background;
  scene.background = null;
  renderer.autoClear = false;
  renderer.clearDepth();
  camera.layers.set(FIRST_PERSON_LAYER);
  renderer.render(scene, camera);
  camera.layers.set(0);
  renderer.autoClear = true;
  scene.background = background;
}

function update(delta) {
  aimBlend = THREE.MathUtils.lerp(aimBlend, controls.isAiming ? 1 : 0, 1 - Math.exp(-delta * 14));
  if (localActorId < 0) return;
  if (controls.isLocked) updateLocalPlayer(delta);
  // Keeps running in the menu so a bot host doesn't freeze the bots for everyone else
  updateWorld(delta);
}

function updateLocalPlayer(delta) {
  const { dx, dy } = controls.consumeMouseDelta();
  // The kill cam owns the view; mouse movement then is dropped so you respawn facing where you were
  if (!killCam) {
    const sens = MOUSE_SENS * settings.sensitivity;
    cameraYaw -= dx * sens;
    cameraPitch = clamp(cameraPitch - dy * sens, PITCH_MIN, PITCH_MAX);
  }

  localPlayer.rotation = cameraYaw;

  // On the death screen you can't move or cast (and can only look around if there's no kill cam)
  if (localPlayer.isRespawning) {
    controls.consumeClick();
    controls.consumeJump();
    return;
  }

  _moveDir.set(0, 0, 0);
  if (controls.isDown('KeyW') || controls.isDown('ArrowUp')) _moveDir.z -= 1;
  if (controls.isDown('KeyS') || controls.isDown('ArrowDown')) _moveDir.z += 1;
  if (controls.isDown('KeyA') || controls.isDown('ArrowLeft')) _moveDir.x -= 1;
  if (controls.isDown('KeyD') || controls.isDown('ArrowRight')) _moveDir.x += 1;

  // Walking and knockback share one displacement, applied in collision-checked sub-steps so a
  // fast frame or an air-spell shove can't carry the player through a thin wall
  _stepDelta.set(0, 0, 0);
  if (_moveDir.lengthSq() > 0) {
    _moveDir.normalize().applyAxisAngle(_yAxis, cameraYaw);
    const speed = localPlayer.slowTimer > 0 ? MOVE_SPEED * SLOW_FACTOR : MOVE_SPEED;
    _stepDelta.addScaledVector(_moveDir, speed * delta);
  }
  if (_knockbackVel.lengthSq() > 0.01) {
    _stepDelta.addScaledVector(_knockbackVel, delta);
    _knockbackVel.multiplyScalar(Math.max(0, 1 - delta * 7));
  }
  moveWithCollisions(localPlayer.position, _stepDelta, colliders);

  if (controls.consumeJump() && isGrounded && localPlayer.groundedTimer <= 0) {
    playerVelocityY = JUMP_VELOCITY;
    isGrounded = false;
  }
  playerVelocityY -= GRAVITY * delta;
  localPlayer.position.y += playerVelocityY * delta;
  const groundY = getGroundY(localPlayer.position.x, localPlayer.position.z, localPlayer.position.y);
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
      const burner = lastHitOnMe?.spell === 'fire' && performance.now() - lastHitOnMe.at < 6000 ? lastHitOnMe.id : null;
      handleLocalDeath(burner, burner != null ? 'fire' : null, 'Burned by');
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
}

function updateWorld(delta) {
  sound.updateHeartbeat(localPlayer.health, controls.isLocked);
  bots.forEach((bot, id) => {
    if (!bot.ai) return;
    const botShot = bot.ai.update(delta, getNearestHuman(bot.player.position));
    if (!botShot) return;
    fireballs.spawn(botShot.position, botShot.direction, id, botShot.spell);
    network.sendFireball(botShot.position, botShot.direction, botShot.spell, id);
  });

  localPlayer.update(delta);
  ui.updateDeathScreen(localPlayer.respawnTimer);
  bots.forEach((bot) => bot.player.update(delta));
  remotePlayers.forEach((p) => p.update(delta));

  fireballs.update(delta, getCombatTargets(), getSimulatedOwners(), (ownerId, targetId, damage, spell, dir) => {
    if (ownerId === localActorId) {
      network.sendHit(targetId, damage, spell, spell === 'air' ? dir : null);
      const target = getCombatTarget(targetId);
      if (!target) return;

      const dead = target.takeDamage(damage);
      ui.addDamageNumber(damage, 'dealt');
      queueLifetimeStats({ damage_dealt: damage });
      progressDailyQuests('damage_dealt', damage);
      if (!dead) {
        sound.hitConfirm(spell);
        return;
      }
      sound.kill();

      // Only the simulating client moves a respawned body; mirrored copies just reset health
      if (target.isLocal) target.respawn(pickSpawnPoint(target));
      else target.health = 100;
      // Remote humans sit out the respawn wait; hide them now rather than when their respawn event lands
      if (remotePlayers.has(targetId)) target.respawnTimer = RESPAWN_DELAY;
      handleDefeat(localActorId, targetId, 'You', getPlayerLabel(targetId));
      network.sendKill(localActorId, targetId);
      const mine = scores.get(localActorId);
      if (mine) network.sendScoreUpdate(localActorId, mine.kills, mine.deaths);
      return;
    }

    if (isBotId(ownerId)) handleBotHit(ownerId, targetId, damage, spell, dir);
  }, colliders);

  netTimer += delta;
  if (netTimer >= NET_TICK) {
    netTimer = 0;
    network.sendPosition(localPlayer.position, localPlayer.rotation);
    // Sent even when empty so mirrors drop bots once the lobby fills up
    if (remotePlayers.size && isBotHost()) sendBotState();
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
  progressDailyQuests('spells_cast', 1);
}

// Player collision lets the eye reach a wall face, which is inside the camera's near plane and
// fills the screen with stone. Keep the camera (not the player) a little way off solid geometry.
const CAMERA_CLEARANCE = 0.35;

function keepCameraOutOfSolids() {
  if (!colliders) return;
  const pos = camera.position;
  const m = CAMERA_CLEARANCE;
  for (const tree of colliders.trees) {
    if (tree.maxY !== undefined && pos.y >= tree.maxY) continue;
    const dx = pos.x - tree.x;
    const dz = pos.z - tree.z;
    const minDist = tree.radius + m;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist && distSq > 0.0001) {
      const scale = minDist / Math.sqrt(distSq);
      pos.x = tree.x + dx * scale;
      pos.z = tree.z + dz * scale;
    }
  }
  for (const box of colliders.boxes || []) {
    if (pos.y >= box.maxY) continue;
    if (pos.x <= box.xMin - m || pos.x >= box.xMax + m || pos.z <= box.zMin - m || pos.z >= box.zMax + m) continue;
    const dxMin = pos.x - (box.xMin - m);
    const dxMax = (box.xMax + m) - pos.x;
    const dzMin = pos.z - (box.zMin - m);
    const dzMax = (box.zMax + m) - pos.z;
    const minD = Math.min(dxMin, dxMax, dzMin, dzMax);
    if (minD === dxMin) pos.x = box.xMin - m;
    else if (minD === dxMax) pos.x = box.xMax + m;
    else if (minD === dzMin) pos.z = box.zMin - m;
    else pos.z = box.zMax + m;
  }
}

// Stairs lift the player a whole step the instant they cross its edge, which reads as a hop. While
// on a staircase the eye height eases toward the real height instead; jumping and falling stay exact.
const STAIR_EYE_EASE = 14;       // 1/s; ~0.07s to cover most of a step
const STAIR_EYE_GRACE = 0.3;     // keep easing briefly after leaving the stairs so the last step settles
let _eyeY = null;
let _eyeEaseTimer = 0;
let _lastEyeT = 0;

function smoothedEyeY() {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - _lastEyeT) / 1000));
  _lastEyeT = now;
  const target = localPlayer.position.y + EYE_HEIGHT;

  if (isOverRamp(localPlayer.position.x, localPlayer.position.z, colliders)) _eyeEaseTimer = STAIR_EYE_GRACE;
  else _eyeEaseTimer = Math.max(0, _eyeEaseTimer - dt);

  const jumpingUp = playerVelocityY > 1;
  const easing = _eyeEaseTimer > 0 && !jumpingUp && _eyeY !== null && Math.abs(target - _eyeY) < 1.6;
  _eyeY = easing ? _eyeY + (target - _eyeY) * (1 - Math.exp(-STAIR_EYE_EASE * dt)) : target;
  return _eyeY;
}

function updateKillCam(delta) {
  const killer = getCombatTarget(killCam.targetId);
  if (killer) {
    _killCamTarget.copy(killer.position);
    _killCamTarget.y += KILL_CAM_HEAD_Y;
    killCam.look.lerp(_killCamTarget, 1 - Math.exp(-delta * 5));
  }
  camera.position.copy(killCam.pos);
  camera.lookAt(killCam.look);
  camera.fov = THREE.MathUtils.lerp(camera.fov, KILL_CAM_FOV, 1 - Math.exp(-delta * 3));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  if (killer) {
    // Marker above the killer's name tag, drawn on top so it shows even when they're behind a wall
    _killCamTarget.y += 1.45;
    _killCamTarget.project(camera);
    ui.setKillCamMarker(_killCamTarget.z < 1 ? _killCamTarget : null);
  } else {
    ui.setKillCamMarker(null);
  }
  if (firstPersonWand) firstPersonWand.visible = false;
  if (scopeOverlayEl) scopeOverlayEl.style.opacity = '0';
  if (crosshairEl) crosshairEl.style.opacity = '0';
}

function updateCamera(delta = 0) {
  if (killCam && !localPlayer.isRespawning) {
    killCam = null;
    ui.setKillCamMarker(null);
  }
  if (killCam) {
    updateKillCam(delta);
    return;
  }
  if (firstPersonWand) firstPersonWand.visible = true;

  camera.position.set(
    localPlayer.position.x,
    smoothedEyeY(),
    localPlayer.position.z
  );
  keepCameraOutOfSolids();

  _lookAt.set(
    localPlayer.position.x - Math.sin(cameraYaw) * Math.cos(cameraPitch),
    camera.position.y + Math.sin(cameraPitch),
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
      THREE.MathUtils.lerp(WAND_HIP_ROT.x, 0, aimBlend) + Math.sin(sway * 8.5) * 0.015 * moving,
      THREE.MathUtils.lerp(WAND_HIP_ROT.y, 0, aimBlend),
      THREE.MathUtils.lerp(WAND_HIP_ROT.z, 0, aimBlend)
    );
  }

  camera.fov = THREE.MathUtils.lerp(settings.fov, ADS_FOV, aimBlend);
  camera.updateProjectionMatrix();

  if (scopeOverlayEl) {
    const scopeStrength = THREE.MathUtils.smoothstep(aimBlend, 0.72, 0.98);
    scopeOverlayEl.style.opacity = String(scopeStrength);
    if (crosshairEl) crosshairEl.style.opacity = String(1 - scopeStrength);
  }
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

init();
