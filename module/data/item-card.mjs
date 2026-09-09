const { fields } = foundry.data;

/**
 * Display label for each EssenceEquipmentData `category` value — proper multi-word capitalization
 * ("Consumable Kit," not "Consumable-kit," which is what a plain CSS `text-transform: capitalize`
 * or a `str[0].toUpperCase()`-style helper produces on a hyphenated value). Every dropdown that
 * lists these categories (the Equipment sheet, the Item Creation Wizard, the Character Wizard's
 * Equipment Group filter) should build its options from this map rather than hand-writing labels
 * in each template, so they can't drift out of sync with each other or with the schema's actual
 * choices list above.
 */
export const EQUIPMENT_CATEGORY_LABELS = {
  weapon: "Weapon",
  armor: "Armor",
  shield: "Shield",
  implement: "Implement",
  toolkit: "Toolkit",
  "consumable-kit": "Consumable Kit",
  gear: "Gear"
};

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
      // What this item fundamentally IS — one flat choice rather than a separate "category" +
      // "kind" pair (an earlier pass split these, which just meant picking two overlapping
      // dropdowns to describe one thing). weapon/armor/shield/implement are the modular-eligible
      // categories (matches CHASSIS_LABELS/FITTING_LABELS in item-component.mjs); toolkit and
      // consumable-kit are the two non-modular Kit shapes (part-viii-equipment-and-items.md §
      // Toolkits / § Consumable Kits — a Toolkit never has Uses, a Consumable Kit grants one or
      // more named Equipment Cards each with its own Uses instead); gear is the catch-all for
      // everything else (a consumable, a quest item, anything not covered above).
      category: new fields.StringField({
        initial: "gear",
        choices: ["weapon", "armor", "shield", "implement", "toolkit", "consumable-kit", "gear"]
      }),
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
      // Consumable Kit only (§ Consumable Kits) — e.g. a Recovery Kit's "Stabilize" and "Field
      // Patch" cards. Each card's `usesRemaining` refreshes to `uses` at end of Adventure, same
      // convention as a Function Augment's Uses (item-component.mjs) — see the shared Adventure
      // reset action both now go through.
      equipmentCards: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        effect: new fields.HTMLField({ initial: "" }),
        uses: new fields.NumberField({ integer: true, nullable: true, initial: null }),
        usesRemaining: new fields.NumberField({ integer: true, nullable: true, initial: null })
      })),
      // A modular item (melee weapon/ranged weapon/armor/shield/implement) is the assembled result
      // of a Chassis + Fitting + any installed Augments (part-viii-equipment-and-items.md §
      // Modular Equipment). Toolkits and Consumable Kits stay non-modular — isModular false,
      // chassis/fitting fields unused — per the design's explicit no-migration decision
      // (design/chassis-fitting-augment-system.md). ids reference embedded Items on the SAME actor
      // (module/data/item-component.mjs).
      isModular: new fields.BooleanField({ initial: false }),
      chassisItemId: new fields.StringField({ initial: "" }),
      fittingItemId: new fields.StringField({ initial: "" }),
      // Modular but with no owning Actor yet (a compendium template being authored, not a
      // character's actual gear) — the real Chassis/Fitting/Augment picker needs an Actor's owned
      // Items to choose from and has nothing to offer here, so this is a plain free-text
      // placeholder instead ("Edge Striker T2 / Swift Handling T1 / Whetstone Edge, Rapid Draw")
      // until real compendium-level Component linking exists. Ignored once the item has an Actor
      // and the real chassisItemId/fittingItemId/mounts fields take over.
      modularNotes: new fields.StringField({ initial: "" }),
      // One entry per the Chassis's Mount (by index) — see EssenceChassisData#mounts in
      // item-component.mjs. `linkOn` only means anything for a Linked pair (§ Linked Mounts); it's
      // otherwise ignored.
      mounts: new fields.ArrayField(new fields.SchemaField({
        augmentItemId: new fields.StringField({ initial: "" }),
        linkOn: new fields.BooleanField({ initial: true })
      })),
      quantity: new fields.NumberField({ integer: true, initial: 1, min: 0 }),
      // Permanent per-item exception to the Reach-gating check (see computeReachGate() in
      // utils.mjs and design/reach-and-economy.md — `cost` above, not `tier`, is the actual Reach
      // requirement). part-ii-character-creation.md's Warcamp Raised "Quartermaster's Due" allows
      // +1 over Reach; Constructs' Adaptation "Internal Compartment" allows exactly Reach, i.e. +0.
      // Named by the granting feature (see module/data/item-grants.mjs's ITEM_GRANT_REGISTRY,
      // which auto-detects and sets these two fields when the player fulfills a matching Heritage
      // Legacy/Species Adaptation) — non-empty reachExceptionSource + reachExceptionMargin together
      // mean "check cost > reach + margin instead of cost > reach," rather than suppressing the
      // warning outright (each granting feature caps its own margin, not an unlimited exemption).
      reachExceptionSource: new fields.StringField({ initial: "" }),
      reachExceptionMargin: new fields.NumberField({ integer: true, initial: 0, min: 0 })
    };
  }
}
