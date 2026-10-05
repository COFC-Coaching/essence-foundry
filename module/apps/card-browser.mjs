import { SUBTYPE_DATABASE } from "../data/expertise-database.mjs";
import { capitalize, hasMastery } from "../utils.mjs";

const SKILLS = ["prowess", "ballistics", "gestalt", "cunning", "magecraft", "psionics", "leadership", "ritualism", "calling"];

/**
 * The "Qualifying Cards" browser shared by the Character Wizard and the Monster Wizard (Shane,
 * 2026-10-04): search, Type / Style / Subtype / Expertise / Sort filters, and one row per card.
 * The markup is templates/wizard/parts/card-browser.hbs; this class holds the filter state (plain
 * display state, never document data), wires the controls after each render, and turns the list
 * of qualifying pack documents into the template's context.
 *
 * Each wizard still decides WHICH cards qualify (that rule differs: a character needs Style Rank
 * and Expertises, an enemy only Style access) and passes them in; everything after that is here.
 */
export default class CardBrowser {
  search = "";
  type = "all";
  skill = "all";
  subtype = "all";
  expertise = "all";
  sort = "rank";
  #refocus = false;

  /** Call from the wizard's _onRender. `rerender` re-renders the wizard after a change. */
  wire(root, rerender) {
    const input = root.querySelector('[data-wizard-search="cards"]');
    if (input) {
      input.addEventListener("input", (e) => { this.search = e.currentTarget.value; this.#refocus = true; rerender(); });
      if (this.#refocus) {
        // A re-render replaces the input, so the caret has to be put back by hand.
        input.focus();
        input.setSelectionRange(input.value.length, input.value.length);
        this.#refocus = false;
      }
    }
    const selects = {
      cardType: (v) => { this.type = v; },
      // Subtype and Expertise are nested under Style, so changing Style resets both.
      cardSkill: (v) => { this.skill = v; this.subtype = "all"; this.expertise = "all"; },
      cardSubtype: (v) => { this.subtype = v; },
      cardExpertise: (v) => { this.expertise = v; },
      cardSort: (v) => { this.sort = v; }
    };
    for (const [key, setter] of Object.entries(selects)) {
      const select = root.querySelector(`[data-wizard-select="${key}"]`);
      select?.addEventListener("change", (e) => { setter(e.currentTarget.value); rerender(); });
    }
  }

  /**
   * @param {object} context - the wizard's render context (mutated)
   * @param {Array<{doc: Document, type: "action-card"|"reaction-card"}>} qualifying - pack docs that qualify
   * @param {Array<{name: string, skill: string}>} actorExpertises - the actor's chosen Expertises
   */
  prepare(context, qualifying, actorExpertises = []) {
    const known = actorExpertises.filter((e) => e.name);
    const listed = (cardSystem) => (cardSystem.expertises || "").split(",").map((s) => s.trim()).filter(Boolean);
    let cards = qualifying.map(({ doc, type }) => ({
      id: doc.id, uuid: doc.uuid, name: doc.name, system: doc.system, type, pack: `essence-system.${type}s`,
      isReaction: type === "reaction-card",
      skillLabel: capitalize(doc.system.skill || ""),
      expertiseList: listed(doc.system),
      // Mastery (Doc "Combat Card Ranks"): more of the listed Expertises than required = 1 free Surge.
      mastery: known.length > 0 && hasMastery(doc.system, known)
    }));

    const search = this.search.trim().toLowerCase();
    if (search) cards = cards.filter((c) => c.name.toLowerCase().includes(search));
    if (this.type !== "all") cards = cards.filter((c) => c.type === this.type);
    if (this.skill !== "all") cards = cards.filter((c) => (c.system.skill || "").toLowerCase() === this.skill);
    if (this.subtype !== "all") cards = cards.filter((c) => c.system.subtype === this.subtype);
    const masteryCount = cards.filter((c) => c.mastery).length;
    if (this.expertise === "mastery") cards = cards.filter((c) => c.mastery);
    else if (this.expertise !== "all") cards = cards.filter((c) => c.expertiseList.includes(this.expertise));

    const sorters = {
      rank: (a, b) => a.system.rank - b.system.rank || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      skill: (a, b) => (a.system.skill || "").localeCompare(b.system.skill || "") || a.name.localeCompare(b.name)
    };
    cards.sort(sorters[this.sort] ?? sorters.rank);

    // Expertise options: the actor's own chosen Expertises when it has any (a character, or an
    // Elite built with them), labelled with their Style unless a Style is already filtered.
    // Otherwise (a Mook or Normal has none) every Expertise listed on a qualifying card, so the
    // GM can still browse by the training a card represents.
    const inSkill = (skill) => this.skill === "all" || skill === this.skill;
    let options;
    if (known.length) {
      options = known.filter((e) => inSkill(e.skill))
        .map((e) => ({ value: e.name, label: this.skill === "all" ? `${e.name} (${capitalize(e.skill)})` : e.name }));
    } else {
      const seen = new Map();
      for (const { doc, type } of qualifying) {
        const skill = (doc.system.skill || "").toLowerCase();
        if (!inSkill(skill)) continue;
        for (const name of listed(doc.system)) if (!seen.has(name)) seen.set(name, { value: name, label: this.skill === "all" ? `${name} (${capitalize(skill)})` : name });
      }
      options = [...seen.values()];
    }
    options.sort((a, b) => a.label.localeCompare(b.label));

    context.browsableCards = cards;
    context.cardSearch = this.search;
    context.cardTypeFilter = this.type;
    context.cardSkillFilter = this.skill;
    context.cardSubtypeFilter = this.subtype;
    context.cardExpertiseFilter = this.expertise;
    context.cardSort = this.sort;
    context.cardSkillOptions = SKILLS;
    // Subtype options follow the filtered Style (each Style has its own fixed set); with no Style
    // chosen, the union, so browsing every "Opener" across Styles still works.
    context.cardSubtypeOptions = this.skill !== "all"
      ? (SUBTYPE_DATABASE[this.skill] ?? [])
      : [...new Set(Object.values(SUBTYPE_DATABASE).flat())].sort();
    context.cardExpertiseOptions = options;
    context.cardMasteryCount = masteryCount;
  }
}
