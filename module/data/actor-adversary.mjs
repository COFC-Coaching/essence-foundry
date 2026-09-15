import EssenceCombatantData from "./actor-combatant.mjs";

const { fields } = foundry.data;

/**
 * Shared identity/behavior fields for both adversary families — People (EssenceNpcData) and
 * Monsters (EssenceMonsterData). Split out of what used to be EssenceNpcData alone once Monsters
 * needed the exact same Grade/Role/Elite Type/Tactics/Abilities machinery but a different Origin
 * concept (Species/Heritage/Distinction for a Person vs. a Monster Type tag for a creature — see
 * actor-monster.mjs). See Things To Work On/Enemies and NPC's.txt for the source design doc.
 *
 * Identity is three independent tags, plus a fourth that only applies to the rarest ones:
 *   - `tier` (on EssenceCombatantData already) is raw power, same field a PC uses.
 *   - `grade` (Mook/Normal/Elite) is GM-facing mechanical complexity/encounter weight. Only Elite
 *     currently gets the system's full player-facing combat engine treatment from the Monster
 *     Wizard; Mook/Normal use the same engine today too (there's no separate fixed-value "Reduced
 *     Enemy Engine" yet — the design doc calls that out as the next thing to design), but Grade
 *     already drives the point-buy budget size and is the hook that engine will read once it exists.
 *   - `battlefieldRole` is the battlefield job (Defender/Striker/Controller/Artillery/Skirmisher/
 *     Support) — purely descriptive/GM-facing, doesn't currently feed any formula.
 *   - `eliteType` (Champion/Leader/Boss) only means anything when `grade` is "Elite" — Champion is
 *     an Elite with no extra mechanics beyond the normal engine; Leader/Boss are where
 *     encounter-scale, adversary-only abilities belong (see the design doc's Elite-Only Ability
 *     Principle). `leaderAbilities`/`bossAbilities` are free-text lists for those, gated by type
 *     purely by convention (the sheet only shows the list matching the current eliteType).
 *
 * `tactics` is a Mook's ordered "follow the first applicable instruction" behavior script; `gmNotes`
 * remains the general free-text field (a Normal's short "Behavior" guidance fits fine there too —
 * it's explicitly non-mandatory per the design doc, so it doesn't need its own structured field).
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
      eliteType: new fields.StringField({ initial: "", blank: true, choices: ["", "Champion", "Leader", "Boss"] }),
      // Ordered list of plain-text instructions — the GM follows the first applicable one rather
      // than optimizing the Mook's turn (design doc § Mook: "The GM follows the first applicable
      // instruction rather than stopping to optimize every individual Mook's turn.").
      tactics: new fields.ArrayField(new fields.StringField({ initial: "" })),
      // Leader-only Command abilities / Boss-only encounter-scale abilities (design doc §§ Leader,
      // Boss). Free text by design — see the Elite-Only Ability Principle for why these stay rare
      // and hand-authored rather than a structured mechanic.
      leaderAbilities: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      })),
      bossAbilities: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      })),
      gmNotes: new fields.HTMLField({ initial: "" })
    };
  }
}
