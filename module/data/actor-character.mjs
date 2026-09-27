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
      // v0.6 Part II "Languages" (Doc L1133): one primary language plus permanent Acuity additional
      // ones. Free text, since "the Campaign defines its languages and dialects; there is no
      // universal list". The sheet shows the allowance (languageCount, actor-combatant.mjs) beside it.
      languages: new fields.StringField({ initial: "" }),
      // Explicit Skill Point grants on top of 5 + Intellect (Doc L815, "plus any explicit grants").
      // Entered by hand from the granting feature's text; nothing derives it.
      skillPointBonus: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // v0.6 Part II "Connections" (Doc L1155): up to permanent Presence dependable allies, each with
      // "a name, an area of involvement, and a relationship to you". `scope` is the Team Tier or
      // reach of the ally's help, agreed with the GM (Doc L2608). Relationships gained through play
      // are unrestricted, so the sheet warns past the allowance rather than blocking (L7832).
      connections: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        area: new fields.StringField({ initial: "" }),
        relationship: new fields.StringField({ initial: "" }),
        scope: new fields.StringField({ initial: "" })
      })),
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
        source: new fields.StringField({ initial: "", blank: true, choices: ["", "intellect"] })
      }))
    };
  }
}
