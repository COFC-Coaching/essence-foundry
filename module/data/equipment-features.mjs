/**
 * Derives the assembled stats/display info for one modular `equipment` Item from its resolved
 * Chassis/Fitting/Augment embedded Items — mirrors module/data/origin-features.mjs's pattern
 * exactly (a pure function over already-resolved sibling Items, called from the sheet's own
 * _prepareContext, NOT baked into EssenceEquipmentData#prepareDerivedData()) because a
 * TypeDataModel can't reach across to sibling embedded Items on the same Actor during its own
 * data preparation — same constraint origin-features.mjs already works around.
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
 * @param {Actor} actor - the owning actor (embedded Items are resolved via actor.items.get)
 * @param {Item} equipmentItem - an `equipment`-type Item with isModular data (chassisItemId,
 *   fittingItemId, mounts)
 * @returns {{
 *   chassis: Item|null, fitting: Item|null,
 *   fortitude: number, resilience: number, movement: number,
 *   grantedCards: Array<{source: string, kind: string, effect: string, uses: number|null, usesRemaining: number|null}>,
 *   mountDisplay: Array<{index: number, linkedWith: number|null, augment: Item|null, linkOn: boolean, partnerAugment: Item|null}>
 * }}
 */
export function deriveEquipmentStats(actor, equipmentItem) {
  const sys = equipmentItem.system;
  const chassis = sys.chassisItemId ? (actor.items.get(sys.chassisItemId) ?? null) : null;
  const fitting = sys.fittingItemId ? (actor.items.get(sys.fittingItemId) ?? null) : null;

  const fortitude = parseSigned(chassis?.system.fortitude) + parseSigned(fitting?.system.fortitude);
  const resilience = parseSigned(chassis?.system.resilience) + parseSigned(fitting?.system.resilience);
  const movement = parseSigned(chassis?.system.movement) + parseSigned(fitting?.system.movement);

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
    const augment = install.augmentItemId ? (actor.items.get(install.augmentItemId) ?? null) : null;
    const linkedWith = mount.linkedWith ?? null;
    const partnerInstall = linkedWith !== null ? (sys.mounts?.[linkedWith] ?? null) : null;
    const partnerAugment = partnerInstall?.augmentItemId ? (actor.items.get(partnerInstall.augmentItemId) ?? null) : null;
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
    // printed text rather than granting a card, so it's surfaced on mountDisplay only.
    if (m.augment.system.kind === "function") {
      grantedCards.push({
        source: m.augment.name,
        kind: "augment",
        effect: m.augment.system.effect,
        uses: m.augment.system.uses,
        usesRemaining: m.augment.system.usesRemaining
      });
    }
  }

  return { chassis, fitting, fortitude, resilience, movement, grantedCards, mountDisplay };
}
