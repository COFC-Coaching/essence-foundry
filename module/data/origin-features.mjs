/**
 * A Nature or Trait with a recorded sub-choice (see item-origin.mjs's subChoiceField()) needs
 * its player-picked value(s) surfaced somewhere, or a Keen character's sheet would show "Keen"
 * with no indication of which two Senses were actually chosen. Appended as a parenthetical after
 * the trait's own text — e.g. " (Senses: Keen Hearing, Low-Light Vision)" — rather than a separate
 * feature row, since it's a qualifier of the SAME trait, not an independent benefit.
 */
function withSubChoiceSuffix(text, subChoice) {
  if (!subChoice?.selected?.length) return text;
  const label = subChoice.label || "Choice";
  return `${text} (${label}: ${subChoice.selected.join(", ")})`;
}

/**
 * Derives the "General Features & Benefits" rows contributed by an actor's Species/Heritage/
 * Distinction Items — shared by the actor sheet and the character-creation wizard so there's one
 * place that knows how a Nature/Trait/Legacy/Familiarity/origin trait becomes a feature row.
 */
export function deriveOriginFeatures({ speciesItem, heritageItem, distinctionItem }) {
  const originFeatures = [];
  if (speciesItem) {
    const sp = speciesItem.system;
    if (sp.nature?.name) {
      originFeatures.push({
        name: sp.nature.name,
        source: `Species: ${speciesItem.name}`,
        text: withSubChoiceSuffix(sp.nature.text, sp.nature.subChoice)
      });
    }
    for (const a of sp.traits) {
      if (a.chosen) originFeatures.push({ name: a.name, source: `Species: ${speciesItem.name}`, text: withSubChoiceSuffix(a.text, a.subChoice) });
    }
  }
  if (heritageItem) {
    const h = heritageItem.system;
    if (h.legacy?.name) originFeatures.push({ name: h.legacy.name, source: `Heritage: ${heritageItem.name}`, text: h.legacy.text });
    if (h.familiarity?.name) originFeatures.push({ name: h.familiarity.name, source: `Heritage: ${heritageItem.name}`, text: h.familiarity.text });
  }
  if (distinctionItem) {
    const d = distinctionItem.system;
    if (d.origin?.name) originFeatures.push({ name: d.origin.name, source: `Distinction: ${distinctionItem.name}`, text: d.origin.text });
  }
  return originFeatures;
}

/**
 * V6 Deathless Nature (design/v6-revision-delta.md §2.3, §4.1): "your Death Track ends at 7
 * instead of 5." The single seam every Death Track cap in the module reads through — rather than
 * hardcoding a "species name === Deathless" string comparison at each of the five call sites the
 * delta report found (actor-combatant.mjs's schema max, combat.mjs's turn-start advance,
 * actor-sheet.mjs's overflow-Wound branch, manifestation.mjs's applyManifestationDefeat, and both
 * sheets' deathTrackPips), this is computed once — by EssenceCombatantData#prepareDerivedData,
 * which calls it — and every other site reads the resulting `system.deathTrackMax` instead.
 * Species identity is checked the same way deriveOriginFeatures above resolves a speciesItem (by
 * `type === "species"` on the actor's own items), matching this species Item's `name` rather than
 * its Nature's name, since "Deathless" is both the species and (per origin-data.json) its Nature's
 * name prefix — the species name is the more stable identifier of the two.
 * @param {Item|null} speciesItem - the actor's owned Species Item, or null/undefined
 * @returns {number} 7 if Deathless, otherwise the normal 5
 */
export function deriveDeathTrackMax(speciesItem) {
  return speciesItem?.name === "Deathless" ? 7 : 5;
}
