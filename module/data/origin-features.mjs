/**
 * A Nature or Adaptation with a recorded sub-choice (see item-origin.mjs's subChoiceField()) needs
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
 * place that knows how a Nature/Adaptation/Legacy/Familiarity/origin trait becomes a feature row.
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
    for (const a of sp.adaptations) {
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
