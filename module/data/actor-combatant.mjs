import { migrateSource } from "./migration.mjs";
import { SEVERITY_BY_INDEX, DAMAGE_TYPES } from "../utils.mjs";
import { deriveDeathTrackMax } from "./origin-features.mjs";

const { fields } = foundry.data;

/**
 * V6 Wound State (part-iv-combat.md § Wound States, plan §5.1.1): governed by the HIGHEST occupied
 * severity among filled Core Wound spaces, not by how many spaces are filled. Derives its rank
 * order from SEVERITY_BY_INDEX (utils.mjs) — the same positional Light/Light/Serious/Serious/
 * Critical layout already used to label a space when a Wound fills it — instead of hardcoding the
 * severity name list a second time.
 */
const SEVERITY_RANK = Object.fromEntries([...new Set(SEVERITY_BY_INDEX)].map((s, i) => [s, i + 1]));
const WOUND_STATE_BY_RANK = ["Unharmed", "Lightly Wounded", "Seriously Wounded", "Critically Wounded"];

/**
 * Psionics Strain's penalty table (V6 Appendix D "Strain"): 0-2 no penalty; 3-4 −1 Composure;
 * 5-6 −1 Composure AND Psionics cards require 1 additional burned die (surfaced separately below
 * as psionicsBurnSurcharge, since it isn't a Defense penalty and has no home in strainPenalty).
 * Harmony and Fortitude are NOT touched at any threshold — the earlier provisional table's
 * Harmony/Fortitude penalties were a placeholder that V6 does not carry forward.
 * Strain itself is capped at 6 by the schema field below; no further penalty exists past that cap.
 */
const STRAIN_PENALTY_THRESHOLDS = [{ min: 3, composure: 1 }];
const STRAIN_EXTRA_BURNED_DIE_AT = 5;

/** One of the 9 attributes: base 1, 7 points to distribute, max 3 at creation. */
export function attributeField() {
  return new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 });
}

/** One of the 9 combat styles: ungated start at rank 0, gated require a matching Distinction. */
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
  /** See module/data/migration.mjs — repairs any value an older version of this system saved that
   *  this schema would now reject, BEFORE Foundry can reject it and leave the document invalid
   *  (and therefore invisible). Inherited by every subtype; `this.schema` resolves to whichever
   *  concrete model is actually loading, so this one implementation covers all of them. */
  static migrateData(source) {
    return migrateSource(this, super.migrateData(source));
  }

  static defineSchema() {
    return {
      species: new fields.StringField({ initial: "" }),
      subspecies: new fields.StringField({ initial: "" }),
      speciesTraits: new fields.ArrayField(new fields.StringField()),
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
      // V6 REVISED (design/v6-revision-delta.md §2.1, 0.6.97 correction of 0.6.85's build):
      // Resistance reduces matching Damage by 2 (min 0), Vulnerability increases it by 2, both
      // applied BEFORE Resilience or Breach (see #onApplyDamage) — EXCEPT that a matching pair of
      // the same Damage type cancel each other outright (see applyResistanceVulnerability in
      // utils.mjs). `damageType` is one of the 12 printed Damage types (DAMAGE_TYPES, utils.mjs) —
      // NEVER a Physical/Mental/Spiritual domain or a Combat Style; the book is explicit that
      // domains/Styles "do not qualify as types." A Distinction Origin Benefit, a Manifestation
      // profile, or equipment can each grant one, so `source` is a free-text label for the sheet
      // display, not a structured back-reference to whichever Item granted it (no existing
      // convention in this codebase ties a derived list entry back to its granting Item by id —
      // see e.g. how `abilities`/`rites` are also plain hand-authored lists).
      resistances: new fields.ArrayField(new fields.SchemaField({
        damageType: new fields.StringField({ initial: DAMAGE_TYPES[0], choices: DAMAGE_TYPES }),
        source: new fields.StringField({ initial: "" })
      })),
      vulnerabilities: new fields.ArrayField(new fields.SchemaField({
        damageType: new fields.StringField({ initial: DAMAGE_TYPES[0], choices: DAMAGE_TYPES }),
        source: new fields.StringField({ initial: "" })
      })),
      // Most characters start with 0 capacity for Temporary Wounds — gear/features grant more.
      // V6 removed the old hard ceiling of 5; this field has no `max` and the sheet's pip display
      // (EssenceActorSheet#_prepareContext's temporaryWoundPips) already sizes itself off this
      // field's live value rather than a hardcoded box count, so no rendering change was needed
      // here (matches the web app's defaultCharacter(), which also starts this at 0).
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
      // `initial: 5` is a starting capacity value, not a universal maximum — V6 explicitly has no
      // universal cap on Temporary Influence capacity, and this field itself sets no `max`.
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
      // V6 Reach pressure (part-v-social-encounters.md § Reach, plan §5.3.1): the first of three
      // layers ordinary Influence pressure now passes through (Reach absorbs first, up to
      // effectiveReach, THEN Temporary Influence, THEN Core Influence) — Influence Breach skips
      // this layer entirely and goes straight to Temporary Influence. Tracked as its OWN
      // accumulator, separate from `reach`/`effectiveReach` below, per V6's explicit "Reach does
      // not decrease as pressure accumulates. Record the accumulated pressure instead" — so a Reach
      // Trigger that temporarily raises effectiveReach doesn't retroactively rewrite what's already
      // been recorded here. Resets at an Adventure boundary (see resetAdventureUses in utils.mjs),
      // same manual "story beat" convention as Reach Triggers' usedThisAdventure flag — any
      // Temporary Influence already spent absorbing overflow pressure stays spent.
      reachPressure: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
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
      // with system.slot in {"inventory","temporary","armory"}. Defaults match the web app's
      // defaultCharacter() (4/8), not the rules text directly — there's no printed formula.
      inventoryLimit: new fields.NumberField({ integer: true, initial: 4 }),
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
        // Psionics — capped at 6 per V6 Appendix D "Strain" (see STRAIN_PENALTY_THRESHOLDS and
        // STRAIN_EXTRA_BURNED_DIE_AT below for the Composure penalty and burned-die surcharge).
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
        // V6 Presence benefit (design/v6-revision-delta.md §3.4, new — no prior plan section):
        // "Once during preparation for each Adventure, gain Temporary Influence equal to your
        // Presence... Record it separately; any unspent portion expires when that Adventure ends...
        // Does not increase Reach or Armory or Inventory limits." A SEPARATE tracked bucket, not
        // folded into the scalar `temporaryInfluence` above, since it has its own expiry the scalar
        // can't represent (§2.7's own recommendation: bundle the model change with this grant
        // rather than rebuilding the whole Temporary Influence model as arrays-of-grants).
        // Deliberately minimal — one small bucket for this one specific grant, not a general
        // expiring-Influence-grant framework. `presenceGrantActive` is whether the once-per-
        // Adventure grant is still available to take (reset true by resetAdventureUses() at the
        // "new Adventure" boundary, set false once taken); `presenceGrantRemaining` is the
        // unspent pool itself (reset to 0 — expired — by that same "new Adventure" boundary, so any
        // leftover never carries into the next Adventure).
        presenceGrantActive: new fields.BooleanField({ initial: true }),
        presenceGrantRemaining: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
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

        // V6 tightens V5's "one Reaction per Action" to "one response per chain" (plan §5.2.7) —
        // strictly narrower, and a *chain* is even less representable than an Action instance in a
        // system with no card-resolution runtime (no persistent record of a triggering Action or a
        // reaction chain exists here — a card use is just a dice roll plus a chat message). This
        // remains an approximate soft check, not real trigger enforcement: it remembers which Combat
        // round + whose Turn was active the last time THIS actor used a Reaction, and warns (never
        // blocks) if they try to use another Reaction while that same Turn is still active — a
        // reasonable proxy since most single Turns only present one or a few genuinely distinct
        // chains. Building a real chain tracker is out of scope (plan §5.2.7/§6.8) — this is
        // deliberately left as the same proxy, just re-labeled to name the actual V6 rule. See
        // EssenceActorSheet#onRollItem for where this is checked/updated.
        lastReactionRound: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        lastReactionCombatantId: new fields.StringField({ initial: "" }),

        // Damage accumulates against Resilience between the starts of a character's own Turns,
        // then resets to 0 (see part-iv-combat.md § Resilience) — reset happens in EssenceCombat#_onStartTurn.
        accumulatedDamage: new fields.NumberField({ integer: true, initial: 0 }),
        // V6 §5.6 (plan): "remaining protection = current Resilience − accumulated ordinary Damage,
        // min 0," and a mid-interval Resilience change must never retroactively create or remove
        // Wounds. Storing the count of Wounds ALREADY extracted from accumulatedDamage (rather than
        // re-deriving it from accumulatedDamage and the CURRENT Resilience on every Apply Damage
        // call, which is what the pre-0.6.85 code did) is what makes that true — see #onApplyDamage's
        // own comment for the bug this fixes. Reset to 0 alongside accumulatedDamage at the start of
        // each of the character's own Turns.
        accumulatedDamageWounds: new fields.NumberField({ integer: true, initial: 0 }),
        // V6 Death Track (part-iv-combat.md § The Death Track, plan §5.1.3): governed by ALL FIVE
        // Core Wound spaces being filled — not by possessing a Critical Wound specifically, though
        // in practice gap-filling means those two conditions nearly always coincide (a Critical
        // space only fills once every space beneath it already has). `deathTrackState` replaces the
        // old plain `deathTrackFrozen` boolean with three real states:
        //   "none"       — not governed; step may still hold a persisted value (see below).
        //   "dying"      — track is full and actively advancing 1 step at the start of each of the
        //                  character's own Turns (EssenceCombat#_onStartTurn), step 5 is death.
        //   "stabilized" — track is full but frozen; set manually by a GM today (the dedicated
        //                  "Stabilize" Basic Action Card is a later-phase deliverable, not built
        //                  here). Taking an extra Wound while Stabilized (all 5 spaces already full)
        //                  breaks Stabilization back to "dying" and advances the step by 1.
        // Filling the 5th space itself only transitions "none" → "dying" at step 0 — it does NOT
        // advance the step; the first automatic advance happens at the start of the character's
        // NEXT Turn. Removing the Critical Wound (slot 4) resets step to 0; removing any OTHER Core
        // Wound while the track was full stops automatic advancement ("none") but PRESERVES the
        // step value, since V6 treats recorded progress as sticky. See EssenceActor#reduceDeathTrack
        // for the (not yet wired to Recovery — see actor-sheet.mjs's #onGrantRecovery) −1 effect.
        // `max: 7` is the schema CEILING, not any one character's effective max — the schema can't
        // be per-actor, so it has to allow the highest value anyone can reach (Deathless Nature,
        // design/v6-revision-delta.md §2.3). Whether a given character's actual cap is 5 or 7 is
        // `deathTrackMax` below (derived in prepareDerivedData) — every call site that used to
        // hardcode `5` as an advance/clamp/display ceiling now reads that instead.
        deathTrackStep: new fields.NumberField({ integer: true, initial: 0, min: 0, max: 7 }),
        deathTrackState: new fields.StringField({ initial: "none", choices: ["none", "dying", "stabilized"] }),

        // V6 Adaptability Attribute benefit (design/v6-revision-delta.md §2.2): "Completing a
        // Recovery also restores your one use of Adaptability's Exploration reroll. An unused use
        // remains available and does not accumulate with the restored use." A plain boolean, never
        // a counter, is what makes non-accumulation structurally impossible to get wrong — see
        // #onGrantRecovery (actor-sheet.mjs), which sets this back to true, and the Character
        // sheet's toggle next to it. Lives on the shared combatant base for the same reason Reach
        // does (equipment/NPC portrayal parity), even though only PCs currently have Adaptability
        // as a leveled Attribute.
        adaptabilityRerollAvailable: new fields.BooleanField({ initial: true }),

        // V6 "Acting While Dying - Provisional Playtest" (design/v6-revision-delta.md §2.4): the
        // first Action or Reaction played each Combat Round while Dying advances the Death Track by
        // 1 after it resolves, at most once per Round. Stores the Combat Round number the advance
        // was last charged for (not a boolean) so it naturally re-arms on the next Round without a
        // separate reset step, and survives the character stopping and re-starting Dying within the
        // same Round (V6: "even if you stop Dying and become Dying again"). See
        // deathTrackAfterCardWhileDying (utils.mjs) and its call sites in actor-sheet.mjs.
        dyingExertionRound: new fields.NumberField({ integer: true, nullable: true, initial: null })
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
    // Psionics Strain's penalty (see STRAIN_PENALTY_THRESHOLDS above) reduces the
    // character's own Defenses directly rather than needing a GM to remember and apply it by hand
    // — the same automation approach as woundState/standing below reading off filled-box counts.
    const strain = this.specialties?.strain ?? 0;
    const strainPenalty = STRAIN_PENALTY_THRESHOLDS.reduce((acc, t) => {
      if (strain < t.min) return acc;
      return { composure: acc.composure + (t.composure ?? 0), harmony: acc.harmony + (t.harmony ?? 0), fortitude: acc.fortitude + (t.fortitude ?? 0) };
    }, { composure: 0, harmony: 0, fortitude: 0 });
    // V6 Appendix D: at 5-6 Strain, Psionics cards require 1 additional burned die on top of their
    // printed cost. Not a Defense penalty, so it doesn't fold into strainPenalty above — surfaced as
    // its own derived flag for the sheet/roll-commit dialog to check.
    this.psionicsBurnSurcharge = strain >= STRAIN_EXTRA_BURNED_DIE_AT;

    this.defenses = {
      fortitude: 2 + twoLowest(might, grace, vigor) + this.fortitudeBonus - strainPenalty.fortitude,
      composure: 2 + twoLowest(intellect, acuity, resolve) + this.composureBonus - strainPenalty.composure,
      harmony: 2 + twoLowest(presence, adaptability, anima) + this.harmonyBonus - strainPenalty.harmony
    };

    // Base combat dice pool: Tier + 5 (see play-mode.ts)
    this.baseCombatDice = 5 + (this.tier || 0);

    // V6 Skill Tree (plan §9.3, confirmed by design/v6-revision-delta.md §4.3): Advancement Points
    // earned beyond standard Character Creation = (Tier-1)*10 + (Level-1), max 49. "Every
    // advancement after the character's initial Tier 1, Level 1 position grants one Advancement
    // Point... only the initial starting position is exempt" — the formula already produces this
    // with no special-casing: at Tier 1/Level 1 it's naturally 0, and entering a LATER Tier at its
    // own Level 1 still yields a nonzero value (e.g. Tier 2/Level 1 = (2-1)*10+(1-1) = 10), so a
    // naive "only Level 1 grants none" reading would wrongly zero that case out — this formula
    // doesn't have that bug. Ship as a read-only derived value: the Skill Tree node system itself
    // (what a point actually buys) remains explicitly blocked/deprioritized (plan §6.9/§9.3) — this
    // is intentionally inert data until that design lands.
    this.advancementPoints = Math.min(49, Math.max(0, ((this.tier || 1) - 1) * 10 + ((this.level || 1) - 1)));

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
    // (Letters of Standing et al. treat Reach as "1 higher" only "for the current Encounter" — see
    // reachTriggers above). Equipment tier checks and the sheet's Inventory Equipment header both
    // read this, never the raw `reach` field directly.
    this.effectiveReach = this.reach + (this.reachBonus ?? 0) + (this.reachTriggers ?? [])
      .filter((t) => t.active)
      .reduce((sum, t) => sum + (t.tempBonus || 0), 0);

    // Wound State (V6, part-iv-combat.md § Wound States): the HIGHEST occupied severity among
    // filled Core Wound spaces — not a count of how many are filled. `coreWoundsFilled` is exposed
    // separately because the Death Track (see playState.deathTrackState below) is governed by
    // occupancy ("all five spaces filled"), a genuinely different signal than worst severity.
    this.coreWoundsFilled = this.coreWounds.filter((w) => w.filled).length;
    const highestSeverityRank = this.coreWounds.reduce(
      (max, w) => (w.filled ? Math.max(max, SEVERITY_RANK[w.severity] ?? 0) : max),
      0
    );
    this.woundState = WOUND_STATE_BY_RANK[highestSeverityRank];

    // Standing (V6, plan §5.3.3): the "Standing by Injury State" table part-v-social-encounters.md
    // used to cite was deleted outright in V6, along with the count-based reading a prior session
    // inferred from it. Mirrors the V6 Wound State rewrite above instead: the HIGHEST occupied
    // severity among filled Core Influence spaces, not how many are filled — same SEVERITY_RANK
    // lookup, just applied to coreInfluence instead of coreWounds (Core Influence has no domain
    // axis, so there's nothing else to branch on).
    this.coreInfluenceFilled = this.coreInfluence.filter((c) => c.filled).length;
    const highestInfluenceRank = this.coreInfluence.reduce(
      (max, c) => (c.filled ? Math.max(max, SEVERITY_RANK[c.severity] ?? 0) : max),
      0
    );
    this.standing = ["Undamaged", "Light Injury", "Serious Injury", "Critical Injury"][highestInfluenceRank];

    // V6 Deathless Nature (design/v6-revision-delta.md §2.3): normally 5, 7 for a Deathless
    // character — see deriveDeathTrackMax (origin-features.mjs) for why this is computed once,
    // here, rather than re-checked at each of the five Death Track call sites that used to
    // hardcode a literal 5. `this.parent` is the owning Actor document — already available by the
    // time an embedded item's/actor's own prepareDerivedData runs, per Foundry's documented data
    // preparation order.
    const speciesItem = this.parent?.items?.find?.((i) => i.type === "species") ?? null;
    this.deathTrackMax = deriveDeathTrackMax(speciesItem);

    // V6's remaining five per-Attribute benefits (Might/Grace/Vigor/Acuity/Resolve — the book's
    // Physical/Mental Attribute write-ups). Each is a GM-adjudicated reference value the book itself
    // hands to the table ("the GM states the Difficulty," "no roll," etc.), not something to wire
    // into an automated timer/roll — matches this codebase's existing convention of computing a
    // derived number once here and letting the sheet display it as a reminder (deathTrackMax/
    // advancementPoints above are the same shape). Computed on the shared combatant base (not just
    // EssenceCharacterData) since NPCs/Monsters share these Attribute fields too, even though only
    // the Character sheet currently displays them (no comparable derived-Attribute display exists on
    // the NPC/Monster sheets to extend).
    //
    // Might "Exceptional loads": 50 lb of exceptional cargo per point of Might, on top of normal
    // personal equipment; grants no Armory/Inventory capacity change.
    this.exceptionalLoad = 50 * (this.might || 0);
    // Grace "Running jumps": cross a horizontal gap up to Grace units with a clear 2-unit run-up;
    // uses normal Combat Movement for the approach and crossing, grants none extra.
    this.runningJumpDistance = this.grace || 0;
    // Vigor "Extreme exertion": hold your breath / sustain extreme physical effort for Vigor
    // MINUTES before the hazard procedure applies — NOT 6x Vigor minutes, despite how the book's own
    // "equal to six times Vigor Rounds" clause can misread at a glance. A minute IS six Rounds, so
    // Vigor minutes = 6x Vigor Rounds; the book's own worked example confirms the reading used here:
    // "Vigor 3 permits three minutes, or eighteen Rounds" (3 minutes, 18 = 6x3 Rounds).
    this.extremeExertionMinutes = this.vigor || 0;
    this.extremeExertionRounds = 6 * (this.vigor || 0);
    // Resolve "Sustained attention": Resolve HOURS of demanding watch/study/surveillance before
    // strain from uninterrupted attention calls for a roll.
    this.sustainedAttentionHours = this.resolve || 0;
    // Acuity "Extended senses": +0 units at Acuity 1-2, +1 at 3-4, +2 at 5 — added to a specialty
    // Sense's own finite detection range. This is a MANUAL reference value, not an auto-applied
    // modifier: Species-granted Senses (scripts/origin-data.json) are stored as free-text Trait
    // descriptions (e.g. "Within 2 units..." baked into prose), not structured numeric range fields,
    // so there is nothing here to reliably parse and rewrite — the sheet shows the bonus and the
    // player/GM apply it to whichever Sense actually qualifies. The fallback "precise natural
    // vision" (for a character with no eligible finite-range Sense) is a SEPARATE flat 10x Acuity
    // units, not this bonus stacked onto a base — the book states them as alternative benefits, and
    // this system has no reliable structured way to tell which branch applies to a given character,
    // so both values are surfaced together with their conditions stated in the label text.
    this.extendedSensesBonus = (this.acuity || 0) >= 5 ? 2 : (this.acuity || 0) >= 3 ? 1 : 0;
    this.preciseVisionRange = 10 * (this.acuity || 0);
  }
}
