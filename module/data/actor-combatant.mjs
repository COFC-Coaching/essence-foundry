const { fields } = foundry.data;

/**
 * Psionics Strain's provisional penalty table (PLAYTEST_RULES.md §12): each threshold's penalty is
 * cumulative with every lower one already reached (6 Strain suffers all three, not only Fortitude).
 * Strain itself is capped at 6 by the schema field below; no further penalty exists past that cap.
 */
const STRAIN_PENALTY_THRESHOLDS = [
  { min: 2, composure: 1 },
  { min: 4, harmony: 1 },
  { min: 6, fortitude: 1 }
];

/** One of the 9 attributes: base 1, 7 points to distribute, max 3 at creation. */
export function attributeField() {
  return new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 });
}

/** One of the 9 combat skills: ungated start at rank 0, gated require a matching Distinction. */
export function skillField() {
  return new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });
}

/**
 * Everything a combat-capable Actor needs regardless of whether it's a player character or an
 * NPC/adversary — attributes, skills, wounds, Specialties, and the combat playState — shared so
 * player and NPC sheets stay mechanically identical (per welcome-to-the-essence-system.md: "Game
 * Masters will use those same rules when portraying... adversaries"). EssenceCharacterData adds
 * the player-only fluff (Concept, Career, Non-Combat Skills, etc.); EssenceNpcData adds GM notes.
 */
export default class EssenceCombatantData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      species: new fields.StringField({ initial: "" }),
      subspecies: new fields.StringField({ initial: "" }),
      speciesAdaptations: new fields.ArrayField(new fields.StringField()),
      heritage: new fields.StringField({ initial: "" }),
      distinction: new fields.StringField({ initial: "" }),
      tier: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),

      // Attributes — Physical / Mental / Spiritual domains
      might: attributeField(), grace: attributeField(), vigor: attributeField(),
      intellect: attributeField(), acuity: attributeField(), resolve: attributeField(),
      presence: attributeField(), adaptability: attributeField(), anima: attributeField(),

      // Combat skills
      prowess: skillField(), ballistics: skillField(), gestalt: skillField(),
      cunning: skillField(), magecraft: skillField(), psionics: skillField(),
      leadership: skillField(), ritualism: skillField(), calling: skillField(),

      // Derived-resource bonuses (flat modifiers on top of the 2 + top-two/bottom-two formula)
      staminaBonus: new fields.NumberField({ integer: true, initial: 0 }),
      focusBonus: new fields.NumberField({ integer: true, initial: 0 }),
      manaBonus: new fields.NumberField({ integer: true, initial: 0 }),
      fortitudeBonus: new fields.NumberField({ integer: true, initial: 0 }),
      composureBonus: new fields.NumberField({ integer: true, initial: 0 }),
      harmonyBonus: new fields.NumberField({ integer: true, initial: 0 }),
      // Equipment's own Resilience/Movement/Reach modifiers (equipment-effects.mjs) land here, NOT
      // on resilience/movement/reach directly below — those are plain editable sheet inputs with
      // submitOnChange:true, so a transferred Active Effect targeting them directly would get its
      // own already-applied result written back as the new "base" on the next unrelated form
      // submit, then re-applied on top of THAT — silently compounding every time. Confirmed live:
      // a single -4 Movement item alone drove a Tier 1 character's Movement from 10 to 2. Mirrors
      // the fortitudeBonus/composureBonus/harmonyBonus pattern already used for Defenses above.
      resilienceBonus: new fields.NumberField({ integer: true, initial: 0 }),
      movementBonus: new fields.NumberField({ integer: true, initial: 0 }),
      reachBonus: new fields.NumberField({ integer: true, initial: 0 }),

      // Harm / wound track
      resilience: new fields.NumberField({ integer: true, initial: 0 }),
      // Most characters start with 0 capacity for Temporary Wounds — gear/features grant more,
      // up to the hard ceiling of 5 (see part-iv-combat.md § Temporary Wounds; matches the web
      // app's defaultCharacter(), which also starts this at 0, not 5).
      temporaryWoundsAvailable: new fields.NumberField({ integer: true, initial: 0 }),
      // 5 spaces, filled in order: 2 Light, 2 Serious, 1 Critical (see part-iv-combat.md § Core Wounds).
      // `condition` is a generated display label ("Light Physical Wound") — the game's own named
      // Wound Condition reference doesn't exist in canon yet, so this stands in for it.
      coreWounds: new fields.ArrayField(
        new fields.SchemaField({
          filled: new fields.BooleanField({ initial: false }),
          domain: new fields.StringField({ initial: "" }),
          severity: new fields.StringField({ initial: "" }),
          condition: new fields.StringField({ initial: "" })
        }),
        { initial: Array.from({ length: 5 }, () => ({ filled: false, domain: "", severity: "", condition: "" })) }
      ),

      // Influence (social harm), tracked separately from wounds but shaped identically — 5 spaces,
      // filled in order: 2 Light, 2 Serious, 1 Critical (see part-v-social-encounters.md § Core
      // Influence, which uses "the same five-box severity track as Core Wounds"). `condition` is a
      // generated display label ("Light Injury"), the Influence equivalent of a Wound Condition —
      // same canon gap: no named mechanical effect per severity exists yet, so this is descriptive only.
      temporaryInfluence: new fields.NumberField({ integer: true, initial: 5 }),
      coreInfluence: new fields.ArrayField(
        new fields.SchemaField({
          filled: new fields.BooleanField({ initial: false }),
          severity: new fields.StringField({ initial: "" }),
          condition: new fields.StringField({ initial: "" })
        }),
        { initial: Array.from({ length: 5 }, () => ({ filled: false, severity: "", condition: "" })) }
      ),

      // Reach is an economic/social scale stat — "the scale across which their wealth,
      // reputation, and connections remain meaningful" (part-ii-character-creation.md § Reach,
      // recorded alongside the Influence tracks in Step 6) — not a combat stat, despite living in
      // this shared combatant schema alongside Movement. It's manually GM-awarded, not a computed
      // formula (Tier only "helps determine what... the character can reasonably access"
      // narratively; there's no printed Reach = f(Tier) formula). The field stays here rather than
      // moving to EssenceCharacterData because NPCs use it too (equipment gating applies to both
      // sheets) — this session only relocated where it's *displayed* (Non-Combat/Influence area,
      // not the Combat tab), not the schema.
      reach: new fields.NumberField({ integer: true, initial: 1 }),
      // Generic "Adventure-Limited Reach Trigger" mechanic (part-ii-character-creation.md §§ Noble
      // Household "Letters of Standing" and Frontier Household "Prepared Cache" — both grant a
      // free-first-use-then-1-Influence-Breach temporary Reach boost. Underworld Raised's "Fence's
      // Cache" also references Reach but has no Adventure-limit/Breach cost in the current text, so
      // it's a plain Reach-gated exchange, not one of these triggers — don't add it here. See
      // part-iii-playing-the-game.md § Adventure-Limited Abilities for the general "resets at
      // Adventure end" pattern these two share). One entry per granted triggered
      // ability rather than bespoke per-Heritage fields/buttons, since more Heritages/Species will
      // likely add more of these as content grows. `active` drives the live Reach bonus (see
      // `effectiveReach` below); `usedThisAdventure` gates the free-vs-Breach cost and is cleared
      // only by an explicit "reset for new adventure" sheet action (this project has no automated
      // Adventure-boundary concept — matches how Wound/Influence recovery are all manual too).
      reachTriggers: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),         // e.g. "Letters of Standing"
        tempBonus: new fields.NumberField({ integer: true, initial: 1 }),        // Reach boost while active
        tempInfluenceGrant: new fields.NumberField({ integer: true, initial: 0 }), // Temp Influence granted on activation
        usedThisAdventure: new fields.BooleanField({ initial: false }),
        active: new fields.BooleanField({ initial: false })
      })),
      movement: new fields.NumberField({ integer: true, initial: 10 }),
      senses: new fields.ArrayField(new fields.StringField()),

      expertises: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        skill: new fields.StringField({ initial: "" })
      })),
      passiveFeatures: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        source: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      })),

      // Equipment slot limits — the items themselves are owned Items of type "equipment"
      // with system.slot in {"signature","temporary","armory"}. Defaults match the web app's
      // defaultCharacter() (4/8), not the rules text directly — there's no printed formula.
      signatureEquipmentLimit: new fields.NumberField({ integer: true, initial: 4 }),
      armoryLimit: new fields.NumberField({ integer: true, initial: 8 }),

      // One resource-tracking mechanic per Combat Style (see part-iv-combat.md § Combat Styles).
      // These are manually managed by the player, matching how the rest of the sheet works
      // (Apply Damage, Burn Dice, etc. are all manual too) rather than auto-triggered off rolls.
      specialties: new fields.SchemaField({
        combo: new fields.NumberField({ integer: true, initial: 0, min: 0, max: 5 }), // Prowess
        lock: new fields.StringField({ initial: "" }), // Ballistics — name of the Locked creature
        adaptation: new fields.SchemaField({ // Gestalt
          name: new fields.StringField({ initial: "" }),
          upkeep: new fields.NumberField({ integer: true, initial: 0, min: 0 })
        }),
        contingency: new fields.StringField({ initial: "" }), // Cunning — trigger + effect, free text
        threads: new fields.ArrayField(new fields.StringField()), // Magecraft — up to 3, fixed family names
        // Psionics — capped at 6 per PLAYTEST_RULES.md §12's provisional table (see
        // STRAIN_PENALTY_THRESHOLDS below for the Composure/Harmony/Fortitude penalties this
        // supersedes the older burn-a-die/Psychic-damage Strain rule with for this playtest wave).
        strain: new fields.NumberField({ integer: true, initial: 0, min: 0, max: 6 }), // Psionics
        authority: new fields.ArrayField(new fields.NumberField({ integer: true })), // Leadership — stored die results
        rites: new fields.ArrayField(new fields.SchemaField({ // Ritualism — up to 3
          trigger: new fields.StringField({ initial: "" }),
          echo: new fields.StringField({ initial: "" }),
          echoLimit: new fields.NumberField({ integer: true, initial: 1, min: 1 })
        })),
        // Calling — Full Manifestation. `manifested`/`broken` are the original flat flags kept for
        // back-compat with any world data already using them; `activeManifestation` (the current
        // subtype name, "" when not manifested) and `manifestationRecords` (see manifestation.mjs)
        // are the richer per-subtype tracking the swap-to-NPC-actor implementation actually reads —
        // see CALLING_PROFILES.md's "one persistent Wound record per subtype for the Adventure."
        manifested: new fields.BooleanField({ initial: false }),
        broken: new fields.BooleanField({ initial: false }),
        activeManifestation: new fields.StringField({ initial: "" }),
        manifestationRecords: new fields.ArrayField(new fields.SchemaField({
          subtype: new fields.StringField({ initial: "" }),
          actorId: new fields.StringField({ initial: "" }), // this character's own persistent world-Actor copy of that profile
          broken: new fields.BooleanField({ initial: false }) // per CALLING_PROFILES.md's defeat rule — until Downtime
        }))
      }),

      // Play state — combat lifecycle & live resource tracking (see play-mode.ts parity notes)
      playState: new fields.SchemaField({
        revision: new fields.NumberField({ integer: true, initial: 0 }),
        currentStamina: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        currentFocus: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        currentMana: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        currentCoreWounds: new fields.NumberField({ integer: true, initial: 0 }),
        currentTemporaryWounds: new fields.NumberField({ integer: true, initial: 0 }),
        currentTemporaryInfluence: new fields.NumberField({ integer: true, initial: 0 }),
        currentCoreInfluence: new fields.NumberField({ integer: true, initial: 0 }),
        pinnedCards: new fields.ArrayField(new fields.StringField()),
        sessionNotes: new fields.StringField({ initial: "" }),
        initiativeDice: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        initiativeFaces: new fields.ArrayField(new fields.NumberField({ integer: true })),
        initiativeTotal: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        initiativeCommitted: new fields.BooleanField({ initial: false }),
        combatStarted: new fields.BooleanField({ initial: false }),
        combatTurn: new fields.StringField({
          initial: "notStarted",
          choices: ["notStarted", "first", "active", "ended"]
        }),
        actionDice: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        reactionDice: new fields.NumberField({ integer: true, nullable: true, initial: null }),

        // "One Reaction per Action" (part-iv-combat.md § One Reaction per Action) is fundamentally
        // about a specific triggering Action, which this system has no persistent record of — a
        // card use is just a dice roll plus a chat message, not a trackable "Action instance." This
        // is therefore an approximate soft check, not real trigger enforcement: it remembers which
        // Combat round + whose Turn was active the last time THIS actor used a Reaction, and warns
        // (never blocks) if they try to use another Reaction while that same Turn is still active —
        // a reasonable proxy since most single Turns only present one or a few genuinely distinct
        // triggers. See EssenceActorSheet#onRollItem for where this is checked/updated.
        lastReactionRound: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        lastReactionCombatantId: new fields.StringField({ initial: "" }),

        // Damage accumulates against Resilience between the starts of a character's own Turns,
        // then resets to 0 (see part-iv-combat.md § Resilience) — reset happens in EssenceCombat#_onStartTurn.
        accumulatedDamage: new fields.NumberField({ integer: true, initial: 0 }),
        // Active only once the 5th Core Wound is filled (Critically Wounded). Advances 1 step at
        // the start of each of the character's Turns while unfrozen; step 5 is death.
        deathTrackStep: new fields.NumberField({ integer: true, initial: 0, min: 0, max: 5 }),
        deathTrackFrozen: new fields.BooleanField({ initial: false })
      })
    };
  }

  /** Mirrors computeStats() in artifacts/essence-system/src/lib/character-model.ts */
  prepareDerivedData() {
    const twoHighest = (a, b, c) => a + b + c - Math.min(a, b, c);
    const twoLowest = (a, b, c) => a + b + c - Math.max(a, b, c);

    const { might, grace, vigor, intellect, acuity, resolve, presence, adaptability, anima } = this;

    const staminaMax = 2 + twoHighest(might, grace, vigor) + this.staminaBonus;
    const focusMax = 2 + twoHighest(intellect, acuity, resolve) + this.focusBonus;
    const manaMax = 2 + twoHighest(presence, adaptability, anima) + this.manaBonus;

    // {value, max} shape so Foundry's token resource bars (primary/secondaryTokenAttribute in
    // system.json) can resolve these paths — value mirrors the live playState counter, falling
    // back to max until the GM sets one (same null-until-touched convention as playState itself).
    this.resources = {
      stamina: { value: this.playState.currentStamina ?? staminaMax, max: staminaMax },
      focus: { value: this.playState.currentFocus ?? focusMax, max: focusMax },
      mana: { value: this.playState.currentMana ?? manaMax, max: manaMax }
    };
    // Psionics Strain's provisional penalty (see STRAIN_PENALTY_THRESHOLDS above) reduces the
    // character's own Defenses directly rather than needing a GM to remember and apply it by hand
    // — the same automation approach as woundState/standing below reading off filled-box counts.
    const strain = this.specialties?.strain ?? 0;
    const strainPenalty = STRAIN_PENALTY_THRESHOLDS.reduce((acc, t) => {
      if (strain < t.min) return acc;
      return { composure: acc.composure + (t.composure ?? 0), harmony: acc.harmony + (t.harmony ?? 0), fortitude: acc.fortitude + (t.fortitude ?? 0) };
    }, { composure: 0, harmony: 0, fortitude: 0 });

    this.defenses = {
      fortitude: 2 + twoLowest(might, grace, vigor) + this.fortitudeBonus - strainPenalty.fortitude,
      composure: 2 + twoLowest(intellect, acuity, resolve) + this.composureBonus - strainPenalty.composure,
      harmony: 2 + twoLowest(presence, adaptability, anima) + this.harmonyBonus - strainPenalty.harmony
    };

    // Base combat dice pool: Tier + 5 (see play-mode.ts)
    this.baseCombatDice = 5 + (this.tier || 0);

    // Each point of Combo increases Movement by 1 unit (part-iv-combat.md § Combo), and equipment's
    // own Movement modifier (movementBonus, see its schema comment above) folds in here too rather
    // than touching the raw, sheet-editable `movement` field directly.
    this.totalMovement = this.movement + (this.movementBonus ?? 0) + (this.specialties?.combo ?? 0);

    // Resilience as actually usable for Apply Damage's math — base plus equipment's own Resilience
    // modifier (resilienceBonus). Apply Damage (actor-sheet.mjs/npc-sheet.mjs) reads this, never
    // the raw `resilience` field directly.
    this.effectiveResilience = this.resilience + (this.resilienceBonus ?? 0);

    // Reach as actually usable right now for equipment-gating purposes: base Reach plus equipment's
    // own Reach modifier (reachBonus) plus any currently-active Adventure-Limited Reach Triggers
    // (Letters of Standing et al. treat Reach as "1 higher" only "for the current Scene" — see
    // reachTriggers above). Equipment tier checks and the sheet's Signature Equipment header both
    // read this, never the raw `reach` field directly.
    this.effectiveReach = this.reach + (this.reachBonus ?? 0) + (this.reachTriggers ?? [])
      .filter((t) => t.active)
      .reduce((sum, t) => sum + (t.tempBonus || 0), 0);

    // Wound State depends only on how many Core Wound spaces are filled, never on any single
    // attack's Damage (see part-iv-combat.md § Wound States).
    const filledCoreWounds = this.coreWounds.filter((w) => w.filled).length;
    this.woundState =
      filledCoreWounds === 0 ? "Unharmed" :
      filledCoreWounds <= 2 ? "Lightly Wounded" :
      filledCoreWounds <= 4 ? "Seriously Wounded" : "Critically Wounded";

    // Standing reads off the Core Influence track the same way Wound State reads off Core Wounds —
    // same box counts (2 Light/2 Serious/1 Critical), same count-based thresholds (see
    // part-v-social-encounters.md § Standing by Injury State).
    const filledCoreInfluence = this.coreInfluence.filter((c) => c.filled).length;
    this.standing =
      filledCoreInfluence === 0 ? "Undamaged" :
      filledCoreInfluence <= 2 ? "Light Injury" :
      filledCoreInfluence <= 4 ? "Serious Injury" : "Critical Injury";
  }
}
