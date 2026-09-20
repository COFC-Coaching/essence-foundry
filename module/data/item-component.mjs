import { migrateSource } from "./migration.mjs";
const { fields } = foundry.data;

/**
 * Shared schema for Chassis and Fitting — both are "Components" per the rules' own term
 * (part-viii-equipment-and-items.md § Modular Equipment). A completed modular item (melee weapon,
 * ranged weapon, armor, shield, magical implement) is the pairing of one Chassis + one Fitting +
 * any installed Augments; see EssenceEquipmentData in item-card.mjs for the assembled-item side of
 * this relationship (chassisItemId/fittingItemId/mounts).
 *
 * Category names differ per equipment type in the printed rules (Striker/Grip for Melee,
 * Launcher/Payload for Ranged, Shell/Rigging for Armor, Shield/Grip for Shields, Focus/
 * Interface for Magical Implements — see CHASSIS_LABELS/FITTING_LABELS below) but that's flavor
 * text over the same mechanical shape — `category` here is the equipment-type key, not the
 * Chassis/Fitting's in-fiction name (which lives on `item.name`, e.g. "Edge Striker" or "Extended
 * Grip").
 */
class EssenceComponentData extends foundry.abstract.TypeDataModel {
  /** See module/data/migration.mjs — repairs any value an older version of this system saved that
   *  this schema would now reject, BEFORE Foundry can reject it and leave the document invalid
   *  (and therefore invisible). Inherited by every subtype; `this.schema` resolves to whichever
   *  concrete model is actually loading, so this one implementation covers all of them. */
  static migrateData(source) {
    return migrateSource(this, super.migrateData(source));
  }

  static defineSchema() {
    return {
      category: new fields.StringField({ initial: "weapon", choices: ["weapon", "ranged", "armor", "shield", "implement"] }),
      // Loose Chassis/Fittings occupy Armory/Inventory capacity at half a slot each (§ Armory and
      // Inventory Capacity) — same slot vocabulary as EssenceEquipmentData's own `slot` field, so
      // computeSlotUsage (utils.mjs) can read it identically regardless of item type.
      slot: new fields.StringField({ initial: "armory", choices: ["inventory", "temporary", "armory"] }),
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
      flavor: new fields.HTMLField({ initial: "" }),
      // Minimum-viable model for Source designation (Source A R4/D2, Source B) without pretending
      // this system has a rules engine: when an Action uses this item as its Source, ONLY the
      // Source's own ordinary properties automatically apply. Rather than actually wiring that
      // into card resolution (there is no such engine — see
      // design/equipment-catalog-2026-09-13-migration.md), each entry just names the property this
      // Component changes when its host is the Source (free text: "range", "targeting", "area",
      // "damage type", "forced movement", "resource", "Surges", "Reaction") and the change itself,
      // so a table can look them up beside a card instead of re-reading the whole item sheet. A
      // Function Augment's card is deliberately NEVER offered these (D2 isolation) — that's already
      // expressed by EssenceAugmentData's own `kind === "function"`, not a separate flag here.
      sourceModifiers: new fields.ArrayField(new fields.SchemaField({
        property: new fields.StringField({ initial: "" }),
        change: new fields.StringField({ initial: "" })
      })),
      // See EssenceEquipmentData's identical field (item-card.mjs) for the full rationale — a
      // LOOSE Chassis/Fitting (½-slot, unassembled) carries its own Inventory/Armory allocation
      // exactly like a complete equipment Item does, so it needs the same used-vs-unused tracking.
      // An assembled Chassis/Fitting's usage is reflected on the assembled equipment Item's own
      // flag instead (the equipment Item is what actually gets rolled/used), not duplicated here.
      usedThisAdventure: new fields.BooleanField({ initial: false })
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
      // Free text naming which Fitting category this Chassis accepts (e.g. "Grip", "Payload",
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
      // `blank: true` is required here even though "" is already listed in `choices` — Foundry's
      // StringField rejects an empty string during validation by default whenever `choices` is set
      // (confirmed live: embedding an armor Rigging, whose handedness is "" since armor uses no
      // hand, onto an actor threw "handedness: may not be a blank string" and silently dropped the
      // whole embedded-item creation with no error surfaced to the caller — createEmbeddedDocuments
      // just returned an empty array).
      handedness: new fields.StringField({ initial: "", blank: true, choices: ["", "one-handed", "two-handed"] }),
      rangeModifier: new fields.StringField({ initial: "" }),
      // V6 (design/v6-revision-delta.md §3.1, correcting plan §4.9's V5-shaped reading): Reconfigure
      // is now ONE Basic Action that always burns 3 Action dice, whichever of its choices you pick
      // (ready/stow/recover/hand over/swap a complete item, or exchange this Fitting/an Augment).
      // There is no more "Simple = 1 die / Structural = 3 dice" cost tier — `reconfigureCategory`'s
      // VALUES are unchanged ("simple"/"structural") but its MEANING changed: it now says whether
      // this Fitting can be exchanged mid-Combat ("simple" = combat-replaceable) or only outside
      // Combat ("structural" = out-of-combat only), same distinction the old V5 tiering was already
      // gesturing at with its "structural" name, just no longer tied to cost. See
      // #onReconfigureFittingCost (item-sheet.mjs) for the flat-3 cost and the soft in-Combat warning
      // this now drives instead of a cost lookup.
      reconfigureCategory: new fields.StringField({ initial: "simple", choices: ["simple", "structural"] }),
      reconfigureCostOverride: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 })
    };
  }
}

/**
 * Augments are exceptional modifications installed into a Chassis Mount (§ Augments). A Function
 * Augment grants an Equipment Action/Reaction with limited Uses; a Support Augment is an
 * always-active modifier with no Uses (§ Function and Support Augments). Augments never consume
 * Armory/Inventory capacity (§ Augment Ownership) — computeSlotUsage (utils.mjs) always counts
 * them at 0 regardless of where they're kept.
 */
export class EssenceAugmentData extends foundry.abstract.TypeDataModel {
  /** See module/data/migration.mjs — repairs any value an older version of this system saved that
   *  this schema would now reject, BEFORE Foundry can reject it and leave the document invalid
   *  (and therefore invisible). Inherited by every subtype; `this.schema` resolves to whichever
   *  concrete model is actually loading, so this one implementation covers all of them. */
  static migrateData(source) {
    return migrateSource(this, super.migrateData(source));
  }

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
      flavor: new fields.HTMLField({ initial: "" }),
      // Support only (see EssenceComponentData's identical field above for the full rationale) — a
      // Function Augment's card is isolated from Source modifiers entirely (D2), which `kind ===
      // "function"` already expresses, so this is meaningful only when `kind === "support"`.
      sourceModifiers: new fields.ArrayField(new fields.SchemaField({
        property: new fields.StringField({ initial: "" }),
        change: new fields.StringField({ initial: "" })
      }))
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
  shield: "Guard",
  implement: "Focus"
};
export const FITTING_LABELS = {
  weapon: "Grip",
  ranged: "Payload",
  armor: "Rigging",
  shield: "Grip",
  implement: "Interface"
};
