const { fields } = foundry.data;

/** One of the 9 attributes: base 1, 7 points to distribute, max 3 at creation. */
function attributeField() {
  return new fields.NumberField({ required: true, integer: true, initial: 1, min: 0 });
}

/** One of the 9 combat skills: ungated start at rank 0, gated require a matching Distinction. */
function skillField() {
  return new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 });
}

export default class EssenceCharacterData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      // Identity
      concept: new fields.StringField({ initial: "" }),
      notes: new fields.HTMLField({ initial: "" }),
      backstory: new fields.HTMLField({ initial: "" }),
      appearance: new fields.HTMLField({ initial: "" }),
      personality: new fields.HTMLField({ initial: "" }),
      pronouns: new fields.StringField({ initial: "" }),
      age: new fields.StringField({ initial: "" }),
      playerName: new fields.StringField({ initial: "" }),
      species: new fields.StringField({ initial: "" }),
      subspecies: new fields.StringField({ initial: "" }),
      speciesAdaptations: new fields.ArrayField(new fields.StringField()),
      heritage: new fields.StringField({ initial: "" }),
      distinction: new fields.StringField({ initial: "" }),
      tier: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      level: new fields.NumberField({ required: true, integer: true, initial: 1, min: 1 }),
      career: new fields.StringField({ initial: "" }),
      keyAspects: new fields.ArrayField(new fields.StringField(), { initial: ["", "", ""] }),

      // Attributes — Physical / Mental / Spiritual domains
      might: attributeField(), grace: attributeField(), vigor: attributeField(),
      intellect: attributeField(), acuity: attributeField(), resolve: attributeField(),
      presence: attributeField(), adaptability: attributeField(), anima: attributeField(),

      // Combat skills
      prowess: skillField(), ballistics: skillField(), gestalt: skillField(),
      cunning: skillField(), magecraft: skillField(), psionics: skillField(),
      leadership: skillField(), ritualism: skillField(), calling: skillField(),

      // Derived-resource bonuses (flat modifiers on top of the 2 + top-two/bottom-two formula)
      staminaBonus: new fields.NumberField({ integer: true, initial: 0 }),
      focusBonus: new fields.NumberField({ integer: true, initial: 0 }),
      manaBonus: new fields.NumberField({ integer: true, initial: 0 }),
      fortitudeBonus: new fields.NumberField({ integer: true, initial: 0 }),
      composureBonus: new fields.NumberField({ integer: true, initial: 0 }),
      harmonyBonus: new fields.NumberField({ integer: true, initial: 0 }),

      // Harm / wound track
      resilience: new fields.NumberField({ integer: true, initial: 0 }),
      temporaryWoundsAvailable: new fields.NumberField({ integer: true, initial: 5 }),
      coreWounds: new fields.ArrayField(
        new fields.SchemaField({
          filled: new fields.BooleanField({ initial: false }),
          condition: new fields.StringField({ initial: "" })
        }),
        { initial: Array.from({ length: 5 }, () => ({ filled: false, condition: "" })) }
      ),

      // Influence (social harm), tracked separately from wounds
      temporaryInfluence: new fields.NumberField({ integer: true, initial: 5 }),
      coreInfluence: new fields.ArrayField(
        new fields.SchemaField({ filled: new fields.BooleanField({ initial: false }) }),
        { initial: Array.from({ length: 5 }, () => ({ filled: false })) }
      ),

      reach: new fields.NumberField({ integer: true, initial: 1 }),
      movement: new fields.NumberField({ integer: true, initial: 10 }),
      senses: new fields.ArrayField(new fields.StringField()),

      expertises: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        skill: new fields.StringField({ initial: "" })
      })),
      nonCombatSkills: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        rating: new fields.NumberField({ integer: true, initial: 0 })
      })),
      passiveFeatures: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        source: new fields.StringField({ initial: "" }),
        text: new fields.HTMLField({ initial: "" })
      })),

      // Equipment slot limits — the items themselves are owned Items of type "equipment"
      // with system.slot in {"signature","temporary","armory"}
      signatureEquipmentLimit: new fields.NumberField({ integer: true, initial: 0 }),
      armoryLimit: new fields.NumberField({ integer: true, initial: 0 }),

      // Play state — combat lifecycle & live resource tracking (see play-mode.ts parity notes)
      playState: new fields.SchemaField({
        revision: new fields.NumberField({ integer: true, initial: 0 }),
        currentStamina: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        currentFocus: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        currentMana: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        currentCoreWounds: new fields.NumberField({ integer: true, initial: 0 }),
        currentTemporaryWounds: new fields.NumberField({ integer: true, initial: 0 }),
        currentTemporaryInfluence: new fields.NumberField({ integer: true, initial: 0 }),
        currentCoreInfluence: new fields.NumberField({ integer: true, initial: 0 }),
        pinnedCards: new fields.ArrayField(new fields.StringField()),
        sessionNotes: new fields.StringField({ initial: "" }),
        initiativeDice: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        initiativeFaces: new fields.ArrayField(new fields.NumberField({ integer: true })),
        initiativeTotal: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        initiativeCommitted: new fields.BooleanField({ initial: false }),
        combatStarted: new fields.BooleanField({ initial: false }),
        combatRound: new fields.NumberField({ integer: true, initial: 0 }),
        combatTurn: new fields.StringField({
          initial: "notStarted",
          choices: ["notStarted", "first", "active", "ended"]
        }),
        actionDice: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        reactionDice: new fields.NumberField({ integer: true, nullable: true, initial: null })
      })
    };
  }

  /** Mirrors computeStats() in artifacts/essence-system/src/lib/character-model.ts */
  prepareDerivedData() {
    const twoHighest = (a, b, c) => a + b + c - Math.min(a, b, c);
    const twoLowest = (a, b, c) => a + b + c - Math.max(a, b, c);

    const { might, grace, vigor, intellect, acuity, resolve, presence, adaptability, anima } = this;

    this.resources = {
      stamina: 2 + twoHighest(might, grace, vigor) + this.staminaBonus,
      focus: 2 + twoHighest(intellect, acuity, resolve) + this.focusBonus,
      mana: 2 + twoHighest(presence, adaptability, anima) + this.manaBonus
    };
    this.defenses = {
      fortitude: 2 + twoLowest(might, grace, vigor) + this.fortitudeBonus,
      composure: 2 + twoLowest(intellect, acuity, resolve) + this.composureBonus,
      harmony: 2 + twoLowest(presence, adaptability, anima) + this.harmonyBonus
    };

    // Base combat dice pool: Tier + 5 (see play-mode.ts)
    this.baseCombatDice = 5 + (this.tier || 0);
  }
}
