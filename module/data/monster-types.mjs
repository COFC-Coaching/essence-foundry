/**
 * Monster Type is the Monster Actor type's Origin tag — what Species/Heritage/Distinction is to a
 * Person. Two bands, per Things To Work On/Enemies and NPC's.txt's follow-up design conversation:
 * a common/developing low band (Tier 0-3, spans Mook through Normal Grade) and a rare/world-scale
 * high band (Tier 3-5, Elite Grade only — same "rare and exceptional" framing as Elite itself).
 *
 * The low band is 8 entries, not a clean 3x3 like the high band's 9 — Familiar and Sprite are a
 * smaller "trivial/companion-tier" pair by design, not a third row missing an entry.
 *
 * Both bands are soft guidance, not hard-validated: Tier is never enforced (same as everywhere
 * else on this page — a Tier 2 Elite Dragon is unusual but not invalid). Grade IS the hard gate
 * the sheet/wizard use: the high band only appears in the picker once Grade is "Elite", mirroring
 * how eliteType itself only appears at Elite.
 */
export const MONSTER_TYPES_LOW = ["Familiar", "Sprite", "Beast", "Phantom", "Golem", "Elemental", "Ancestor", "Fey"];

export const MONSTER_TYPES_HIGH = ["Dragon", "Fiend", "Celestial", "Abomination", "Leviathan", "Avatar", "Outsider", "Colossus", "Primordial"];

export const MONSTER_TYPES = [...MONSTER_TYPES_LOW, ...MONSTER_TYPES_HIGH];
