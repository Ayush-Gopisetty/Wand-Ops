/**
 * Game modes and team deathmatch tuning. Each mode has its own Photon room; in team deathmatch the
 * bot host assigns teams and keeps the score, everyone else mirrors it.
 */
export const TDM_TEAM_MAX = 4; // 4v4 at most

// `maxPlayers` is the room's human cap. Newcomers join the smaller team, so a team deathmatch room
// of 8 can never go past 4 on a side.
export const GAME_MODES = {
  ffa: { room: 'WizardArena', maxPlayers: 8, label: 'Free for all', card: 'Quick match: Arena' },
  tdm: { room: 'WizardArena-TDM', maxPlayers: TDM_TEAM_MAX * 2, label: 'Team deathmatch', card: 'Team deathmatch: Arena' },
};

export const TEAMS = [
  { name: 'Blue', color: 0x3d8bff },
  { name: 'Red', color: 0xff4d5e },
];

export const TDM_KILLS_TO_WIN = 20;
export const TDM_TEAM_SIZE = 2; // bots fill each team up to this many
export const TDM_ROUND_BREAK_MS = 6000; // winner banner, then everyone starts the next round fresh

/** The team a newcomer joins: fewer humans first, then fewer members overall, then Blue. */
export function smallerTeam(teams, humanIds) {
  const humans = [0, 0];
  const everyone = [0, 0];
  for (const [id, team] of teams) {
    everyone[team]++;
    if (humanIds.includes(id)) humans[team]++;
  }
  if (humans[0] !== humans[1]) return humans[0] < humans[1] ? 0 : 1;
  return everyone[1] < everyone[0] ? 1 : 0;
}
