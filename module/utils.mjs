/** "might" -> "Might". Attribute/skill keys are stored lowercase; every player-facing label built from one needs this. */
export function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
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

/** A card's Domain determines which resource pool its Cost is paid from — see the Domain/
 *  Resource/Defense grouping used throughout the sheet (actor-sheet.mjs's DOMAINS constant). */
const DOMAIN_RESOURCE = { physical: "Stamina", mental: "Focus", spiritual: "Mana" };
export function domainResource(domain) {
  return DOMAIN_RESOURCE[domain] ?? "";
}

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

/** Recovery time by severity for Core Influence Injuries and Temporary Influence slots (see
 *  part-v-social-encounters.md § Recovery) — shown as a reference note, not an automated timer,
 *  matching how Core Wound recovery is also a manual GM-triggered action rather than a clock. */
export const INFLUENCE_RECOVERY_TIME = { Light: "1 day", Serious: "1 week", Critical: "1 month" };

/**
 * Armory/Signature capacity accounting (part-viii-equipment-and-items.md § Armory and Signature
 * Capacity): a complete `equipment` item in a slot normally costs 1 (`system.slotCost`, defaulting
 * to 1 for equipment that doesn't set it — see build-packs.mjs) — but 0 for an item granted by a
 * feature like Quartermaster's Due that explicitly waives it (see item-grants.mjs's
 * `countsAgainstLimit`). A loose (not currently assembled into any equipment item) `chassis`/
 * `fitting` in that slot costs ½; an `augment` always costs 0, regardless of where it's kept
 * (§ Augment Ownership — Augments never consume Armory/Signature capacity). "Loose" is actor-wide,
 * not slot-scoped: a Chassis is loose if no equipment Item on the actor references it via
 * chassisItemId/fittingItemId, no matter which slot either item is in.
 * @param {Array<Item>} items - the actor's full item list (needs the whole list, not just one
 *   slot's items, to determine which Components are actually referenced)
 * @param {"signature"|"temporary"|"armory"} slotKey
 * @returns {number} total slots used in that slotKey (may be a .5 fraction)
 */
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
 * Reach gating (part-ii-character-creation.md §§ Reach / Signature Equipment; see
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
 * One shared function (rather than duplicated per-sheet) since actor-sheet.mjs and npc-sheet.mjs
 * both need identical behavior here.
 * @param {Actor} actor
 */
export async function resetAdventureUses(actor) {
  const triggers = actor.system.reachTriggers.map((t) => ({ ...t, usedThisAdventure: false }));
  await actor.update({ "system.reachTriggers": triggers });

  const augments = actor.items.filter((i) => i.type === "augment" && i.system.kind === "function" && i.system.uses != null);
  for (const augment of augments) await augment.update({ "system.usesRemaining": augment.system.uses });

  const kits = actor.items.filter((i) => i.type === "equipment" && i.system.category === "consumable-kit");
  for (const kit of kits) {
    const cards = kit.system.equipmentCards.map((c) => ({ ...c, usesRemaining: c.uses }));
    await kit.update({ "system.equipmentCards": cards });
  }
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
 * The Equipment tab's Signature/Temporary/Armory sections are each wrapped in a `data-drop-slot`
 * container (see character-sheet.hbs/npc-sheet.hbs) purely so a drop landing inside one can tell
 * which section it landed in — Foundry has no native concept of these three areas, since
 * `system.slot` is this system's own schema field, not a core one. Returns the target slot value
 * ("signature"/"temporary"/"armory") or null if the drop didn't land inside one of those sections
 * (e.g. dropped on the Components & Augments table, or a blank part of the tab).
 */
export function resolveEquipmentDropSlot(event) {
  return event.target?.closest?.("[data-drop-slot]")?.dataset.dropSlot ?? null;
}
