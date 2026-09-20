import { takeRepairLog, wasRepaired } from "../data/migration.mjs";

/**
 * The GM-facing half of the data repair described in module/data/migration.mjs.
 *
 * migration.mjs already makes a world from an older version LOAD correctly — it rewrites stale
 * values on the way in, every load, forever. This module does the two things that repair on its
 * own cannot:
 *
 *  1. WRITES THE REPAIR BACK. Until the corrected value is actually saved, the stale one is still
 *     the thing on disk, and the world stays dependent on migration.mjs continuing to carry an
 *     alias for it indefinitely. One pass at the end of the first load after upgrading settles it.
 *
 *  2. TELLS THE GM, IN WORDS THEY CAN ACT ON. A GM who opens their world and sees an empty Actors
 *     directory has no way to know the data is fine — and no reason to trust that it is. Asking
 *     them to open a browser console and read `invalidDocumentIds` is not a real answer for most
 *     people. So the system says what happened, in plain language, without being asked.
 *
 * GM-only throughout: a player has no permission to write these documents, and the GM's pass fixes
 * the world for everyone. Fully re-entrant — once repairs are persisted there is nothing left to
 * find, so subsequent loads are silent with no version watermark needed to gate them.
 */

/** Plain-language noun phrase — "1 character" / "14 characters". No jargon reaches the dialog. */
function count(n, singular, plural) {
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Every world document whose stored data was corrected on the way in, grouped by how it has to be
 *  written back: world-level documents update themselves, owned items go through their actor. */
function collectRepaired() {
  const actors = [];
  const items = [];
  const embedded = new Map(); // actor -> [{ _id, system }]

  for (const actor of game.actors) {
    if (wasRepaired(actor._source?.system)) {
      actors.push({ _id: actor.id, system: actor.toObject().system });
    }
    for (const item of actor.items) {
      if (!wasRepaired(item._source?.system)) continue;
      if (!embedded.has(actor)) embedded.set(actor, []);
      embedded.get(actor).push({ _id: item.id, system: item.toObject().system });
    }
  }

  for (const item of game.items) {
    if (wasRepaired(item._source?.system)) {
      items.push({ _id: item.id, system: item.toObject().system });
    }
  }

  return { actors, items, embedded };
}

/**
 * Writes the corrected data back. `diff: false` and `recursive: false` are both required: the
 * in-memory document is ALREADY correct, so a normal diffing update would compare the repaired
 * value against itself, find no change, and write nothing at all — leaving the stale value on disk
 * permanently. Batched into one call per collection rather than one per document.
 */
async function persist({ actors, items, embedded }) {
  const options = { diff: false, recursive: false, render: false };
  // CONFIG.*.documentClass rather than the `Actor`/`Item` globals: this system already reassigns
  // CONFIG.Actor.documentClass (see essence.mjs), so this is the class actually in use, and it
  // stays correct as Foundry continues moving those globals under the `foundry.documents` namespace.
  if (actors.length) await CONFIG.Actor.documentClass.updateDocuments(actors, options);
  if (items.length) await CONFIG.Item.documentClass.updateDocuments(items, options);
  for (const [actor, updates] of embedded) {
    await actor.updateEmbeddedDocuments("Item", updates, options);
  }
}

/** Anything the repair could not rescue. Should be empty — but if the schema ever rejects
 *  something this system doesn't know how to coerce, the GM deserves to hear it from us rather
 *  than discover it themselves. */
function countUnrecovered() {
  let total = 0;
  try {
    total += game.actors.invalidDocumentIds?.size ?? 0;
    total += game.items.invalidDocumentIds?.size ?? 0;
    for (const actor of game.actors) total += actor.items?.invalidDocumentIds?.size ?? 0;
  } catch {
    return 0;
  }
  return total;
}

function showRepairedDialog(actorCount, itemCount, persisted) {
  const parts = [];
  if (actorCount) parts.push(count(actorCount, "character or creature", "characters and creatures"));
  if (itemCount) parts.push(count(itemCount, "item", "items"));

  const content = `
    <p><strong>Your content has been restored.</strong></p>
    <p>
      This world was last opened with an older version of The Essence System, and
      ${parts.join(" and ")} had been saved in a format the current version no longer recognised.
      Anything affected would have stopped appearing in your sidebar until now.
    </p>
    <p>
      Nothing was ever deleted. It has all been brought up to date${persisted ? " and saved" : ""},
      and everything should now be exactly where you left it.
    </p>
    <p>
      A small number of dropdown settings — an enemy's battlefield role, or which slot a piece of
      equipment sits in — may have been reset to their default if the old value no longer exists.
      Those are quick to set again. Nothing else was touched.
    </p>
    <p><em>You don't need to do anything. This message won't appear again.</em></p>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: "The Essence System — Your Content Has Been Restored" },
    content,
    buttons: [{ action: "ok", label: "Got it", default: true }]
  }).render(true);
}

function showUnrecoveredDialog(unrecovered) {
  const content = `
    <p><strong>Some content could not be opened.</strong></p>
    <p>
      ${count(unrecovered, "entry in this world", "entries in this world")} could not be loaded by
      the current version of The Essence System.
    </p>
    <p>
      <strong>Nothing has been deleted</strong> — the data is still saved in your world and can be
      recovered. Please get in touch and mention that the system reported
      <em>unrecovered entries</em>, and include which version you updated from if you know it.
    </p>
    <p>Everything else in your world is safe to keep using in the meantime.</p>
  `;

  new foundry.applications.api.DialogV2({
    window: { title: "The Essence System — Some Content Needs Attention" },
    content,
    buttons: [{ action: "ok", label: "OK", default: true }]
  }).render(true);
}

/**
 * Called once from essence.mjs on "ready". Persists whatever migration.mjs repaired during load,
 * then tells the GM what happened — only if something actually happened. A world that was already
 * current sees nothing at all.
 */
export async function repairWorldData() {
  if (!game.user.isGM) return;

  const log = takeRepairLog();
  const found = collectRepaired();
  const actorCount = found.actors.length + found.embedded.size;
  const itemCount = found.items.length + [...found.embedded.values()].reduce((n, u) => n + u.length, 0);

  if (log.length) {
    // Kept as a single grouped console record for support: the dialog above is deliberately
    // non-technical, so this is the only place the actual field-by-field detail exists.
    console.group(`Essence System | Repaired ${log.length} value(s) saved by an older version`);
    for (const entry of log) console.log(`${entry.path}: ${JSON.stringify(entry.from)} -> ${JSON.stringify(entry.to)} (${entry.kind})`);
    console.groupEnd();
  }

  let persisted = false;
  if (actorCount || itemCount) {
    try {
      await persist(found);
      persisted = true;
    } catch (err) {
      // The world is still fully usable — migration.mjs repairs it again on every load — so this
      // is a "couldn't make it permanent" failure, not a "your data is broken" one. Say so, and
      // don't let it stop the GM being told the good news below.
      console.error("Essence System | Could not save repaired data; it will be repaired again on next load", err);
    }
    showRepairedDialog(actorCount, itemCount, persisted);
  }

  const unrecovered = countUnrecovered();
  if (unrecovered) showUnrecoveredDialog(unrecovered);
}
