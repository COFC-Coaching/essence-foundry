const { fields } = foundry.data;

/** Shared schema pieces for action-card / reaction-card, mirroring CombatCard in card-builder.ts */
class EssenceCardData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      domain: new fields.StringField({ initial: "physical", choices: ["physical", "mental", "spiritual"] }),
      rank: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      style: new fields.StringField({ initial: "" }),
      subtype: new fields.StringField({ initial: "" }),
      attr: new fields.StringField({ initial: "" }),        // attribute used for the roll pool
      skill: new fields.StringField({ initial: "" }),       // combat skill used for the roll pool
      defense: new fields.StringField({ initial: "" }),     // opposing defense: Fortitude/Composure/Harmony
      min: new fields.StringField({ initial: "" }),         // minimum dice for success (can be numeric or text)
      cost: new fields.StringField({ initial: "" }),        // Action/Reaction Dice cost
      expertises: new fields.StringField({ initial: "" }),
      expertisesMode: new fields.StringField({ initial: "any", choices: ["any", "any2"] }),
      tags: new fields.StringField({ initial: "" }),
      flavor: new fields.HTMLField({ initial: "" }),
      body: new fields.ArrayField(new fields.SchemaField({
        label: new fields.StringField({ initial: "" }),
        html: new fields.HTMLField({ initial: "" })
      })),
      surges: new fields.ArrayField(new fields.SchemaField({
        n: new fields.StringField({ initial: "1" }),
        html: new fields.HTMLField({ initial: "" })
      })),
      rider: new fields.SchemaField({
        title: new fields.StringField({ initial: "" }),
        html: new fields.HTMLField({ initial: "" }),
        meta: new fields.StringField({ initial: "" })
      })
    };
  }
}

export class EssenceActionCardData extends EssenceCardData {}
export class EssenceReactionCardData extends EssenceCardData {}

/** Mirrors ConditionCard: kind 'condition' with free-text labeled sections. */
export class EssenceConditionData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      sections: new fields.ArrayField(new fields.SchemaField({
        label: new fields.StringField({ initial: "" }),
        html: new fields.HTMLField({ initial: "" })
      }))
    };
  }
}

/** Mirrors EquipmentItem in equipment-model.ts (subset most relevant to Foundry play). */
export class EssenceEquipmentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new fields.StringField({ initial: "gear", choices: ["weapon", "armor", "tool", "gear"] }),
      slot: new fields.StringField({ initial: "armory", choices: ["signature", "temporary", "armory"] }),
      tier: new fields.NumberField({ integer: true, nullable: true, initial: null }),
      type: new fields.StringField({ initial: "" }),
      cost: new fields.StringField({ initial: "" }),
      range: new fields.StringField({ initial: "" }),
      effect: new fields.HTMLField({ initial: "" }),
      passive: new fields.HTMLField({ initial: "" }),
      special: new fields.HTMLField({ initial: "" }),
      fortitude: new fields.StringField({ initial: "" }),
      resilience: new fields.StringField({ initial: "" }),
      movement: new fields.StringField({ initial: "" }),
      tags: new fields.StringField({ initial: "" }),
      flavor: new fields.HTMLField({ initial: "" }),
      reachBonus: new fields.NumberField({ integer: true, initial: 0 }),
      uses: new fields.NumberField({ integer: true, nullable: true, initial: null }),
      slotCost: new fields.NumberField({ integer: true, initial: 1 }),
      isModular: new fields.BooleanField({ initial: false }),
      quantity: new fields.NumberField({ integer: true, initial: 1, min: 0 })
    };
  }
}
