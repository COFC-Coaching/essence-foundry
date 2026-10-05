import { EXPERTISE_DATABASE } from "../data/expertise-database.mjs";
import CardBrowser from "./card-browser.mjs";
import { NATURAL_WEAPON_TRAITS, syncNaturalWeapons } from "../data/natural-weapons.mjs";
import { deriveOriginFeatures } from "../data/origin-features.mjs";
import { setOriginItem, clearOriginItem } from "../data/origin-select.mjs";
import { assembledComponentIds, capitalize, computeTierGate, computeSlotUsage, isDistinctionStyle, distinctionUnlocks, teamForActor, teamTierFor, componentTiers } from "../utils.mjs";
import { ITEM_GRANT_REGISTRY, deriveActiveGrants, equipmentMatchesGrant, tierQualifiesForGrant } from "../data/item-grants.mjs";
import { EQUIPMENT_CATEGORY_LABELS, MODULAR_EQUIPMENT_CATEGORIES } from "../data/item-card.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { DocumentSheetV2 } = foundry.applications.api;

const ATTRIBUTES = ["might", "grace", "vigor", "intellect", "acuity", "resolve", "presence", "adaptability", "anima"];
const SKILLS = ["prowess", "ballistics", "gestalt", "cunning", "magecraft", "psionics", "leadership", "ritualism", "calling"];
const SKILL_GATE = { gestalt: "Gifted", magecraft: "Arcanist", psionics: "Psyker", ritualism: "Invoker", calling: "Summoner" };

/** part-ii-character-creation.md § Assigning Attributes / Assigning Combat Style Points / Non-Combat Skills. */
const ATTRIBUTE_POOL = 7;
const ATTRIBUTE_MAX = 3;
const SKILL_POOL = 5;
const SKILL_MAX_AT_CREATION = 2;
/** v0.7 Doc (Shane, 2026-10-04): "Choose 5 Expertises from your accessible Styles." Was 4 through 0.20.1. */
const EXPERTISE_COUNT = 5;
const NONCOMBAT_POOL = 5;
const NONCOMBAT_MAX = 2;
/** Doc L815: "5 + permanent Intellect Skill Points, plus any explicit grants." */
function skillPointPool(system) {
  return NONCOMBAT_POOL + (system.intellect ?? 0) + (system.skillPointBonus ?? 0);
}
function skillPointsSpent(system) {
  return system.nonCombatSkills.reduce((sum, s) => sum + Math.max(0, s.rating || 0), 0);
}
const CARD_LIMIT = 10;

/**
 * part-iv-combat.md § Basic Combat Cards — identified by an empty system.style (no Combat Style
 * tie). Explicitly excludes `speciesGranted` cards (see isSpeciesCard below): those also carry an
 * empty `style`, but they're a Species Trait grant, not part of the universal Basic set — without
 * this exclusion, #onGrantBasicCards would hand every character every Species Combat Card
 * regardless of whether they actually have the matching Species Trait.
 */
function isBasicCard(cardSystem) {
  return !cardSystem.style && !cardSystem.speciesGranted;
}

/**
 * V6 §6.7 (plan, confirmed unchanged by design/v6-revision-delta.md §6): a Species Trait's unique
 * unranked Combat Card does NOT count against the 10 learned-card selection, same as a Basic card,
 * but tracked with its own explicit flag rather than folded into isBasicCard()'s empty-style check
 * — Species cards DO have thematic Style ties per the plan's own guidance, so "no Style" isn't a
 * reliable signal for them the way it is for the universal Basic set.
 */
function isSpeciesCard(cardSystem) {
  return !!cardSystem.speciesGranted;
}

/** The four Species Trait names that grant a Species Combat Card of the same name (see
 *  scripts/build-packs.mjs's SPECIES_CARDS) — checked in #onToggleTraitChosen. */
const SPECIES_CARD_TRAIT_NAMES = ["Shaper", "True Breath", "Ink Cloud", "Spore Cloud"];

/**
 * Per-Style Expertise cap, layered on top of the overall EXPERTISE_COUNT creation budget: the
 * Style's Rank, +1 for the Style tied to the character's Distinction (Character Options: "the
 * character's Expertise limit is one higher than the Style's Rank"). Shane, 2026-10-04: the v0.7
 * creation text's "one plus that Style's Rank" wording is NOT the rule — its own example (Mara,
 * Magecraft Rank 2, two Magecraft Expertises) is; the limit stays at Rank, only the count moved to
 * 5. The main Character sheet's own #onAddExpertise (actor-sheet.mjs) enforces no cap at all.
 * `keyCombatSkill` is item-origin.mjs's own field for "the Style associated with the Distinction."
 */
function expertiseLimitForSkill(system, skill, distinctionItem) {
  const rank = system[skill] ?? 0;
  const bonus = isDistinctionStyle(distinctionItem, skill) ? 1 : 0;
  return rank + bonus;
}

/**
 * Some Distinctions grant a bonus Expertise and/or bonus Combat Cards immediately at creation
 * (Athlete/Marksman/Strategist/Orator's "Gain one additional [Skill] Expertise and two additional
 * [Skill] Action Cards") — see item-origin.mjs's creationExpertiseBonus/creationActionCardBonus
 * schema fields. The five gated Distinctions (Gifted/Psyker/Arcanist/Invoker/Summoner) only grant
 * that bonus "if acquired later" per their own benefit text, so they read as 0 here at creation.
 */
function creationBonusFor(distinctionItem) {
  return {
    expertise: distinctionItem?.system.creationExpertiseBonus ?? 0,
    actionCards: distinctionItem?.system.creationActionCardBonus ?? 0
  };
}

/** Wounds and Influence are deliberately absent: both are play state, not creation choices. A new
 *  character starts at 0 Resilience, 0 Temporary Wounds, an empty Core Wound track and unmarked
 *  Influence, and every one of those fields is already editable on the character sheet once play
 *  starts — a creation step that only ever showed empty tracks was two clicks of nothing. */
const STEPS = [
  "Concept", "Identity", "Attributes", "Non-Combat",
  "Combat Styles", "Passive Features", "Equipment", "Finalize"
];

/**
 * Walks the creation steps (Concept, Identity, Attributes, Non-Combat, Combat Styles, Passive
 * Features, Equipment, Finalize — Career, Skills and Languages come before Styles, as in the
 * Doc's own Step 4 to Step 6 order — see STEPS for why Wounds and Influence aren't among them), writing
 * directly to an existing Actor rather than building a separate draft — every choice here is a
 * normal actor.update()/createEmbeddedDocuments() call, so closing and reopening the wizard loses
 * nothing and the main sheet already reflects every choice live.
 *
 * Extends DocumentSheetV2 (not a plain ApplicationV2) specifically so plain `name="system.x"`
 * inputs auto-save via Foundry's own form-submission handling, exactly like the main actor sheet
 * — only the point-buy/list-picker steps need custom action handlers.
 */
export default class EssenceCharacterWizard extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "wizard"],
    position: { width: 680, height: 760 },
    form: { submitOnChange: true },
    actions: {
      wizardGoTo: EssenceCharacterWizard.#onGoTo,
      wizardNext: EssenceCharacterWizard.#onNext,
      wizardBack: EssenceCharacterWizard.#onBack,
      wizardAccept: EssenceCharacterWizard.#onAccept,
      selectOrigin: EssenceCharacterWizard.#onSelectOrigin,
      clearOrigin: EssenceCharacterWizard.#onClearOrigin,
      adjustAttribute: EssenceCharacterWizard.#onAdjustAttribute,
      adjustSkill: EssenceCharacterWizard.#onAdjustSkill,
      toggleExpertise: EssenceCharacterWizard.#onToggleExpertise,
      grantBasicCards: EssenceCharacterWizard.#onGrantBasicCards,
      toggleCard: EssenceCharacterWizard.#onToggleCard,
      addNonCombatSkill: EssenceCharacterWizard.#onAddNonCombatSkill,
      addConnection: EssenceCharacterWizard.#onAddConnection,
      deleteConnection: EssenceCharacterWizard.#onDeleteConnection,
      deleteNonCombatSkill: EssenceCharacterWizard.#onDeleteNonCombatSkill,
      adjustNonCombatRating: EssenceCharacterWizard.#onAdjustNonCombatRating,
      addPassiveFeature: EssenceCharacterWizard.#onAddPassiveFeature,
      deletePassiveFeature: EssenceCharacterWizard.#onDeletePassiveFeature,
      toggleEquipment: EssenceCharacterWizard.#onToggleEquipment,
      buildEquipment: EssenceCharacterWizard.#onBuildEquipment,
      previewItem: EssenceCharacterWizard.#onPreviewItem,
      toggleTraitChosen: EssenceCharacterWizard.#onToggleTraitChosen,
      toggleSubChoiceOption: EssenceCharacterWizard.#onToggleSubChoiceOption,
      chooseGrantedItem: EssenceCharacterWizard.#onChooseGrantedItem
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/wizard/wizard.hbs" }
  };

  #step = 0;
  /** Qualifying Cards browser state and context (shared with the Monster Wizard). */
  #cards = new CardBrowser();
  #equipmentSearch = "";
  #equipmentCategoryFilter = "all";
  #equipmentTypeFilter = "equipment";
  #buildCategory = "weapon";
  #refocusSearch = null;
  /** Last known scrollTop of the current step's `.wizard-body` (the whole step's content area)
   *  and its inner `.wizard-scroll-list` (Qualifying Cards / Equipment Library), each keyed by
   *  step index — see #wireScrollList for why this exists. */
  #bodyScrollTop = {};
  #listScrollTop = {};

  constructor(actor, options = {}) {
    super({ ...options, document: actor });
  }

  get title() {
    return `Character Wizard: ${this.document.name}`;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Typing in a search box triggers a re-render (the filtered list isn't part of document
    // data, so nothing else refreshes it) — that replaces the input element, so focus and the
    // caret position have to be restored manually or every keystroke would kick focus out.
    this.#cards.wire(this.element, () => this.render());
    this.#wireSearch("equipment", (v) => { this.#equipmentSearch = v; });
    this.#wireSelect("equipmentCategory", (v) => { this.#equipmentCategoryFilter = v; });
    this.#wireSelect("equipmentType", (v) => { this.#equipmentTypeFilter = v; });
    this.#wireSelect("buildCategory", (v) => { this.#buildCategory = v; });
    this.#wireScrollList();
    this.#wireSubChoiceText();
  }

  /**
   * Free-text sub-choice inputs (Nature or an Trait's "type: free" sub-choice, e.g. Dragonkin's
   * Draconic Lineage) write to the embedded Species Item, not `this.document` (the Actor) — plain
   * submitOnChange only serializes fields under the wizard's own bound document, so these need a
   * manual "change" listener and an explicit speciesItem.update(), same reasoning as #wireSelect.
   */
  #wireSubChoiceText() {
    const speciesItem = this.document.items.find((i) => i.type === "species");
    if (!speciesItem) return;
    for (const el of this.element.querySelectorAll(".subchoice-free-text")) {
      el.addEventListener("change", async (event) => {
        const path = event.currentTarget.dataset.path; // "nature" or "traits.<i>"
        const value = event.currentTarget.value.trim();
        await speciesItem.update({ [`system.${path}.subChoice.selected`]: value ? [value] : [] });
      });
    }
  }

  /**
   * Adding/removing a Card or Equipment item (and changing any of the filters above) re-renders
   * the whole sheet, because `this.document` (the Actor) changed and Foundry's own DocumentSheetV2
   * auto-refreshes on that — same reason search focus needs manual restoration in #wireSearch. A
   * freshly-rendered element always starts at scrollTop 0, so without this, picking a card near
   * the bottom of a long Qualifying Cards / Equipment Library list (or scrolled partway down a
   * tall step like Combat Styles) yanks the view back to the very top on every single pick —
   * exactly the "jerking up" the user reported. There are two independent scroll containers to
   * restore: `.wizard-body` (the whole step's content area) and, on steps that have one, the
   * inner `.wizard-scroll-list`. Both are kept live via their own 'scroll' listener so the
   * remembered position is always current no matter which action (card toggle, equipment toggle,
   * filter change, search) triggers the next re-render.
   */
  #wireScrollList() {
    const body = this.element.querySelector(".wizard-body");
    if (body) {
      body.scrollTop = this.#bodyScrollTop[this.#step] ?? 0;
      body.addEventListener("scroll", () => { this.#bodyScrollTop[this.#step] = body.scrollTop; });
    }
    const list = this.element.querySelector(".wizard-scroll-list");
    if (list) {
      list.scrollTop = this.#listScrollTop[this.#step] ?? 0;
      list.addEventListener("scroll", () => { this.#listScrollTop[this.#step] = list.scrollTop; });
    }
  }

  #wireSearch(key, setter) {
    const input = this.element.querySelector(`[data-wizard-search="${key}"]`);
    if (!input) return;
    input.addEventListener("input", (e) => {
      setter(e.currentTarget.value);
      this.#refocusSearch = key;
      this.render();
    });
    if (this.#refocusSearch === key) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      this.#refocusSearch = null;
    }
  }

  /** Filter/sort dropdowns for the card browser — plain <select> elements, not data-action, since
   *  they need "change" not "click" and don't need focus restored across re-render like search. */
  #wireSelect(key, setter) {
    const select = this.element.querySelector(`[data-wizard-select="${key}"]`);
    if (!select) return;
    select.addEventListener("change", (e) => {
      setter(e.currentTarget.value);
      this.render();
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.document;
    const system = actor.system;
    context.actor = actor;
    context.system = system;
    context.steps = STEPS.map((name, i) => ({ name, i }));
    context.connectionTierOptions = [1, 2, 3, 4, 5].map((n) => ({ value: n, label: game.i18n.format("ESSENCE.Character.ConnectionTierOption", { n }) }));
    context.step = this.#step;
    // Team Tier is the Team's (actor-team.mjs), shown read-only; the GM sets it on the Team sheet.
    context.team = teamForActor(this.document);
    context.teamTier = teamTierFor(this.document);
    context.stepName = STEPS[this.#step];
    context.isFirst = this.#step === 0;
    context.isLast = this.#step === STEPS.length - 1;

    const speciesItem = actor.items.find((i) => i.type === "species");
    const heritageItem = actor.items.find((i) => i.type === "heritage");
    const distinctionItem = actor.items.find((i) => i.type === "distinction");
    context.speciesItem = speciesItem;
    context.heritageItem = heritageItem;
    context.distinctionItem = distinctionItem;

    switch (this.#step) {
      case 1: await this.#prepareIdentity(context, speciesItem, heritageItem, distinctionItem); break;
      case 2: this.#prepareAttributes(context); break;
      case 3: this.#prepareNonCombat(context); break;
      case 4: await this.#prepareCombatSkills(context, distinctionItem); break;
      case 5: context.originFeatures = deriveOriginFeatures({ speciesItem, heritageItem, distinctionItem }); break;
      case 6: await this.#prepareEquipment(context); break;
      case 7: this.#prepareFinalize(context, speciesItem, heritageItem, distinctionItem); break;
    }
    return context;
  }

  async #prepareIdentity(context, speciesItem, heritageItem, distinctionItem) {
    const [species, heritages, distinctions] = await Promise.all([
      game.packs.get("essence-system.species")?.getDocuments() ?? [],
      game.packs.get("essence-system.heritages")?.getDocuments() ?? [],
      game.packs.get("essence-system.distinctions")?.getDocuments() ?? []
    ]);
    context.speciesOptions = species.sort((a, b) => a.name.localeCompare(b.name));
    context.heritageOptions = heritages.sort((a, b) => a.name.localeCompare(b.name));
    context.distinctionOptions = distinctions.sort((a, b) => a.name.localeCompare(b.name));

    // Inline Trait picker (replaces the old "(open — choose Traits here)" link that sent
    // players to the Species Item's own GM-authoring sheet — see build-history). Trait rows
    // carry their own index so the toggle/sub-choice actions below know which array entry to write.
    // Fixed-list sub-choice options are precomputed with their checked/disabled state here rather
    // than via an "includes" Handlebars helper (this project has none registered, and core Foundry
    // doesn't provide one either — see essence.mjs's registerHelper calls).
    if (speciesItem) {
      const sp = speciesItem.system;
      const buildSubChoiceOptions = (subChoice) => {
        const selected = subChoice.selected ?? [];
        return (subChoice.options ?? []).map((opt) => ({
          value: opt,
          checked: selected.includes(opt),
          disabled: !selected.includes(opt) && selected.length >= subChoice.count
        }));
      };
      context.natureSubChoiceOptions = sp.nature.subChoice?.type === "fixed" ? buildSubChoiceOptions(sp.nature.subChoice) : [];
      context.traitRows = sp.traits.map((a, i) => ({
        ...a,
        i,
        subChoiceOptions: a.subChoice?.type === "fixed" ? buildSubChoiceOptions(a.subChoice) : []
      }));
      context.traitChosenCount = sp.traits.filter((a) => a.chosen).length;
      context.traitCap = sp.traitCount;
    }
  }

  #prepareAttributes(context) {
    const system = context.system;
    const spent = ATTRIBUTES.reduce((sum, key) => sum + (system[key] - 1), 0);
    context.attributePool = ATTRIBUTE_POOL;
    context.attributeSpent = spent;
    context.attributeRemaining = ATTRIBUTE_POOL - spent;
    context.attributes = ATTRIBUTES.map((key) => ({ key, label: capitalize(key), value: system[key] }));
  }

  async #prepareCombatSkills(context, distinctionItem) {
    const system = context.system;
    const spent = SKILLS.reduce((sum, key) => sum + system[key], 0);
    context.skillPool = SKILL_POOL;
    context.skillSpent = spent;
    context.skillRemaining = SKILL_POOL - spent;
    context.skills = SKILLS.map((key) => {
      const gateDistinction = SKILL_GATE[key];
      const gateOpen = !gateDistinction || distinctionUnlocks(distinctionItem ? [distinctionItem] : [], key);
      return { key, label: capitalize(key), value: system[key], gateDistinction, gateOpen };
    });

    const bonus = creationBonusFor(distinctionItem);
    context.expertiseCount = EXPERTISE_COUNT + bonus.expertise;
    context.expertiseSpent = system.expertises.length;
    // Doc L5592: "An Expertise granted directly by that Distinction may override the normal Rank 1
    // requirement for that associated Style", so the Distinction's own Style is offered at Rank 0.
    context.eligibleSkills = SKILLS.filter((key) => system[key] >= 1 || isDistinctionStyle(distinctionItem, key));
    context.expertisesBySkill = context.eligibleSkills.map((key) => ({
      key,
      options: (EXPERTISE_DATABASE[key] || []).map((name) => ({
        name,
        chosen: system.expertises.some((e) => e.skill === key && e.name === name)
      }))
    }));

    const ownedCards = this.document.items.filter((i) => i.type === "action-card" || i.type === "reaction-card");
    context.ownedActionCards = ownedCards.filter((i) => i.type === "action-card" && !isBasicCard(i.system) && !isSpeciesCard(i.system));
    context.ownedReactionCards = ownedCards.filter((i) => i.type === "reaction-card" && !isBasicCard(i.system) && !isSpeciesCard(i.system));
    context.ownedBasicCards = ownedCards.filter((i) => isBasicCard(i.system) && !isSpeciesCard(i.system));
    context.ownedSpeciesCards = ownedCards.filter((i) => isSpeciesCard(i.system));
    context.cardCount = context.ownedActionCards.length + context.ownedReactionCards.length;
    context.cardLimit = CARD_LIMIT + bonus.actionCards;

    const [actionPack, reactionPack] = await Promise.all([
      game.packs.get("essence-system.action-cards")?.getDocuments() ?? [],
      game.packs.get("essence-system.reaction-cards")?.getDocuments() ?? []
    ]);
    const ownedNames = new Set(ownedCards.map((i) => i.name));

    const qualifies = (cardSystem) => {
      const skill = (cardSystem.skill || "").toLowerCase();
      if (!skill) return true;
      const gateDistinction = SKILL_GATE[skill];
      if (gateDistinction && distinctionItem?.system.unlocks !== skill) return false;
      // A card's Rank can't exceed the character's Rank in its Style: "Increasing a Style Rank...
      // unlocks higher-Rank Combat Cards" (Doc L4860). This used to check only Style Rank >= 1,
      // so a Rank 2 card was offered at Style Rank 1. Rank 0 cards need only Style access (above).
      const rank = system[skill] ?? 0;
      if ((Number(cardSystem.rank) || 0) > rank) return false;
      const required = (cardSystem.expertises || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!required.length) return true;
      const have = system.expertises.filter((e) => e.skill === skill).map((e) => e.name);
      const matched = required.filter((e) => have.includes(e)).length;
      // schema only defines "any" (>=1 of the listed) and "any2" (>=2) — there's no "all".
      return matched >= (cardSystem.expertisesMode === "any2" ? 2 : 1);
    };
    // Species Combat Cards (speciesGranted) are excluded here too — they're a Species Trait grant,
    // not a pickable ranked selection; a character gains them automatically (or via a dedicated
    // grant flow), never by spending one of the 10 card picks in this browser.
    const pickable = (d) => !isBasicCard(d.system) && !isSpeciesCard(d.system) && !ownedNames.has(d.name) && qualifies(d.system);
    this.#cards.prepare(context, [
      ...actionPack.filter(pickable).map((doc) => ({ doc, type: "action-card" })),
      ...reactionPack.filter(pickable).map((doc) => ({ doc, type: "reaction-card" }))
    ], system.expertises);
    context.missingBasicCount = 7 - context.ownedBasicCards.length;
  }

  /** v0.6 Step 5 (Doc L815): one pool of 5 + permanent Intellect + explicit grants. Points buy Ranks
   *  in new or existing Skills, no Skill above Rank 2 at creation. The pre-0.9.0 "one free Rank-1
   *  Skill per Intellect" sub-step is gone; a stored `source: "intellect"` tag is just an ordinary
   *  entry now. */
  #prepareNonCombat(context) {
    const system = context.system;
    context.nonCombatPool = skillPointPool(system);
    context.nonCombatSpent = skillPointsSpent(system);
    context.nonCombatRemaining = context.nonCombatPool - context.nonCombatSpent;
    context.nonCombatEntries = system.nonCombatSkills.map((s, i) => ({ ...s, i }));
  }

  /** Equipment plus the three Component types — the Wizard's loadout lists and its Library both
   *  cover all four now, matching how the character sheet's own Inventory/Armory tables already
   *  fold Chassis/Fitting/Augment into the same three slots (actor-sheet.mjs). */
  static #EQUIPMENT_STEP_TYPES = ["equipment", "chassis", "fitting", "augment"];

  /** One row's grey subtitle, for both the owned loadout lists and the Library — an assembled
   *  Equipment item is identified by Category (it has no Tier of its own: "a complete modular item
   *  has no combined Tier", Doc L1793), a Component by what kind of part it is, for what category,
   *  at what Tier. */
  static #rowMeta(doc) {
    if (doc.type === "equipment") {
      return EQUIPMENT_CATEGORY_LABELS[doc.system.category] ?? capitalize(doc.system.category);
    }
    return [capitalize(doc.type), EQUIPMENT_CATEGORY_LABELS[doc.system.category], doc.system.tier ? `T${doc.system.tier}` : null]
      .filter(Boolean).join(" · ");
  }

  async #prepareEquipment(context) {
    const system = context.system;
    const owned = this.document.items.filter((i) => EssenceCharacterWizard.#EQUIPMENT_STEP_TYPES.includes(i.type));
    // Team Tier access (computeTierGate in utils.mjs). Soft, non-blocking flag only — the Wizard
    // still lets you add the item, same as the character sheet does.
    context.reach = system.effectiveReach ?? system.reach;
    const teamTier = teamTierFor(this.document);
    const equipmentRow = (i) => ({
      id: i.id,
      uuid: i.uuid,
      name: i.name,
      system: i.system,
      meta: EssenceCharacterWizard.#rowMeta(i),
      overTier: computeTierGate(i, teamTier, this.document.items).overTier
    });
    // Augments are never "carried" independently of what they're mounted in — same rule the
    // character sheet applies (actor-sheet.mjs), so they always list under Armory. A Component
    // already assembled into an equipment Item isn't listed at all: it's part of that item, not
    // separate gear, and it costs no capacity either (see assembledComponentIds in utils.mjs).
    const assembled = assembledComponentIds(this.document.items);
    const carried = owned.filter((i) => !assembled.has(i.id));
    const inSlot = (slot) => carried.filter((i) => (i.type === "augment" ? slot === "armory" : i.system.slot === slot));
    context.inventoryItems = inSlot("inventory").map(equipmentRow);
    // computeSlotUsage rather than a plain count: a loose Component is ½ a slot, and one already
    // assembled into an equipment Item is free (utils.mjs).
    context.inventoryUsed = computeSlotUsage(this.document.items, "inventory");
    context.inventoryLimit = system.inventoryLimit;
    // Armory (§ Armory and Inventory Capacity) — previously the Wizard only ever let a player add
    // to Inventory; there was no way to stock the Armory during character creation at all, so
    // every new character started with an empty one regardless of what they'd bought/found.
    context.armoryItems = inSlot("armory").map(equipmentRow);
    // Inclusive of the prepared Inventory — see EssenceActorSheet#_prepareContext for the rules
    // text this follows. The Wizard counted the armory bucket alone until 0.7.9, so it and the
    // character sheet reported different Armory figures for the same character.
    context.armoryStored = computeSlotUsage(this.document.items, "armory");
    context.armoryUsed = context.inventoryUsed + context.armoryStored;
    context.armoryLimit = system.armoryLimit;
    // Item Grants (Quartermaster's Due, Internal Compartment, ...) — see item-grants.mjs and
    // EssenceActorSheet#_prepareContext for the full reasoning.
    // Equipment only: a grant is satisfied by a whole item (`reachExceptionSource`), never by a
    // loose Component, and `owned` now carries Components too.
    context.itemGrants = deriveActiveGrants({ speciesItem: context.speciesItem, heritageItem: context.heritageItem }, owned.filter((i) => i.type === "equipment"));

    let pack = [];
    try {
      pack = await (game.packs.get("essence-system.equipment")?.getDocuments() ?? []);
    } catch (err) {
      console.warn("Essence | Could not read the equipment compendium for this user", err);
    }
    const ownedNames = new Set(owned.map((i) => `${i.type}:${i.name}`));
    const search = this.#equipmentSearch.trim().toLowerCase();
    // Chassis/Fitting/Augment share this pack as folders (see build-packs.mjs's
    // COMPONENT_TYPES_FOR_FOLDERS). The Library used to hard-exclude them and show `equipment`
    // only — which, after the modular catalog migration retired every flat weapon/armor/shield/
    // implement template, left a character-creating player with nothing to browse but Toolkits and
    // Consumable Kits. The Type filter below now covers all four, so a player can stock loose
    // Components too; Equipment stays the default view.
    context.browsableEquipment = pack
      .filter((d) => this.#equipmentTypeFilter === "all"
        ? EssenceCharacterWizard.#EQUIPMENT_STEP_TYPES.includes(d.type)
        : d.type === this.#equipmentTypeFilter)
      .filter((d) => !ownedNames.has(`${d.type}:${d.name}`))
      .filter((d) => !search || d.name.toLowerCase().includes(search))
      // Augments have no category at all (printed free-text compatibility instead), so a category
      // filter can't apply to them — they'd otherwise vanish entirely whenever one is set.
      .filter((d) => this.#equipmentCategoryFilter === "all" || d.type === "augment" || d.system.category === this.#equipmentCategoryFilter)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({
        id: d.id,
        uuid: d.uuid,
        name: d.name,
        system: d.system,
        // An Augment has no slot of its own, so it's only ever offered an Armory button.
        isAugment: d.type === "augment",
        meta: EssenceCharacterWizard.#rowMeta(d)
      }));
    context.equipmentTypeFilter = this.#equipmentTypeFilter;
    context.equipmentTypeOptions = EssenceCharacterWizard.#EQUIPMENT_STEP_TYPES.map((t) => ({ value: t, label: capitalize(t) }));
    // The five categories that are always an assembled Chassis + Fitting — what "build a new one"
    // can actually mean. Toolkits/Consumable Kits/Gear aren't modular, and are added from the
    // Library as whole pre-fab items instead.
    context.buildCategoryOptions = MODULAR_EQUIPMENT_CATEGORIES.map((value) => ({ value, label: EQUIPMENT_CATEGORY_LABELS[value] }));
    context.buildCategory = this.#buildCategory;
    context.equipmentSearch = this.#equipmentSearch;
    // Equipment's "group" is its Category (weapon/armor/shield/implement/toolkit/consumable-kit/
    // gear — see EssenceEquipmentData's schema in item-card.mjs). Offered as a fixed list rather
    // than derived from the pack's actual categories in use, so the filter's own option order/
    // labels stay stable even if a given category happens to have zero items in the compendium at
    // some point.
    context.equipmentCategoryFilter = this.#equipmentCategoryFilter;
    context.equipmentCategoryOptions = Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
  }

  #prepareFinalize(context, speciesItem, heritageItem, distinctionItem) {
    const system = context.system;
    const attrSpent = ATTRIBUTES.reduce((sum, key) => sum + (system[key] - 1), 0);
    const skillSpent = SKILLS.reduce((sum, key) => sum + system[key], 0);
    const ownedCards = this.document.items.filter((i) => i.type === "action-card" || i.type === "reaction-card");
    const nonBasicCardCount = ownedCards.filter((i) => !isBasicCard(i.system) && !isSpeciesCard(i.system)).length;
    const ncSpent = skillPointsSpent(system);
    const ncPool = skillPointPool(system);
    // Matches the Equipment step's own accounting — computeSlotUsage counts a loose Component as
    // ½ a slot and an assembled one as free, which a plain per-item count of `equipment` missed.
    const inventoryUsed = computeSlotUsage(this.document.items, "inventory");
    // Armory 8 includes the Inventory 4 (Doc, Part III): stored + prepared against the Armory limit.
    const armoryUsed = inventoryUsed + computeSlotUsage(this.document.items, "armory");
    const bonus = creationBonusFor(distinctionItem);
    const expertiseCount = EXPERTISE_COUNT + bonus.expertise;
    const cardLimit = CARD_LIMIT + bonus.actionCards;

    context.checklist = [
      { label: "Species / Heritage / Distinction chosen", ok: !!(speciesItem && heritageItem && distinctionItem) },
      { label: `Attribute points spent (${attrSpent} / ${ATTRIBUTE_POOL})`, ok: attrSpent === ATTRIBUTE_POOL },
      { label: `Combat Style points spent (${skillSpent} / ${SKILL_POOL})`, ok: skillSpent === SKILL_POOL },
      { label: `Expertises chosen (${system.expertises.length} / ${expertiseCount})`, ok: system.expertises.length === expertiseCount },
      { label: `Basic Combat Cards granted (${ownedCards.filter((i) => isBasicCard(i.system)).length} / 7)`, ok: ownedCards.filter((i) => isBasicCard(i.system)).length === 7 },
      { label: `Combat Cards chosen (${nonBasicCardCount} / ${cardLimit})`, ok: nonBasicCardCount <= cardLimit },
      { label: `Skill Points spent (${ncSpent} / ${ncPool})`, ok: ncSpent === ncPool },
      { label: `Connections within permanent Presence (${system.connections.length} / ${system.connectionLimit})`, ok: system.connections.length <= system.connectionLimit },
      { label: `Inventory Equipment within limit (${inventoryUsed} / ${system.inventoryLimit})`, ok: inventoryUsed <= system.inventoryLimit },
      { label: `Armory within limit (${armoryUsed} / ${system.armoryLimit})`, ok: armoryUsed <= system.armoryLimit }
    ];
    context.resources = system.resources;
    context.defenses = system.defenses;
    context.baseCombatDice = system.baseCombatDice;
  }

  static #onGoTo(event, target) {
    this.#step = Number(target.dataset.step);
    this.render();
  }

  static #onNext() {
    this.#step = Math.min(STEPS.length - 1, this.#step + 1);
    this.render();
  }

  static #onBack() {
    this.#step = Math.max(0, this.#step - 1);
    this.render();
  }

  /** Every choice up to here already saved directly to the actor (see class doc) — Accept isn't
   *  a commit, just the explicit "I'm done" that closes the wizard back to the main sheet. */
  static #onAccept() {
    this.close();
  }

  /** Opens the real Item sheet (compendium source or owned copy) so players can read a card's
   *  full text before deciding to add it, instead of judging it from a name + rank/skill tag. */
  static async #onPreviewItem(event, target) {
    const doc = await fromUuid(target.dataset.uuid);
    doc?.sheet.render(true);
  }

  static async #onSelectOrigin(event, target) {
    const pack = game.packs.get(target.dataset.pack);
    const sourceItem = await pack?.getDocument(target.dataset.id);
    if (sourceItem) await setOriginItem(this.document, sourceItem);
  }

  static async #onClearOrigin(event, target) {
    await clearOriginItem(this.document, target.dataset.type);
  }

  /**
   * Inline Trait checkbox, capped at `traitCount` (mirrors #onToggleExpertise's
   * capped-array shape). Writes the whole `traits` array back to the embedded Species Item —
   * same read-modify-write pattern as EssenceItemSheetBase#onAddArrayRow/#onDeleteArrayRow
   * (item-sheet.mjs), just targeting speciesItem instead of the Actor.
   */
  static async #onToggleTraitChosen(event, target) {
    const speciesItem = this.document.items.find((i) => i.type === "species");
    if (!speciesItem) return;
    const i = Number(target.dataset.index);
    const traits = speciesItem.system.traits.map((a) => foundry.utils.deepClone(a));
    const row = traits[i];
    if (!row) return;
    if (!row.chosen) {
      const chosenCount = traits.filter((a) => a.chosen).length;
      if (chosenCount >= speciesItem.system.traitCount) {
        ui.notifications.warn(game.i18n.format("ESSENCE.Notify.AlreadyChosenTraits", { count: speciesItem.system.traitCount, label: speciesItem.system.traitLabel }));
        return;
      }
    }
    row.chosen = !row.chosen;
    await speciesItem.update({ "system.traits": traits });
    // V6 §6.7 (plan): choosing one of the four Species Traits that grants a Species Combat Card
    // (Shaper/True Breath/Ink Cloud/Spore Cloud — see scripts/build-packs.mjs's SPECIES_CARDS)
    // auto-grants that Card the same way #onGrantBasicCards grants the universal Basic set;
    // un-choosing the Trait removes it again. Matched by exact name, same convention this file's
    // ITEM_GRANT_REGISTRY-adjacent code already uses elsewhere.
    if (SPECIES_CARD_TRAIT_NAMES.includes(row.name)) {
      await EssenceCharacterWizard.#syncSpeciesCombatCard(this.document, row.name, row.chosen);
    }
    // Same shape for a Trait that grants a natural weapon (Natural/Draconic Armament): the chosen
    // anatomy is a real weapon Item on the sheet — see natural-weapons.mjs.
    if (NATURAL_WEAPON_TRAITS[row.name]) await syncNaturalWeapons(this.document, speciesItem);
  }

  /** See #onToggleTraitChosen's doc comment above. */
  static async #syncSpeciesCombatCard(actor, name, shouldHave) {
    const owned = actor.items.find((i) => i.type === "action-card" && i.name === name && i.system.speciesGranted);
    if (shouldHave && !owned) {
      const pack = game.packs.get("essence-system.action-cards");
      const index = await pack?.getIndex();
      const entry = index?.find((e) => e.name === name);
      if (!entry) return;
      const doc = await pack.getDocument(entry._id);
      if (doc) await actor.createEmbeddedDocuments("Item", [doc.toObject()]);
    } else if (!shouldHave && owned) {
      await owned.delete();
    }
  }

  /**
   * Fixed-list sub-choice checkbox (e.g. Keen's three named Senses), shared between Nature and any
   * Trait via `data-scope` ("nature" | "trait") + `data-index` (trait rows only).
   * Capped at the sub-choice's own `count`, same disable-once-full convention as Combat Cards'
   * CARD_LIMIT and #onToggleTraitChosen above — this is a clean single-purpose picker, not a
   * combat action, so the brief calls for disabling further checkboxes rather than just warning.
   */
  static async #onToggleSubChoiceOption(event, target) {
    const speciesItem = this.document.items.find((i) => i.type === "species");
    if (!speciesItem) return;
    const option = target.dataset.option;

    const applySelection = (subChoice) => {
      const selected = [...(subChoice.selected ?? [])];
      const idx = selected.indexOf(option);
      if (idx !== -1) {
        selected.splice(idx, 1);
      } else {
        if (selected.length >= subChoice.count) {
          ui.notifications.warn(game.i18n.format("ESSENCE.Notify.AlreadyChosenSubChoice", { count: subChoice.count, label: subChoice.label || game.i18n.localize("ESSENCE.Notify.OptionsFallback") }));
          return null;
        }
        selected.push(option);
      }
      return selected;
    };

    if (target.dataset.scope === "nature") {
      const selected = applySelection(speciesItem.system.nature.subChoice);
      if (selected) await speciesItem.update({ "system.nature.subChoice.selected": selected });
    } else {
      const i = Number(target.dataset.index);
      const traits = speciesItem.system.traits.map((a) => foundry.utils.deepClone(a));
      const row = traits[i];
      if (!row) return;
      const selected = applySelection(row.subChoice);
      if (!selected) return;
      row.subChoice.selected = selected;
      await speciesItem.update({ "system.traits": traits });
      // Picking Claws vs Fangs renames the granted natural weapon Item (natural-weapons.mjs).
      if (NATURAL_WEAPON_TRAITS[row.name]) await syncNaturalWeapons(this.document, speciesItem);
    }
  }

  static async #onAdjustAttribute(event, target) {
    const key = target.dataset.attr;
    const delta = Number(target.dataset.delta);
    const system = this.document.system;
    const current = system[key];
    const spent = ATTRIBUTES.reduce((sum, k) => sum + (system[k] - 1), 0);
    if (delta > 0 && (current >= ATTRIBUTE_MAX || spent >= ATTRIBUTE_POOL)) return;
    if (delta < 0 && current <= 1) return;
    await this.document.update({ [`system.${key}`]: current + delta });
  }

  static async #onAdjustSkill(event, target) {
    const key = target.dataset.skill;
    const delta = Number(target.dataset.delta);
    const system = this.document.system;
    const current = system[key];
    const spent = SKILLS.reduce((sum, k) => sum + system[k], 0);
    const gateDistinction = SKILL_GATE[key];
    const distinctionItem = this.document.items.find((i) => i.type === "distinction");
    const gateOpen = !gateDistinction || distinctionItem?.system.unlocks === key;
    if (delta > 0 && (!gateOpen || current >= SKILL_MAX_AT_CREATION || spent >= SKILL_POOL)) return;
    if (delta < 0 && current <= 0) return;
    const newValue = current + delta;
    const updates = { [`system.${key}`]: newValue };
    // Dropping a Combat Style back to 0 un-eligibles it for Expertises (see #prepareCombatSkills'
    // eligibleSkills filter), but any Expertise the player already picked under it doesn't clear
    // itself — left alone it becomes an invisible entry that still counts against the Expertises
    // total (confirmed live: "EXPERTISES (5 / 4)" with only 4 actually visible/chosen anywhere),
    // silently blocking a legitimate pick elsewhere. Pruning it here keeps the count honest.
    if (newValue === 0) updates["system.expertises"] = system.expertises.filter((e) => e.skill !== key);
    await this.document.update(updates);
  }

  static async #onToggleExpertise(event, target) {
    const skill = target.dataset.skill;
    const name = target.dataset.name;
    const expertises = this.document.system.expertises.map((e) => ({ name: e.name, skill: e.skill }));
    const i = expertises.findIndex((e) => e.skill === skill && e.name === name);
    if (i !== -1) {
      expertises.splice(i, 1);
    } else {
      const distinctionItem = this.document.items.find((it) => it.type === "distinction");
      const expertiseCount = EXPERTISE_COUNT + creationBonusFor(distinctionItem).expertise;
      if (expertises.length >= expertiseCount) {
        ui.notifications.warn(game.i18n.format("ESSENCE.Notify.AlreadyChosenExpertises", { count: expertiseCount }));
        return;
      }
      // Per-Style Expertise limit (see expertiseLimitForSkill's own doc comment): the Style's
      // Rank, +1 if it's the Style tied to the character's Distinction.
      const styleLimit = expertiseLimitForSkill(this.document.system, skill, distinctionItem);
      const styleChosen = expertises.filter((e) => e.skill === skill).length;
      if (styleChosen >= styleLimit) {
        ui.notifications.warn(`${capitalize(skill)}'s Expertise limit is ${styleLimit} (its Rank${isDistinctionStyle(distinctionItem, skill) ? ", +1 for your Distinction" : ""}).`);
        return;
      }
      expertises.push({ name, skill });
    }
    await this.document.update({ "system.expertises": expertises });
  }

  static async #onGrantBasicCards() {
    const [actionPack, reactionPack] = await Promise.all([
      game.packs.get("essence-system.action-cards")?.getDocuments() ?? [],
      game.packs.get("essence-system.reaction-cards")?.getDocuments() ?? []
    ]);
    const owned = new Set(this.document.items.filter((i) => i.type === "action-card" || i.type === "reaction-card").map((i) => i.name));
    const missing = [...actionPack, ...reactionPack].filter((d) => isBasicCard(d.system) && !owned.has(d.name));
    if (!missing.length) return;
    await this.document.createEmbeddedDocuments("Item", missing.map((d) => d.toObject()));
  }

  static async #onToggleCard(event, target) {
    const existing = this.document.items.get(target.dataset.itemId);
    if (existing) {
      await existing.delete();
      return;
    }
    const pack = game.packs.get(target.dataset.pack);
    const sourceItem = await pack?.getDocument(target.dataset.id);
    if (!sourceItem) return;
    // Species cards don't use a learned-card selection (Doc L858), matching how the display and
    // Finalize already count; this check used to count them against the limit.
    const nonBasicCount = this.document.items.filter((i) => (i.type === "action-card" || i.type === "reaction-card") && !isBasicCard(i.system) && !isSpeciesCard(i.system)).length;
    const distinctionItem = this.document.items.find((it) => it.type === "distinction");
    const cardLimit = CARD_LIMIT + creationBonusFor(distinctionItem).actionCards;
    if (nonBasicCount >= cardLimit) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.AlreadyChosenCombatCards", { count: cardLimit }));
      return;
    }
    await this.document.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
  }

  static async #onAddNonCombatSkill() {
    const nonCombatSkills = this.document.system.nonCombatSkills.map((s) => ({ ...s }));
    nonCombatSkills.push({ name: "", rating: 0, source: "" });
    await this.document.update({ "system.nonCombatSkills": nonCombatSkills });
  }

  static async #onDeleteNonCombatSkill(event, target) {
    const i = Number(target.dataset.index);
    const nonCombatSkills = this.document.system.nonCombatSkills.map((s) => ({ ...s }));
    nonCombatSkills.splice(i, 1);
    await this.document.update({ "system.nonCombatSkills": nonCombatSkills });
  }

  static async #onAdjustNonCombatRating(event, target) {
    const i = Number(target.dataset.index);
    const delta = Number(target.dataset.delta);
    const nonCombatSkills = this.document.system.nonCombatSkills.map((s) => ({ ...s }));
    const row = nonCombatSkills[i];
    const spent = skillPointsSpent(this.document.system);
    const current = row.rating || 0;
    if (delta > 0 && (current >= NONCOMBAT_MAX || spent >= skillPointPool(this.document.system))) return;
    if (delta < 0 && current <= 0) return;
    row.rating = current + delta;
    await this.document.update({ "system.nonCombatSkills": nonCombatSkills });
  }

  static async #onAddConnection() {
    const connections = this.document.system.connections.map((c) => ({ ...c }));
    if (connections.length >= (this.document.system.connectionLimit ?? 0)) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Character.ConnectionsOverLimit", { n: this.document.system.connectionLimit }));
    }
    connections.push({ name: "", area: "", relationship: "", tier: 1 });
    await this.document.update({ "system.connections": connections });
  }

  static async #onDeleteConnection(event, target) {
    const i = Number(target.dataset.index);
    const connections = this.document.system.connections.map((c) => ({ ...c }));
    connections.splice(i, 1);
    await this.document.update({ "system.connections": connections });
  }

  static async #onAddPassiveFeature() {
    const passiveFeatures = this.document.system.passiveFeatures.map((f) => ({ ...f }));
    passiveFeatures.push({ name: "", source: "", text: "" });
    await this.document.update({ "system.passiveFeatures": passiveFeatures });
  }

  static async #onDeletePassiveFeature(event, target) {
    const i = Number(target.dataset.index);
    const passiveFeatures = this.document.system.passiveFeatures.map((f) => ({ ...f }));
    passiveFeatures.splice(i, 1);
    await this.document.update({ "system.passiveFeatures": passiveFeatures });
  }

  /** `data-slot` ("inventory" or "armory") picks which capacity this Library "+" button adds to —
   *  see the two separate buttons per row in wizard.hbs's Equipment Library list. Missing/unknown
   *  values default to "inventory" for backward compatibility with any other caller. Capacity is
   *  checked by #fitsInInventory below. */
  static async #onToggleEquipment(event, target) {
    const existing = this.document.items.get(target.dataset.itemId);
    if (existing) {
      await existing.delete();
      return;
    }
    const pack = game.packs.get(target.dataset.pack);
    const sourceItem = await pack?.getDocument(target.dataset.id);
    if (!sourceItem) return;
    const slot = target.dataset.slot === "armory" ? "armory" : "inventory";
    if (slot === "inventory" && !this.#fitsInInventory(EssenceCharacterWizard.#slotCostOf(sourceItem))) return;
    const data = sourceItem.toObject();
    delete data._id;
    delete data.folder;
    foundry.utils.setProperty(data, "_stats.compendiumSource", sourceItem.uuid);
    // An Augment has no slot of its own (it's never carried independently of what it's mounted
    // in) — its schema has no `slot` field at all, so writing one would just be dropped.
    if (data.system && sourceItem.type !== "augment") data.system.slot = slot;
    await this.document.createEmbeddedDocuments("Item", [data]);
  }

  /** What one more item of this kind costs against Inventory/Armory capacity — the same ½-slot
   *  Component / 0-slot Augment rule computeSlotUsage (utils.mjs) applies to what's already there. */
  static #slotCostOf(item) {
    if (item.type === "augment") return 0;
    if (item.type === "chassis" || item.type === "fitting") return 0.5;
    return item.system.slotCost || 1;
  }

  /** Warns and returns false when adding `cost` more slots would breach the Inventory limit. Only
   *  Inventory is hard-blocked here — Armory's over-limit handling is the Temporary-Influence
   *  spend on the actor sheet, not a Wizard-time refusal. */
  #fitsInInventory(cost) {
    const used = computeSlotUsage(this.document.items, "inventory");
    if (used + cost > this.document.system.inventoryLimit) {
      ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.ExceedsInventoryLimit"));
      return false;
    }
    return true;
  }

  /**
   * "Build New" — creates an empty modular equipment Item (Melee Weapon/Ranged Weapon/Armor/
   * Shield/Implement) in the chosen slot and opens its sheet so the player can assemble it from
   * the Chassis/Fitting catalog right there. Character creation previously had no way to make one
   * at all: the modular catalog migration retired every flat pre-fab weapon and armor template, so
   * the Library a player browses here holds only Toolkits and Consumable Kits, and building your
   * own gear meant finishing the Wizard first and then finding "+ Add Item" on the sheet.
   * `essence.mjs` force-sets isModular for these five categories on create, so the new Item lands
   * ready to assemble.
   */
  static async #onBuildEquipment(event, target) {
    const slot = target.dataset.slot === "armory" ? "armory" : "inventory";
    // Read from wizard state, not the DOM: #wireSelect re-renders on change, so by the time this
    // click lands the <select> element the player chose from has already been replaced.
    const category = this.#buildCategory;
    if (slot === "inventory" && !this.#fitsInInventory(1)) return;
    const name = game.i18n.format("ESSENCE.Wizard.NewEquipmentNamed", {
      label: EQUIPMENT_CATEGORY_LABELS[category] ?? capitalize(category)
    });
    const [created] = await this.document.createEmbeddedDocuments("Item", [{
      name,
      type: "equipment",
      img: "icons/svg/item-bag.svg",
      system: { slot, category }
    }]);
    created?.sheet.render(true);
  }

  /** See EssenceActorSheet#onChooseGrantedItem for the full reasoning — identical behavior here,
   *  just targeting this.document (the Actor being built) instead of this.actor: pulls eligible
   *  items from the character's own Equipment step choices, not the shared compendium. */
  static async #onChooseGrantedItem(event, target) {
    const sourceName = target.dataset.grantSource;
    const grant = ITEM_GRANT_REGISTRY[sourceName];
    if (!grant) return;

    const teamTier = teamTierFor(this.document);
    const owned = this.document.items.filter((i) => i.type === "equipment" && i.system.reachExceptionSource !== sourceName);
    const eligible = owned.filter((i) => equipmentMatchesGrant(i.system, grant) && tierQualifiesForGrant(i, grant, teamTier, this.document.items));
    if (!eligible.length) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoQualifyingEquipmentChoice", { source: sourceName }));
      return;
    }

    const chosenId = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Choose Item — ${sourceName}` },
        content: `<label>Item
          <select name="itemId">${eligible.map((i) => `<option value="${i.id}">${i.name}${(() => { const t = componentTiers(i, this.document.items); return t.length ? ` (Tier ${Math.max(...t)})` : ""; })()}</option>`).join("")}</select>
        </label>`,
        buttons: [{
          action: "choose",
          label: "Choose",
          default: true,
          callback: (ev, button) => button.form.elements.itemId.value
        }],
        submit: (result) => resolve(result ?? null)
      }).render(true);
    });
    if (!chosenId) return;

    const previous = this.document.items.filter((i) => i.type === "equipment" && i.system.reachExceptionSource === sourceName);
    for (const p of previous) await p.update({ "system.reachExceptionSource": "", "system.reachExceptionMargin": 0, "system.slotCost": 1 });

    const chosen = this.document.items.get(chosenId);
    await chosen.update({
      "system.slot": "inventory",
      "system.reachExceptionSource": sourceName,
      "system.reachExceptionMargin": grant.tierMargin ?? 0,
      "system.slotCost": grant.countsAgainstLimit ? 1 : 0
    });
  }
}
