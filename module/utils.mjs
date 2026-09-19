/** "might" -> "Might". Attribute/skill keys are stored lowercase; every player-facing label built from one needs this. */
export function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

/**
 * "Tier 3 Elite — Controller (Leader)" — the enemy-identity header format from Things To Work
 * On/Enemies and NPC's.txt (see its "Example headers" list). Shared between the NPC sheet header
 * and the Monster Wizard's Concept step so both read the same three-tag identity (Tier/Grade,
 * battlefieldRole, eliteType) the same way. Falls back gracefully as fields are left blank —
 * a brand-new NPC with nothing set yet just shows "Tier 1".
 */
export function buildEnemyHeaderLabel(system) {
  const parts = [`Tier ${system.tier ?? 1}`];
  if (system.grade) parts.push(system.grade);
  let label = parts.join(" ");
  if (system.battlefieldRole) label += ` — ${system.battlefieldRole}`;
  if (system.grade === "Elite" && system.eliteType) label += ` (${system.eliteType})`;
  return label;
}

/**
 * A title font-size (px) that shrinks as `text` gets longer, so a long item name doesn't overlap
 * a fixed-width sibling button next to it (e.g. a Card's name field next to its Edit/View toggle)
 * instead of just clipping or overflowing at a fixed size. Purely length-based — cheap and good
 * enough for a name field, not a substitute for actually measuring rendered text width.
 */
export function fitTitleSize(text, { max = 24, min = 14, startAt = 10, rate = 0.7 } = {}) {
  const len = (text || "").length;
  if (len <= startAt) return max;
  return Math.max(min, Math.round(max - (len - startAt) * rate));
}

/** Several item types (Equipment, Chassis, Fitting) store their Fortitude/Resilience/Movement
 *  bonuses as signed text ("+2", "-1", "") rather than NumberFields, matching how the printed
 *  rules present them — shared here so equipment-features.mjs's display math and
 *  equipment-effects.mjs's Active Effect sync parse them identically. */
export function parseSigned(str) {
  const n = parseInt(str, 10);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Lists every currently-worn (Inventory slot) Equipment item contributing a nonzero Fortitude/
 * Resilience/Movement/Reach modifier — the same fields equipment-effects.mjs turns into a
 * transferred Active Effect on *Bonus accumulator fields, surfaced here so a player/GM can actually
 * see what's granting a bonus instead of just a mystery final number (see the sheet's "effective"
 * notes next to Movement/Resilience/Reach). Only Inventory items are listed since only those are
 * actually active (equipment-effects.mjs disables the transferred effect for anything else).
 * @param {object|null} deriveModularStats - `(item) => {fortitude, resilience, movement}` for a
 *   MODULAR item (weapon/ranged/armor/shield/implement — always modular, see
 *   MODULAR_EQUIPMENT_CATEGORIES in item-card.mjs), whose own flat fields are blank; the real
 *   numbers come from its assembled Chassis+Fitting instead (equipment-features.mjs's
 *   deriveEquipmentStats, same function equipment-effects.mjs's sync now uses). Passed in rather
 *   than imported directly to avoid a utils.mjs <-> equipment-features.mjs import cycle (that file
 *   already imports parseSigned from here). Omit for a caller that never has modular items handy;
 *   a modular item then just shows as contributing nothing, same as before this parameter existed.
 */
export function computeEquipmentBonusSources(items, deriveModularStats = null) {
  return items
    .filter((i) => i.type === "equipment" && i.system.slot === "inventory")
    .map((i) => {
      const { fortitude, resilience, movement } = i.system.isModular && deriveModularStats
        ? deriveModularStats(i)
        : { fortitude: parseSigned(i.system.fortitude), resilience: parseSigned(i.system.resilience), movement: parseSigned(i.system.movement) };
      return { name: i.name, fortitude, resilience, movement, reach: Number(i.system.reachBonus) || 0 };
    })
    .filter((b) => b.fortitude || b.resilience || b.movement || b.reach);
}

/** A card's Domain determines which resource pool its Cost is paid from — see the Domain/
 *  Resource/Defense grouping used throughout the sheet (actor-sheet.mjs's DOMAINS constant). */
const DOMAIN_RESOURCE = { physical: "Stamina", mental: "Focus", spiritual: "Mana" };
export function domainResource(domain) {
  return DOMAIN_RESOURCE[domain] ?? "";
}

/**
 * V6 REVISED TEXT (Combat Encounters -> Damage -> "Resistance and Vulnerability - Playtest
 * Values"; see design/v6-revision-delta.md §2.1 — 0.6.97 correction of the 0.6.85 build):
 * "Resistance and Vulnerability apply to named Damage types, such as Fire or Psychic. They do NOT
 * apply to an entire Physical, Mental, or Spiritual domain or to a Combat Style... Multiple
 * sources of Resistance to the same type do not increase this reduction... If Resistance and
 * Vulnerability both apply to the same Damage type, they CANCEL for that event: neither changes
 * the Damage." Appendix C's quick table: "Does not stack; cancels matching Vulnerability...
 * Domains and Combat Styles do not qualify as types."
 *
 * This REVERSES the previous (0.6.85) reading, which had Resistance and Vulnerability of the same
 * type both apply in sequence, and matched them against a Physical/Mental/Spiritual DOMAIN instead
 * of a named Damage type. Do not revert this without checking the delta report first — the old
 * reading was built against a since-superseded rulebook draft, not a design choice.
 *
 * Non-stacking (multiple Resistance sources of the same type only reduce once) was already correct
 * here by construction — `.some()` below collapses N matching sources to a single application —
 * and is confirmed, not changed, by this revision.
 * @param {Actor} actor
 * @param {string} damageType - a named Damage type (Fire, Psychic, Bludgeoning, etc.), NOT a
 *   Physical/Mental/Spiritual domain — see the Apply Damage dialog's separate Damage Type field.
 * @param {number} amount - raw incoming Damage before Resistance/Vulnerability
 * @returns {{amount: number, log: string[]}} the adjusted amount (min 0) and any log lines to show
 */
export function applyResistanceVulnerability(actor, damageType, amount) {
  const resistances = actor.system.resistances ?? [];
  const vulnerabilities = actor.system.vulnerabilities ?? [];
  const hasResistance = resistances.some((r) => r.damageType === damageType);
  const hasVulnerability = vulnerabilities.some((v) => v.damageType === damageType);
  const log = [];

  if (hasResistance && hasVulnerability) {
    log.push(`Resistance and Vulnerability (${damageType}) cancel — Damage is unchanged.`);
    return { amount, log };
  }

  let adjusted = amount;
  if (hasResistance) {
    adjusted = Math.max(0, adjusted - 2);
    log.push(`Resistance (${damageType}) reduces incoming Damage by 2.`);
  }
  if (hasVulnerability) {
    adjusted = adjusted + 2;
    log.push(`Vulnerability (${damageType}) increases incoming Damage by 2.`);
  }
  return { amount: adjusted, log };
}

/** The 12 printed Damage types (V6 Combat Encounters -> Damage) that Resistance/Vulnerability key
 *  off of — never a Physical/Mental/Spiritual domain or a Combat Style (see
 *  applyResistanceVulnerability's doc comment above). Shared by the Apply Damage dialog and the
 *  Resistance/Vulnerability entry dialogs on both the Character and NPC sheets. */
export const DAMAGE_TYPES = [
  "Bludgeoning", "Piercing", "Slashing", "Fire", "Cold", "Lightning",
  "Acid", "Force", "Psychic", "Arcane", "Radiant", "Necrotic"
];

/** Strips tags for a plain-text preview; card body/rider fields are stored as HTMLFields. */
export function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Mastery (Part II, "Mastery"): a card lists several Expertises but only requires some of them
 * ("any" = 1, "any2" = 2). A character who possesses MORE of the card's listed Expertises than it
 * requires has Mastery with that card and gains a flat 1 free Surge — the bonus does not stack
 * with further qualifying Expertises beyond the first.
 * @param {object} cardSystem - an Action/Reaction Card's `system` data (expertises, expertisesMode)
 * @param {Array<{name: string}>} actorExpertises - the rolling actor's `system.expertises`
 * @returns {boolean} whether Mastery applies to this use of the card
 */
export function hasMastery(cardSystem, actorExpertises) {
  const listed = (cardSystem?.expertises || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!listed.length) return false;
  const required = cardSystem.expertisesMode === "any2" ? 2 : 1;
  const possessedNames = new Set((actorExpertises ?? []).map((e) => (e.name || "").trim().toLowerCase()).filter(Boolean));
  const possessed = listed.filter((name) => possessedNames.has(name)).length;
  return possessed > required;
}

/** Fixed severity by slot index for both Core Wounds and Core Influence — same 5-space,
 *  2 Light/2 Serious/1 Critical layout (see actor-combatant.mjs's coreWounds/coreInfluence). */
export const SEVERITY_BY_INDEX = ["Light", "Light", "Serious", "Serious", "Critical"];

/**
 * V6 Death Track wound-removal effect (part-iv-combat.md § The Death Track, plan §5.1.3): removing
 * a Core Wound while the track is actively governing this actor ("dying"/"stabilized") stops
 * automatic advancement — state falls back to "none". Removing the Critical Wound specifically
 * (the last slot, index 4) also resets the recorded step to 0; removing any OTHER Wound preserves
 * whatever step had already accumulated, per V6's "recorded progress persists" rule. Returns null
 * when there's nothing to change (the track wasn't governing this actor in the first place).
 */
export function deathTrackAfterWoundRemoval(currentState, slot) {
  if (!currentState || currentState === "none") return null;
  return { state: "none", resetStep: slot === (SEVERITY_BY_INDEX.length - 1) };
}

/**
 * V6 Death Track wound-FILL effect (part-iv-combat.md § The Death Track, plan §5.1.3) — the
 * activation/overflow counterpart to deathTrackAfterWoundRemoval above. Shared by every call site
 * that fills a Core Wound space: #onApplyDamage and #onToggleCoreWound (actor-sheet.mjs, and the
 * NPC/Monster sheets' simplified-Wounds equivalents don't use this — adversaries skip Death Track
 * entirely) and applyManifestationDefeat (manifestation.mjs), which previously reimplemented (and,
 * in applyManifestationDefeat's case, incompletely reimplemented — it advanced deathTrackStep but
 * never set deathTrackState) this same logic ad hoc.
 *
 * Two distinct cases, both keyed off wasFull/nowFull (whether ALL Core Wound spaces were filled
 * immediately before vs. after the Wound(s) being applied):
 * - Not full -> full (the initial activation): the track activates at step 0 WITHOUT advancing —
 *   the first real advance happens at the next Turn start (EssenceCombat's existing turn-start
 *   logic in documents/combat.mjs, unaffected by this helper).
 * - Already full (an overflow Wound lands on a track with no empty space left): the caller is
 *   expected to advance deathTrackStep itself (this may run once per overflow Wound within a
 *   single action, so the step isn't returned here) and force state to "dying", breaking
 *   Stabilization if the actor was currently "stabilized".
 *
 * @param {string} currentState - playState.deathTrackState before this change
 * @param {boolean} wasFull - were all Core Wound spaces filled immediately BEFORE this change
 * @param {boolean} nowFull - are all Core Wound spaces filled immediately AFTER this change
 * @returns {{deathTrackState: string, deathTrackStep?: number}|null} null when nothing changes;
 *   `deathTrackStep` is only present (and always 0) for the initial-activation case — an overflow
 *   result omits it so the caller's own step-advance isn't clobbered.
 */
export function deathTrackAfterWoundFilled(currentState, wasFull, nowFull) {
  const state = currentState || "none";
  if (!wasFull && nowFull && state === "none") return { deathTrackState: "dying", deathTrackStep: 0 };
  if (wasFull) return { deathTrackState: "dying" };
  return null;
}

/**
 * V6 "Acting While Dying - Provisional Playtest" (design/v6-revision-delta.md §2.4, new content —
 * no prior scope): "The first time each Round you play an Action or Reaction while Dying, advance
 * your Death Track by 1 after that card finishes resolving, if you are still Dying. A failed or
 * interrupted card still counts. This extra advance occurs at most once per Round, even if you
 * stop Dying and become Dying again. It is additional to normal start-of-Turn deterioration...
 * Ordinary Movement does not trigger this additional advance."
 *
 * The caller is expected to invoke this AFTER a Combat/Reaction card's roll has fully resolved
 * (success, failure, or interruption all count equally — this helper doesn't distinguish them,
 * matching the book's own "a failed or interrupted card still counts"), and only for a card use
 * that is itself an Action or Reaction (not ordinary Movement, which never reaches this call site
 * since Movement isn't a card roll in this codebase). See actor-sheet.mjs's #onRollItem and
 * #onRollEquipmentCard for the two call sites.
 * @param {string} currentState - playState.deathTrackState AFTER the card resolved (the caller
 *   should re-read this post-roll, since the roll itself cannot change Dying state, but a
 *   concurrent Apply Damage in the same turn theoretically could)
 * @param {number|null} dyingExertionRound - playState.dyingExertionRound (the Combat Round this
 *   Round's exertion advance was already charged for, or null if never charged / a new Combat)
 * @param {number|null} currentCombatRound - game.combat?.round, or null with no active Combat
 * @returns {{advance: boolean, dyingExertionRound: number|null}} whether to advance the Death
 *   Track by 1, and the dyingExertionRound value to persist either way (unchanged when not
 *   advancing, set to currentCombatRound when advancing)
 */
export function deathTrackAfterCardWhileDying(currentState, dyingExertionRound, currentCombatRound) {
  if (currentState !== "dying" || currentCombatRound == null || dyingExertionRound === currentCombatRound) {
    return { advance: false, dyingExertionRound };
  }
  return { advance: true, dyingExertionRound: currentCombatRound };
}

/**
 * V6 Wound Cards (plan §6.4, Appendix E "Baseline Fallback Wound Cards"): the named Condition Item
 * a filled Core Wound space attaches, keyed by the space's Damage domain and severity. Names must
 * match the nine Condition Items build-packs.mjs authors into packs/_source/conditions/ exactly —
 * see WOUND_CARDS in that script.
 */
export const WOUND_CARD_NAMES = {
  Physical: { Light: "Impaired Body", Serious: "Debilitated Body", Critical: "Catastrophic Injury" },
  Mental: { Light: "Disrupted Mind", Serious: "Cognitive Trauma", Critical: "Fractured Consciousness" },
  Spiritual: { Light: "Unmoored Essence", Serious: "Spiritual Trauma", Critical: "Severed Essence" }
};

/**
 * Resolves (but does not create) the Wound Card item-data object for a domain+severity pair — the
 * compendium-lookup half of attachWoundCard, split out so a caller attaching SEVERAL Wound Cards in
 * one action (e.g. #onApplyDamage filling more than one Core Wound space at once) can resolve them
 * all in parallel and create them with a single batched `createEmbeddedDocuments` call rather than
 * one call per Wound — see attachWoundCards below and Finding 7 in build-history's Recent sessions.
 */
async function resolveConditionItemDataByName(name) {
  if (!name) return null;
  const pack = game.packs?.get("essence-system.conditions");
  if (!pack) return null;
  const index = await pack.getIndex();
  const entry = index.find((e) => e.name === name);
  if (!entry) return null;
  const source = await fromUuid(entry.uuid);
  if (!source) return null;
  const itemData = source.toObject();
  delete itemData._id;
  return itemData;
}

async function resolveWoundCardItemData(domain, severity) {
  return resolveConditionItemDataByName(WOUND_CARD_NAMES[domain]?.[severity]);
}

/**
 * Attaches the Wound Card matching a filled Core Wound space's domain+severity to the actor,
 * flagged with that space's slot index so removeWoundCard can find and remove the right one again
 * on recovery. Reuses the same "clone from the conditions compendium, flag, createEmbeddedDocuments"
 * pattern EssenceActor#toggleStatusEffect (documents/actor.mjs) already uses for the Token HUD,
 * rather than inventing a second lookup/attach mechanism. This is the single-Wound path — a caller
 * attaching several at once (see attachWoundCards below) should use that instead so all of them land
 * in one Foundry operation.
 */
export async function attachWoundCard(actor, domain, severity, slot) {
  const itemData = await resolveWoundCardItemData(domain, severity);
  if (!itemData) return null;
  foundry.utils.setProperty(itemData, "flags.essence-system.woundCardSlot", slot);
  const [created] = await actor.createEmbeddedDocuments("Item", [itemData]);
  return created;
}

/**
 * Batched counterpart to attachWoundCard: resolves every fill's Wound Card item data in parallel
 * (`Promise.all`, same compendium-index lookup as the single-item path, just not serialized one
 * Wound at a time) and creates all of them with ONE `createEmbeddedDocuments` call — the fix for
 * #onApplyDamage's old `for (const f of filledSlots) await attachWoundCard(...)` loop, which did one
 * full create round-trip per newly-filled Core Wound space instead of one per Apply Damage action.
 * @param {Actor} actor
 * @param {Array<{domain: string, severity: string, slot: number}>} fills
 * @returns {Promise<Item[]>} the created Wound Card Items (empty array if none resolved)
 */
export async function attachWoundCards(actor, fills) {
  const resolved = await Promise.all(fills.map(async (f) => {
    const itemData = await resolveWoundCardItemData(f.domain, f.severity);
    if (!itemData) return null;
    foundry.utils.setProperty(itemData, "flags.essence-system.woundCardSlot", f.slot);
    return itemData;
  }));
  const itemsData = resolved.filter(Boolean);
  return itemsData.length ? actor.createEmbeddedDocuments("Item", itemsData) : [];
}

/** Removes the Wound Card attached to a given Core Wound slot (see attachWoundCard above), if any
 *  is present — a no-op (returns false) for a Wound that never got one, e.g. one filled by the
 *  manual pip-toggle, which has no Damage domain to look a card up from. This is the single-Wound
 *  path — a caller removing several at once (see removeWoundCards below) should use that instead so
 *  all of them are removed in one Foundry operation. */
export async function removeWoundCard(actor, slot) {
  const existing = actor.items.find(
    (i) => i.type === "condition" && i.getFlag("essence-system", "woundCardSlot") === slot
  );
  if (existing) await existing.delete();
  return !!existing;
}

/**
 * Batched counterpart to removeWoundCard: ONE pass over `actor.items` builds a slot -> Item map
 * (instead of removeWoundCard's own per-call linear scan, repeated once per slot), then every
 * matching Item is removed with a single `deleteEmbeddedDocuments` call — the fix for
 * #onGrantRecovery's old `for (const slot of woundSlotsRecovered) await removeWoundCard(...)` loop,
 * which did one full linear scan AND one delete round-trip per recovered Wound instead of one scan
 * and one delete per Grant Recovery action.
 * @param {Actor} actor
 * @param {number[]} slots - Core Wound slot indices being recovered this action
 * @returns {Promise<Item[]>} the deleted Wound Card Items (empty array if none were attached)
 */
export async function removeWoundCards(actor, slots) {
  const slotSet = new Set(slots);
  const bySlot = new Map();
  for (const item of actor.items) {
    if (item.type !== "condition") continue;
    const slot = item.getFlag("essence-system", "woundCardSlot");
    if (slotSet.has(slot)) bySlot.set(slot, item);
  }
  const ids = [...bySlot.values()].map((i) => i.id);
  return ids.length ? actor.deleteEmbeddedDocuments("Item", ids) : [];
}

/**
 * V6 Influence Consequence Cards (plan §6.6, Appendix F "Baseline Fallback Consequences —
 * Playtest"): the named Condition Item a filled Core Influence space attaches, keyed by severity
 * only (unlike Wound Cards there is no domain axis — Core Influence has one severity-only track).
 * Names must match the three Condition Items build-packs.mjs authors into packs/_source/conditions/
 * exactly — see CONSEQUENCE_CARDS in that script. Only Serious ("Compromised Standing") gets a real
 * Active Effect (reachBonus -1, unconditional); Light and Critical are both explicitly SCOPED to
 * "the sphere harmed"/"the primary sphere of collapse" rather than a flat unconditional change, so
 * per this project's own Active-Effect convention (see build-packs.mjs's activeEffects() doc
 * comment) they stay reminder text only, same as Wound Cards' Critical tier.
 */
export const CONSEQUENCE_CARD_NAMES = { Light: "Strained Position", Serious: "Compromised Standing", Critical: "Crisis of Standing" };

/**
 * Attaches the Influence Consequence Card matching a filled Core Influence space's severity,
 * flagged with that space's slot index so removeConsequenceCard can find and remove the right one
 * again on recovery — the exact same "clone from the conditions compendium, flag, createEmbeddedDocuments"
 * pattern attachWoundCard already uses. Unlike a Wound (whose domain is only known at the moment
 * Apply Damage is rolled), a Core Influence space's severity is always derivable purely from its
 * slot index (see SEVERITY_BY_INDEX), so every fill path — Apply Influence Injury, Contribute to
 * Goal, a Reach Trigger's Breach cost, and even the manual pip toggle — can attach the right card.
 */
export async function attachConsequenceCard(actor, severity, slot) {
  const itemData = await resolveConditionItemDataByName(CONSEQUENCE_CARD_NAMES[severity]);
  if (!itemData) return null;
  foundry.utils.setProperty(itemData, "flags.essence-system.consequenceCardSlot", slot);
  const [created] = await actor.createEmbeddedDocuments("Item", [itemData]);
  return created;
}

/** Batched counterpart to attachConsequenceCard — see attachWoundCards for the same reasoning
 *  (one createEmbeddedDocuments call for every space filled by a single action instead of one per
 *  space). @param {Array<{severity: string, slot: number}>} fills */
export async function attachConsequenceCards(actor, fills) {
  const resolved = await Promise.all(fills.map(async (f) => {
    const itemData = await resolveConditionItemDataByName(CONSEQUENCE_CARD_NAMES[f.severity]);
    if (!itemData) return null;
    foundry.utils.setProperty(itemData, "flags.essence-system.consequenceCardSlot", f.slot);
    return itemData;
  }));
  const itemsData = resolved.filter(Boolean);
  return itemsData.length ? actor.createEmbeddedDocuments("Item", itemsData) : [];
}

/** Removes the Influence Consequence Card attached to a given Core Influence slot, if any — see
 *  removeWoundCard for the identical reasoning (a no-op for a slot filled without going through one
 *  of the attach paths, e.g. legacy data from before this version). */
export async function removeConsequenceCard(actor, slot) {
  const existing = actor.items.find(
    (i) => i.type === "condition" && i.getFlag("essence-system", "consequenceCardSlot") === slot
  );
  if (existing) await existing.delete();
  return !!existing;
}

/** Batched counterpart to removeConsequenceCard — see removeWoundCards for the same reasoning.
 *  @param {number[]} slots */
export async function removeConsequenceCards(actor, slots) {
  const slotSet = new Set(slots);
  const bySlot = new Map();
  for (const item of actor.items) {
    if (item.type !== "condition") continue;
    const slot = item.getFlag("essence-system", "consequenceCardSlot");
    if (slotSet.has(slot)) bySlot.set(slot, item);
  }
  const ids = [...bySlot.values()].map((i) => i.id);
  return ids.length ? actor.deleteEmbeddedDocuments("Item", ids) : [];
}

/**
 * Armory/Inventory capacity accounting (part-viii-equipment-and-items.md § Armory and Inventory
 * Capacity): a complete `equipment` item in a slot normally costs 1 (`system.slotCost`, defaulting
 * to 1 for equipment that doesn't set it — see build-packs.mjs) — but 0 for an item granted by a
 * feature like Quartermaster's Due that explicitly waives it (see item-grants.mjs's
 * `countsAgainstLimit`). A loose (not currently assembled into any equipment item) `chassis`/
 * `fitting` in that slot costs ½; an `augment` always costs 0, regardless of where it's kept
 * (§ Augment Ownership — Augments never consume Armory/Inventory capacity). "Loose" is actor-wide,
 * not slot-scoped: a Chassis is loose if no equipment Item on the actor references it via
 * chassisItemId/fittingItemId, no matter which slot either item is in.
 * @param {Array<Item>} items - the actor's full item list (needs the whole list, not just one
 *   slot's items, to determine which Components are actually referenced)
 * @param {"inventory"|"temporary"|"armory"} slotKey
 * @returns {number} total slots used in that slotKey (may be a .5 fraction)
 */
/**
 * V6 Reconfigure — a Fitting exchange always costs a flat 3 Action dice unless the Fitting's own
 * printed text overrides it (`reconfigureCostOverride`); `reconfigureCategory` no longer selects a
 * cost tier (see item-component.mjs's doc comment), it only flags whether the change is
 * out-of-Combat only. Shared by the equipment sheet's cost button label and
 * `#onReconfigureFittingCost` (item-sheet.mjs) so the displayed cost can never drift from the
 * charged cost.
 * @param {Item|null} fittingItem - the currently-installed Fitting, or null/undefined if unassigned
 * @returns {{cost: number, outOfCombatOnly: boolean}}
 */
export function fittingReconfigureCost(fittingItem) {
  return {
    cost: fittingItem?.system.reconfigureCostOverride ?? 3,
    outOfCombatOnly: fittingItem?.system.reconfigureCategory === "structural"
  };
}

export function computeSlotUsage(items, slotKey) {
  const referenced = new Set();
  for (const item of items) {
    if (item.type !== "equipment") continue;
    if (item.system.chassisItemId) referenced.add(item.system.chassisItemId);
    if (item.system.fittingItemId) referenced.add(item.system.fittingItemId);
  }
  let used = 0;
  for (const item of items) {
    if (item.system?.slot !== slotKey) continue;
    if (item.type === "equipment") used += item.system.slotCost ?? 1;
    else if ((item.type === "chassis" || item.type === "fitting") && !referenced.has(item.id)) used += 0.5;
    // item.type === "augment": always 0, no branch needed.
  }
  return used;
}

/**
 * Reach gating (part-ii-character-creation.md §§ Reach / Inventory Equipment; see
 * design/reach-and-economy.md for the full reference): an Equipment Item's `system.cost` field IS
 * its Reach requirement — "a value of 1 in that column means the item exists at Reach Level 1,"
 * not a spend value and not the same thing as `system.tier` (which is a Chassis/Fitting/Component's
 * own sophistication rating for the *modular assembly* system — see equipment-features.mjs — a
 * completely separate axis). A 2026-09-08 pass wrongly conflated the two and read `tier` here
 * instead; this is the corrected version. `cost` is a StringField (matches how Fortitude/
 * Resilience/Movement are also stored as signed text elsewhere in this schema) so it needs parsing,
 * and an empty string means "no stated Reach requirement" — skip the check entirely rather than
 * treating blank as 0.
 * @param {object} equipmentSystem - an `equipment` Item's `system` data
 * @param {number} effectiveReach - the actor's `system.effectiveReach` (base Reach + active Reach Triggers)
 * @returns {{reachCost: number|null, exceptionSource: string, overReach: boolean}}
 */
export function computeReachGate(equipmentSystem, effectiveReach) {
  const raw = (equipmentSystem.cost ?? "").trim();
  const reachCost = raw === "" ? null : Number(raw);
  const exceptionSource = equipmentSystem.reachExceptionSource || "";
  const allowance = effectiveReach + (exceptionSource ? (equipmentSystem.reachExceptionMargin ?? 0) : 0);
  return {
    reachCost,
    exceptionSource,
    overReach: reachCost != null && !Number.isNaN(reachCost) && reachCost > allowance
  };
}

/**
 * Manual "start a new Adventure" reset, covering every Uses-like resource that refreshes at the
 * end of an Adventure rather than automatically (this system has no Adventure-boundary detection —
 * see build-history — so this is a GM/player-driven button, same as Wound/Influence recovery):
 * - Reach Triggers' `usedThisAdventure` flag (part-ii-character-creation.md § Reach Triggers)
 * - Function Augments' `usesRemaining`, reset to `uses` (item-component.mjs § Function Augments)
 * - Consumable Kit Equipment Cards' `usesRemaining`, reset to `uses` (item-card.mjs's
 *   `equipmentCards`, part-viii-equipment-and-items.md § Consumable Kits)
 * - `reachPressure`, back to 0 (V6 plan §5.3.2 "Reach Pressure Resets Slowly" — normally at the end
 *   of an Adventure; any Temporary Influence already spent absorbing overflow pressure stays spent,
 *   this only clears the accumulated-pressure counter itself)
 * - Every equipment/chassis/fitting Item's `usedThisAdventure` flag, back to false (design/
 *   v6-revision-delta.md §3.5 "used vs unused preparation commitment" — a new Adventure means
 *   everything is "unused" again, so whatever stayed committed through the last Adventure is once
 *   more free to transfer to an equal-capacity replacement on Armory access)
 * One shared function (rather than duplicated per-sheet) since actor-sheet.mjs and npc-sheet.mjs
 * both need identical behavior here.
 * @param {Actor} actor
 */
export async function resetAdventureUses(actor) {
  const triggers = actor.system.reachTriggers.map((t) => ({ ...t, usedThisAdventure: false }));
  // V6 Presence benefit (design/v6-revision-delta.md §3.4): a new Adventure's preparation both
  // expires any unspent portion of the LAST Adventure's grant (presenceGrantRemaining -> 0) and
  // makes the once-per-Adventure grant takeable again (presenceGrantActive -> true) — see
  // actor-combatant.mjs's schema comment for the full field-shape reasoning.
  await actor.update({
    "system.reachTriggers": triggers,
    "system.reachPressure": 0,
    "system.playState.presenceGrantActive": true,
    "system.playState.presenceGrantRemaining": 0
  });

  const augments = actor.items.filter((i) => i.type === "augment" && i.system.kind === "function" && i.system.uses != null);
  for (const augment of augments) await augment.update({ "system.usesRemaining": augment.system.uses });

  const kits = actor.items.filter((i) => i.type === "equipment" && i.system.category === "consumable-kit");
  for (const kit of kits) {
    const cards = kit.system.equipmentCards.map((c) => ({ ...c, usesRemaining: c.uses }));
    await kit.update({ "system.equipmentCards": cards });
  }

  const usedItems = actor.items.filter((i) => ["equipment", "chassis", "fitting"].includes(i.type) && i.system.usedThisAdventure);
  for (const item of usedItems) await item.update({ "system.usedThisAdventure": false });
}

/**
 * V6 §6.8 (plan)/item-card.mjs's `cooldownFrequency` schema comment: whether a Combat/Reaction
 * Card is currently unavailable because its cooldown hasn't reset yet.
 * @param {Item} item
 * @returns {boolean}
 */
export function cardOnCooldown(item) {
  const sys = item.system;
  return !!sys?.cooldownFrequency && sys.cooldownFrequency !== "none" && !!sys.cooldownUsed;
}

/**
 * Starts a card's cooldown the moment it's PLAYED (see #onRollItem in actor-sheet.mjs/npc-sheet.mjs
 * — called right when dice are committed, before the roll resolves, so a failed/interrupted use
 * still starts the cooldown per V6's own text). The cooldown belongs to the TECHNIQUE, not the
 * physical card copy: every Item the actor owns sharing this card's name and type is marked used
 * together, so a second printed copy of the same card can't bypass it.
 * @param {Actor} actor
 * @param {Item} item
 */
export async function applyCardCooldown(actor, item) {
  const sys = item.system;
  if (!sys?.cooldownFrequency || sys.cooldownFrequency === "none") return;
  const siblings = actor.items.filter((i) => i.type === item.type && i.name === item.name && i.system.cooldownFrequency && i.system.cooldownFrequency !== "none");
  for (const sibling of siblings) await sibling.update({ "system.cooldownUsed": true });
}

/**
 * V6 §6.8 (plan): the explicit GM "New Encounter" action — resets once-per-Encounter Combat/Reaction
 * Card cooldowns. Deliberately NOT called by combat.mjs's Combat-start hooks: "Combat beginning
 * inside an existing Encounter does not restart the Encounter — once-per-Encounter abilities stay
 * spent." Only this manual action, matching this project's standing manual-lifecycle convention
 * (Reach pressure, Adventure Uses, etc. all reset via an explicit GM button, never an implicit hook).
 * @param {Actor} actor
 */
export async function resetEncounterCooldowns(actor) {
  const cards = actor.items.filter((i) => (i.type === "action-card" || i.type === "reaction-card") && i.system.cooldownFrequency === "perEncounter" && i.system.cooldownUsed);
  for (const card of cards) await card.update({ "system.cooldownUsed": false });
}

/**
 * A one-line preview of what an Action/Reaction Card does, for card-list rows that otherwise show
 * only name + rank/skill/cost — there's room for it and it saves opening the card mid-turn just to
 * check what it does. Prefers the "Effect" section (every card that resolves something has one);
 * falls back to the first section with any text, then the flavor line.
 */
export function cardSummary(system, max = 140) {
  const sections = system.body ?? [];
  const effect = sections.find((s) => /effect/i.test(s.label ?? "") && stripHtml(s.html));
  const first = sections.find((s) => stripHtml(s.html));
  const text = stripHtml((effect ?? first)?.html) || stripHtml(system.flavor);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The Equipment tab's Inventory/Temporary/Armory sections are each wrapped in a `data-drop-slot`
 * container (see character-sheet.hbs/npc-sheet.hbs) purely so a drop landing inside one can tell
 * which section it landed in — Foundry has no native concept of these three areas, since
 * `system.slot` is this system's own schema field, not a core one. Returns the target slot value
 * ("inventory"/"temporary"/"armory") or null if the drop didn't land inside one of those sections
 * (e.g. dropped on the Components & Augments table, or a blank part of the tab).
 */
export function resolveEquipmentDropSlot(event) {
  return event.target?.closest?.("[data-drop-slot]")?.dataset.dropSlot ?? null;
}
