/** "might" -> "Might". Attribute/skill keys are stored lowercase; every player-facing label built from one needs this. */
export function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

/**
 * "Elite — Controller (Leader)" — the enemy-identity header format from Things To Work On/Enemies
 * and NPC's.txt. Shared between the NPC sheet header and the Monster Wizard's Concept step so both
 * read the same identity (Grade, battlefieldRole, eliteType) the same way. Tier used to lead this
 * label; v0.6 Part XIV drops it ("Team Tier is not an enemy rating"). A brand-new NPC with nothing
 * set yet shows "Enemy".
 */
export function buildEnemyHeaderLabel(system) {
  let label = system.grade || game.i18n.localize("ESSENCE.Common.Enemy");
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

/** Each printed Damage type's domain (Doc L3898: "its specific Damage type, which determines its
 *  domain"). Physical: the eight bodily and elemental types; Mental: Psychic, Arcane; Spiritual:
 *  Radiant, Necrotic. */
export const DAMAGE_TYPE_DOMAIN = {
  Bludgeoning: "Physical", Piercing: "Physical", Slashing: "Physical", Fire: "Physical",
  Cold: "Physical", Lightning: "Physical", Acid: "Physical", Force: "Physical",
  Psychic: "Mental", Arcane: "Mental", Radiant: "Spiritual", Necrotic: "Spiritual"
};

/** Pure form of applyResistanceVulnerability for the component engine below. */
export function adjustForResistance(resistances, vulnerabilities, damageType, amount) {
  const hasResistance = (resistances ?? []).some((r) => r.damageType === damageType);
  const hasVulnerability = (vulnerabilities ?? []).some((v) => v.damageType === damageType);
  if (hasResistance && hasVulnerability) return { amount, note: `Resistance and Vulnerability (${damageType}) cancel.` };
  if (hasResistance) return { amount: Math.max(0, amount - 2), note: `Resistance (${damageType}) −2.` };
  if (hasVulnerability) return { amount: amount + 2, note: `Vulnerability (${damageType}) +2.` };
  return { amount, note: "" };
}

/**
 * Generic flat Damage reduction (Doc L3900, and Weakened at L4188): applied once to the card's
 * total, each point taken from the currently largest component, stopping at 0. On a tie the
 * creature taking the Damage chooses; here the earlier-listed tied component is reduced and the
 * log says so. Returns new amounts in the same order.
 */
export function applyFlatReduction(amounts, reduction) {
  const out = amounts.map((n) => Math.max(0, n | 0));
  let left = Math.max(0, reduction | 0);
  while (left > 0 && out.some((n) => n > 0)) {
    let idx = 0;
    for (let i = 1; i < out.length; i++) if (out[i] > out[idx]) idx = i;
    out[idx] -= 1;
    left -= 1;
  }
  return out;
}

/**
 * Multiple Damage Components (Doc L3896-L3918), one card use against one target, resolved in
 * printed order after the flat reduction: Resistance or Vulnerability, then Resilience (or
 * Breach), Temporary Wounds, then Core Wounds, finishing each component before the next so later
 * components see the updated state. Pure: takes a snapshot, returns the new one plus a log.
 *
 * @param {object} state
 * @param {number} state.resilience - effective Resilience
 * @param {number} state.accumulated - ordinary Damage accumulated this interval
 * @param {number} state.tempWounds - Temporary Wounds available
 * @param {Array<{filled: boolean}>} state.coreWounds - the track (any length; capacity below)
 * @param {number} [state.capacity] - usable spaces (simplified enemies); default all
 * @param {string} [state.deathTrackState] - "none" | "dying" | "stabilized" | "dead"
 * @param {number} [state.deathTrackStep]
 * @param {number} [state.deathTrackMax] - 5, or 7 for Deathless
 * @param {"deathTrack"|"count"|"none"} [state.overflow] - what an extra Wound on a full track does:
 *   advance the Death Track (characters), count it (Manifestations), or nothing (simplified enemies)
 * @param {Array} [state.resistances]
 * @param {Array} [state.vulnerabilities]
 * @param {Array<{amount: number, type: string, breach?: boolean, nonlethal?: boolean}>} components
 * @param {number} [reduction] - generic flat reduction incl. Weakened's 1
 */
export function resolveDamageComponents(state, components, reduction = 0) {
  const capacity = state.capacity ?? state.coreWounds.length;
  const track = state.coreWounds.map((w) => ({ ...w }));
  let accumulated = state.accumulated ?? 0;
  let tempWounds = state.tempWounds ?? 0;
  let deathTrackState = state.deathTrackState ?? "none";
  let deathTrackStep = state.deathTrackStep ?? 0;
  const deathTrackMax = state.deathTrackMax ?? 5;
  const overflowMode = state.overflow ?? "deathTrack";
  const log = [];
  const filledSlots = [];
  let overflowCount = 0;
  let nonlethalStable = false;
  let died = false;

  const live = components.filter((c) => (c.amount | 0) > 0);
  const reduced = applyFlatReduction(live.map((c) => c.amount), reduction);
  if (reduction > 0) {
    const ties = live.length > 1;
    log.push(`Flat reduction −${reduction} applied once to the total, from the largest component${ties ? " (ties: the target may choose; the earlier one was reduced here)" : ""}: ${reduced.map((n, i) => `${n} ${live[i].type}`).join(" + ")}.`);
  }

  const isFull = () => track.slice(0, capacity).every((w) => w.filled);

  live.forEach((c, i) => {
    const domain = DAMAGE_TYPE_DOMAIN[c.type] ?? "Physical";
    const rv = adjustForResistance(state.resistances, state.vulnerabilities, c.type, reduced[i]);
    if (rv.note) log.push(rv.note);
    const amount = rv.amount;
    let wounds;
    if (c.breach) {
      wounds = amount;
      log.push(`${amount} ${c.type} (Breach): skips Resilience.`);
    } else {
      wounds = ordinaryDamageWounds(state.resilience ?? 0, accumulated, amount);
      accumulated += amount;
      log.push(`${amount} ${c.type}: accumulated ${accumulated} against Resilience ${state.resilience ?? 0}, ${wounds} Wound${wounds === 1 ? "" : "s"}.`);
    }
    const wasFullBefore = isFull();
    const wasDying = deathTrackState === "dying";
    for (let n = 0; n < wounds; n++) {
      if (tempWounds > 0) { tempWounds -= 1; log.push(`1 ${domain} Wound absorbed by a Temporary Wound.`); continue; }
      const slot = track.slice(0, capacity).findIndex((w) => !w.filled);
      if (slot === -1) {
        // Surplus Wounds from a nonlethal component cannot kill or advance the track (Doc L4119).
        if (c.nonlethal) { log.push("Surplus Wound from a nonlethal component: no effect."); continue; }
        if (overflowMode === "deathTrack" && deathTrackState !== "dead") {
          deathTrackStep = Math.min(deathTrackMax, deathTrackStep + 1);
          const change = deathTrackAfterWoundFilled(deathTrackState, true, true);
          if (change) deathTrackState = change.deathTrackState;
          log.push(`Core Wound track full: Death Track advances to ${deathTrackStep}.`);
          if (deathTrackStep >= deathTrackMax) died = true;
        } else if (overflowMode === "count") {
          overflowCount += 1;
          log.push("Wound Track full: this Wound overflows.");
        } else {
          log.push("Wound capacity already full.");
        }
        continue;
      }
      const severity = SEVERITY_BY_INDEX[slot] ?? "";
      track[slot] = { filled: true, domain, severity, condition: severity ? `${severity} ${domain} Wound` : "" };
      filledSlots.push({ slot, domain, severity });
      log.push(`Core Wound filled: ${severity ? `${severity} ${domain} Wound` : `${domain} Wound`}.`);
    }
    const nowFull = isFull();
    if (!wasFullBefore && nowFull) {
      if (c.nonlethal && !wasDying) {
        // Nonlethal defeat (Doc L4117): unconscious and stable instead of beginning to die.
        deathTrackState = overflowMode === "deathTrack" ? "stabilized" : deathTrackState;
        nonlethalStable = true;
        log.push("Last space filled by a nonlethal component: unconscious and stable, not Dying.");
      } else if (overflowMode === "deathTrack") {
        const change = deathTrackAfterWoundFilled(deathTrackState, false, true);
        if (change) deathTrackState = change.deathTrackState;
        log.push("Every Core Wound space is filled: Dying, Death Track active.");
      }
    }
  });

  return {
    coreWounds: track, accumulated, tempWounds, deathTrackState, deathTrackStep,
    filledSlots, overflowCount, nonlethalStable, died, log,
    total: reduced.reduce((a, b) => a + b, 0)
  };
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
/**
 * Whether `skill` (a lowercase Combat Style key such as "prowess") is the Style associated with a
 * Distinction. `keyCombatSkill` is stored as display text ("Prowess"), and the Distinction sheet
 * edits it as free text, so compare case-insensitively rather than with ===. The +1 Expertise limit
 * this gates never applied while the comparison was a strict === against the lowercase key.
 * @param {Item|null|undefined} distinctionItem
 * @param {string} skill
 */
/**
 * The Team a character belongs to: the first `team` Actor whose member list holds this actor's
 * id, or null. Team data lives on the Team actor (module/data/actor-team.mjs), not the character.
 * A synthetic token actor resolves through its base Actor's id.
 * @param {Actor} actor
 * @returns {Actor|null}
 */
export function teamForActor(actor) {
  const id = actor?.isToken ? actor.token?.actorId : actor?.id;
  if (!id || !globalThis.game?.actors) return null;
  return game.actors.find((a) => a.type === "team" && (a.system.members ?? []).includes(id)) ?? null;
}

/**
 * The Team Tier that applies to a character: its Team's Tier, or 1 with no Team ("Standard Team
 * Tier: 1", Doc L2171).
 * @param {Actor} actor
 * @returns {number}
 */
export function teamTierFor(actor) {
  return teamForActor(actor)?.system.tier ?? 1;
}

/**
 * Wounds caused by one event of ordinary (non-Breach) Damage, v0.6 Part VII "Resilience and
 * Accumulated Damage" (Doc L3877): "Remaining protection = current Resilience - accumulated
 * ordinary Damage, minimum 0... Every point of the new Damage beyond the remaining protection causes
 * 1 Wound. Then add the entire ordinary Damage event to accumulated Damage."
 *
 * Computed per event from the CURRENT Resilience and what has already accumulated, never by
 * re-deriving a running Wound total. That is what makes "a change to Resilience never creates or
 * removes Wounds retroactively" hold in both directions. The pre-0.7.10 code kept a stored running
 * Wound count, which over-counted when Resilience fell mid-interval (Doc example: Resilience 3,
 * 2 accumulated, Resilience falls to 1, then 1 Damage causes 1 Wound, not 2).
 * @param {number} resilience - current effective Resilience
 * @param {number} accumulated - ordinary Damage already accumulated this interval
 * @param {number} amount - this event's Damage after Resistance/Vulnerability
 * @returns {number} Wounds caused by this event
 */
export function ordinaryDamageWounds(resilience, accumulated, amount) {
  const remaining = Math.max(0, (resilience ?? 0) - (accumulated ?? 0));
  return Math.max(0, (amount ?? 0) - remaining);
}

/** Whether `skill` is the Style associated with any of the character's Distinctions. Takes one
 *  Distinction Item or an array of them (v0.6 allows two, Doc L4911); each raises its own Style's
 *  Expertise limit by 1 (L4921). */
export function isDistinctionStyle(distinctionItem, skill) {
  const items = Array.isArray(distinctionItem) ? distinctionItem : [distinctionItem];
  const wanted = (skill ?? "").toLowerCase();
  return items.some((item) => {
    const key = (item?.system?.keyCombatSkill ?? "").trim().toLowerCase();
    return !!key && key === wanted;
  });
}

/** Whether any of the character's Distinctions unlocks the restricted Style `skill`. */
export function distinctionUnlocks(distinctionItems, skill) {
  return (distinctionItems ?? []).some((item) => item?.system?.unlocks === skill);
}

/**
 * Whether the character holds `name` as their creation Distinction. Origin Benefits (Orator's
 * Commanding Authority, Marksman's Split Focus, ...) come only from that one (Doc L4915: a later
 * Distinction "does not grant its Origin Benefit"), so `acquiredLater` items never count.
 */
export function hasOriginDistinction(distinctionItems, name) {
  const wanted = (name ?? "").trim().toLowerCase();
  return (distinctionItems ?? []).some((i) => !i?.system?.acquiredLater && (i?.name ?? "").trim().toLowerCase() === wanted);
}

// ---- Combat Style Specialties (Part X, Appendix E; 0.12.0) -------------------------------------

/** Magecraft: "You may maintain up to 3 Threads" (Doc L6033). Duplicates allowed. */
export const THREAD_CAPACITY = 3;

/** Adds a Thread, or reports that one must be discarded first. */
export function addThread(threads, thread) {
  const list = [...(threads ?? [])];
  if (list.length >= THREAD_CAPACITY) return { threads: list, error: "capacity" };
  list.push(thread);
  return { threads: list };
}

/** Leadership: occupied-card capacity is half Leadership Rank rounded up, minimum 1 (Doc L6164). */
export function authorityCapacity(rank) {
  return Math.max(1, Math.ceil((rank ?? 0) / 2));
}

/** Results one card may hold: 1, or 2 with the Orator's Commanding Authority (Doc L6189). */
export function authorityResultsPerCard(orator) {
  return orator ? 2 : 1;
}

/**
 * Stores newly rolled results on a Leadership card (Doc L6162-L6164, L6189). `cards` is
 * [{card, results[]}]. A new card needs a free capacity slot; an occupied card keeps or replaces
 * (`discard` lists the indexes of existing results to drop first). The total on a card never
 * exceeds `perCard`; the newest results win, so a full card with nothing discarded replaces its
 * oldest result. Never transfers between cards.
 */
export function storeAuthority(cards, cardName, results, { capacity, perCard, discard = [] }) {
  const list = (cards ?? []).map((c) => ({ card: c.card, results: [...(c.results ?? [])] }));
  const vals = (results ?? []).filter((n) => Number.isInteger(n) && n >= 1 && n <= 10).slice(0, perCard);
  if (!vals.length) return { cards: list, error: "noResults" };
  const idx = list.findIndex((c) => c.card === cardName);
  if (idx === -1) {
    if (list.length >= capacity) return { cards: list, error: "capacity" };
    list.push({ card: cardName, results: vals });
    return { cards: list, replaced: 0 };
  }
  const kept = list[idx].results.filter((_, i) => !discard.includes(i));
  const merged = [...kept, ...vals].slice(-perCard);
  const replaced = list[idx].results.length + vals.length - merged.length;
  list[idx].results = merged;
  return { cards: list, replaced };
}

/** Spends (removes) one stored result; an emptied card releases its capacity slot (Doc L6187). */
export function spendAuthority(cards, cardIndex, resultIndex) {
  const list = (cards ?? []).map((c) => ({ card: c.card, results: [...(c.results ?? [])] }));
  const card = list[cardIndex];
  if (!card) return list;
  card.results.splice(resultIndex, 1);
  if (!card.results.length) list.splice(cardIndex, 1);
  return list;
}

/** Ballistics: one Lock, two with the Marksman's Split Focus (Doc L5889). */
export function lockCapacity(marksman) {
  return marksman ? 2 : 1;
}

/** Cunning: establish one Contingency per Round, two with the Strategist's Branching Plans; only
 *  one may trigger per Round either way (Doc L5985, L5993). */
export function contingencyCapacity(strategist) {
  return strategist ? 2 : 1;
}

/** Ritualism: maintain 3 Rites, 4 with the Invoker's Final Echo (Doc L6241-L6243). */
export function riteCapacity(invoker) {
  return invoker ? 4 : 3;
}

/**
 * Places a Rite (Doc L6241, L6281). A Possessed Rite (one with a `subject`) whose name already sits
 * on that subject replaces the earlier application in place ("a new same-named effect replaces the
 * old application"); otherwise it needs a free slot.
 */
export function placeRite(rites, rite, capacity) {
  const list = (rites ?? []).map((r) => ({ ...r }));
  const name = (rite.name ?? "").trim().toLowerCase();
  const subject = (rite.subject ?? "").trim().toLowerCase();
  if (name && subject) {
    const idx = list.findIndex((r) => (r.name ?? "").trim().toLowerCase() === name && (r.subject ?? "").trim().toLowerCase() === subject);
    if (idx !== -1) { list[idx] = { ...rite }; return { rites: list, replacedIndex: idx }; }
  }
  if (list.length >= capacity) return { rites: list, error: "capacity" };
  list.push({ ...rite });
  return { rites: list };
}

/**
 * Gestalt upkeep actually due at end of Turn (Doc L5941, L5977): the printed Stamina upkeep, less 1
 * (minimum 0) with the Gifted's Efficient Transformation, plus 1 while Unstable, which that
 * reduction cannot remove.
 */
export function adaptationUpkeep(printed, { efficient = false, unstable = false } = {}) {
  const base = Math.max(0, (printed ?? 0) - (efficient ? 1 : 0));
  return base + (unstable ? 1 : 0);
}

/** Psionics Strain is capped at 6 (Doc L6120). */
export const STRAIN_MAX = 6;

/** Forced Strain past 6 stays at 6 and deals 1 Psychic Breach Damage per excess point (Doc L6120). */
export function forcedStrain(current, amount) {
  const target = Math.max(0, current ?? 0) + Math.max(0, amount ?? 0);
  return { strain: Math.min(STRAIN_MAX, target), excess: Math.max(0, target - STRAIN_MAX) };
}

/** Extra burned die a Psionics card costs at the given Strain (Doc L6118: 5-6). */
export function psionicsBurnSurchargeAt(strain) {
  return (strain ?? 0) >= 5 ? 1 : 0;
}

/**
 * Full Manifestation entry costs by Rank (Doc L6295-L6303) and the form's native card minimums
 * (L6323-L6331). The Summoner's Greater Manifestation reduces only the burned-die surcharge, by 1
 * to a minimum of 0 (L6305); the underlying card keeps its own commitment.
 */
export const MANIFESTATION_ENTRY_COSTS = [
  { burn: 3, mana: 0, actionMin: 2, reactionMin: 2 },
  { burn: 3, mana: 1, actionMin: 2, reactionMin: 2 },
  { burn: 3, mana: 2, actionMin: 3, reactionMin: 2 },
  { burn: 4, mana: 3, actionMin: 4, reactionMin: 2 },
  { burn: 4, mana: 4, actionMin: 5, reactionMin: 3 },
  { burn: 5, mana: 5, actionMin: 6, reactionMin: 3 }
];

export function manifestationEntryCost(rank, { summoner = false } = {}) {
  const row = MANIFESTATION_ENTRY_COSTS[Math.min(5, Math.max(0, rank | 0))];
  return { burn: Math.max(0, row.burn - (summoner ? 1 : 0)), mana: row.mana, actionMin: row.actionMin, reactionMin: row.reactionMin };
}

/** All of a character's forms share one five-space Manifestation Wound track (Doc L6365). */
export const MANIFESTATION_TRACK = 5;

/** A five-space track with the first `filled` spaces marked, for the active form's sheet. */
export function manifestationTrack(filled) {
  const n = Math.min(MANIFESTATION_TRACK, Math.max(0, filled | 0));
  return Array.from({ length: MANIFESTATION_TRACK }, (_, i) => ({ filled: i < n, domain: "", severity: "", condition: i < n ? "Manifestation Wound" : "" }));
}

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
  const critical = slot === (SEVERITY_BY_INDEX.length - 1);
  // Death is final (Doc L4059): opening a Wound space cannot resurrect.
  if (currentState === "dead") return null;
  // Doc L2729 / L4100: "Removing the Critical Wound clears any remaining Death Track progress to
  // 0", whether or not the track is currently governing the character.
  if (!currentState || currentState === "none") return critical ? { state: "none", resetStep: true } : null;
  return { state: "none", resetStep: critical };
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
  if (state === "dead") return null;
  // Doc L4100: a refilled track resumes from the recorded step while the Critical Wound remains,
  // so activation no longer zeroes the step (removing the Critical Wound is what resets it).
  if (!wasFull && nowFull && state === "none") return { deathTrackState: "dying" };
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
/** Initiative ties (Doc L3402): "Player Characters win ties against enemies." Returns a sort
 *  comparator result for two combatants with equal Initiative: negative puts `a` first. */
export function initiativeTieBreak(aType, bType) {
  const aPc = aType === "character" ? 0 : 1;
  const bPc = bType === "character" ? 0 : 1;
  return aPc - bPc;
}

/**
 * The burn-only play shape of a card (Doc L3639, "Burned Dice"; L3680 Dash; L4258 Reconfigure;
 * L4276 Stabilize; L4320 Prepare Action; L5421 Species cards). Reads the card's own `burnDice` /
 * `noRoll` fields when set, else a name table for cards saved before 0.10.0. Null means the card
 * is a rolling card.
 * @returns {{burn: number}|null}
 */
export function burnOnlyProfile(cardSystem, cardName = "") {
  if (cardSystem?.noRoll && typeof cardSystem.burnDice === "number") return { burn: cardSystem.burnDice };
  if (cardSystem?.speciesGranted) return { burn: 2 };
  const table = { "Dash": 2, "Reconfigure": 3, "Stabilize": 3, "Prepare Action": 2 };
  const burn = table[cardName];
  return burn ? { burn } : null;
}

/**
 * An Equipment Card's printed commitment (Doc L4204): "at least 2 dice, or its higher printed
 * minimum... Roll or burn as instructed; if no roll or dice cost is specified, burn 2." Parsed from
 * the card's prose, since Equipment Cards carry no structured dice fields.
 * @returns {{burn: number}|{min: number}}
 */
export function equipmentCardCommitment(effectText) {
  const text = stripHtml(effectText || "");
  const burn = /burn\s+(\d+)/i.exec(text);
  if (burn) return { burn: Math.max(2, parseInt(burn[1], 10)) };
  const roll = /roll\s+(\d+)\s*\+?/i.exec(text);
  if (roll) return { min: Math.max(2, parseInt(roll[1], 10)) };
  return { burn: 2 };
}

/** Recovery's base Resource restoration (Doc L2701): 25% of maximum rounded up; Fatigued halves
 *  that and rounds up again. Anima's extra points are added afterwards by the caller. */
export function recoveryBaseAmount(max, pct = 25, fatigued = false) {
  const base = Math.ceil((max || 0) * (pct / 100));
  return fatigued ? Math.ceil(base / 2) : base;
}

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

/**
 * The ids of every Component currently built INTO an assembled equipment Item on this actor — its
 * Chassis, its Fitting, and any Augment installed in one of its Mounts. Such a Component is a part
 * of that item, not a separate thing the character is carrying: it costs no capacity (below) and
 * the sheets don't list it as its own Inventory/Armory row either. Shared between the two so the
 * count and the list can never disagree about what's loose.
 */
export function assembledComponentIds(items) {
  const referenced = new Set();
  for (const item of items) {
    if (item.type !== "equipment") continue;
    if (item.system.chassisItemId) referenced.add(item.system.chassisItemId);
    if (item.system.fittingItemId) referenced.add(item.system.fittingItemId);
    for (const mount of item.system.mounts ?? []) {
      if (mount.augmentItemId) referenced.add(mount.augmentItemId);
    }
  }
  return referenced;
}

export function computeSlotUsage(items, slotKey) {
  const referenced = assembledComponentIds(items);
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
 * The Tier of each Component that decides an item's ordinary access (v0.6 Part III "Team Tier and
 * Acquisition", Doc L1793): "Check each Component separately; a complete modular item has no
 * combined Tier." An assembled item contributes its Chassis and Fitting; a loose Chassis or Fitting
 * its own Tier; a non-modular item (Toolkit, Kit, Gear) its own `tier` if one is set. Augments are
 * Tierless ("Tierless Augments follow their own access rules") and contribute nothing.
 * @param {Item|object} item - an equipment/chassis/fitting/augment Item (or `{type, system}`)
 * @param {Iterable<Item>} items - the owning actor's items, to resolve a modular item's parts
 * @returns {number[]}
 */
export function componentTiers(item, items) {
  const tierOf = (i) => (i && Number.isFinite(i.system?.tier) ? i.system.tier : null);
  if (item.type === "chassis" || item.type === "fitting") return [tierOf(item)].filter((t) => t != null);
  if (item.type !== "equipment") return [];
  if (item.system.isModular) {
    const list = [...(items ?? [])];
    const find = (id) => (id ? list.find((i) => i.id === id) ?? null : null);
    return [find(item.system.chassisItemId), find(item.system.fittingItemId)].map(tierOf).filter((t) => t != null);
  }
  return [tierOf(item)].filter((t) => t != null);
}

/**
 * Team Tier access check (v0.6 Part III "Team Tier and Acquisition", Doc L1793-1795): through
 * routine channels a character obtains a Chassis or Fitting whose Tier is no higher than Team
 * Tier. "A higher personal Reach can absorb more expenditure within that scale, but does not by
 * itself open higher-Tier suppliers." This replaces the pre-v0.6 check of an item's `cost` against
 * personal Reach. Reach itself is unchanged: it still absorbs the Influence cost of getting the
 * item.
 *
 * A soft warning only, and about acquisition only: "Once equipment is actually obtained, this
 * acquisition guideline does not prevent its use or retention" (L1795). A feature that grants access
 * above the Team's (Quartermaster's Due: +1) is recorded on the item as `reachExceptionSource` /
 * `reachExceptionMargin`. Those names are pre-v0.6 and kept so stored items still load; the margin
 * now counts Tiers above Team Tier.
 * @param {Item|object} item
 * @param {number} teamTier - teamTierFor(actor)
 * @param {Iterable<Item>} items - the owning actor's items
 * @returns {{componentTier: number|null, exceptionSource: string, overTier: boolean}}
 */
export function computeTierGate(item, teamTier, items) {
  const tiers = componentTiers(item, items);
  const exceptionSource = item.system?.reachExceptionSource || "";
  const allowance = (teamTier ?? 1) + (exceptionSource ? (item.system.reachExceptionMargin ?? 0) : 0);
  const componentTier = tiers.length ? Math.max(...tiers) : null;
  return { componentTier, exceptionSource, overTier: componentTier != null && componentTier > allowance };
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
  await actor.update({
    "system.reachTriggers": triggers,
    "system.reachPressure": 0,
    // Adaptability's Non-Combat rerolls refresh at the start of each Adventure, never at Recovery
    // (Doc 2026-09-28, Core Rules "Improvisation").
    "system.playState.adaptabilityRerollsUsed": 0
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
/**
 * What ends when the Encounter ends (Doc L5842 Combo, L5930 Lock, L6032 Threads, L6186 Authority,
 * L5882 Stance, L5978 Unstable). Called by the explicit New Encounter action only; deleting the
 * Combat document no longer clears anything, since Combat can end inside an Encounter that goes
 * on (Doc L3039). A Full Manifestation also ends (L6360); the sheet handles that return, since it
 * lives in apps/manifestation.mjs.
 * @returns {Promise<string[]>} the names of what was cleared, for the chat note
 */
export async function resetEncounterSpecialties(actor) {
  const sp = actor.system.specialties ?? {};
  const update = {};
  const cleared = [];
  if (sp.combo) { update["system.specialties.combo"] = 0; cleared.push("Combo"); }
  if (sp.comboDealtDamage) update["system.specialties.comboDealtDamage"] = false;
  if (sp.lock) { update["system.specialties.lock"] = ""; cleared.push("Lock"); }
  if (sp.locks?.length) { update["system.specialties.locks"] = []; cleared.push("Lock"); }
  if (sp.threads?.length) { update["system.specialties.threads"] = []; cleared.push("Threads"); }
  if (sp.authority?.length) { update["system.specialties.authority"] = []; cleared.push("Authority"); }
  if (sp.authorityCards?.length) { update["system.specialties.authorityCards"] = []; cleared.push("Authority"); }
  // Contingencies expire at the start of the next Turn anyway; Encounter end clears them too.
  if (sp.contingency) update["system.specialties.contingency"] = "";
  if (sp.contingencies?.length) { update["system.specialties.contingencies"] = []; cleared.push("Contingencies"); }
  if (sp.contingencyTriggered) update["system.specialties.contingencyTriggered"] = false;
  if (sp.finalEchoUsed) update["system.specialties.finalEchoUsed"] = false;
  if (sp.strainVented) update["system.specialties.strainVented"] = false;
  // Doc L6359: Full Manifestation normally ends when the Encounter ends; the caller's sheet handles
  // the actual return (see #onNewEncounter). Adaptations follow their cards; Unstable ends below.
  if (Object.keys(update).length) await actor.update(update);
  const ending = actor.items.filter((i) => i.type === "condition" && ["STANCE", "UNSTABLE"].includes((i.name || "").toUpperCase()));
  if (ending.length) {
    await actor.deleteEmbeddedDocuments("Item", ending.map((i) => i.id));
    cleared.push(...ending.map((i) => capitalize(i.name.toLowerCase())));
  }
  return cleared;
}

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

/**
 * Burn the difference (Ryan, 2026-09-27): a card's minimum commitment is always paid from the
 * Pool, but only up to the card's normal maximum (Attribute + Style Rank) is rolled; the rest is
 * burned. Minimum 2, maximum 1: pay 2, roll 1, burn 1. Minimum 3, maximum 2: pay 3, roll 2,
 * burn 1. Free dice are added to the roll afterwards and never pay the minimum. Replaces the old
 * "Basic and Rank 0 cards roll at least 2" floor. `maxRolled` null means no maximum is known.
 * @returns {{rolled: number, burned: number}}
 */
/**
 * Adaptability's Non-Combat rerolls (Doc 2026-09-28, Core Rules "Improvisation"): uses per
 * Adventure equal to Adaptability; a use rerolls every die of one of the character's own
 * Non-Combat checks. `used` is what this Adventure has spent so far.
 * @param {number} adaptability
 * @param {number} used
 * @returns {{max: number, used: number, remaining: number}}
 */
export function adaptabilityRerollState(adaptability, used = 0) {
  const max = Math.max(0, Math.floor(adaptability) || 0);
  const spent = Math.min(max, Math.max(0, Math.floor(used) || 0));
  return { max, used: spent, remaining: max - spent };
}

export function splitCommitment(committed, cardMin, maxRolled) {
  if (typeof maxRolled !== "number" || !Number.isFinite(maxRolled) || maxRolled >= cardMin) return { rolled: committed, burned: 0 };
  const rolled = Math.max(1, Math.min(committed, maxRolled));
  return { rolled, burned: committed - rolled };
}

/**
 * Arrow-key movement on an ApplicationV2 tab strip (live-test check 98). Foundry renders the strip
 * and switches tabs on click; it binds no keys, so Left/Right/Home/End here focus and activate the
 * neighbouring tab through the same click the mouse would send.
 */
export function wireTabArrowKeys(root) {
  for (const nav of root.querySelectorAll("nav.tabs[role=tablist]")) {
    nav.addEventListener("keydown", (event) => {
      const tabs = [...nav.querySelectorAll("[data-action=tab]")];
      const i = tabs.indexOf(document.activeElement);
      if (i === -1) return;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
      if (next === undefined) return;
      event.preventDefault();
      const target = tabs[(next + tabs.length) % tabs.length];
      target.focus();
      target.click();
    });
  }
}
