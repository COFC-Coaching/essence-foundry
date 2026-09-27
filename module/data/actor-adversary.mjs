import EssenceCombatantData from "./actor-combatant.mjs";
import { getGradeBudget } from "./monster-budgets.mjs";

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
 *   - `grade` (Mook/Normal/Elite) is GM-facing mechanical complexity/encounter weight. Historically
 *     this also gated a "Reduced Engine" (fixed printed dice-pool sizes and flat Defenses in place
 *     of the usual Attribute/Skill/Card build) for Mook and Normal — **V6 retires that as the
 *     resolution model** (plan §5.1.4/§9.5, confirmed by Ryan): every Grade now rolls dice the
 *     exact same way — Attribute + Combat Style Rank feeding real Action/Reaction Cards, same
 *     `EssenceActorSheet`/`EssenceNpcSheet#onRollItem` path a Character uses. `grade` only still
 *     differs by BUDGET (Mook has far fewer Attribute/Skill points and Cards than Elite — see
 *     monster-budgets.mjs's GRADE_BUDGETS — not a different engine) and by simplified Wound
 *     capacity (Mook 2 / Normal 4 / Elite 5 — see prepareDerivedData below and
 *     monster-budgets.mjs's `woundCapacity`, V6 §2410/§2467/§2415): every enemy grade uses a flat
 *     filled/capacity Wound counter instead of the player-facing 5-space Light/Serious/Critical
 *     track, receives no Wound Cards, and never uses the Death Track. This is the OPPOSITE pairing
 *     from the old model (which simplified combat resolution but used the full Wound track) — only
 *     Wounds are simplified now, and that applies to every grade, not just Mook/Normal.
 *   - `battlefieldRole` is the battlefield job (Defender/Striker/Controller/Blaster/Skirmisher/
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
 * `abilities` is a general-purpose GM-facing special-ability reference list, available to every
 * Grade (not just Mook/Normal, now that it no longer stands in for "no Cards") — each entry is
 * plain text tagged with a frequency (At Will / 1 per Round / X per Combat) the GM tracks by hand,
 * same as everything else on this sheet, layered ALONGSIDE an adversary's normal Action/Reaction
 * Cards rather than replacing them. `usesRemaining` only means something for "perCombat" (resets
 * once, at the start of Round 1 — see EssenceCombat#_onStartRound); `usedThisRound` only means
 * something for "perRound" (resets at the start of every one of the actor's own Turns — see
 * EssenceCombat#_onStartTurn). "atWill" tracks nothing.
 *
 * `fixedAttack`/`fixedDefenses` (the old Reduced Engine's flat dice-pool-size/flat-Defense fields)
 * and `monster-budgets.mjs`'s matching `REDUCED_ENGINE_DEFAULTS`/`computeFixedAttack`/
 * `computeFixedDefense` were removed outright in the V6 sync rather than kept-but-deprecated —
 * there are no live games and therefore no persisted Actor data anywhere that could reference them,
 * so there was nothing to preserve compatibility with. If this class ever needs a genuinely fixed,
 * non-rolled adversary stat block again, reintroduce it as new, explicitly-named fields rather than
 * reviving these — reusing the old names would misleadingly imply the old semantics.
 */
export default class EssenceAdversaryData extends EssenceCombatantData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      grade: new fields.StringField({ initial: "", blank: true, choices: ["", "Mook", "Normal", "Elite"] }),
      battlefieldRole: new fields.StringField({
        initial: "", blank: true,
        choices: ["", "Defender", "Striker", "Controller", "Blaster", "Skirmisher", "Support"]
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

      // v0.6 Part XIV "Enemy Construction" (Doc L6866-L6884, 0.11.0): a Mook or Normal ability is
      // a printed roll (`dice` d10, no Pool) with a kind (Action per Turn, Reaction per Round,
      // Triggered, or a passive modifier) and an optional Defense it rolls against. For an Elite,
      // `dice` is the card-style minimum commitment. "betweenRecoveries" replaces the old
      // "perCombat" (Doc L6921: uses refresh only after a genuine Recovery); migration.mjs maps
      // the stored value.
      abilities: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" }),
        kind: new fields.StringField({ initial: "action", choices: ["action", "reaction", "triggered", "passive"] }),
        dice: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 }),
        defense: new fields.StringField({ initial: "", blank: true, choices: ["", "fortitude", "composure", "harmony"] }),
        unopposed: new fields.BooleanField({ initial: false }),
        frequency: new fields.StringField({ initial: "atWill", choices: ["atWill", "perRound", "betweenRecoveries"] }),
        usesMax: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
        usesRemaining: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
        usedThisRound: new fields.BooleanField({ initial: false })
      })),

      // Reduced-engine allowances (Doc L6874-L6878, L7962). Null means "use the Grade default":
      // Mook 1 Action, 4 Task Dice; Normal 2 Actions, 5 Task Dice; both 2d10 Initiative; 1
      // Reaction per Round when a Reaction ability is listed. Elites use Pools and `rollLimit`
      // (Doc L7193) instead; Task Dice fall back to the Roll Limit (L6872).
      initiativeDice: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 1 }),
      actionsPerTurn: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 }),
      reactionsPerRound: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 }),
      taskDice: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 }),
      rollLimit: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 }),
      // Printed Defenses (Doc L6979, "Defenses Should Create a Profile"): an enemy's Defenses are
      // printed, not derived. Null keeps the Attribute-derived value for that Defense.
      printedDefenses: new fields.SchemaField({
        fortitude: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 }),
        composure: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 }),
        harmony: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 })
      }),
      // Per-Turn and per-Round counters for the reduced engine, reset by EssenceCombat.
      enemyTurn: new fields.SchemaField({
        actionsUsed: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
        utilityUsed: new fields.BooleanField({ initial: false }),
        reactionsUsed: new fields.NumberField({ integer: true, initial: 0, min: 0 })
      }),

      gmNotes: new fields.HTMLField({ initial: "" })
    };
  }

  /** Doc L6866: Mooks and Normals run the reduced engine (printed rolls, no Pools); Elites the full
   *  one. A blank Grade counts as Normal, matching getGradeBudget's fallback. */
  get isReducedEngine() {
    return this.grade !== "Elite";
  }

  /**
   * V6: every Grade now uses the same Attribute-derived Fortitude/Composure/Harmony formula
   * EssenceCombatantData just computed (no more flat fixedDefenses substitution for Mook/Normal) —
   * this override now exists purely for the simplified-Wound bookkeeping below.
   */
  prepareDerivedData() {
    super.prepareDerivedData();

    // Printed Defenses override the Attribute-derived ones (Doc L6979); Strain and bonuses do not
    // apply on top of a printed value, since the profile is the whole statement.
    for (const key of ["fortitude", "composure", "harmony"]) {
      const printed = this.printedDefenses?.[key];
      if (typeof printed === "number") this.defenses[key] = printed;
    }

    // Reduced-engine defaults (Doc L7962, L7193).
    const mook = this.grade === "Mook";
    this.engine = this.isReducedEngine ? "reduced" : "full";
    this.effectiveInitiativeDice = this.initiativeDice ?? 2;
    this.effectiveActionsPerTurn = this.actionsPerTurn ?? (mook ? 1 : 2);
    const hasReaction = (this.abilities ?? []).some((a) => a.kind === "reaction");
    this.effectiveReactionsPerRound = this.reactionsPerRound ?? (hasReaction ? 1 : 0);
    this.effectiveTaskDice = this.taskDice ?? (this.isReducedEngine ? (mook ? 4 : 5) : (this.rollLimit ?? null));

    // V6 §2415: every enemy grade uses a simplified Wound model — a flat filled/capacity counter,
    // no Light/Serious/Critical spaces, no Wound Cards, no Wound State track, no Death Track.
    // `usesSimplifiedWounds` is the flag npc-sheet.hbs/monster-sheet.hbs branch on to hide that UI
    // and show a simple counter instead; combat.mjs's turn-start Death Track advance also checks it.
    this.usesSimplifiedWounds = true;
    const capacity = getGradeBudget(this.grade).woundCapacity ?? 5;
    if (this.coreWounds.length !== capacity) {
      // Re-view the stored coreWounds array at the Grade's own capacity — padding a short array
      // with empty spaces, or (if a GM just downgraded Grade) dropping the excess spaces from this
      // derived view. EssenceManifestationData already proves an arbitrary coreWounds length "just
      // works" for Apply Damage's slot-indexed logic, so no other change is needed here. Note this
      // is a VIEW change only; it only becomes a permanent data loss if the sheet's own
      // read-modify-write Wound logic subsequently persists this shorter array back to the actor.
      this.coreWounds = Array.from({ length: capacity }, (_, i) =>
        this.coreWounds[i] ?? { filled: false, domain: "", severity: "", condition: "" }
      );
    }
    this.coreWoundsFilled = this.coreWounds.filter((w) => w.filled).length;
    // Stabilize on a Defeated enemy (Doc L4280): "stops dying from the treated injuries but remains
    // Defeated and unable to act." EssenceActor#stabilize records it in deathTrackState.
    this.woundState = this.coreWoundsFilled >= capacity
      ? (this.playState?.deathTrackState === "stabilized" ? "Defeated (stable)" : this.playState?.deathTrackState === "dead" ? "Dead" : (this.playState?.deathTrackStep ?? 0) > 0 ? `Defeated (dying, Round ${this.playState.deathTrackStep} of 6)` : "Defeated")
      : "";
  }
}
