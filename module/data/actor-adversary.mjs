import EssenceCombatantData from "./actor-combatant.mjs";

const { fields } = foundry.data;

/**
 * Shared identity/behavior fields for both adversary families — People (EssenceNpcData) and
 * Monsters (EssenceMonsterData). Split out of what used to be EssenceNpcData alone once Monsters
 * needed the exact same Grade/Role/Elite Type/Tactics/Abilities machinery but a different Origin
 * concept (Species/Heritage/Distinction for a Person vs. a Monster Type tag for a creature — see
 * actor-monster.mjs). See Things To Work On/Enemies and NPC's.txt and the Encounter & Adventure
 * Building Primer for the source design docs.
 *
 * Identity is three independent tags, plus a fourth that only applies to the rarest ones:
 *   - `tier` (on EssenceCombatantData already) is raw power, same field a PC uses.
 *   - `grade` (Mook/Normal/Elite) is GM-facing mechanical complexity/encounter weight. Elite gets
 *     the system's full player-facing combat engine (dice pools built fresh from Attributes/
 *     Skills, Combat Cards, MP). Mook and Normal use the Reduced Engine below instead.
 *   - `battlefieldRole` is the battlefield job (Defender/Striker/Controller/Artillery/Skirmisher/
 *     Support) — purely descriptive/GM-facing, doesn't currently feed any formula.
 *   - `eliteType` (Champion/Leader/Solo) only means anything when `grade` is "Elite" — Champion is
 *     an Elite with no extra mechanics beyond the normal engine; Leader/Solo are where
 *     encounter-scale, adversary-only abilities belong (see the design doc's Elite-Only Ability
 *     Principle). "Solo" is an Elite Type, not a synonym for a Boss Encounter — a Boss Encounter
 *     (see the Encounter & Adventure Building Primer) is built from EITHER a Leader OR a Solo
 *     Elite; "Boss" never appears as a value here. `leaderAbilities`/`soloAbilities` are free-text
 *     lists for those, gated by type purely by convention (the sheet only shows the list matching
 *     the current eliteType).
 *
 * `tactics` is a Mook's ordered "follow the first applicable instruction" behavior script; `gmNotes`
 * remains the general free-text field (a Normal's short "Behavior" guidance fits fine there too —
 * it's explicitly non-mandatory per the design doc, so it doesn't need its own structured field).
 *
 * The Reduced Engine (Mook/Normal only — confirmed design, see monster-budgets.mjs's
 * REDUCED_ENGINE_DEFAULTS doc comment for the calibration target and why these numbers are a first
 * draft, not a ruling):
 *   - `fixedAttack` — a flat dice-pool SIZE per Domain, printed on the stat block instead of being
 *     rebuilt from Attribute + Skill each time. The GM still rolls that many dice, same success
 *     math as a PC (see EssenceNpcSheet#onRollFixedAttack) — nothing about "fixed" skips the roll.
 *   - `fixedDefenses` — Fortitude/Composure/Harmony as flat printed numbers, replacing the
 *     9-Attribute-derived formula (EssenceCombatantData#prepareDerivedData) that a Mook/Normal
 *     no longer needs to fill in an Attribute grid for.
 *   - `abilities` — replaces Action/Reaction Cards + MP costs. Each entry is plain text tagged
 *     with a frequency (At Will / 1 per Round / X per Combat) the GM tracks by hand, same as
 *     everything else on this sheet. `usesRemaining` only means something for "perCombat"
 *     (resets once, at the start of Round 1 — see EssenceCombat#_onStartRound); `usedThisRound`
 *     only means something for "perRound" (resets at the start of every one of the actor's own
 *     Turns — see EssenceCombat#_onStartTurn). "atWill" tracks nothing.
 */
export default class EssenceAdversaryData extends EssenceCombatantData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      grade: new fields.StringField({ initial: "", blank: true, choices: ["", "Mook", "Normal", "Elite"] }),
      battlefieldRole: new fields.StringField({
        initial: "", blank: true,
        choices: ["", "Defender", "Striker", "Controller", "Artillery", "Skirmisher", "Support"]
      }),
      eliteType: new fields.StringField({ initial: "", blank: true, choices: ["", "Champion", "Leader", "Solo"] }),
      // Ordered list of plain-text instructions — the GM follows the first applicable one rather
      // than optimizing the Mook's turn (design doc § Mook: "The GM follows the first applicable
      // instruction rather than stopping to optimize every individual Mook's turn.").
      tactics: new fields.ArrayField(new fields.StringField({ initial: "" })),
      // Leader-only Command abilities / Solo-only encounter-scale abilities (design doc §§ Leader,
      // Solo). Free text by design — see the Elite-Only Ability Principle for why these stay rare
      // and hand-authored rather than a structured mechanic.
      leaderAbilities: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      })),
      soloAbilities: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      })),

      // Reduced Engine (Mook/Normal only) — see class doc comment above.
      fixedAttack: new fields.SchemaField({
        physical: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        mental: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        spiritual: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),
      fixedDefenses: new fields.SchemaField({
        fortitude: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        composure: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        harmony: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),
      abilities: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" }),
        frequency: new fields.StringField({ initial: "atWill", choices: ["atWill", "perRound", "perCombat"] }),
        usesMax: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
        usesRemaining: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
        usedThisRound: new fields.BooleanField({ initial: false })
      })),

      gmNotes: new fields.HTMLField({ initial: "" })
    };
  }

  /** Mook/Normal Grade substitutes flat, hand-set fixedDefenses for the Attribute-derived
   *  Fortitude/Composure/Harmony formula EssenceCombatantData just computed — equipment's own
   *  *Bonus fields still apply on top, same as every other Defense on this system. Elite (and a
   *  blank/unset Grade, so a freshly-created adversary defaults to the familiar full engine) are
   *  untouched. */
  prepareDerivedData() {
    super.prepareDerivedData();
    if (this.grade !== "Mook" && this.grade !== "Normal") return;
    this.defenses = {
      fortitude: this.fixedDefenses.fortitude + this.fortitudeBonus,
      composure: this.fixedDefenses.composure + this.composureBonus,
      harmony: this.fixedDefenses.harmony + this.harmonyBonus
    };
  }
}
