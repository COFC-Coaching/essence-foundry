/**
 * Natural weapons granted by a Species Trait (Beastfolk "Natural Armament", Dragonkin "Draconic
 * Armament" — scripts/origin-data.json). The Doc's rule for both: "Choose claws, horns, fangs, a
 * tail, mandibles, or another natural weapon. It otherwise counts as a basic one-handed weapon,
 * does not consume Armory or Inventory capacity, and cannot be disarmed... Its default Range is 1.
 * When choosing the Trait, choose Bludgeoning, Piercing, or Slashing Damage appropriate to its
 * anatomy with the GM. It uses Basic Melee Attack's normal Damage and Surge option and grants no
 * additional equipment properties or Mounts."
 *
 * Shane (2026-10-04): a Trait that gives an attack must show up as its own Item on the sheet, not
 * just as a paragraph on the Biography tab. So the chosen anatomy becomes a `weapon` Equipment
 * Item the character owns: `natural: true` (item-card.mjs) keeps it out of the Chassis + Fitting
 * assembly essence.mjs forces on every other weapon, `slotCost: 0` keeps it out of Inventory and
 * Armory capacity (computeSlotUsage, utils.mjs), and `reachExceptionSource` names the granting
 * Trait — the same "the fulfilling item is the record" convention item-grants.mjs uses, so there
 * is no separate grant bookkeeping. The Character Wizard creates, renames and removes it as the
 * Trait and its anatomy pick change (#onToggleTraitChosen / #onToggleSubChoiceOption), and a
 * one-time ready pass in essence.mjs gives one to any character who already chose the Trait.
 *
 * The four Species Combat Cards (True Breath, Shaper, Ink Cloud, Spore Cloud) are the other
 * "Trait grants a thing you play" shape and are already real Action Card Items granted the same
 * way (SPECIES_CARD_TRAIT_NAMES in character-wizard.mjs); nothing here touches them.
 */

/** Trait name -> the sub-choice label that holds the anatomy pick. */
export const NATURAL_WEAPON_TRAITS = {
  "Natural Armament": { subChoiceLabel: "Natural Weapon" },
  "Draconic Armament": { subChoiceLabel: "Natural Weapon" }
};

/** Damage type the Doc's "appropriate to its anatomy" most plainly suggests; the GM may change it
 *  on the Item (it is only text on the Item, never rolled by code). */
const DEFAULT_DAMAGE = {
  Claws: "Slashing",
  Horns: "Piercing",
  Fangs: "Piercing",
  Tail: "Bludgeoning",
  Mandibles: "Piercing"
};

const BODY_PART = {
  Claws: "the relevant hand or limb",
  Horns: "the head",
  Fangs: "the mouth",
  Tail: "the tail",
  Mandibles: "the mouth"
};

/** The anatomy the player picked for a natural-weapon Trait row, or null if none yet. */
export function naturalWeaponChoice(traitRow) {
  return traitRow?.subChoice?.selected?.[0] ?? null;
}

/**
 * Item data for the natural weapon a Trait grants.
 * @param {string} traitName - a NATURAL_WEAPON_TRAITS key
 * @param {string|null} anatomy - the sub-choice pick ("Claws", ... or "Other (GM-approved)"); null
 *   before the player has picked, which still creates the Item so the attack exists on the sheet
 * @param {string} speciesName - for the flavor line
 */
export function naturalWeaponItemData(traitName, anatomy, speciesName) {
  const other = !anatomy || /^other/i.test(anatomy);
  const name = other ? "Natural Weapon" : anatomy;
  const damage = other ? null : DEFAULT_DAMAGE[anatomy] ?? null;
  const part = other ? "the body part you and the GM agree on" : BODY_PART[anatomy] ?? "the relevant body part";
  const damageLine = damage
    ? `<p><strong>Damage type:</strong> ${damage} (chosen with the GM when the Trait was taken; change it here if you agreed otherwise).</p>`
    : "<p><strong>Damage type:</strong> choose Bludgeoning, Piercing or Slashing with the GM, appropriate to the anatomy.</p>";
  return {
    name,
    type: "equipment",
    img: "icons/svg/pawprint.svg",
    system: {
      category: "weapon",
      slot: "inventory",
      slotCost: 0,
      natural: true,
      isModular: false,
      tier: null,
      type: "Natural weapon",
      range: "1",
      tags: ["natural weapon", "cannot be disarmed", damage ? damage.toLowerCase() : "", "one-handed"].filter(Boolean).join(", "),
      effect: [
        `<p>Counts as a basic one-handed weapon: attack with it through <strong>Basic Melee Attack</strong>, using that card's normal Damage and Surge option. Default Range 1.</p>`,
        damageLine,
        `<p>It uses ${part} instead of needing a free hand; that body part must be available when you attack with it. It cannot be disarmed and takes no Armory or Inventory capacity. It grants no other equipment properties or Mounts unless another rule says so.</p>`
      ].join(""),
      flavor: `<p>${speciesName ? `${speciesName} ` : ""}${traitName}.</p>`,
      reachExceptionSource: traitName,
      reachExceptionMargin: 0
    }
  };
}

/** The natural weapon Item a Trait currently grants on this actor, if any. */
export function ownedNaturalWeapon(actor, traitName) {
  return actor.items.find((i) => i.type === "equipment" && i.system.natural && i.system.reachExceptionSource === traitName) ?? null;
}

/**
 * Make the actor's natural weapon Items agree with the Species Item's chosen Traits: one Item per
 * chosen natural-weapon Trait, named for its anatomy pick; none for an unchosen Trait. Renames in
 * place (keeping any text the GM edited is NOT attempted — the anatomy changed, so the Item's
 * name, tags and effect are rewritten; the GM's Damage type edit is preserved when the anatomy
 * is unchanged because the Item is then left alone).
 * @returns {Promise<{created: string[], removed: string[], renamed: string[]}>}
 */
export async function syncNaturalWeapons(actor, speciesItem) {
  const result = { created: [], removed: [], renamed: [] };
  if (!actor) return result;
  const rows = speciesItem?.system.traits ?? [];
  for (const traitName of Object.keys(NATURAL_WEAPON_TRAITS)) {
    const row = rows.find((r) => r.name === traitName);
    const owned = ownedNaturalWeapon(actor, traitName);
    const wanted = row?.chosen ? naturalWeaponItemData(traitName, naturalWeaponChoice(row), speciesItem?.name) : null;
    if (!wanted && owned) {
      await owned.delete();
      result.removed.push(owned.name);
    } else if (wanted && !owned) {
      await actor.createEmbeddedDocuments("Item", [wanted]);
      result.created.push(wanted.name);
    } else if (wanted && owned && owned.name !== wanted.name) {
      await owned.update({ name: wanted.name, "system.tags": wanted.system.tags, "system.effect": wanted.system.effect });
      result.renamed.push(wanted.name);
    }
  }
  return result;
}
