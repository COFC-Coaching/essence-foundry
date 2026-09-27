/**
 * Sets an actor's Species/Heritage/Distinction from a compendium (or any source) Item document,
 * enforcing the one-per-type rule and keeping the display name field (system.species/heritage/
 * distinction) in sync — the same rule EssenceActorSheet#_onDropItem enforces for drag-and-drop,
 * shared here for the character-creation wizard's "Use" buttons.
 */
export async function setOriginItem(actor, sourceItem) {
  const type = sourceItem.type;
  const stale = actor.items.filter((i) => i.type === type);
  if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map((i) => i.id));
  const [created] = await actor.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
  const field = type === "distinction" ? "distinction" : type;
  await actor.update({ [`system.${field}`]: created.name });
  return created;
}

/**
 * v0.6 second Distinction (Doc L4911-L4921): keeps the starting Distinction and adds `sourceItem`
 * as a later acquisition, which uses its later-acquisition benefit instead of its Origin Benefit.
 * A character may hold no more than two, so an existing later-acquired Distinction is replaced.
 * The same Distinction twice is refused. `system.distinction` keeps naming the starting one.
 * @returns {Promise<Item|null>} the created Item, or null when refused
 */
export async function addSecondDistinction(actor, sourceItem) {
  const existing = actor.items.filter((i) => i.type === "distinction");
  if (existing.some((i) => i.name === sourceItem.name)) {
    ui.notifications.warn(game.i18n.format("ESSENCE.Notify.DistinctionAlreadyHeld", { name: sourceItem.name }));
    return null;
  }
  const stale = existing.filter((i) => i.system.acquiredLater);
  if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map((i) => i.id));
  const data = sourceItem.toObject();
  data.system.acquiredLater = true;
  const [created] = await actor.createEmbeddedDocuments("Item", [data]);
  return created;
}

export async function clearOriginItem(actor, type) {
  const stale = actor.items.filter((i) => i.type === type);
  if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map((i) => i.id));
  const field = type === "distinction" ? "distinction" : type;
  await actor.update({ [`system.${field}`]: "" });
}
