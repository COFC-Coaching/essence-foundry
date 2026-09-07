import EssenceCombatantData from "./actor-combatant.mjs";

const { fields } = foundry.data;

/** Adds the player-only fluff (Concept, Career, Non-Combat Skills, etc.) on top of the combat
 * fields every combatant shares — see actor-combatant.mjs. */
export default class EssenceCharacterData extends EssenceCombatantData {
  static defineSchema() {
    return {
      ...super.defineSchema(),

      // Identity
      concept: new fields.StringField({ initial: "" }),
      notes: new fields.HTMLField({ initial: "" }),
      backstory: new fields.HTMLField({ initial: "" }),
      appearance: new fields.HTMLField({ initial: "" }),
      personality: new fields.HTMLField({ initial: "" }),
      pronouns: new fields.StringField({ initial: "" }),
      age: new fields.StringField({ initial: "" }),
      playerName: new fields.StringField({ initial: "" }),
      career: new fields.StringField({ initial: "" }),
      keyAspects: new fields.ArrayField(new fields.StringField(), { initial: ["", "", ""] }),
      nonCombatSkills: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        rating: new fields.NumberField({ integer: true, initial: 0 })
      }))
    };
  }
}
