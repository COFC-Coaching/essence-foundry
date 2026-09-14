/**
 * Derives the assembled stats/display info for one modular `equipment` Item from its resolved
 * Chassis/Fitting/Augment Items — mirrors module/data/origin-features.mjs's pattern exactly (a
 * pure function over already-resolved sibling Items, called from the sheet's own _prepareContext,
 * NOT baked into EssenceEquipmentData#prepareDerivedData()) because a TypeDataModel can't reach
 * across to sibling Items during its own data preparation — same constraint origin-features.mjs
 * already works around.
 *
 * This function is Chassis/Fitting-only display math (their bonuses have no standalone existence
 * outside an assembled equipment Item, so they can't drive a real transferred Active Effect the
 * way a plain equipment Item's own fields can — see equipment-effects.mjs for that). Composed
 * items' Chassis/Fitting bonuses are therefore still display-only pending a future pass; a plain
 * (non-modular) equipment Item's own Fortitude/Resilience/Movement fields, by contrast, now flow
 * through real Active Effects instead (Phase 4, 2026-09-08 — see build-history).
 */

import { parseSigned } from "../utils.mjs";

/**
 * Resolves a Chassis/Fitting/Augment id to its Item for one actor, checking the actor's own
 * embedded Items first and falling back to the shared `essence-system.equipment` compendium —
 * confirmed live: several pre-existing owned equipment Items (Mage Armor, Sage's Focus, .357
 * Magnum) had chassisItemId/fittingItemId set to a COMPENDIUM document's id with no matching
 * Item actually embedded on the actor (no embedded Chassis/Fitting existed for them at all), so
 * deriveEquipmentStats() resolved nothing and every Effect cell rendered blank. An owned item is
 * still meant to hold its own embedded copies going forward (that's what lets a player track that
 * copy's Augment Uses independently, per item-sheet.mjs's own chassisOptions/fittingOptions,
 * which stay actor-scoped) — this fallback only makes already-stored references that skipped
 * embedding still resolve to *something* displayable instead of silently showing nothing.
 * @param {Actor} actor
 * @returns {Promise<{get: (id: string) => Item|null}>}
 */
export async function buildEquipmentResolver(actor) {
  const pack = game.packs.get("essence-system.equipment");
  const compendiumDocs = pack ? await pack.getDocuments() : [];
  const byCompendiumId = new Map(compendiumDocs.map((d) => [d.id, d]));
  return { get: (id) => actor.items.get(id) ?? byCompendiumId.get(id) ?? null };
}

/**
 * @param {{get: (id: string) => Item|undefined}} items - resolves a Chassis/Fitting/Augment id to
 *   its Item. An owned equipment Item passes its actor's `actor.items` (a Foundry Collection);
 *   an unowned/compendium-authored one has no actor to embed copies into, so the sheet instead
 *   passes a plain `Map` built from `essence-system.equipment` pack documents — either way, this
 *   function only ever needs `.get(id)`, so it doesn't care which.
 * @param {Item} equipmentItem - an `equipment`-type Item with isModular data (chassisItemId,
 *   fittingItemId, mounts)
 * @returns {{
 *   chassis: Item|null, fitting: Item|null,
 *   fortitude: number, resilience: number, movement: number,
 *   grantedCards: Array<{source: string, kind: string, effect: string, uses: number|null, usesRemaining: number|null}>,
 *   combinedEffect: Array<{source: string, kind: string, html: string}>,
 *   mountDisplay: Array<{index: number, linkedWith: number|null, augment: Item|null, linkOn: boolean, partnerAugment: Item|null}>
 * }}
 */
export function deriveEquipmentStats(items, equipmentItem) {
  const sys = equipmentItem.system;
  const chassis = sys.chassisItemId ? (items.get(sys.chassisItemId) ?? null) : null;
  const fitting = sys.fittingItemId ? (items.get(sys.fittingItemId) ?? null) : null;

  const fortitude = parseSigned(chassis?.system.fortitude) + parseSigned(fitting?.system.fortitude);
  const resilience = parseSigned(chassis?.system.resilience) + parseSigned(fitting?.system.resilience);
  const movement = parseSigned(chassis?.system.movement) + parseSigned(fitting?.system.movement);

  // combinedEffect is the assembled item's OWN rules text — what an old flat (pre-modular) item's
  // single `system.effect` field used to hold in one place is now spread across the Chassis, the
  // Fitting, and any always-active Support Augment (a Function Augment's text stays out of this:
  // it's already surfaced below via grantedCards, with its own Uses tracking — repeating it here
  // would just show the same text twice). The same exclusion applies to a Chassis/Fitting whose
  // OWN `effect` field grantsEquipmentCard: true — confirmed live (Sage's Focus/Projection
  // Interface): that field is already the full merged card text (its own variant intro plus the
  // base Equipment Card's stat block, see scripts/component-catalog-data.json), which grantedCards
  // below surfaces on its own, so including it here too rendered the identical block twice in a
  // row. Order mirrors § Assembling an item: Chassis first, then Fitting, then whatever Supports
  // happen to be installed.
  const combinedEffect = [];
  if (chassis?.system.effect && !chassis.system.grantsEquipmentCard) combinedEffect.push({ source: chassis.name, kind: "chassis", html: chassis.system.effect });
  if (fitting?.system.effect && !fitting.system.grantsEquipmentCard) combinedEffect.push({ source: fitting.name, kind: "fitting", html: fitting.system.effect });

  const grantedCards = [];
  if (chassis?.system.grantsEquipmentCard) {
    grantedCards.push({ source: chassis.name, kind: "chassis", effect: chassis.system.effect, uses: null, usesRemaining: null });
  }
  if (fitting?.system.grantsEquipmentCard) {
    grantedCards.push({ source: fitting.name, kind: "fitting", effect: fitting.system.effect, uses: null, usesRemaining: null });
  }

  // Mounts are defined on the Chassis (Mount count/Linked pairing is a Chassis property, § Augment
  // Mounts); which Augment is installed in each Mount, and whether a Linked pair's Link is On, are
  // tracked on the assembled equipment Item itself (sys.mounts), since that's what changes during
  // reconfiguration while the Chassis stays the same.
  const chassisMounts = chassis?.system.mounts ?? [];
  const mountDisplay = chassisMounts.map((mount, index) => {
    const install = sys.mounts?.[index] ?? { augmentItemId: "", linkOn: true };
    const augment = install.augmentItemId ? (items.get(install.augmentItemId) ?? null) : null;
    const linkedWith = mount.linkedWith ?? null;
    const partnerInstall = linkedWith !== null ? (sys.mounts?.[linkedWith] ?? null) : null;
    const partnerAugment = partnerInstall?.augmentItemId ? (items.get(partnerInstall.augmentItemId) ?? null) : null;
    return { index, linkedWith, isLinked: linkedWith !== null, augment, linkOn: install.linkOn ?? true, partnerAugment };
  });

  // § Linked Mounts: when a Linked pair's Link is On, the Support no longer modifies the Chassis
  // and instead modifies its paired Function — so a linked-and-on Support's Equipment Card entry
  // is folded into its Function's entry rather than listed as its own independent effect.
  const seenLinkedOn = new Set();
  for (const m of mountDisplay) {
    if (!m.augment) continue;
    if (m.linkedWith !== null && m.linkOn) {
      if (seenLinkedOn.has(m.index)) continue; // partner already emitted this pair's combined entry
      seenLinkedOn.add(m.linkedWith);
      const fn = m.augment.system.kind === "function" ? m.augment : m.partnerAugment;
      const support = m.augment.system.kind === "support" ? m.augment : m.partnerAugment;
      if (fn) {
        grantedCards.push({
          source: support ? `${fn.name} (linked with ${support.name})` : fn.name,
          kind: "augment",
          effect: fn.system.effect,
          uses: fn.system.uses,
          usesRemaining: fn.system.usesRemaining
        });
      }
      continue;
    }
    // Unlinked (or Link Off): each installed Augment stands on its own. A Function shows as a
    // granted card with its Uses; an unlinked Support "modifies the Chassis directly" per its own
    // printed text — always active while this item is, same as the Chassis/Fitting's own printed
    // text above, so it joins combinedEffect rather than grantedCards (which is Uses-tracked cards
    // only).
    if (m.augment.system.kind === "function") {
      grantedCards.push({
        source: m.augment.name,
        kind: "augment",
        effect: m.augment.system.effect,
        uses: m.augment.system.uses,
        usesRemaining: m.augment.system.usesRemaining
      });
    } else if (m.augment.system.effect) {
      combinedEffect.push({ source: m.augment.name, kind: "augment", html: m.augment.system.effect });
    }
  }

  return { chassis, fitting, fortitude, resilience, movement, grantedCards, combinedEffect, mountDisplay };
}

/**
 * One-line HTML summary of what an `equipment` Item actually does — for list/table rows (the
 * Signature/Armory/Temporary Equipment tables on the actor/NPC sheets) that only have room for a
 * single "Effect" cell, not the full breakdown deriveEquipmentStats() returns. A MODULAR item
 * (weapon/ranged/armor/shield/implement — always modular, see MODULAR_EQUIPMENT_CATEGORIES) has
 * nothing in its OWN effect/passive/special fields — those stay blank now that the real text lives
 * on its Chassis/Fitting/Augments — so reading them directly (the pre-2026-09-14 behavior) always
 * rendered an empty cell for a modular item. This reads combinedEffect instead for those, and
 * falls back to the flat fields (and any Consumable Kit equipmentCards) for a non-modular item.
 * @param {{get: (id: string) => Item|undefined}} items - same resolver deriveEquipmentStats takes.
 * @param {Item} item - an `equipment`-type Item.
 * @returns {string} HTML (may be empty) — render with a triple-stash, not `{{escaped}}`.
 */
export function equipmentEffectSummary(items, item) {
  if (item.system.isModular) {
    const stats = deriveEquipmentStats(items, item);
    const pieces = stats.combinedEffect.map((ce) => `<strong>${ce.source}:</strong> ${ce.html}`);
    const cards = stats.grantedCards.map((g) => `<strong>${g.source}:</strong> ${g.effect}`);
    return [...pieces, ...cards].join(" ");
  }
  const flat = item.system.effect || item.system.passive || item.system.special || "";
  const cards = (item.system.equipmentCards ?? []).map((c) => `<strong>${c.name}:</strong> ${c.effect}`);
  return [flat, ...cards].filter(Boolean).join(" ");
}
