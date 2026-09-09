/**
 * Heritage Legacies and Species Adaptations that let a character choose a specific Equipment item
 * as a standing benefit (part-ii-character-creation.md's Warcamp Raised "Quartermaster's Due";
 * Constructs' "Internal Compartment"/"Integrated Tool"; Craftfolk's "Inherited Tools") — as opposed
 * to Reach Triggers (see actor-combatant.mjs), which grant a temporary Scene/Adventure-scoped
 * boost rather than a persistent item choice. Generic and data-driven (one registry entry per
 * named feature) rather than one bespoke button per feature, per the design discussion in
 * build-history — a future rulebook feature of the same shape (choose one item meeting a Reach/
 * type constraint) only needs a new registry entry here, not new code.
 *
 * Deliberately keyed by the Legacy/Adaptation's own name rather than a separate "grant id" field
 * on Heritage/Species — those names are already the display text players see, and matching against
 * them (rather than introducing a parallel identifier) means a Heritage/Species document doesn't
 * need any awareness that a grant exists at all.
 *
 * `matchers`: an item qualifies if it satisfies ANY one matcher's `category`. Equipment's
 * `category` is now the one flat field for "what this item is" (weapon/armor/shield/implement/
 * toolkit/consumable-kit/gear — see item-card.mjs), so a grant just lists which categories
 * qualify; an empty matcher `{}` means "any category."
 * `reachMargin`: added to the actor's effectiveReach when picking (0 for "does not exceed Reach").
 * `exactCost`: when set, only items whose Reach cost equals this value qualify (Internal
 * Compartment's "a cost of 1"); reachMargin is ignored in that case.
 * `countsAgainstLimit`: whether the granted item still spends a Signature Equipment slot — false
 * sets the granted item's `system.slotCost` to 0 so computeSlotUsage() doesn't charge for it.
 */
export const ITEM_GRANT_REGISTRY = {
  // "Main-Hand, Off-Hand, or Armor item" (part-ii-character-creation.md) — a worn/wielded item,
  // not a Toolkit or Consumable Kit.
  "Quartermaster's Due": {
    matchers: [{ category: "weapon" }, { category: "armor" }, { category: "shield" }, { category: "implement" }],
    reachMargin: 1,
    exactCost: null,
    countsAgainstLimit: true
  },
  // "Choose one small Other Equipment item" — any category except the two Kit shapes (a Toolkit
  // or Consumable Kit isn't "a small item," it's a whole maintained collection).
  "Internal Compartment": {
    matchers: [{ category: "weapon" }, { category: "armor" }, { category: "shield" }, { category: "implement" }, { category: "gear" }],
    reachMargin: 0,
    exactCost: 1,
    countsAgainstLimit: false
  },
  "Integrated Tool": {
    matchers: [{ category: "toolkit" }],
    reachMargin: 0,
    exactCost: null,
    countsAgainstLimit: false
  },
  "Inherited Tools": {
    matchers: [{ category: "toolkit" }],
    reachMargin: 0,
    exactCost: null,
    countsAgainstLimit: false
  }
};

/** Whether an Equipment Item's `system` data satisfies one of a grant's matchers. */
export function equipmentMatchesGrant(system, grant) {
  return grant.matchers.some((m) => !m.category || system.category === m.category);
}

/** Whether an Equipment Item's Reach cost qualifies for a grant, given the actor's effectiveReach. */
export function reachQualifiesForGrant(system, grant, effectiveReach) {
  const raw = (system.cost ?? "").trim();
  const cost = raw === "" ? null : Number(raw);
  if (grant.exactCost != null) return cost === grant.exactCost;
  if (cost == null || Number.isNaN(cost)) return true;
  return cost <= effectiveReach + grant.reachMargin;
}

/**
 * Which of the actor's Heritage Legacy / chosen Species Adaptations name a feature in the
 * registry — one row per matching name, each carrying its own registry config plus whichever
 * already-owned Equipment item (if any) currently fulfills it (matched by `reachExceptionSource`,
 * the same field the Reach-gating exception already uses — see computeReachGate() in utils.mjs).
 * No separate persisted "grant" record on the actor: the fulfilling item, if chosen, already is
 * the record.
 */
export function deriveActiveGrants({ speciesItem, heritageItem }, ownedEquipment) {
  const names = [];
  if (heritageItem?.system.legacy?.name) names.push(heritageItem.system.legacy.name);
  for (const a of speciesItem?.system.adaptations ?? []) {
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
