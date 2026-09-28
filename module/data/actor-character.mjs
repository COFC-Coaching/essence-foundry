import EssenceCombatantData from "./actor-combatant.mjs";
import { recordRepair } from "./migration.mjs";
import { SEVERITY_BY_INDEX } from "../utils.mjs";

const { fields } = foundry.data;

/** Adds the player-only fluff (Concept, Career, Non-Combat Skills, etc.) on top of the combat
 * fields every combatant shares — see actor-combatant.mjs. */
const CONNECTION_TIER_MIN = 1;
const CONNECTION_TIER_MAX = 5;

export default class EssenceCharacterData extends EssenceCombatantData {
  /**
   * A character always has five Core Wound spaces and five Core Influence spaces: Light, Light,
   * Serious, Serious, Critical (Doc L914, L920). A world was found holding a character with only
   * two Core Wound spaces (0.18.7), which the sheet then drew as two boxes and the Wound math
   * could never fill past. The cause could not be traced, so the repair does not depend on it:
   * a short track is padded back to five as the actor loads. Nothing is ever removed, so a marked
   * Wound or Influence space keeps its place. Adversaries are excluded on purpose: their track is
   * sized by Grade (actor-adversary.mjs).
   */
  static migrateData(source) {
    source = super.migrateData(source);
    for (const key of ["coreWounds", "coreInfluence"]) {
      const track = source?.[key];
      if (!Array.isArray(track) || track.length >= SEVERITY_BY_INDEX.length) continue;
      const from = track.length;
      const blank = key === "coreWounds"
        ? { filled: false, domain: "", severity: "", condition: "" }
        : { filled: false, severity: "", condition: "" };
      while (track.length < SEVERITY_BY_INDEX.length) track.push({ ...blank });
      recordRepair(source, { path: key, from: `${from} spaces`, to: `${SEVERITY_BY_INDEX.length} spaces`, kind: "restored" });
    }
    // 0.18.9: a Connection's free-text `scope` became a 1-5 `tier`. A number in the old text
    // ("2", "Tier 3") becomes the Tier; any other words are kept by appending them to the Area of
    // Involvement, which now describes what the ally can do for you, so nothing typed is lost.
    if (Array.isArray(source?.connections)) {
      source.connections.forEach((c, i) => {
        if (!c || typeof c !== "object" || !("scope" in c)) return;
        const scope = String(c.scope ?? "").trim();
        delete c.scope;
        if (c.tier !== undefined && c.tier !== null) return;
        const n = Number(scope.match(/\d+/)?.[0]);
        c.tier = Number.isFinite(n) ? Math.min(CONNECTION_TIER_MAX, Math.max(CONNECTION_TIER_MIN, n)) : CONNECTION_TIER_MIN;
        const words = scope.replace(/^\s*(tier|t)?\s*\d+\s*[:\-–—,.]?\s*/i, "").trim();
        if (words) c.area = c.area ? `${c.area} (${words})` : words;
        if (scope) recordRepair(source, { path: `connections.${i}.scope`, from: scope, to: `Tier ${c.tier}`, kind: "restored" });
      });
    }
    return source;
  }

  static defineSchema() {
    return {
      ...super.defineSchema(),

      // Identity
      concept: new fields.StringField({ initial: "" }),
      notes: new fields.HTMLField({ initial: "" }),
      backstory: new fields.HTMLField({ initial: "" }),
      appearance: new fields.HTMLField({ initial: "" }),
      personality: new fields.HTMLField({ initial: "" }),
      pronouns: new fields.StringField({ initial: "" }),
      age: new fields.StringField({ initial: "" }),
      playerName: new fields.StringField({ initial: "" }),
      career: new fields.StringField({ initial: "" }),
      keyAspects: new fields.ArrayField(new fields.StringField(), { initial: ["", "", ""] }),
      // v0.6 Part II "Languages" (Doc L1133): one primary language plus permanent Acuity additional
      // ones. Free text, since "the Campaign defines its languages and dialects; there is no
      // universal list". The sheet shows the allowance (languageCount, actor-combatant.mjs) beside it.
      languages: new fields.StringField({ initial: "" }),
      // Explicit Skill Point grants on top of 5 + Intellect (Doc L815, "plus any explicit grants").
      // Entered by hand from the granting feature's text; nothing derives it.
      skillPointBonus: new fields.NumberField({ required: true, integer: true, initial: 0, min: 0 }),
      // v0.6 Part II "Connections" (Doc L1155): up to permanent Presence dependable allies, each with
      // "a name, an area of involvement, and a relationship to you". `tier` (1-5) is the Tier of
      // the ally's help, agreed with the GM (Doc L2608); it replaced the free-text `scope` in
      // 0.18.9 (see migrateData). Relationships gained through play are unrestricted, so the sheet
      // warns past the allowance rather than blocking (L7832).
      connections: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        area: new fields.StringField({ initial: "" }),
        relationship: new fields.StringField({ initial: "" }),
        tier: new fields.NumberField({ required: true, integer: true, initial: CONNECTION_TIER_MIN, min: CONNECTION_TIER_MIN, max: CONNECTION_TIER_MAX })
      })),
      nonCombatSkills: new fields.ArrayField(new fields.SchemaField({
        name: new fields.StringField({ initial: "" }),
        rating: new fields.NumberField({ integer: true, initial: 0 }),
        // design/v6-revision-delta.md §3.4: "Gain one different Non-Combat Skill at Rank 1 per
        // point of permanent Intellect... Record which Skills came from Intellect; retraining
        // recalculates these grants." "intellect" marks a Rank-1 grant from the Intellect benefit
        // (made BEFORE spending the ordinary 5 Skill Points, per the book); "" (default) is an
        // ordinary player-picked entry paid from that pool. Retraining logic itself isn't built yet
        // — this tag exists so a future retraining pass can recompute Intellect grants without
        // repeatedly harvesting them, per the book's own explicit caution.
        source: new fields.StringField({ initial: "", blank: true, choices: ["", "intellect"] })
      }))
    };
  }
}
