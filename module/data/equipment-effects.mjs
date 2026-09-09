import { parseSigned } from "../utils.mjs";

/**
 * Keeps a single "Equipment Bonus" ActiveEffect on an `equipment` Item in sync with its own
 * Fortitude/Resilience/Movement/Reach fields (part-viii-equipment-and-items.md never gave these a
 * mechanical delivery mechanism in code — nothing before this synced them to the actor at all).
 * Uses Foundry's own transferred-effect mechanism (`transfer: true` on an embedded ActiveEffect)
 * per the project's "check Foundry-native first" convention, rather than hand-summing these fields
 * in prepareDerivedData the way the rest of this sheet does — this is the one equipment case where
 * a genuinely native mechanism fits instead of the sheet's usual manual math.
 *
 * Foundry's native transfer has no "transfer only if a sibling field says so" concept, so the
 * effect's `disabled` flag is toggled manually to gate it: only equipment prepared as Signature
 * Equipment should affect the actor's active stats (see § Bringing More Than Your Signature
 * Limit — Armory/Temporary gear you own but aren't carrying for the Adventure shouldn't).
 *
 * Not a general-purpose Active Effects migration — Chassis/Fitting bonuses on assembled modular
 * items stay display-only via equipment-features.mjs, since a Chassis/Fitting has no standalone
 * existence as an actor-owned Item the way a plain equipment Item does; Foundry's transfer
 * mechanism has nothing to attach to for "an Item referenced by another Item." Only a plain
 * (non-modular) equipment Item's own printed fields are covered here.
 */

const FLAG_SCOPE = "essence-system";
const FLAG_KEY = "equipmentBonus";

function buildChanges(system) {
  const changes = [];
  const fortitude = parseSigned(system.fortitude);
  const resilience = parseSigned(system.resilience);
  const movement = parseSigned(system.movement);
  const reach = Number(system.reachBonus) || 0;
  if (fortitude) changes.push({ key: "system.fortitudeBonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(fortitude) });
  if (resilience) changes.push({ key: "system.resilience", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(resilience) });
  if (movement) changes.push({ key: "system.movement", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(movement) });
  if (reach) changes.push({ key: "system.reach", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(reach) });
  return changes;
}

function changesEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((c, i) => c.key === b[i].key && c.mode === b[i].mode && c.value === b[i].value);
}

/** @param {Item} item - an `equipment`-type Item; no-op for any other type or an unowned Item. */
export async function syncEquipmentEffect(item) {
  if (item.type !== "equipment" || !item.actor) return;

  const changes = buildChanges(item.system);
  const disabled = item.system.slot !== "signature";
  const existing = item.effects.find((e) => e.getFlag(FLAG_SCOPE, FLAG_KEY));

  if (!changes.length) {
    if (existing) await existing.delete();
    return;
  }

  if (existing) {
    if (existing.disabled !== disabled || !changesEqual(existing.changes, changes)) {
      await existing.update({ changes, disabled });
    }
    return;
  }

  await item.createEmbeddedDocuments("ActiveEffect", [{
    name: "Equipment Bonus",
    img: item.img,
    changes,
    disabled,
    transfer: true,
    flags: { [FLAG_SCOPE]: { [FLAG_KEY]: true } }
  }]);
}
