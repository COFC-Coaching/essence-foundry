const { fields } = foundry.data;

/**
 * Shared schema for Chassis and Fitting — both are "Components" per the rules' own term
 * (part-viii-equipment-and-items.md § Modular Equipment). A completed modular item (melee weapon,
 * ranged weapon, armor, shield, magical implement) is the pairing of one Chassis + one Fitting +
 * any installed Augments; see EssenceEquipmentData in item-card.mjs for the assembled-item side of
 * this relationship (chassisItemId/fittingItemId/mounts).
 *
 * Category names differ per equipment type in the printed rules (Striker/Handling for Melee,
 * Launcher/Payload for Ranged, Shell/Rigging for Armor, Shield/Handling for Shields, Focus/
 * Interface for Magical Implements — see CHASSIS_LABELS/FITTING_LABELS below) but that's flavor
 * text over the same mechanical shape — `category` here is the equipment-type key, not the
 * Chassis/Fitting's in-fiction name (which lives on `item.name`, e.g. "Edge Striker" or "Extended
 * Handling").
 */
class EssenceComponentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new fields.StringField({ initial: "weapon", choices: ["weapon", "ranged", "armor", "shield", "implement"] }),
      // Loose Chassis/Fittings occupy Armory/Signature capacity at half a slot each (§ Armory and
      // Signature Capacity) — same slot vocabulary as EssenceEquipmentData's own `slot` field, so
      // computeSlotUsage (utils.mjs) can read it identically regardless of item type.
      slot: new fields.StringField({ initial: "armory", choices: ["signature", "temporary", "armory"] }),
      tier: new fields.NumberField({ integer: true, initial: 1, min: 1, max: 5 }),
      // Inherent bonuses this Component contributes when assembled. Stored as signed-text
      // ("+2"/"-1") rather than NumberFields to match EssenceEquipmentData's existing
      // fortitude/resilience/movement fields — see equipment-features.mjs for the parse.
      fortitude: new fields.StringField({ initial: "" }),
      resilience: new fields.StringField({ initial: "" }),
      movement: new fields.StringField({ initial: "" }),
      effect: new fields.HTMLField({ initial: "" }),
      passive: new fields.HTMLField({ initial: "" }),
      special: new fields.HTMLField({ initial: "" }),
      grantsEquipmentCard: new fields.BooleanField({ initial: false }), // rarely true, mostly Fittings
      flavor: new fields.HTMLField({ initial: "" })
    };
  }
}

/**
 * The Chassis is the primary body of a modular item — its fundamental category, its Augment
 * Mounts, and what Fittings are compatible with it (§ Chassis). Every Chassis has at least 1
 * Mount (§ Augment Mounts); higher-Tier Chassis may add more, and may pair two into a Linked
 * Mount (`linkedWith` pointing at the partner's index — see § Linked Mounts).
 */
export class EssenceChassisData extends EssenceComponentData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      mounts: new fields.ArrayField(new fields.SchemaField({
        linkedWith: new fields.NumberField({ integer: true, nullable: true, initial: null })
      }), { initial: [{ linkedWith: null }] }),
      // Free text naming which Fitting category this Chassis accepts (e.g. "Handling", "Payload",
      // "Rigging", "Interface") — printed compatibility, not a hard-coded enum (§ Augment
      // Compatibility uses the same "printed on the item, no universal chart" convention).
      compatibleFittingCategory: new fields.StringField({ initial: "" })
    };
  }
}

/**
 * The Fitting determines how the Chassis is configured, worn, handled, or delivered (§ Fittings).
 * Unlike the Chassis it does not normally carry Augment Mounts.
 */
export class EssenceFittingData extends EssenceComponentData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      handedness: new fields.StringField({ initial: "", choices: ["", "one-handed", "two-handed"] }),
      rangeModifier: new fields.StringField({ initial: "" }),
      // § Reconfiguring Equipment — "a Simple Fitting Change costs approximately 1 Action die,
      // while a Structural Fitting Change costs approximately 3... The specific Fitting may state
      // otherwise," so the default lives on the sheet/reconfig action and this field only holds an
      // override when the Fitting's own printed text specifies a different die cost.
      reconfigureCategory: new fields.StringField({ initial: "simple", choices: ["simple", "structural"] }),
      reconfigureCostOverride: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 })
    };
  }
}

/**
 * Augments are exceptional modifications installed into a Chassis Mount (§ Augments). A Function
 * Augment grants an Equipment Action/Reaction with limited Uses; a Support Augment is an
 * always-active modifier with no Uses (§ Function and Support Augments). Augments never consume
 * Armory/Signature capacity (§ Augment Ownership) — computeSlotUsage (utils.mjs) always counts
 * them at 0 regardless of where they're kept.
 */
export class EssenceAugmentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new fields.StringField({ initial: "function", choices: ["function", "support"] }),
      // Free text printed requirement (§ Augment Compatibility) — "Weapon", "Armor", "Any",
      // "Requires ranged equipment", "Requires Tier 3+ Chassis", etc. No universal chart exists.
      compatibility: new fields.StringField({ initial: "Any" }),
      // Function only — Uses refresh at end of Adventure unless stated otherwise (§ Function and
      // Support Augments), the same convention as Consumable Kit Uses.
      uses: new fields.NumberField({ integer: true, nullable: true, initial: null }),
      usesRemaining: new fields.NumberField({ integer: true, nullable: true, initial: null }),
      effect: new fields.HTMLField({ initial: "" }), // Function's granted Action/Reaction, or Support's modifier text
      flavor: new fields.HTMLField({ initial: "" })
    };
  }
}

/**
 * The printed rules use a different in-fiction name for "Chassis" and "Fitting" per equipment
 * category — these aren't cosmetic, they're the actual mechanical terms a player reads on the
 * sheet (part-viii-equipment-and-items.md § Modular Equipment). Sheets should show these labels
 * instead of the generic words "Chassis"/"Fitting" wherever a specific category is known; fall
 * back to the generic word only where no category context exists yet (e.g. before a category is
 * chosen).
 */
export const CHASSIS_LABELS = {
  weapon: "Striker",
  ranged: "Launcher",
  armor: "Shell",
  shield: "Shield",
  implement: "Focus"
};
export const FITTING_LABELS = {
  weapon: "Handling",
  ranged: "Payload",
  armor: "Rigging",
  shield: "Handling",
  implement: "Interface"
};
