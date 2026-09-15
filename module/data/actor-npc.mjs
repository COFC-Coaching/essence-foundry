import EssenceCombatantData from "./actor-combatant.mjs";

const { fields } = foundry.data;

/**
 * NPCs/adversaries use the exact same combat mechanics as player characters — per
 * welcome-to-the-essence-system.md, "Game Masters will use those same rules when portraying...
 * adversaries" — just without the player-facing fluff (Concept, Career, Non-Combat Skills) that
 * doesn't apply to a monster stat block.
 *
 * Identity is three independent tags (see Things To Work On/Enemies and NPC's.txt, the homebrew
 * "Essence Enemy Rules" design doc — none of this is canonical rules text either):
 *   - `tier` (on EssenceCombatantData already) is raw power, same field a PC uses.
 *   - `grade` (Mook/Normal/Elite) is GM-facing mechanical complexity/encounter weight. It replaces
 *     the old 4-value `role` field (Minion/Standard/Elite/Nemesis) — see monster-budgets.mjs's
 *     GRADE_BUDGETS for the migration mapping. Only Elite currently gets the system's full
 *     player-facing combat engine treatment from the Monster Wizard; Mook/Normal use the same
 *     engine today too (there's no separate fixed-value "Reduced Enemy Engine" yet — the design
 *     doc calls that out as the next thing to design), but Grade already drives the point-buy
 *     budget size and is the hook that engine will read once it exists.
 *   - `battlefieldRole` is the battlefield job (Defender/Striker/Controller/Artillery/Skirmisher/
 *     Support) — purely descriptive/GM-facing, doesn't currently feed any formula.
 *   - `eliteType` (Champion/Leader/Boss) only means anything when `grade` is "Elite" — Champion is
 *     an Elite with no extra mechanics beyond the normal engine; Leader/Boss are where
 *     encounter-scale, NPC-only abilities belong (see the design doc's Elite-Only Ability
 *     Principle). `leaderAbilities`/`bossAbilities` are free-text lists for those, gated by type
 *     purely by convention (the sheet only shows the list matching the current eliteType).
 *
 * `tactics` is a Mook's ordered "follow the first applicable instruction" behavior script; `gmNotes`
 * remains the general free-text field (a Normal's short "Behavior" guidance fits fine there too —
 * it's explicitly non-mandatory per the design doc, so it doesn't need its own structured field).
 */
export default class EssenceNpcData extends EssenceCombatantData {
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
