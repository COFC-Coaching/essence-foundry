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

export async function clearOriginItem(actor, type) {
  const stale = actor.items.filter((i) => i.type === type);
  if (stale.length) await actor.deleteEmbeddedDocuments("Item", stale.map((i) => i.id));
  const field = type === "distinction" ? "distinction" : type;
  await actor.update({ [`system.${field}`]: "" });
}
