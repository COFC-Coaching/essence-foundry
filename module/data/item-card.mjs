import { migrateSource } from "./migration.mjs";
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
  /** See module/data/migration.mjs — repairs any value an older version of this system saved that
   *  this schema would now reject, BEFORE Foundry can reject it and leave the document invalid
   *  (and therefore invisible). Inherited by every subtype; `this.schema` resolves to whichever
   *  concrete model is actually loading, so this one implementation covers all of them. */
  static migrateData(source) {
    return migrateSource(this, super.migrateData(source));
  }

  static defineSchema() {
    return {
      domain: new fields.StringField({ initial: "physical", choices: ["physical", "mental", "spiritual"] }),
      rank: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      style: new fields.StringField({ initial: "" }),
      subtype: new fields.StringField({ initial: "" }),
      attr: new fields.StringField({ initial: "" }),        // attribute used for the roll pool
      skill: new fields.StringField({ initial: "" }),       // combat style used for the roll pool
      defense: new fields.StringField({ initial: "" }),     // opposing defense: Fortitude/Composure/Harmony
      // V6 §5.2.3 (plan): an Unopposed card has no opposing Defense by its own nature — it
      // auto-succeeds, no die is reserved as the Success Die, and every rolled 6+ grants a Surge
      // (see essence-roll.mjs's resolveCombatRoll). Distinct from simply leaving `defense` blank on
      // a normal card (which just means "roll open, GM adjudicates" — see rollEssencePool's
      // `openRoll`), so this is its own explicit field rather than inferred from an empty `defense`.
      unopposed: new fields.BooleanField({ initial: false }),
      min: new fields.StringField({ initial: "" }),         // minimum dice for success (can be numeric or text)
      // design/v6-revision-delta.md §2.5: a card with a PRINTED roll limit uses that limit verbatim
      // instead of Attribute + Combat Style Rank (with the Basic/Rank-0 floor of 2 only applying
      // when there's no printed limit). Null means "no printed limit — derive from Attribute +
      // Style Rank as usual." Also needed by the enemy Roll Limit rule (§2.6), which the same field
      // shape serves for adversary profiles.
      rollLimit: new fields.NumberField({ integer: true, nullable: true, initial: null, min: 0 }),
      // V6 §6.7 (plan): a Species Trait's unique unranked Combat Card does NOT count against the
      // 10 learned-card selection budget. Explicit flag rather than overloading `style` (empty),
      // since Species cards DO have thematic Style ties per the plan's own guidance — see
      // character-wizard.mjs's card-count filtering.
      speciesGranted: new fields.BooleanField({ initial: false }),
      // Perform Task (design/v6-revision-delta.md §3.3): the first Basic Card whose own roll runs
      // through the NON-COMBAT roll path (full Attribute + Non-Combat Skill, or Attribute + 5 for a
      // Key Aspect) instead of the ordinary Combat Card roll. Flags the card so the sheet routes it
      // to the non-combat roll prompt (see actor-sheet.mjs's #onRollItem) rather than treating its
      // `attr`/`skill`/`defense` fields as a normal combat pool.
      nonCombatTask: new fields.BooleanField({ initial: false }),
      // A card whose printed text says it generates no Surges (e.g. Stabilize: "This Action does
      // not heal a Wound and has no Surges") without otherwise changing its roll path — reuses
      // rollEssencePool's `nonCombat` suppression flag (see #onRollItem) rather than adding a
      // second suppression mechanism.
      noSurges: new fields.BooleanField({ initial: false }),
      // V6 §6.8 (plan): cooldowns / once-per-Encounter tracking for PLAYER Combat Cards, mirroring
      // the shape the adversary `abilities` array already uses (actor-adversary.mjs: frequency +
      // usesRemaining/usedThisRound). A card is "available unless printed otherwise"; a cooldown
      // starts when the card is PLAYED (even on a failed/interrupted use), and belongs to the
      // TECHNIQUE — a second printed copy of the same card doesn't bypass it (see utils.mjs's
      // applyCardCooldown, which marks every owned Item of the same name together). "perRound"
      // resets at the start of the owning actor's own next Turn (combat.mjs's _onStartTurn,
      // alongside the identical adversary-ability reset); "perEncounter" resets ONLY via the
      // explicit GM "New Encounter" action (utils.mjs's resetEncounterCooldowns) — starting a new
      // Combat inside the same Encounter does NOT reset it (V6: "Combat beginning inside an
      // existing Encounter does not restart the Encounter").
      cooldownFrequency: new fields.StringField({ initial: "none", choices: ["none", "perRound", "perEncounter"] }),
      cooldownUsed: new fields.BooleanField({ initial: false }),
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
  /** See module/data/migration.mjs — repairs any value an older version of this system saved that
   *  this schema would now reject, BEFORE Foundry can reject it and leave the document invalid
   *  (and therefore invisible). Inherited by every subtype; `this.schema` resolves to whichever
   *  concrete model is actually loading, so this one implementation covers all of them. */
  static migrateData(source) {
    return migrateSource(this, super.migrateData(source));
  }

  static defineSchema() {
    return {
      // V6 (plan §6.5, design/v6-revision-delta.md §2.8/§6): "Ordinary Conditions are temporary
      // tactical states. Wound Conditions are tied to Core Wounds. Specialty Conditions are
      // protected states belonging to Combat Style mechanics." "ordinary" = one of the 8 printed
      // baseline Conditions (Blinded/Burning/Dazed/Immobilized/Prone/Restrained/Silenced/Weakened);
      // "specialty" = one of the 9 named Combat Style states (Stance/Lock/Unstable/Exposed/
      // Concentration/Strain/Rallied/Possessed/Broken); "wound"/"consequence"/"cover" = the
      // Wound Card/Influence Consequence Card/Cover Condition subsystems (scripts/build-packs.mjs);
      // "other" = every additional Condition this system keeps beyond V6's 8-item baseline (V6:
      // "deliberately restrictive rather than exhaustive" — kept and reclassified, not deleted).
      // Purely informational (a sheet/compendium label) — nothing currently branches on it.
      classification: new fields.StringField({
        initial: "other",
        choices: ["ordinary", "specialty", "wound", "consequence", "cover", "other"]
      }),
      sections: new fields.ArrayField(new fields.SchemaField({
        label: new fields.StringField({ initial: "" }),
        html: new fields.HTMLField({ initial: "" })
      }))
    };
  }
}

/** Mirrors EquipmentItem in equipment-model.ts (subset most relevant to Foundry play). */
export class EssenceEquipmentData extends foundry.abstract.TypeDataModel {
  /** See module/data/migration.mjs — repairs any value an older version of this system saved that
   *  this schema would now reject, BEFORE Foundry can reject it and leave the document invalid
   *  (and therefore invisible). Inherited by every subtype; `this.schema` resolves to whichever
   *  concrete model is actually loading, so this one implementation covers all of them. */
  static migrateData(source) {
    return migrateSource(this, super.migrateData(source));
  }

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
      slot: new fields.StringField({ initial: "armory", choices: ["inventory", "temporary", "armory"] }),
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
      // +1 over Reach; Constructs' Trait "Internal Compartment" allows exactly Reach, i.e. +0.
      // Named by the granting feature (see module/data/item-grants.mjs's ITEM_GRANT_REGISTRY,
      // which auto-detects and sets these two fields when the player fulfills a matching Heritage
      // Legacy/Species Trait) — non-empty reachExceptionSource + reachExceptionMargin together
      // mean "check cost > reach + margin instead of cost > reach," rather than suppressing the
      // warning outright (each granting feature caps its own margin, not an unlimited exemption).
      reachExceptionSource: new fields.StringField({ initial: "" }),
      reachExceptionMargin: new fields.NumberField({ integer: true, initial: 0, min: 0 }),
      // V6 "used vs unused preparation commitment" (part-viii-equipment-and-items.md, plan §5.7,
      // design/v6-revision-delta.md §3.5) — the central new equipment rule: an UNUSED prepared
      // item's Inventory/Armory allocation may transfer to an equal-capacity replacement once
      // Armory access is regained; a USED item's allocation stays committed for the rest of the
      // Adventure "even if stored, lent, depleted, lost, or replaced." Set true by any meaningful
      // use (an Equipment Card roll — see #onRollEquipmentCard in actor-sheet.mjs/npc-sheet.mjs —
      // or a manual toggle for uses the code can't detect, e.g. worn-and-hit or used as a Card's
      // Source), never by merely being prepared. Cleared for everyone by resetAdventureUses()
      // (utils.mjs) at the "start a new Adventure" boundary. This system has no automated
      // Armory-access-swap enforcement (see computeSlotUsage's own doc comment) — this flag is
      // surfaced as a visible badge on the sheet so the GM/player can honor the rule by hand,
      // consistent with this project's established warn/inform-don't-over-automate convention.
      // Lives on the Item itself, not on any actor-scoped state, so lending (§3.5's "it remains
      // attached to Rook's preparation" example) already keys off the true owner's allocation by
      // construction — an embedded Item stays owned by whoever's Actor document holds it,
      // regardless of who's currently using it in the fiction.
      usedThisAdventure: new fields.BooleanField({ initial: false })
    };
  }
}
