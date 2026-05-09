import {
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

export const EMPTY_LIFETIME_STATS = {
  kills: 0,
  deaths: 0,
  assists: 0,
  damage_dealt: 0,
  damage_taken: 0,
  spells_cast: 0,
  coins: 0,
};

export const EMPTY_PLAYER_PROFILE = {
  owned_skins: ['amethyst'],
  selected_skin_id: 'amethyst',
  daily_quests: null,
};

export function normalizeLifetimeStats(row) {
  return {
    kills: Number(row?.kills || 0),
    deaths: Number(row?.deaths || 0),
    assists: Number(row?.assists || 0),
    damage_dealt: Number(row?.damage_dealt || 0),
    damage_taken: Number(row?.damage_taken || 0),
    spells_cast: Number(row?.spells_cast || 0),
    coins: Number(row?.coins || 0),
  };
}

export function normalizePlayerProfile(row) {
  const ownedSkins = Array.isArray(row?.owned_skins)
    ? row.owned_skins.filter((value) => typeof value === 'string')
    : [...EMPTY_PLAYER_PROFILE.owned_skins];

  return {
    owned_skins: ownedSkins.length ? ownedSkins : [...EMPTY_PLAYER_PROFILE.owned_skins],
    selected_skin_id: typeof row?.selected_skin_id === 'string'
      ? row.selected_skin_id
      : EMPTY_PLAYER_PROFILE.selected_skin_id,
    daily_quests: row?.daily_quests && typeof row.daily_quests === 'object'
      ? row.daily_quests
      : null,
  };
}

export async function fetchLifetimeStats(db, userId) {
  const snapshot = await getDoc(doc(db, 'player_lifetime_stats', userId));
  return snapshot.exists() ? normalizeLifetimeStats(snapshot.data()) : { ...EMPTY_LIFETIME_STATS };
}

export async function fetchPlayerProfile(db, userId) {
  const snapshot = await getDoc(doc(db, 'player_lifetime_stats', userId));
  return snapshot.exists() ? normalizePlayerProfile(snapshot.data()) : { ...EMPTY_PLAYER_PROFILE };
}

export async function incrementLifetimeStats(db, userId, delta) {
  const ref = doc(db, 'player_lifetime_stats', userId);

  await setDoc(ref, {
    kills: increment(delta.kills || 0),
    deaths: increment(delta.deaths || 0),
    assists: increment(delta.assists || 0),
    damage_dealt: increment(delta.damage_dealt || 0),
    damage_taken: increment(delta.damage_taken || 0),
    spells_cast: increment(delta.spells_cast || 0),
    coins: increment(delta.coins || 0),
    updated_at: serverTimestamp(),
  }, { merge: true });

  const snapshot = await getDoc(ref);
  return snapshot.exists() ? normalizeLifetimeStats(snapshot.data()) : { ...EMPTY_LIFETIME_STATS };
}

export async function savePlayerProfile(db, userId, profile) {
  const ref = doc(db, 'player_lifetime_stats', userId);

  await setDoc(ref, {
    owned_skins: Array.isArray(profile?.owned_skins) ? profile.owned_skins : [...EMPTY_PLAYER_PROFILE.owned_skins],
    selected_skin_id: profile?.selected_skin_id || EMPTY_PLAYER_PROFILE.selected_skin_id,
    daily_quests: profile?.daily_quests || null,
    updated_at: serverTimestamp(),
  }, { merge: true });
}
