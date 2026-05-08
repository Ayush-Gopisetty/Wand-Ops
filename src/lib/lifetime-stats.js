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

export async function fetchLifetimeStats(client, userId) {
  const { data, error } = await client
    .from('player_lifetime_stats')
    .select('kills, deaths, assists, damage_dealt, damage_taken, spells_cast')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return normalizeLifetimeStats(data);
}

export async function incrementLifetimeStats(client, delta) {
  const payload = {
    p_kills: delta.kills || 0,
    p_deaths: delta.deaths || 0,
    p_assists: delta.assists || 0,
    p_damage_dealt: delta.damage_dealt || 0,
    p_damage_taken: delta.damage_taken || 0,
    p_spells_cast: delta.spells_cast || 0,
  };

  const { data, error } = await client.rpc('increment_player_lifetime_stats', payload);
  if (error) throw error;

  if (Array.isArray(data)) return normalizeLifetimeStats(data[0]);
  return normalizeLifetimeStats(data);
}
