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

// Matches essence-options.ts's SUBTYPE_DATABASE verbatim — the web app/spreadsheet source is
// canonical here, NOT the V5 rulebook's Part X Appendix A, which turned out to list a materially
// different (and apparently stale/draft) set of Action Subtypes per skill. A 2026-09-08 "fix" of
// this table against Appendix A was reverted the same day once the user confirmed the spreadsheet
// source is authoritative — see build-history's "Recent sessions" for the full story. The rulebook
// wiki's Appendix A prose itself still needs a follow-up correction; it wasn't touched here.
export const SUBTYPE_DATABASE = {
  prowess: ["Blitz", "Breaker", "Finisher", "Guard", "Opener", "Stance"],
  ballistics: ["Execution", "Salvo", "Suppression", "Targeting", "Trickshot"],
  gestalt: ["Bulwark", "Chimera", "Mimic", "Predator", "Strider", "Titan"],
  cunning: ["Ambush", "Diversion", "Evasion", "Gambit", "Reversal", "Trap"],
  magecraft: ["Aether", "Air", "Earth", "Fire", "Space", "Time", "Water"],
  psionics: ["Assault", "Barrier", "Fracture", "Projection", "Resonance", "Trance"],
  leadership: ["Example", "Formation", "Order", "Signal", "Standard", "Vow"],
  ritualism: ["Circle", "Divination", "Hex", "Imbuement", "Offering", "Ward"],
  calling: ["Ancestor", "Beast", "Elemental", "Familiar", "Fey", "Golem", "Phantom", "Sprite"]
};
