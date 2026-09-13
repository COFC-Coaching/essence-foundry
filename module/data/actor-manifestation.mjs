const { fields } = foundry.data;

/**
 * A Calling Full Manifestation profile (see CALLING_PROFILES.md and module/apps/manifestation.mjs)
 * — a purpose-built Actor type instead of reusing EssenceNpcData/EssenceCombatantData. A profile's
 * Fortitude/Composure/Harmony/Resilience/Movement/Wound-capacity are fixed by the rules text and
 * never hand-built by a GM the way a monster stat block is, so there's no Species/Heritage/
 * Distinction/Role/Non-Combat/Influence/Expertise data here — none of it applies. Per the official
 * rules, "the profile supplies no extra Attributes": a maneuver's dice come from the CALLER's own
 * Calling Rank and Attribute, never a stat stored here, so this schema doesn't carry the usual 9
 * Attributes or 9 Combat Skills at all.
 *
 * Fortitude/Composure/Harmony are plain numbers here (not derived from Attributes via the usual
 * twoLowest() formula) because a profile simply doesn't have Attributes to derive them from — the
 * printed profile table gives these three directly.
 */
export default class EssenceManifestationData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      subtype: new fields.StringField({ initial: "" }), // Familiar/Sprite/Beast/Phantom/Golem/Elemental/Ancestor/Fey
      rank: new fields.NumberField({ integer: true, initial: 0, min: 0, max: 2 }),
      body: new fields.StringField({ initial: "Living", choices: ["Living", "Nonliving"] }),
      purpose: new fields.StringField({ initial: "" }),
      traitName: new fields.StringField({ initial: "" }),
      traitText: new fields.HTMLField({ initial: "" }),
      // Elemental's "Declared Aspect" trait only — chosen at first entry each Encounter and fixed
      // for that Encounter; blank and unused for every other subtype. Tracked manually here, same
      // as every other Combat Style Specialty in this system.
      aspect: new fields.StringField({ initial: "", blank: true, choices: ["", "Fire", "Cold", "Lightning"] }),

      // Synced from the caller's own Tier at each entry (see manifestation.mjs) — drives
      // baseCombatDice below exactly like a character's or NPC's Tier does.
      tier: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
      fortitude: new fields.NumberField({ integer: true, initial: 0 }),
      composure: new fields.NumberField({ integer: true, initial: 0 }),
      harmony: new fields.NumberField({ integer: true, initial: 0 }),
      resilience: new fields.NumberField({ integer: true, initial: 0 }),
      movement: new fields.NumberField({ integer: true, initial: 0 }),

      // Sized to the profile's own Wound capacity (3-5) at creation, not the usual fixed 5 — see
      // build-packs.mjs's manifestationProfileToActor(). Apply Damage indexes by slot position
      // (utils.mjs's SEVERITY_BY_INDEX), so any length here "just works" unmodified.
      coreWounds: new fields.ArrayField(new fields.SchemaField({
        filled: new fields.BooleanField({ initial: false }),
        domain: new fields.StringField({ initial: "" }),
        severity: new fields.StringField({ initial: "" }),
        condition: new fields.StringField({ initial: "" })
      })),

      // Combat lifecycle only — no Stamina/Focus/Mana, Core Influence, or Death Track here. A
      // manifestation's own defeat is immediate collapse (see manifestation.mjs's
      // applyManifestationDefeat), not the Death Track's multi-step countdown, and it has no
      // Resources of its own to track (maneuvers cost the CALLER's Mana, paid by hand same as the
      // entry cost itself).
      playState: new fields.SchemaField({
        actionDice: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        reactionDice: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        accumulatedDamage: new fields.NumberField({ integer: true, initial: 0 }),
        currentTemporaryWounds: new fields.NumberField({ integer: true, initial: 0 }),
        // Counts Wounds that couldn't fit once coreWounds was already full — i.e. the overflow
        // CALLING_PROFILES.md says transfers to the caller on defeat (see manifestation.mjs's
        // applyManifestationDefeat). There's no Death Track here; a manifestation's own defeat is
        // immediate collapse, not a multi-step countdown.
        overflowWounds: new fields.NumberField({ integer: true, initial: 0 }),
        combatStarted: new fields.BooleanField({ initial: false }),
        combatTurn: new fields.StringField({
          initial: "notStarted",
          choices: ["notStarted", "first", "active", "ended"]
        }),
        initiativeDice: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        initiativeFaces: new fields.ArrayField(new fields.NumberField({ integer: true })),
        initiativeTotal: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        initiativeCommitted: new fields.BooleanField({ initial: false }),
        lastReactionRound: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        lastReactionCombatantId: new fields.StringField({ initial: "" })
      })
    };
  }

  prepareDerivedData() {
    this.baseCombatDice = 5 + (this.tier || 0);
    this.defenses = { fortitude: this.fortitude, composure: this.composure, harmony: this.harmony };
    const filled = this.coreWounds.filter((w) => w.filled).length;
    this.woundsFilled = filled;
    this.defeated = this.coreWounds.length > 0 && filled >= this.coreWounds.length;
  }
}
