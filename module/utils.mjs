/** "might" -> "Might". Attribute/skill keys are stored lowercase; every player-facing label built from one needs this. */
export function capitalize(str) {
  return str ? str[0].toUpperCase() + str.slice(1) : str;
}

/**
 * A title font-size (px) that shrinks as `text` gets longer, so a long item name doesn't overlap
 * a fixed-width sibling button next to it (e.g. a Card's name field next to its Edit/View toggle)
 * instead of just clipping or overflowing at a fixed size. Purely length-based — cheap and good
 * enough for a name field, not a substitute for actually measuring rendered text width.
 */
export function fitTitleSize(text, { max = 24, min = 14, startAt = 10, rate = 0.7 } = {}) {
  const len = (text || "").length;
  if (len <= startAt) return max;
  return Math.max(min, Math.round(max - (len - startAt) * rate));
}

/** A card's Domain determines which resource pool its Cost is paid from — see the Domain/
 *  Resource/Defense grouping used throughout the sheet (actor-sheet.mjs's DOMAINS constant). */
const DOMAIN_RESOURCE = { physical: "Stamina", mental: "Focus", spiritual: "Mana" };
export function domainResource(domain) {
  return DOMAIN_RESOURCE[domain] ?? "";
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
