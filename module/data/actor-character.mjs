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
        rating: new fields.NumberField({ integer: true, initial: 0 }),
        // design/v6-revision-delta.md §3.4: "Gain one different Non-Combat Skill at Rank 1 per
        // point of permanent Intellect... Record which Skills came from Intellect; retraining
        // recalculates these grants." "intellect" marks a Rank-1 grant from the Intellect benefit
        // (made BEFORE spending the ordinary 5 Skill Points, per the book); "" (default) is an
        // ordinary player-picked entry paid from that pool. Retraining logic itself isn't built yet
        // — this tag exists so a future retraining pass can recompute Intellect grants without
        // repeatedly harvesting them, per the book's own explicit caution.
        source: new fields.StringField({ initial: "", choices: ["", "intellect"] })
      }))
    };
  }
}
