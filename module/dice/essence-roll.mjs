/**
 * Essence System dice pool resolution.
 * Ports the exact rules from artifacts/essence-system/src/lib/dice/engine.ts so that
 * Foundry rolls agree with the web app's roller and card resolution.
 */

/** Legacy d10-pool successes: 10 = 2 successes, 6-9 = 1 success, 1-5 = 0. Used for open-difficulty / non-combat checks. */
export function countD10Successes(faces) {
  return faces.reduce((sum, f) => sum + (f === 10 ? 2 : f >= 6 ? 1 : 0), 0);
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
 */
export function resolveCombatRoll(faces, defense = null) {
  if (!faces.length) {
    return { successDieIndex: -1, successDie: 0, succeeded: false, surges: 0 };
  }
  let successDieIndex = 0;
  for (let i = 1; i < faces.length; i++) {
    if (faces[i] > faces[successDieIndex]) successDieIndex = i;
  }
  const successDie = faces[successDieIndex];
  const succeeded = defense == null ? successDie >= 6 : successDie >= defense;
  const surges = faces.reduce((sum, f, i) => sum + (i !== successDieIndex && f >= 6 ? 1 : 0), 0);
  return { successDieIndex, successDie, succeeded, surges };
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
 */
export async function rollEssencePool({ pool, defense = null, targets = null, label = "Essence Roll", actor = null, surgeOptions = [], bonusSurges = 0 } = {}) {
  const n = Math.max(1, Math.floor(pool));
  const roll = new Roll(`${n}d10`);
  await roll.evaluate();
  const faces = roll.terms[0].results.map((r) => r.result);

  const multi = Array.isArray(targets) && targets.length > 0;
  // "Open" roll: no Defense was targeted or declared (the dice-commit dialog's own "leave blank to
  // roll open" option) — the dice-derived Surge count is only a candidate for the GM to confirm,
  // per the 2026-09-09 rule clarification, not an authoritative total.
  const openRoll = !multi && defense == null;
  const combat = resolveCombatRoll(faces, multi ? null : defense);
  combat.surges += bonusSurges;
  const poolSuccesses = countD10Successes(faces);

  const targetResults = multi
    ? targets.map((t) => ({
        name: t.name,
        defense: t.defense,
        succeeded: t.defense == null ? combat.successDie >= 6 : combat.successDie >= t.defense
      }))
    : [];

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/essence-system/templates/chat/roll-card.hbs",
    {
      label,
      faces,
      pool: n,
      defense: multi ? null : defense,
      successDieIndex: combat.successDieIndex,
      successDie: combat.successDie,
      succeeded: combat.succeeded,
      surges: combat.surges,
      openRoll,
      poolSuccesses,
      targets: targetResults,
      surgeOptions: surgeOptions.map((opt, i) => ({ i, n: opt.n, html: opt.html })),
      bonusSurges
    }
  );

  await ChatMessage.create({
    speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
    content,
    rolls: [roll],
    sound: CONFIG.sounds.dice,
    flags: {
      "essence-system": {
        surgesAvailable: combat.surges,
        surgeOptions: surgeOptions.map((opt) => ({ n: opt.n, html: opt.html })),
        spentIndices: []
      }
    }
  });

  return { roll, faces, ...combat, poolSuccesses, targets: targetResults };
}
