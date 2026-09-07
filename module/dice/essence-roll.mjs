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
 * Card/combat resolution: the highest die is the Success Die. It succeeds if it meets or
 * beats the target Defense. Every other die showing 6+ grants 1 Surge (no doubling on a 10).
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
  let surges = 0;
  faces.forEach((f, i) => {
    if (i !== successDieIndex && f >= 6) surges += 1;
  });
  return { successDieIndex, successDie, succeeded, surges };
}

/**
 * Roll a pool of d10s for an Actor and resolve it either as a combat roll (against a
 * Defense) or as an open/non-combat pool-successes check.
 * @param {object} options
 * @param {number} options.pool - number of d10 to roll (Attribute + Skill rank + modifiers)
 * @param {number|null} [options.defense] - opposing Defense value, for combat rolls
 * @param {string} [options.label] - chat card title
 * @param {Actor} [options.actor] - speaker actor
 * @param {Array<{n: string, html: string}>} [options.surgeOptions] - a card's printed Surge
 *   options (system.surges) — when given, the chat card renders them as clickable, spendable
 *   options instead of just a bare Surge count. See essence.mjs's renderChatMessageHTML hook
 *   for how clicking one is handled after the message is posted.
 */
export async function rollEssencePool({ pool, defense = null, label = "Essence Roll", actor = null, surgeOptions = [] } = {}) {
  const n = Math.max(1, Math.floor(pool));
  const roll = new Roll(`${n}d10`);
  await roll.evaluate();
  const faces = roll.terms[0].results.map((r) => r.result);

  const combat = resolveCombatRoll(faces, defense);
  const poolSuccesses = countD10Successes(faces);

  const content = await foundry.applications.handlebars.renderTemplate(
    "systems/essence-system/templates/chat/roll-card.hbs",
    {
      label,
      faces,
      pool: n,
      defense,
      successDieIndex: combat.successDieIndex,
      successDie: combat.successDie,
      succeeded: combat.succeeded,
      surges: combat.surges,
      poolSuccesses,
      surgeOptions: surgeOptions.map((opt, i) => ({ i, n: opt.n, html: opt.html }))
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

  return { roll, faces, ...combat, poolSuccesses };
}
