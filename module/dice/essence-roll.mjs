/**
 * Essence System dice pool resolution.
 * Ports the exact rules from artifacts/essence-system/src/lib/dice/engine.ts so that
 * Foundry rolls agree with the web app's roller and card resolution.
 */

/**
 * Non-Combat task resolution (Doc L1238-L1239): "Read the highest result without adding the dice
 * together... A final highest result meeting or exceeding the Difficulty succeeds." With no
 * Difficulty given, the GM reads the highest die off the chat card and decides.
 * @param {number[]} faces
 * @param {number|null} difficulty
 * @returns {{highest: number, succeeded: boolean|null}}
 */
export function resolveNonCombatRoll(faces, difficulty = null, requiredSuccesses = 1) {
  const highest = faces.length ? Math.max(...faces) : 0;
  const required = Math.max(1, Math.floor(requiredSuccesses) || 1);
  // Multiple Success Dice (Doc, Core Rules "Multiple Success Dice"): reserve the required number
  // of highest dice; each must meet the Difficulty on its own, never summed. Too few dice fails.
  const successDice = [...faces].sort((a, b) => b - a).slice(0, required);
  const succeeded = difficulty == null ? null : successDice.length >= required && successDice.every((f) => f >= difficulty);
  return { highest, succeeded, successDice, required };
}

/**
 * Card/combat resolution: the highest die is the Success Die, and it alone determines pass/fail
 * against the target Defense. Surges are counted AFTER that Defense check, from the dice left
 * over — the Success Die itself never earns a Surge, even when it's 6+, because it was already
 * spent meeting Defense. Only the OTHER dice showing 6+ grant 1 Surge each (no doubling on a 10).
 * (2026-09-09 rule change, reverting the 2026-09-08 change: the user clarified the ordering is
 * "successes come after the Defense has been met" — e.g. a Success Die of 8 against a lower
 * Defense doesn't itself count as a Surge; only remaining dice at 6+ do.)
 *
 * When `defense` is null on a single-target roll (the player rolled "open" because no Defense was
 * targeted/declared), this function still returns a candidate Surge count from the dice, but that
 * count is NOT authoritative — the caller (rollEssencePool) flags the roll as `openRoll` so the
 * chat card presents it as the GM's call rather than a spendable total.
 * @param {number[]} faces
 * @param {number|null} defense
 * @param {boolean} [unopposed] - V6 §5.2.3 (plan): an Unopposed card auto-succeeds and reserves NO
 *   die as the Success Die, so every rolled face of 6+ grants a Surge, including whichever die would
 *   otherwise have been "spent" meeting Defense. This is a distinct concept from an "open" roll (no
 *   Defense declared, e.g. no target selected) — an open roll's Surge count is only a GM-confirmed
 *   candidate (see rollEssencePool's `openRoll` flag), while an Unopposed card's result is fully
 *   authoritative. Do not conflate the two signals.
 */
export function resolveCombatRoll(faces, defense = null, unopposed = false, requiredSuccesses = 1) {
  if (!faces.length) {
    return { successDieIndex: -1, successDieIndices: [], successDice: [], successDie: 0, succeeded: false, surges: 0, required: 1 };
  }
  const required = Math.max(1, Math.floor(requiredSuccesses) || 1);
  // Multiple Success Dice (Doc, "Multiple Success Dice" and "Set Success Dice Before Rolling"):
  // reserve the `required` highest dice, in face order (ties by position). Each reserved die must
  // meet the Defense on its own; none of them can generate a Surge, even when it falls short.
  const order = faces.map((f, i) => i).sort((a, b) => faces[b] - faces[a] || a - b);
  const successDieIndices = order.slice(0, required);
  const successDieIndex = successDieIndices[0];
  const successDice = successDieIndices.map((i) => faces[i]);
  const successDie = faces[successDieIndex];
  if (unopposed) {
    const surges = faces.reduce((sum, f) => sum + (f >= 6 ? 1 : 0), 0);
    return { successDieIndex: -1, successDieIndices: [], successDice: [], successDie, succeeded: true, surges, required };
  }
  const threshold = defense == null ? 6 : defense;
  const succeeded = successDieIndices.length >= required && successDice.every((f) => f >= threshold);
  const reserved = new Set(successDieIndices);
  const surges = faces.reduce((sum, f, i) => sum + (!reserved.has(i) && f >= 6 ? 1 : 0), 0);
  return { successDieIndex, successDieIndices, successDice, successDie, succeeded, surges, required };
}

/**
 * Roll a pool of d10s for an Actor and resolve it either as a combat roll (against one or more
 * Defenses) or as an open/non-combat pool-successes check.
 * @param {object} options
 * @param {number} options.pool - number of d10 to roll (Attribute + Skill rank + modifiers)
 * @param {number|null} [options.defense] - single opposing Defense value, for combat rolls
 *   against exactly one target. Ignored if `targets` is given.
 * @param {Array<{name: string, defense: number|null}>} [options.targets] - multiple targets to
 *   resolve the same roll against independently. The dice are only rolled once — every target
 *   shares the same Success Die and Surge count, only pass/fail varies with each one's Defense.
 * @param {string} [options.label] - chat card title
 * @param {Actor} [options.actor] - speaker actor
 * @param {Array<{n: string, html: string}>} [options.surgeOptions] - a card's printed Surge
 *   options (system.surges) — when given, the chat card renders them as clickable, spendable
 *   options instead of just a bare Surge count. See essence.mjs's renderChatMessageHTML hook
 *   for how clicking one is handled after the message is posted.
 * @param {number} [options.bonusSurges] - flat Surges added on top of the dice result before
 *   spending — currently only Mastery (see utils.mjs's hasMastery), always 0 or 1.
 * @param {number} [options.freeDice] - V6 Free Dice (plan §5.2.6): rolled ALONGSIDE the committed
 *   Pool without themselves leaving the Pool. They may push the total rolled past the card's normal
 *   maximum (§5.2.2), can become the Success Die or generate Surges exactly like any other die, but
 *   never count toward a card's minimum commitment — that check happens at the dialog layer against
 *   `pool` alone, before this function ever sees the Free Dice, so no filtering is needed here.
 *   Required by Leadership's Rallied condition and non-combat Cooperation (both not yet wired to a
 *   UI — this is plumbing only, per the task's explicit "minimal" scope for this piece).
 * @param {boolean} [options.unopposed] - V6 §5.2.3 (plan): the card has no opposing Defense by its
 *   own nature (not merely "no target selected/declared" — see resolveCombatRoll's doc comment on
 *   why these are different signals). Auto-succeeds; no die is reserved as the Success Die; every
 *   face of 6+ grants a Surge.
 * @param {boolean} [options.nonCombat] - V6 §5.5 (plan): non-combat rolls (Key Aspect, Non-Combat
 *   Skill, plain Attribute checks, and Perform Task's internal roll) never generate or display
 *   Surges. Reusable flag rather than a one-off: Perform Task (0.6.104) needs the identical
 *   suppression from inside a Combat-card roll path. When true, the chat card's Surges section is
 *   replaced with a short "no Surges — non-combat roll" note, and the message's stored
 *   `surgesAvailable`/`surgeOptions` flags are zeroed so the click-to-spend handler in essence.mjs
 *   has nothing to spend even if a card somehow supplied `surgeOptions` alongside `nonCombat`.
 * @param {number|null} [options.difficulty] - Non-Combat only (Doc L1265): the GM's Difficulty.
 *   The highest die meeting or beating it succeeds. null means the GM decides from the card.
 */

const CARD_KIND_LABEL = { action: "Action", reaction: "Reaction", equipment: "Equipment", basic: "Basic" };
const RESOURCE_BY_DOMAIN = { physical: "Stamina", mental: "Focus", spiritual: "Mana" };
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");

/** The card half of a chat card (plan step 6): kind, band text, body lines and Rider, read off
 *  the played Item so the chat card shows what the card says without reopening it. */
/** Splits a card's rules sections into the Trigger lines shown above the roll and the rest shown
 *  after it, blanking a label that repeats the previous section's. */
export function splitCardBody(lines) {
  const lead = []; const body = [];
  for (const l of lines) (/^\s*trigger\s*$/i.test(l.label ?? "") ? lead : body).push(l);
  const dedupe = (list) => list.map((l, i) => ({ ...l, label: i && (list[i - 1].label ?? "").trim().toLowerCase() === (l.label ?? "").trim().toLowerCase() ? "" : l.label }));
  return { lead: dedupe(lead), body: dedupe(body) };
}

export function cardChatContext(item) {
  if (!item) return null;
  const sys = item.system ?? {};
  const isEquipment = item.type === "equipment" || item.type === "augment" || item.kind === "equipment";
  const kind = isEquipment ? "equipment" : item.type === "reaction-card" ? "reaction" : sys.skill ? "action" : "basic";
  const kindLabel = kind === "basic" ? `${CARD_KIND_LABEL.basic} · ${item.type === "reaction-card" ? "Reaction" : "Action"}` : kind === "equipment" && item.kind === "equipment" ? `Equipment${item.reaction ? " · Reaction" : ""}` : CARD_KIND_LABEL[kind];
  return {
    kind, kindLabel, name: item.name, subtype: sys.subtype || "", style: sys.skill ? cap(sys.skill) : "", rank: sys.rank ?? 0,
    domainLabel: sys.domain ? cap(sys.domain) : "", attr: sys.attr ? cap(sys.attr) : "",
    // The concept's order: a Trigger states why the card fired, so it sits above the commit line;
    // every other section follows the roll. A section whose label repeats the one before it (two
    // Effect lines) shows its label once, as a continuation (0.18.9).
    ...splitCardBody((sys.body ?? []).filter((l) => l?.html)),
    rider: sys.rider?.html ? sys.rider : null
  };
}

/** The play half: what left the Pool and what was paid (finishCardPlay knows; the roll does not). */
export function playChatContext(play) {
  if (!play) return null;
  const burned = play.burned | 0;
  const resource = play.domain ? RESOURCE_BY_DOMAIN[play.domain] ?? "" : play.resource ?? "";
  const after = play.after ?? (typeof play.available === "number" ? play.available - (play.committed | 0) - (play.extraBurn | 0) : null);
  return {
    committed: play.committed | 0, rolled: play.rolled ?? play.committed, burned, burnedList: Array.from({ length: burned }),
    available: play.available ?? null, after, hasAfter: typeof after === "number" && typeof play.available === "number",
    poolLabel: play.poolLabel ?? "Action", cost: Number(play.cost) || 0, resource, maxRolled: play.maxRolled ?? null, burnOnly: !!play.burnOnly
  };
}
export async function rollEssencePool({ pool, defense = null, targets = null, label = "Essence Roll", actor = null, surgeOptions = [], bonusSurges = 0, freeDice = 0, unopposed = false, nonCombat = false, difficulty = null, noSurges = false, card = null, play = null, requiredSuccesses = 1, rerollOf = null, resolvedFrom = null } = {}) {
  const n = Math.max(1, Math.floor(pool));
  const nFree = Math.max(0, Math.floor(freeDice) || 0);
  const roll = new Roll(`${n + nFree}d10`);
  await roll.evaluate();
  const faces = roll.terms[0].results.map((r) => r.result);
  const required = Math.max(1, Math.floor(requiredSuccesses) || 1);

  const multi = Array.isArray(targets) && targets.length > 0;
  // "Open" roll: no Defense was targeted or declared (the dice-commit dialog's own "leave blank to
  // roll open" option) — the dice-derived Surge count is only a candidate for the GM to confirm,
  // per the 2026-09-09 rule clarification, not an authoritative total. An Unopposed card is a
  // different, fully-authoritative case (see @param unopposed above), so it's excluded here even
  // though it also has no Defense value.
  const openRoll = !unopposed && !multi && defense == null;
  const combat = resolveCombatRoll(faces, multi ? null : defense, unopposed, required);
  // Mooks roll their printed dice against the Defense but never generate Surges (Ryan, 2026-09-27,
  // gap question 5); Normals and Elites do.
  if (noSurges) combat.surges = 0; else combat.surges += bonusSurges;
  const task = nonCombat ? resolveNonCombatRoll(faces, difficulty, required) : null;

  // Several targets share one roll and one reservation (Doc, "Multi-Target Cards"): the reserved
  // dice are checked against each target's own Defense.
  const targetResults = multi
    ? targets.map((t) => ({
        name: t.name,
        defense: t.defense,
        succeeded: unopposed ? true : combat.successDice.length >= required && combat.successDice.every((f) => f >= (t.defense == null ? 6 : t.defense))
      }))
    : [];

  // Adaptability (Doc, Core Rules "Improvisation"): a character may reroll every die of one of
  // their own Non-Combat checks, a number of times per Adventure equal to Adaptability. The chat
  // card offers the reroll while uses remain; the button handler (essence.mjs) spends one.
  const rerollState = nonCombat && actor?.type === "character" ? actor.system.adaptabilityRerolls : null;
  const rerollOffer = rerollState && rerollState.remaining > 0 && !rerollOf
    ? { actorUuid: actor.uuid, pool: n, freeDice: nFree, difficulty, label, requiredSuccesses: required, remaining: rerollState.remaining }
    : null;

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/essence-system/templates/chat/roll-card.hbs",
    {
      label,
      faces,
      // One entry per die for the chat card: its role class and the label read aloud and shown on
      // hover (0.18.12). The Success Die never counts as a Surge (resolveCombatRoll).
      dice: faces.map((face, i) => {
        const isSuccess = nonCombat ? isNonCombatSuccessDie(faces, task?.successDice ?? [], i) : combat.successDieIndices.includes(i);
        const role = isSuccess ? "success" : !nonCombat && face >= 6 ? "surge" : "rolled";
        const key = { success: "ESSENCE.Chat.SuccessDieAria", surge: "ESSENCE.Chat.SurgeDieAria", rolled: "ESSENCE.Chat.RolledDieAria" }[role];
        return { face, cls: role === "rolled" ? "" : `${role}-die`, label: game.i18n.format(key, { n: face }) };
      }),
      pool: n,
      defense: multi || unopposed ? null : defense,
      unopposed,
      successDieIndex: combat.successDieIndex,
      successDie: combat.successDie,
      successDice: nonCombat ? (task?.successDice ?? []) : combat.successDice,
      successDiceText: (nonCombat ? (task?.successDice ?? []) : combat.successDice).join(", "),
      required,
      multiSuccess: required > 1,
      succeeded: combat.succeeded,
      surges: combat.surges,
      rerollOffer,
      rerollOf,
      resolvedFrom,
      openRoll: nonCombat || noSurges ? false : openRoll,
      noSurges,
      nonCombat,
      difficulty: nonCombat ? difficulty : null,
      taskSucceeded: task?.succeeded ?? null,
      targets: targetResults,
      surgeOptions: nonCombat ? [] : surgeOptions.map((opt, i) => ({ i, n: opt.n, html: opt.html })),
      // Apply buttons (Shane, 2026-09-27): one per targeted token, opening that actor's own Apply
      // Damage dialog; and a Card button that opens the played card. Only for card plays.
      applyTargets: card && !nonCombat ? Array.from(game.user.targets).filter((t) => t.actor).map((t) => ({ name: t.actor.name, uuid: t.actor.uuid })) : [],
      cardUuid: card?.uuid ?? null,
      card: cardChatContext(card),
      play: playChatContext(play),
      bonusSurges: noSurges ? 0 : bonusSurges,
      suppressSurges: nonCombat
    }
  );

  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: {
      "essence-system": {
        surgesAvailable: nonCombat || noSurges ? 0 : combat.surges,
        surgeOptions: nonCombat || noSurges ? [] : surgeOptions.map((opt) => ({ n: opt.n, html: opt.html })),
        spentIndices: [],
        applyTargets: card && !nonCombat ? Array.from(game.user.targets).filter((t) => t.actor).map((t) => ({ name: t.actor.name, uuid: t.actor.uuid })) : [],
        cardUuid: card?.uuid ?? null,
        rerollOffer,
        rerolled: false
      }
    }
  });

  return { roll, faces, ...combat, task, targets: targetResults };
}

/** Whether die `i` is one of the reserved Success Dice of a Non-Combat check, matching by face so
 *  two equal faces reserve the leftmost first. */
function isNonCombatSuccessDie(faces, successDice, i) {
  const counts = new Map();
  for (const f of successDice) counts.set(f, (counts.get(f) ?? 0) + 1);
  for (let j = 0; j <= i; j++) {
    const f = faces[j];
    if (!counts.get(f)) continue;
    counts.set(f, counts.get(f) - 1);
    if (j === i) return true;
  }
  return false;
}

/**
 * Roll at resolution (Doc, Combat Encounters "Card Sequence", 2026-09-28): a card's dice are
 * committed and its costs paid when it is played, but nothing is rolled until every response is
 * declared and the chain resolves back to it. This posts the card's chat card without dice and
 * with a Roll button; essence.mjs's chat hook rolls it through `resolvePendingCardPlay` when the
 * player clicks. Targets are read again at that moment (Doc: "finalize targeting when it
 * resolves"), and the Success Die requirement is asked then ("Set Success Dice Before Rolling").
 * Cancelling keeps the dice and Resources spent (Doc: a cancelled card's costs remain spent).
 * @param {object} options - everything rollEssencePool will need, minus the targets
 */
export async function postPendingCardPlay({ card, play, pool, defenseKey = "", label, actor, surgeOptions = [], bonusSurges = 0, unopposed = false, nonCombat = false, noSurges = false } = {}) {
  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/essence-system/templates/chat/roll-card.hbs",
    { label, pending: true, pool, card: cardChatContext(card), play: playChatContext(play), cardUuid: card?.uuid ?? null, dice: [], surgeOptions: [], targets: [] }
  );
  const pending = {
    actorUuid: actor?.uuid ?? null, cardUuid: card?.uuid ?? null, pool, defenseKey, label,
    surgeOptions: (surgeOptions ?? []).map((o) => ({ n: o.n, html: o.html })), bonusSurges, unopposed, nonCombat, noSurges, play
  };
  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
    content,
    flags: { "essence-system": { pending, pendingState: "open", cardUuid: card?.uuid ?? null } }
  });
}

/** Rolls a card posted by postPendingCardPlay. `targets` is what the caller resolved now. */
export async function resolvePendingCardPlay(message, { defense = null, targets = null, requiredSuccesses = 1 } = {}) {
  const pending = message.flags?.["essence-system"]?.pending;
  if (!pending) return null;
  const actor = pending.actorUuid ? await fromUuid(pending.actorUuid) : null;
  const card = pending.cardUuid ? await fromUuid(pending.cardUuid) : null;
  return rollEssencePool({
    card, play: pending.play, pool: pending.pool, defense, targets, label: pending.label, actor,
    surgeOptions: pending.surgeOptions, bonusSurges: pending.bonusSurges, unopposed: pending.unopposed,
    nonCombat: pending.nonCombat, noSurges: pending.noSurges, requiredSuccesses, resolvedFrom: message.id
  });
}
