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
  weapon: "Melee Weapon",
  ranged: "Ranged Weapon",
  armor: "Armor",
  shield: "Shield",
  implement: "Implement",
  toolkit: "Toolkit",
  "consumable-kit": "Consumable Kit",
  gear: "Gear"
};

/**
 * The five categories that are ALWAYS an assembled Chassis + Fitting (+ Augments), never a flat
 * item with its own hardcoded stats — Melee Weapon, Ranged Weapon (its own assembled category as
 * of 2026-09-14; previously folded into "weapon", see the design doc below), Armor, Shield,
 * Magical Implement. `essence.mjs` force-sets `isModular: true` on create/update for any of these
 * (an equipment Item can't be un-modular-ed by unchecking a box), and `equipment-effects.mjs`
 * routes their Fortitude/Resilience/Movement through the assembled Chassis+Fitting sum
 * (equipment-features.mjs) instead of the item's own flat fields, which only a
 * toolkit/consumable-kit/gear item still uses directly. Single source of truth for every place
 * that used to hand-roll this same five/four-item list (item-sheet.mjs, content-wizard.mjs).
 */
export const MODULAR_EQUIPMENT_CATEGORIES = ["weapon", "ranged", "armor", "shield", "implement"];

/**
 * The subset of EQUIPMENT_CATEGORY_LABELS still authorable as a standalone, pre-fab compendium
 * `equipment` template (via the Item Creation Wizard's "Equipment" type or Bulk Import's
 * "equipment" CSV template) — MODULAR_EQUIPMENT_CATEGORIES is excluded as of the 2026-09-13
 * Chassis/Fitting/Augment catalog import (see design/equipment-catalog-2026-09-13-migration.md):
 * those categories are wholesale modular, authored as Chassis + Fitting (+ Augment) templates
 * instead, one per equipment TYPE_CONFIG entry (chassis/fitting/augment) rather than one flat
 * item. This does NOT remove MODULAR_EQUIPMENT_CATEGORIES from the schema's own `category` choices
 * below — an actual assembled `equipment` Item (isModular: true, chassisItemId/fittingItemId)
 * still needs one of those as what it fundamentally is; only the "author one flat pre-fab item
 * with its own hardcoded Fortitude/Effect/etc." path is retired.
 */
export const FLAT_EQUIPMENT_CATEGORIES = ["toolkit", "consumable-kit", "gear"];

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
      // dropdowns to describe one thing). MODULAR_EQUIPMENT_CATEGORIES (above) are always an
      // assembled Chassis + Fitting; toolkit and consumable-kit are the two non-modular Kit shapes
      // (part-viii-equipment-and-items.md § Toolkits / § Consumable Kits — a Toolkit never has
      // Uses, a Consumable Kit grants one or more named Equipment Cards each with its own Uses
      // instead); gear is the catch-all for everything else (a consumable, a quest item, anything
      // not covered above).
      category: new fields.StringField({
        initial: "gear",
        choices: ["weapon", "ranged", "armor", "shield", "implement", "toolkit", "consumable-kit", "gear"]
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
      // Modular Equipment). Toolkits, Consumable Kits, and Gear stay non-modular — isModular false,
      // chassis/fitting fields unused. essence.mjs force-sets this true on create/update whenever
      // `category` is one of MODULAR_EQUIPMENT_CATEGORIES (above); the field still exists as a real
      // BooleanField rather than being derived, since a TypeDataModel can't reach `category` from
      // inside its own schema definition and the sheet/effects code reads it directly. ids
      // reference embedded Items on the SAME actor, or (for a compendium-authored, actor-less
      // template) a sibling document in the shared `essence-system.equipment` pack — see
      // item-sheet.mjs's #resolveComponentSource() for which source applies.
      isModular: new fields.BooleanField({ initial: false }),
      chassisItemId: new fields.StringField({ initial: "" }),
      fittingItemId: new fields.StringField({ initial: "" }),
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
