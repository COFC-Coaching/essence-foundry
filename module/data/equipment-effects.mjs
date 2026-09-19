import { parseSigned } from "../utils.mjs";
import { deriveEquipmentStats, buildEquipmentResolver } from "./equipment-features.mjs";

/**
 * Keeps a single "Equipment Bonus" ActiveEffect on an `equipment` Item in sync with the
 * Fortitude/Resilience/Movement/Reach it actually contributes (part-viii-equipment-and-items.md
 * never gave these a mechanical delivery mechanism in code — nothing before this synced them to
 * the actor at all). Uses Foundry's own transferred-effect mechanism (`transfer: true` on an
 * embedded ActiveEffect) per the project's "check Foundry-native first" convention, rather than
 * hand-summing these fields in prepareDerivedData the way the rest of this sheet does — this is
 * the one equipment case where a genuinely native mechanism fits instead of the sheet's usual
 * manual math.
 *
 * Foundry's native transfer has no "transfer only if a sibling field says so" concept, so the
 * effect's `disabled` flag is toggled manually to gate it: only equipment prepared as Inventory
 * Equipment should affect the actor's active stats (see § Bringing More Than Your Inventory
 * Limit — Armory/Temporary gear you own but aren't carrying for the Adventure shouldn't).
 *
 * A plain (non-modular: toolkit/consumable-kit/gear) item's own printed fields are the source.
 * A MODULAR item (weapon/ranged/armor/shield/implement — always modular as of the 2026-09-14
 * pass, see MODULAR_EQUIPMENT_CATEGORIES) has no numbers of its own worth reading: its assembled
 * Chassis + Fitting sum (equipment-features.mjs's deriveEquipmentStats(), the same pure function
 * the sheet already calls for display) is the real source instead — this used to be display-only,
 * which meant a Shell's own +Resilience looked correct on the sheet and did nothing in play.
 * essence.mjs's updateItem/deleteItem hooks re-run this sync whenever the assembled Chassis or
 * Fitting itself changes, not just when this item's own fields do.
 */

const FLAG_SCOPE = "essence-system";
const FLAG_KEY = "equipmentBonus";

function buildChanges(fortitude, resilience, movement, reach) {
  const changes = [];
  // Every target here is an indirect *Bonus accumulator (actor-combatant.mjs), never the matching
  // raw editable field (system.resilience/movement/reach) directly. Those raw fields are plain
  // sheet inputs with submitOnChange:true — a transferred Active Effect that targeted them directly
  // would get its own already-applied result written back as the new "base" on the very next
  // unrelated form submit, then re-applied on top of THAT, silently compounding every time this
  // sheet re-saves. Confirmed live: a single -4 Movement item alone drove a Tier 1 character's
  // Movement from 10 to 2, and a single +2 Resilience item drove another's Resilience to 8.
  if (fortitude) changes.push({ key: "system.fortitudeBonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(fortitude) });
  if (resilience) changes.push({ key: "system.resilienceBonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(resilience) });
  if (movement) changes.push({ key: "system.movementBonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(movement) });
  if (reach) changes.push({ key: "system.reachBonus", mode: CONST.ACTIVE_EFFECT_MODES.ADD, value: String(reach) });
  return changes;
}

function changesEqual(a, b) {
  if (a.length !== b.length) return false;
  return a.every((c, i) => c.key === b[i].key && c.mode === b[i].mode && c.value === b[i].value);
}

/** @param {Item} item - an `equipment`-type Item; no-op for any other type or an unowned Item. */
export async function syncEquipmentEffect(item) {
  if (item.type !== "equipment" || !item.actor) return;

  const sys = item.system;
  let fortitude, resilience, movement;
  if (sys.isModular) {
    const resolver = await buildEquipmentResolver(item.actor);
    const stats = deriveEquipmentStats(resolver, item);
    fortitude = stats.fortitude;
    resilience = stats.resilience;
    movement = stats.movement;
  } else {
    fortitude = parseSigned(sys.fortitude);
    resilience = parseSigned(sys.resilience);
    movement = parseSigned(sys.movement);
  }
  const reach = Number(sys.reachBonus) || 0;
  const changes = buildChanges(fortitude, resilience, movement, reach);
  const disabled = item.system.slot !== "inventory";
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
