import EssenceCombatantData from "./actor-combatant.mjs";

const { fields } = foundry.data;

/**
 * NPCs/adversaries use the exact same combat mechanics as player characters — per
 * welcome-to-the-essence-system.md, "Game Masters will use those same rules when portraying...
 * adversaries" — just without the player-facing fluff (Concept, Career, Non-Combat Skills) that
 * doesn't apply to a monster stat block. Adds only a Role tag (matches part-iv-combat.md's
 * "Nemesis" enemy category) and a free-text GM Notes field for tactics/behavior reminders.
 */
export default class EssenceNpcData extends EssenceCombatantData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      role: new fields.StringField({ initial: "", blank: true, choices: ["", "Minion", "Standard", "Elite", "Nemesis"] }),
      gmNotes: new fields.HTMLField({ initial: "" })
    };
  }
}
