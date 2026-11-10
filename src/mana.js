/**
 * Mana: every normal spell costs some, it trickles back over time, and mana potions refill it.
 * (Ultimates run off their own meter and cost no mana.) Bots have unlimited mana.
 *
 * Each wand has its own mana cost and cooldown (damage and projectile speed live in fireball.js).
 * Damage per second stays in a similar band, so the wands differ in feel rather than raw power:
 *   fire       15 dmg every 0.50s   10 mana   burns on top
 *   ice        20 dmg every 0.60s   12 mana   slows
 *   lightning  12 dmg every 0.35s    6 mana   rapid and cheap, silences
 *   air        16 dmg every 0.45s    9 mana   knocks back
 *   earth      36 dmg every 1.00s   18 mana   slow, heavy hitter, grounds
 */
export const MANA_MAX = 100;
export const MANA_REGEN = 10;  // per second
export const MANA_POTION = 50; // restored by a mana potion

export const SPELL_CAST = {
  fire:      { cost: 10, cooldown: 0.5 },
  ice:       { cost: 12, cooldown: 0.6 },
  lightning: { cost: 6,  cooldown: 0.35 },
  air:       { cost: 9,  cooldown: 0.45 },
  earth:     { cost: 18, cooldown: 1.0 },
};

export const castCost = (spell) => (SPELL_CAST[spell] ?? SPELL_CAST.fire).cost;
export const castCooldown = (spell) => (SPELL_CAST[spell] ?? SPELL_CAST.fire).cooldown;

export const spendMana = (mana, cost) => Math.max(0, mana - cost);
export const regenMana = (mana, delta) => Math.min(MANA_MAX, mana + MANA_REGEN * delta);
export const addMana = (mana, amount) => Math.min(MANA_MAX, mana + amount);
