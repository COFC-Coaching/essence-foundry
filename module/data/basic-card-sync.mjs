/**
 * Keeps every actor's Basic cards current with the compendium.
 *
 * A Basic card (Basic Melee Attack, Basic Ranged Attack, Dash, Perform Task, Prepare Action,
 * Reconfigure, Stabilize, Defend) is a reminder of a system rule, not a choice the character made,
 * yet each actor owns its own copy, taken at creation or granted by the Character Wizard. Those
 * copies never follow a pack update, so a world that started early keeps whatever that version's
 * card said. Shane (2026-10-18) found a Dash that read "Target. Yourself. Effect. Deal 1 damage."
 * on a live sheet; the pack's Dash has never dealt damage. The chat card prints the owned copy's
 * body lines (card-play.mjs cardText), so the stale text is what the table saw.
 *
 * On the first GM load of each system version this walks every actor, finds owned Action/Reaction
 * cards with a Basic's name and type, and rewrites their text and mechanics from the compendium
 * copy. Play state the copy carries (cooldownUsed) and the item's own id and flags stay. A GM is
 * told which sheets changed, by whisper, so a deliberate house edit can be put back by hand.
 */

const SETTING = "basicCardsSyncedVersion";
const CARD_TYPES = ["action-card", "reaction-card"];

/** Same test the Character Wizard uses for the universal Basic set: no Style, not a Species card. */
function isBasicCard(system) {
  return !system?.style && !system?.speciesGranted;
}

export function registerBasicCardSyncSetting() {
  game.settings.register("essence-system", SETTING, { scope: "world", config: false, type: String, default: "" });
}

/**
 * Resyncs every actor's Basic cards from the compendium once per system version.
 * @param {object} [options]
 * @param {boolean} [options.force=false] run even when this version already synced
 * @returns {Promise<{actors: string[], cards: number}>} what changed
 */
export async function syncBasicCards({ force = false } = {}) {
  const version = game.system.version;
  const result = { actors: [], cards: 0 };
  if (!game.user.isGM) return result;
  if (!force && game.settings.get("essence-system", SETTING) === version) return result;

  const [actionPack, reactionPack] = await Promise.all([
    game.packs.get("essence-system.action-cards")?.getDocuments() ?? [],
    game.packs.get("essence-system.reaction-cards")?.getDocuments() ?? []
  ]);
  const basics = new Map();
  for (const doc of [...actionPack, ...reactionPack]) {
    if (isBasicCard(doc.system)) basics.set(`${doc.type}:${doc.name.toLowerCase()}`, doc);
  }
  if (!basics.size) return result;

  for (const actor of game.actors) {
    const updates = [];
    const names = [];
    for (const item of actor.items) {
      if (!CARD_TYPES.includes(item.type) || item.system?.speciesGranted) continue;
      const source = basics.get(`${item.type}:${item.name.toLowerCase()}`);
      if (!source) continue;
      const fresh = foundry.utils.deepClone(source.toObject().system);
      // Play state lives on the owned copy, not the compendium: keep it.
      fresh.cooldownUsed = item.system.cooldownUsed ?? false;
      const current = item.toObject().system;
      if (foundry.utils.objectsEqual(foundry.utils.diffObject(current, fresh), {}) && foundry.utils.objectsEqual(foundry.utils.diffObject(fresh, current), {})) continue;
      updates.push({ _id: item.id, name: source.name, img: source.img, system: fresh, "_stats.compendiumSource": source.uuid });
      names.push(source.name);
    }
    if (!updates.length) continue;
    await actor.updateEmbeddedDocuments("Item", updates);
    result.actors.push(`${actor.name} (${names.join(", ")})`);
    result.cards += updates.length;
  }

  if (result.cards) {
    await ChatMessage.create({
      whisper: ChatMessage.getWhisperRecipients("GM"),
      content: game.i18n.format("ESSENCE.Notify.BasicCardsResynced", { version, details: result.actors.join("; ") })
    });
  }
  await game.settings.set("essence-system", SETTING, version);
  return result;
}
