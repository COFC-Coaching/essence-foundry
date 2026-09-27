// Source: essence-options.ts (EXPERTISE_DATABASE / SUBTYPE_DATABASE) in the web app repo —
// the Expertise & Subtype tab of the Essence System spreadsheet.

export const EXPERTISE_DATABASE = {
  prowess: ["Dueling", "Berserking", "Brawling", "Grappling", "Skirmishing", "Reaving", "Phalanx"],
  ballistics: ["Precision", "Trajectory", "Cadence", "Payload", "Mobility", "Penetration", "Flair"],
  gestalt: ["Armament", "Regeneration", "Awareness", "Locomotion", "Metabolism", "Plasticity", "Integration"],
  cunning: ["Deception", "Infiltration", "Sabotage", "Exploitation", "Observation", "Improvisation", "Sleight"],
  magecraft: ["Channeling", "Sculpting", "Fabrication", "Transmutation", "Augmentation", "Reinforcement", "Disjunction"],
  psionics: ["Telepathy", "Telekinesis", "Precognition", "Clairvoyance", "Imprint", "Biokinesis", "Mesmerism"],
  leadership: ["Tactics", "Coordination", "Provocation", "Guardianship", "Discipline", "Inspiration", "Valor"],
  ritualism: ["Inscription", "Reagents", "Sympathy", "Consecration", "Entreaty", "Severance", "Liturgy"],
  calling: ["Accord", "Dominion", "Vessel", "Anchoring", "Banishment", "Chorus", "Transference"]
};

// Re-derived from V6 Appendix J ("Combat Style Expertises and Subtypes"), which is now the book's
// own authoritative Subtype Family list per Combat Style. This SUPERSEDES the prior note in this
// file (and build-history's "Recent sessions") recording that a 2026-09-08 fix against the V5
// rulebook's Part X Appendix A was reverted in favor of essence-options.ts's SUBTYPE_DATABASE —
// that reversal was correct for V5, whose Appendix A really was stale/draft and contradicted the
// spreadsheet. V6 Appendix J resolves that contradiction in the book itself: it was diffed field by
// field against the pre-V6 (essence-options.ts-sourced) table below, and every family in every
// Style either matched exactly or is corrected here (Prowess's spurious "Stance", Gestalt's
// spurious "Mimic", Cunning's spurious "Diversion", Magecraft missing Light/Shadow/Chaos,
// Psionics's spurious "Resonance", Leadership's spurious "Signal", Ritualism's spurious "Circle",
// and Calling expanded from its old Rank 0-2-only 8 entries to the full 17 named in Appendix
// H/J's Rank 0-5 table). Do NOT revert this against essence-options.ts or the old V5 Appendix A —
// V6 Appendix J is the current source of truth for this table.
//
// Note: removing "Stance" from prowess here does NOT touch the Prowess Specialty Condition Item
// (packs/_source/conditions/stance_*.json, name "Stance") — that's a retained V6 Condition, an
// unrelated compendium Item that happens to share the old subtype's name; this table has zero
// importers of that Condition and vice versa.
// V6 Appendix G (plan §6.12, confirmed unchanged by design/v6-revision-delta.md §6): the printed
// effect of each of the 10 Magecraft Thread families, shown beside every stored Thread on the
// Character sheet. Purely display text — nothing here branches on it, matching this file's own
// convention for tables that are reminder text rather than live mechanics. A Thread cannot
// strengthen the Action that created it; duplicates are allowed; effects stack; a consumed Thread
// is spent even if the card fails — all reminder-only, not modeled in code.
/** Thread effects when consumed (Doc L6044-L6053, brought to full wording in 0.12.0). */
export const THREAD_EFFECTS = {
  Fire: "Intensify: add 1 Damage to one chosen creature successfully affected by a damaging effect of the card; that effect keeps its Damage type.",
  Water: "Flow: after resolution, move yourself or one willing creature successfully affected by the card up to 2 units.",
  Earth: "Ground: after resolution, gain +1 Fortitude until the start of your next Turn. Repeated Earth Threads stack.",
  Air: "Carry: increase the card's numeric Range by 2 units. A Self effect stays Self.",
  Time: "Sustain: extend one eligible effect that would end at the start or end of your next Turn by one additional Turn of yours. Upkeep and Concentration still apply.",
  Space: "Expand: increase a Sphere's hex radius by 1 (one outer ring), or a Line or Cone's length by 1 unit.",
  Light: "Clarify: add 1 to the Success Die of an opposed Magecraft roll; the final value can exceed 10.",
  Shadow: "Obscure: one successfully affected enemy suffers −1 to the Success Die of its next hostile Action before the start of your next Turn. Repeated Shadow Threads stack.",
  Aether: "Economize: reduce the card's Focus cost by 1, to a minimum of 0.",
  Chaos: "Recast: reroll one die actually rolled for this card before calculating Surges; you must use the new result. A fixed Authority result cannot be rerolled. Each Chaos Thread permits another reroll."
};

export const SUBTYPE_DATABASE = {
  prowess: ["Blitz", "Breaker", "Finisher", "Guard", "Opener"],
  ballistics: ["Execution", "Salvo", "Suppression", "Targeting", "Trickshot"],
  gestalt: ["Bulwark", "Chimera", "Predator", "Strider", "Titan"],
  cunning: ["Ambush", "Evasion", "Gambit", "Reversal", "Trap"],
  magecraft: ["Aether", "Air", "Chaos", "Earth", "Fire", "Light", "Shadow", "Space", "Time", "Water"],
  psionics: ["Assault", "Barrier", "Fracture", "Projection", "Trance"],
  leadership: ["Example", "Formation", "Order", "Standard", "Vow"],
  ritualism: ["Divination", "Hex", "Imbuement", "Offering", "Ward"],
  calling: [
    "Abomination", "Ancestor", "Avatar", "Beast", "Celestial", "Dragon", "Elemental", "Familiar",
    "Fey", "Fiend", "Golem", "Leviathan", "Outsider", "Phantom", "Primordial", "Sprite", "Titan"
  ]
};
