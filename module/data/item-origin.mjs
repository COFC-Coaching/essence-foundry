const { fields } = foundry.data;

/**
 * Some Species Nature traits and Adaptations bury a SECOND choice inside their own rules text
 * beyond the outer "choose N Adaptations" pick — e.g. Mortal-Kin's Keen ("choose two of the
 * following special Senses: low-light vision, keen hearing, or keen scent") or Dragonkin's Nature
 * ("Choose a Draconic Lineage, such as Flame, Frost, Storm, Stone..."). This factory builds that
 * nested sub-choice block, shared identically between `nature` and each `adaptations` entry so the
 * Wizard (character-wizard.mjs) can render/handle both with one code path.
 *
 * `type` distinguishes two flavors found in part-ii-character-creation.md § Species:
 * - "fixed": the rules print an exhaustive (or GM-approved-extensible-but-still-enumerable) list —
 *   e.g. Keen's three named Senses. Rendered as capped checkboxes in the Wizard.
 * - "free": the rules use "such as"/open wording implying more options than the examples given —
 *   e.g. Dragonkin's "Draconic Lineage, such as Flame, Frost, Storm, Stone" or Verdant's
 *   nourishment source. Rendered as a plain text input the player fills in themselves.
 * A few entries print a fixed list PLUS an explicit GM-approved "other" option (Constructs' Sensor
 * Suite, Beastfolk's Heightened Instincts/Natural Armament) — modeled simply as one more literal
 * string appended to `options` ("Other (GM-approved)") rather than a third type, per the "simplest
 * correct approach" call for that shape.
 *
 * `selected` is a plain array of strings for BOTH types, capped at `count`: for "fixed" it holds a
 * subset of `options`; for "free" it holds the player's own typed string(s) (almost always length
 * 1, but kept as an array for symmetry with "fixed" rather than adding a second, type-conditional
 * field). This is what `deriveOriginFeatures()` (origin-features.mjs) reads to surface the actual
 * pick on the Character sheet's General Features & Benefits table.
 */
function subChoiceField() {
  return new fields.SchemaField({
    label: new fields.StringField({ initial: "" }), // e.g. "Senses", "Lineage", "Origin"
    type: new fields.StringField({ initial: "none", choices: ["none", "fixed", "free"] }),
    options: new fields.ArrayField(new fields.StringField()), // fixed-list choices; unused for "free"
    count: new fields.NumberField({ integer: true, initial: 1, min: 1 }),
    selected: new fields.ArrayField(new fields.StringField()) // player's picks/typed text, capped at count
  });
}

/** A Species (natural lineage): a Nature trait plus a pool of Adaptations the player picks from. */
export class EssenceSpeciesData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      description: new fields.HTMLField({ initial: "" }),
      nature: new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" }),
        subChoice: subChoiceField()
      }),
      adaptationLabel: new fields.StringField({ initial: "Adaptation" }),
      adaptationCount: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      adaptations: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" }),
        chosen: new fields.BooleanField({ initial: false }),
        subChoice: subChoiceField()
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
