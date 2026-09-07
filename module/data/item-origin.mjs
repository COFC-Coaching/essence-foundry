const { fields } = foundry.data;

/** A Species (natural lineage): a Nature trait plus a pool of Adaptations the player picks from. */
export class EssenceSpeciesData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      nature: new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      }),
      adaptationLabel: new fields.StringField({ initial: "Adaptation" }),
      adaptationCount: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      adaptations: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" }),
        chosen: new fields.BooleanField({ initial: false })
      })),
      subspecies: new fields.ArrayField(new fields.StringField())
    };
  }
}

/** A Heritage (upbringing/background): grants a Legacy (mechanical) and a Familiarity (narrative/knowledge). */
export class EssenceHeritageData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      legacy: new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      }),
      familiarity: new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      })
    };
  }
}

/**
 * A Distinction: the character-creation option that ties to one Combat Skill, and for five of
 * them (Gifted/Psyker/Arcanist/Invoker/Summoner) is the ONLY way to unlock a gated skill
 * (Gestalt/Psionics/Magecraft/Ritualism/Calling respectively). See SKILL_GATE in the web app's
 * essence-options.ts for the canonical skill -> distinction-name mapping this mirrors.
 */
export class EssenceDistinctionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      keyCombatSkill: new fields.StringField({ initial: "" }),
      primaryAttr: new fields.StringField({ initial: "" }),
      unlocks: new fields.StringField({ initial: "", nullable: true }),
      benefit: new fields.HTMLField({ initial: "" }),
      origin: new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      })
    };
  }
}
