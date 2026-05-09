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
};

export function normalizeLifetimeStats(row) {
  return {
    kills: Number(row?.kills || 0),
    deaths: Number(row?.deaths || 0),
    assists: Number(row?.assists || 0),
    damage_dealt: Number(row?.damage_dealt || 0),
    damage_taken: Number(row?.damage_taken || 0),
    spells_cast: Number(row?.spells_cast || 0),
  };
}

export async function fetchLifetimeStats(db, userId) {
  const snapshot = await getDoc(doc(db, 'player_lifetime_stats', userId));
  return snapshot.exists() ? normalizeLifetimeStats(snapshot.data()) : { ...EMPTY_LIFETIME_STATS };
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
    updated_at: serverTimestamp(),
  }, { merge: true });

  const snapshot = await getDoc(ref);
  return snapshot.exists() ? normalizeLifetimeStats(snapshot.data()) : { ...EMPTY_LIFETIME_STATS };
}
