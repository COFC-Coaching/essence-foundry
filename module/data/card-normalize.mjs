/**
 * Mechanical corrections derived from a card's own text. Pure functions, no Foundry globals, so
 * scripts/build-packs.mjs applies them while writing the compendium source and the client applies
 * the same rules to the copies actors already own (basic-card-sync.mjs).
 *
 * Why (Ryan, 2026-10-18 session): Bashing of Dust and Mote of Mercy reserved a Success Die and
 * "failed" although their text says "Response (unopposed)". The roll engine handles an unopposed
 * card correctly (no Success Die, every 6+ a Surge) when `system.unopposed` is set; 188 cards in
 * the packs said unopposed in prose and rolled against no Defense, but only Defend carried the
 * flag. The Neon rows the packs are built from still lack it, so the rule lives here.
 */

/** Hand-fixed wording, keyed by card name. Each entry is [find, replace] applied to body/surge html. */
const TEXT_FIXES = {
  "Bastion of Dust": [["Create the screen in an adjacent space instead after seeing the roll.", "Create the screen in an additional adjacent space after seeing the roll."]]
};

function stripTags(html) {
  return String(html ?? "").replace(/<[^>]+>/g, " ");
}

/**
 * @param {{name: string, system: object}} card - a card item's plain data (toObject()); not mutated
 * @returns {{system: object, changes: string[]}} a corrected copy of `system` and what changed
 */
export function normalizeCardSystem(card) {
  const system = foundryClone(card.system ?? {});
  const changes = [];
  const text = [...(system.body ?? []).map((b) => b.html), ...(system.surges ?? []).map((s) => s.html), system.rider?.html].map(stripTags).join(" ");

  // A card that rolls against no Defense and calls itself unopposed is unopposed.
  if (!system.unopposed && !system.defense && !system.nonCombatTask && /\bunopposed\b/i.test(text)) {
    system.unopposed = true;
    changes.push("unopposed");
  }

  const fixes = TEXT_FIXES[card.name] ?? [];
  for (const [find, replace] of fixes) {
    for (const line of [...(system.body ?? []), ...(system.surges ?? [])]) {
      if (typeof line.html === "string" && line.html.includes(find)) {
        line.html = line.html.split(find).join(replace);
        changes.push("text");
      }
    }
  }
  return { system, changes };
}

/** Structured clone that also works under plain Node (no foundry.utils). */
function foundryClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}
