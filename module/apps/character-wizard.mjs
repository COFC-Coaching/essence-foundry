import { EXPERTISE_DATABASE } from "../data/expertise-database.mjs";
import { deriveOriginFeatures } from "../data/origin-features.mjs";
import { setOriginItem, clearOriginItem } from "../data/origin-select.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { DocumentSheetV2 } = foundry.applications.api;

const ATTRIBUTES = ["might", "grace", "vigor", "intellect", "acuity", "resolve", "presence", "adaptability", "anima"];
const SKILLS = ["prowess", "ballistics", "gestalt", "cunning", "magecraft", "psionics", "leadership", "ritualism", "calling"];
const SKILL_GATE = { gestalt: "Gifted", magecraft: "Arcanist", psionics: "Psyker", ritualism: "Invoker", calling: "Summoner" };

/** part-ii-character-creation.md § Assigning Attributes / Assigning Combat Skill Points / Non-Combat Skills. */
const ATTRIBUTE_POOL = 7;
const ATTRIBUTE_MAX = 3;
const SKILL_POOL = 5;
const SKILL_MAX_AT_CREATION = 2;
const EXPERTISE_COUNT = 4;
const NONCOMBAT_POOL = 5;
const NONCOMBAT_MAX = 2;
const CARD_LIMIT = 10;

/** part-iv-combat.md § Basic Combat Cards — identified by an empty system.style (no Combat Style tie). */
function isBasicCard(cardSystem) {
  return !cardSystem.style;
}

const STEPS = [
  "Concept", "Identity", "Attributes", "Wounds", "Combat Skills",
  "Influence", "Non-Combat", "Passive Features", "Equipment", "Finalize"
];

function pips(value, max = 5) {
  return Array.from({ length: max }, (_, i) => i < value);
}

/**
 * Walks the same 10 steps as the web app's character-builder.tsx (Concept, Identity, Attributes,
 * Wounds, Combat Skills, Influence, Non-Combat, Passive Features, Equipment, Finalize), writing
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
      selectOrigin: EssenceCharacterWizard.#onSelectOrigin,
      clearOrigin: EssenceCharacterWizard.#onClearOrigin,
      adjustAttribute: EssenceCharacterWizard.#onAdjustAttribute,
      adjustSkill: EssenceCharacterWizard.#onAdjustSkill,
      toggleExpertise: EssenceCharacterWizard.#onToggleExpertise,
      grantBasicCards: EssenceCharacterWizard.#onGrantBasicCards,
      toggleCard: EssenceCharacterWizard.#onToggleCard,
      toggleTempInfluence: EssenceCharacterWizard.#onToggleTempInfluence,
      toggleCoreInfluence: EssenceCharacterWizard.#onToggleCoreInfluence,
      addNonCombatSkill: EssenceCharacterWizard.#onAddNonCombatSkill,
      deleteNonCombatSkill: EssenceCharacterWizard.#onDeleteNonCombatSkill,
      adjustNonCombatRating: EssenceCharacterWizard.#onAdjustNonCombatRating,
      addPassiveFeature: EssenceCharacterWizard.#onAddPassiveFeature,
      deletePassiveFeature: EssenceCharacterWizard.#onDeletePassiveFeature,
      toggleEquipment: EssenceCharacterWizard.#onToggleEquipment,
      previewItem: EssenceCharacterWizard.#onPreviewItem
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/wizard/wizard.hbs" }
  };

  #step = 0;
  #cardSearch = "";
  #cardTypeFilter = "all";
  #cardSkillFilter = "all";
  #cardSort = "rank";
  #equipmentSearch = "";
  #refocusSearch = null;

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
    this.#wireSearch("cards", (v) => { this.#cardSearch = v; });
    this.#wireSearch("equipment", (v) => { this.#equipmentSearch = v; });
    this.#wireSelect("cardType", (v) => { this.#cardTypeFilter = v; });
    this.#wireSelect("cardSkill", (v) => { this.#cardSkillFilter = v; });
    this.#wireSelect("cardSort", (v) => { this.#cardSort = v; });
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
    context.step = this.#step;
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
      case 4: await this.#prepareCombatSkills(context, distinctionItem); break;
      case 5: context.temporaryInfluencePips = pips(system.playState.currentTemporaryInfluence, system.temporaryInfluence); context.coreInfluencePips = system.coreInfluence; break;
      case 6: this.#prepareNonCombat(context); break;
      case 7: context.originFeatures = deriveOriginFeatures({ speciesItem, heritageItem, distinctionItem }); break;
      case 8: await this.#prepareEquipment(context); break;
      case 9: this.#prepareFinalize(context, speciesItem, heritageItem, distinctionItem); break;
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
  }

  #prepareAttributes(context) {
    const system = context.system;
    const spent = ATTRIBUTES.reduce((sum, key) => sum + (system[key] - 1), 0);
    context.attributePool = ATTRIBUTE_POOL;
    context.attributeSpent = spent;
    context.attributeRemaining = ATTRIBUTE_POOL - spent;
    context.attributes = ATTRIBUTES.map((key) => ({ key, label: key, value: system[key] }));
  }

  async #prepareCombatSkills(context, distinctionItem) {
    const system = context.system;
    const spent = SKILLS.reduce((sum, key) => sum + system[key], 0);
    context.skillPool = SKILL_POOL;
    context.skillSpent = spent;
    context.skillRemaining = SKILL_POOL - spent;
    context.skills = SKILLS.map((key) => {
      const gateDistinction = SKILL_GATE[key];
      const gateOpen = !gateDistinction || distinctionItem?.system.unlocks === key;
      return { key, label: key, value: system[key], gateDistinction, gateOpen };
    });

    context.expertiseCount = EXPERTISE_COUNT;
    context.expertiseSpent = system.expertises.length;
    context.eligibleSkills = SKILLS.filter((key) => system[key] >= 1);
    context.expertisesBySkill = context.eligibleSkills.map((key) => ({
      key,
      options: (EXPERTISE_DATABASE[key] || []).map((name) => ({
        name,
        chosen: system.expertises.some((e) => e.skill === key && e.name === name)
      }))
    }));

    const ownedCards = this.document.items.filter((i) => i.type === "action-card" || i.type === "reaction-card");
    context.ownedActionCards = ownedCards.filter((i) => i.type === "action-card" && !isBasicCard(i.system));
    context.ownedReactionCards = ownedCards.filter((i) => i.type === "reaction-card" && !isBasicCard(i.system));
    context.ownedBasicCards = ownedCards.filter((i) => isBasicCard(i.system));
    context.cardCount = context.ownedActionCards.length + context.ownedReactionCards.length;
    context.cardLimit = CARD_LIMIT;

    const [actionPack, reactionPack] = await Promise.all([
      game.packs.get("essence-system.action-cards")?.getDocuments() ?? [],
      game.packs.get("essence-system.reaction-cards")?.getDocuments() ?? []
    ]);
    const ownedNames = new Set(ownedCards.map((i) => i.name));
    const search = this.#cardSearch.trim().toLowerCase();

    const qualifies = (cardSystem) => {
      const skill = (cardSystem.skill || "").toLowerCase();
      if (!skill) return true;
      const gateDistinction = SKILL_GATE[skill];
      if (gateDistinction && distinctionItem?.system.unlocks !== skill) return false;
      const rank = system[skill] ?? 0;
      if ((Number(cardSystem.rank) || 0) > 0 && rank < 1) return false;
      const required = (cardSystem.expertises || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!required.length) return true;
      const have = system.expertises.filter((e) => e.skill === skill).map((e) => e.name);
      const matched = required.filter((e) => have.includes(e)).length;
      // schema only defines "any" (>=1 of the listed) and "any2" (>=2) — there's no "all".
      return matched >= (cardSystem.expertisesMode === "any2" ? 2 : 1);
    };

    const toBrowserEntry = (type) => (doc) =>
      ({ id: doc.id, uuid: doc.uuid, name: doc.name, system: doc.system, type, pack: `essence-system.${type}s` });

    let combined = [
      ...actionPack.filter((d) => !isBasicCard(d.system) && !ownedNames.has(d.name) && qualifies(d.system)).map(toBrowserEntry("action-card")),
      ...reactionPack.filter((d) => !isBasicCard(d.system) && !ownedNames.has(d.name) && qualifies(d.system)).map(toBrowserEntry("reaction-card"))
    ];

    if (search) combined = combined.filter((c) => c.name.toLowerCase().includes(search));
    if (this.#cardTypeFilter !== "all") combined = combined.filter((c) => c.type === this.#cardTypeFilter);
    if (this.#cardSkillFilter !== "all") combined = combined.filter((c) => (c.system.skill || "").toLowerCase() === this.#cardSkillFilter);

    const sorters = {
      rank: (a, b) => a.system.rank - b.system.rank || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      skill: (a, b) => (a.system.skill || "").localeCompare(b.system.skill || "") || a.name.localeCompare(b.name)
    };
    combined.sort(sorters[this.#cardSort] ?? sorters.rank);

    context.browsableCards = combined;
    context.cardSearch = this.#cardSearch;
    context.cardTypeFilter = this.#cardTypeFilter;
    context.cardSkillFilter = this.#cardSkillFilter;
    context.cardSort = this.#cardSort;
    context.cardSkillOptions = SKILLS;
    context.missingBasicCount = 7 - context.ownedBasicCards.length;
  }

  #prepareNonCombat(context) {
    const system = context.system;
    const spent = system.nonCombatSkills.reduce((sum, s) => sum + (s.rating || 0), 0);
    context.nonCombatPool = NONCOMBAT_POOL;
    context.nonCombatSpent = spent;
    context.nonCombatRemaining = NONCOMBAT_POOL - spent;
    context.nonCombatEntries = system.nonCombatSkills.map((s, i) => ({ ...s, i }));
  }

  async #prepareEquipment(context) {
    const system = context.system;
    const owned = this.document.items.filter((i) => i.type === "equipment");
    context.signatureItems = owned.filter((i) => i.system.slot === "signature").map((i) => ({ id: i.id, uuid: i.uuid, name: i.name, system: i.system }));
    context.signatureUsed = context.signatureItems.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
    context.signatureLimit = system.signatureEquipmentLimit;

    const pack = await (game.packs.get("essence-system.equipment")?.getDocuments() ?? []);
    const ownedNames = new Set(owned.map((i) => i.name));
    const search = this.#equipmentSearch.trim().toLowerCase();
    context.browsableEquipment = pack
      .filter((d) => !ownedNames.has(d.name))
      .filter((d) => !search || d.name.toLowerCase().includes(search))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((d) => ({ id: d.id, uuid: d.uuid, name: d.name, system: d.system }));
    context.equipmentSearch = this.#equipmentSearch;
  }

  #prepareFinalize(context, speciesItem, heritageItem, distinctionItem) {
    const system = context.system;
    const attrSpent = ATTRIBUTES.reduce((sum, key) => sum + (system[key] - 1), 0);
    const skillSpent = SKILLS.reduce((sum, key) => sum + system[key], 0);
    const ownedCards = this.document.items.filter((i) => i.type === "action-card" || i.type === "reaction-card");
    const nonBasicCardCount = ownedCards.filter((i) => !isBasicCard(i.system)).length;
    const ncSpent = system.nonCombatSkills.reduce((sum, s) => sum + (s.rating || 0), 0);
    const signature = this.document.items.filter((i) => i.type === "equipment" && i.system.slot === "signature");
    const signatureUsed = signature.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);

    context.checklist = [
      { label: "Species / Heritage / Distinction chosen", ok: !!(speciesItem && heritageItem && distinctionItem) },
      { label: `Attribute points spent (${attrSpent} / ${ATTRIBUTE_POOL})`, ok: attrSpent === ATTRIBUTE_POOL },
      { label: `Combat Skill points spent (${skillSpent} / ${SKILL_POOL})`, ok: skillSpent === SKILL_POOL },
      { label: `Expertises chosen (${system.expertises.length} / ${EXPERTISE_COUNT})`, ok: system.expertises.length === EXPERTISE_COUNT },
      { label: `Basic Combat Cards granted (${ownedCards.filter((i) => isBasicCard(i.system)).length} / 7)`, ok: ownedCards.filter((i) => isBasicCard(i.system)).length === 7 },
      { label: `Combat Cards chosen (${nonBasicCardCount} / ${CARD_LIMIT})`, ok: nonBasicCardCount <= CARD_LIMIT },
      { label: `Non-Combat Skill points spent (${ncSpent} / ${NONCOMBAT_POOL})`, ok: ncSpent === NONCOMBAT_POOL },
      { label: `Signature Equipment within limit (${signatureUsed} / ${system.signatureEquipmentLimit})`, ok: signatureUsed <= system.signatureEquipmentLimit }
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
    await this.document.update({ [`system.${key}`]: current + delta });
  }

  static async #onToggleExpertise(event, target) {
    const skill = target.dataset.skill;
    const name = target.dataset.name;
    const expertises = this.document.system.expertises.map((e) => ({ name: e.name, skill: e.skill }));
    const i = expertises.findIndex((e) => e.skill === skill && e.name === name);
    if (i !== -1) {
      expertises.splice(i, 1);
    } else {
      if (expertises.length >= EXPERTISE_COUNT) {
        ui.notifications.warn(`Already chosen ${EXPERTISE_COUNT} Expertises — remove one first.`);
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
    const nonBasicCount = this.document.items.filter((i) => (i.type === "action-card" || i.type === "reaction-card") && !isBasicCard(i.system)).length;
    if (nonBasicCount >= CARD_LIMIT) {
      ui.notifications.warn(`Already chosen ${CARD_LIMIT} Combat Cards — remove one first.`);
      return;
    }
    await this.document.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
  }

  static #onTogglePip(current, index) {
    return current === index + 1 ? index : index + 1;
  }

  static async #onToggleTempInfluence(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceCharacterWizard.#onTogglePip(this.document.system.playState.currentTemporaryInfluence, i);
    await this.document.update({ "system.playState.currentTemporaryInfluence": next });
  }

  static async #onToggleCoreInfluence(event, target) {
    const i = Number(target.dataset.index);
    const coreInfluence = this.document.system.coreInfluence.map((c) => ({ filled: c.filled }));
    coreInfluence[i].filled = !coreInfluence[i].filled;
    await this.document.update({ "system.coreInfluence": coreInfluence });
  }

  static async #onAddNonCombatSkill() {
    const nonCombatSkills = this.document.system.nonCombatSkills.map((s) => ({ ...s }));
    nonCombatSkills.push({ name: "", rating: 0 });
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
    const spent = nonCombatSkills.reduce((sum, s) => sum + (s.rating || 0), 0);
    const current = nonCombatSkills[i].rating || 0;
    if (delta > 0 && (current >= NONCOMBAT_MAX || spent >= NONCOMBAT_POOL)) return;
    if (delta < 0 && current <= 0) return;
    nonCombatSkills[i].rating = current + delta;
    await this.document.update({ "system.nonCombatSkills": nonCombatSkills });
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

  static async #onToggleEquipment(event, target) {
    const existing = this.document.items.get(target.dataset.itemId);
    if (existing) {
      await existing.delete();
      return;
    }
    const pack = game.packs.get(target.dataset.pack);
    const sourceItem = await pack?.getDocument(target.dataset.id);
    if (!sourceItem) return;
    const owned = this.document.items.filter((i) => i.type === "equipment" && i.system.slot === "signature");
    const used = owned.reduce((sum, i) => sum + (i.system.slotCost || 1), 0);
    const cost = sourceItem.system.slotCost || 1;
    if (used + cost > this.document.system.signatureEquipmentLimit) {
      ui.notifications.warn("Adding this would exceed your Signature Equipment Limit.");
      return;
    }
    const data = sourceItem.toObject();
    data.system.slot = "signature";
    await this.document.createEmbeddedDocuments("Item", [data]);
  }
}
