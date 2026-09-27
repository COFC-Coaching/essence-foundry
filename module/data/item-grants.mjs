import { componentTiers } from "../utils.mjs";

/**
 * Heritage Legacies and Species Traits that let a character choose a specific Equipment item
 * as a standing benefit (part-ii-character-creation.md's Warcamp Raised "Quartermaster's Due";
 * Constructs' "Internal Compartment"/"Integrated Tool"; Craftfolk's "Inherited Tools") — as opposed
 * to Reach Triggers (see actor-combatant.mjs), which grant a temporary Encounter/Adventure-scoped
 * boost rather than a persistent item choice. Generic and data-driven (one registry entry per
 * named feature) rather than one bespoke button per feature, per the design discussion in
 * build-history — a future rulebook feature of the same shape (choose one item meeting a Reach/
 * type constraint) only needs a new registry entry here, not new code.
 *
 * Deliberately keyed by the Legacy/Trait's own name rather than a separate "grant id" field
 * on Heritage/Species — those names are already the display text players see, and matching against
 * them (rather than introducing a parallel identifier) means a Heritage/Species document doesn't
 * need any awareness that a grant exists at all.
 *
 * `matchers`: an item qualifies if it satisfies ANY one matcher's `category`. Equipment's
 * `category` is the one flat field for "what this item is" (weapon/ranged/armor/shield/implement/
 * toolkit/consumable-kit/gear — see item-card.mjs); an empty matcher `{}` means "any category."
 * `tierMargin`: how many Tiers above Team Tier each of the item's Components may be (see
 * componentTiers/computeTierGate in utils.mjs). `null` means the feature sets no access limit.
 * Pre-v0.6 these were Reach-based (`reachMargin`/`exactCost` against an item's Reach cost); v0.6
 * moves ordinary access to Team Tier (Doc L1793).
 * `countsAgainstLimit`: false sets the granted item's `system.slotCost` to 0, so it uses no Armory
 * or Inventory capacity (computeSlotUsage counts slotCost for both).
 */
export const ITEM_GRANT_REGISTRY = {
  // Warcamp Raised (Doc L5470, L1829): "one Chassis and one compatible Fitting, each up to 1 Tier
  // above the Team's normal procurement Tier, to a maximum of Tier 5... The assembled item occupies
  // Armory and Inventory capacity normally." The player chooses the assembled item.
  "Quartermaster's Due": {
    matchers: [{ category: "weapon" }, { category: "ranged" }, { category: "armor" }, { category: "shield" }, { category: "implement" }],
    tierMargin: 1,
    countsAgainstLimit: true
  },
  // Constructs (L5405): "one small item of ordinary utility equipment within the Team's ordinary
  // access... does not consume Armory or Inventory capacity". Utility, so not weapons or armor.
  "Internal Compartment": {
    matchers: [{ category: "gear" }, { category: "toolkit" }, { category: "consumable-kit" }],
    tierMargin: 0,
    countsAgainstLimit: false
  },
  // Constructs (L5402): "one ordinary Non-Combat Toolkit... does not consume Armory or Inventory
  // capacity".
  "Integrated Tool": {
    matchers: [{ category: "toolkit" }],
    tierMargin: null,
    countsAgainstLimit: false
  },
  // Artisan Household (L5508): "one ordinary Toolkit... does not consume Armory capacity and may be
  // included in your Inventory without consuming Inventory capacity".
  "Inherited Tools": {
    matchers: [{ category: "toolkit" }],
    tierMargin: null,
    countsAgainstLimit: false
  }
};

/** Whether an Equipment Item's `system` data satisfies one of a grant's matchers. */
export function equipmentMatchesGrant(system, grant) {
  return grant.matchers.some((m) => !m.category || system.category === m.category);
}

/**
 * Whether an item's Components are within a grant's access limit: each at most Team Tier +
 * `tierMargin`, and never above Tier 5 (Quartermaster's Due: "to a maximum of Tier 5").
 * @param {Item} item
 * @param {object} grant - an ITEM_GRANT_REGISTRY entry
 * @param {number} teamTier - teamTierFor(actor)
 * @param {Iterable<Item>} items - the owning actor's items, to resolve a modular item's parts
 */
export function tierQualifiesForGrant(item, grant, teamTier, items) {
  if (grant.tierMargin == null) return true;
  const limit = Math.min(5, (teamTier ?? 1) + grant.tierMargin);
  return componentTiers(item, items).every((t) => t <= limit);
}

/**
 * Which of the actor's Heritage Legacy / chosen Species Traits name a feature in the
 * registry — one row per matching name, each carrying its own registry config plus whichever
 * already-owned Equipment item (if any) currently fulfills it (matched by `reachExceptionSource`,
 * the same field the Team Tier access exception uses — see computeTierGate() in utils.mjs).
 * No separate persisted "grant" record on the actor: the fulfilling item, if chosen, already is
 * the record.
 */
export function deriveActiveGrants({ speciesItem, heritageItem }, ownedEquipment) {
  const names = [];
  if (heritageItem?.system.legacy?.name) names.push(heritageItem.system.legacy.name);
  for (const a of speciesItem?.system.traits ?? []) {
    if (a.chosen) names.push(a.name);
  }
  return names
    .filter((name) => ITEM_GRANT_REGISTRY[name])
    .map((name) => ({
      sourceName: name,
      ...ITEM_GRANT_REGISTRY[name],
      grantedItem: ownedEquipment.find((i) => i.system.reachExceptionSource === name) ?? null
    }));
}
