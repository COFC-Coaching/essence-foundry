/** "might" -> "Might". Attribute/skill keys are stored lowercase; every player-facing label built from one needs this. */
export function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

/** Strips tags for a plain-text preview; card body/rider fields are stored as HTMLFields. */
export function stripHtml(html) {
  return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * A one-line preview of what an Action/Reaction Card does, for card-list rows that otherwise show
 * only name + rank/skill/cost — there's room for it and it saves opening the card mid-turn just to
 * check what it does. Prefers the "Effect" section (every card that resolves something has one);
 * falls back to the first section with any text, then the flavor line.
 */
export function cardSummary(system, max = 140) {
  const sections = system.body ?? [];
  const effect = sections.find((s) => /effect/i.test(s.label ?? "") && stripHtml(s.html));
  const first = sections.find((s) => stripHtml(s.html));
  const text = stripHtml((effect ?? first)?.html) || stripHtml(system.flavor);
  if (!text) return "";
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
