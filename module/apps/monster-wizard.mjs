import { setOriginItem, clearOriginItem } from "../data/origin-select.mjs";
import { getRoleBudget } from "../data/monster-budgets.mjs";
import { capitalize } from "../utils.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { DocumentSheetV2 } = foundry.applications.api;

const ATTRIBUTES = ["might", "grace", "vigor", "intellect", "acuity", "resolve", "presence", "adaptability", "anima"];
const SKILLS = ["prowess", "ballistics", "gestalt", "cunning", "magecraft", "psionics", "leadership", "ritualism", "calling"];
const SKILL_GATE = { gestalt: "Gifted", magecraft: "Arcanist", psionics: "Psyker", ritualism: "Invoker", calling: "Summoner" };
const DOMAINS = [
  { key: "physical", label: "Physical", attrs: ["might", "grace", "vigor"], skills: ["prowess", "ballistics", "gestalt"] },
  { key: "mental", label: "Mental", attrs: ["intellect", "acuity", "resolve"], skills: ["cunning", "magecraft", "psionics"] },
  { key: "spiritual", label: "Spiritual", attrs: ["presence", "adaptability", "anima"], skills: ["leadership", "ritualism", "calling"] }
];

const STEPS = ["Concept", "Origin", "Attributes", "Combat Skills", "Wounds", "Combat Cards", "Equipment", "Finalize"];

/** Weighted-random point-buy: emphasis-domain keys are 3x as likely to receive the next point,
 *  so auto-generated stat blocks lean toward the chosen domain without ever excluding the rest. */
function distributePoints(pool, capFor, eligibleKeys, emphasisKeys) {
  const alloc = Object.fromEntries(eligibleKeys.map((k) => [k, 0]));
  let remaining = pool;
  let guard = pool * 20 + 50; // avoids an infinite loop if every key hits its cap early
  while (remaining > 0 && guard-- > 0) {
    const candidates = eligibleKeys.filter((k) => alloc[k] < capFor(k));
    if (!candidates.length) break;
    const weighted = candidates.flatMap((k) => Array(emphasisKeys.includes(k) ? 3 : 1).fill(k));
    const pick = weighted[Math.floor(Math.random() * weighted.length)];
    alloc[pick] += 1;
    remaining -= 1;
  }
  return alloc;
}

function pickRandom(arr, n) {
  const pool = [...arr];
  const picked = [];
  while (pool.length && picked.length < n) {
    const i = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(i, 1)[0]);
  }
  return picked;
}

/**
 * A GM-facing analog to the Character Wizard: same "write directly to the actor" approach, but
 * for the NPC's smaller surface (no Non-Combat, Influence, Expertises, or Passive Features — the
 * NPC sheet doesn't expose those either) plus an Auto-Generate step that fills the whole stat
 * block from Role + Tier using the homebrew budgets in monster-budgets.mjs, since the rules don't
 * define one. Every auto-filled value is a normal actor.update()/createEmbeddedDocuments() call
 * and stays fully hand-editable afterward, same as the Character Wizard.
 */
export default class EssenceMonsterWizard extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "wizard"],
    position: { width: 680, height: 760 },
    form: { submitOnChange: true },
    actions: {
      wizardGoTo: EssenceMonsterWizard.#onGoTo,
      wizardNext: EssenceMonsterWizard.#onNext,
      wizardBack: EssenceMonsterWizard.#onBack,
      wizardAccept: EssenceMonsterWizard.#onAccept,
      selectOrigin: EssenceMonsterWizard.#onSelectOrigin,
      clearOrigin: EssenceMonsterWizard.#onClearOrigin,
      setEmphasis: EssenceMonsterWizard.#onSetEmphasis,
      autoGenerate: EssenceMonsterWizard.#onAutoGenerate,
      rerollAttributes: EssenceMonsterWizard.#onRerollAttributes,
      rerollSkills: EssenceMonsterWizard.#onRerollSkills,
      rerollCards: EssenceMonsterWizard.#onRerollCards,
      rerollEquipment: EssenceMonsterWizard.#onRerollEquipment,
      adjustAttribute: EssenceMonsterWizard.#onAdjustAttribute,
      adjustSkill: EssenceMonsterWizard.#onAdjustSkill,
      toggleCard: EssenceMonsterWizard.#onToggleCard,
      toggleEquipment: EssenceMonsterWizard.#onToggleEquipment,
      previewItem: EssenceMonsterWizard.#onPreviewItem
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/wizard/monster-wizard.hbs" }
  };

  #step = 0;
  #emphasis = "balanced";
  #cardSearch = "";
  #equipmentSearch = "";
  #refocusSearch = null;

  constructor(actor, options = {}) {
    super({ ...options, document: actor });
  }

  get title() {
    return `Monster Creator: ${this.document.name}`;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#wireSearch("cards", (v) => { this.#cardSearch = v; });
    this.#wireSearch("equipment", (v) => { this.#equipmentSearch = v; });
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
    context.emphasis = this.#emphasis;
    context.budget = getRoleBudget(system.role);

    const speciesItem = actor.items.find((i) => i.type === "species");
    const distinctionItem = actor.items.find((i) => i.type === "distinction");
    context.speciesItem = speciesItem;
    context.distinctionItem = distinctionItem;

    switch (this.#step) {
      case 1: await this.#prepareOrigin(context); break;
      case 2: this.#prepareAttributes(context); break;
      case 3: this.#prepareCombatSkills(context, distinctionItem); break;
      case 5: await this.#prepareCards(context, distinctionItem); break;
      case 6: await this.#prepareEquipment(context); break;
      case 7: this.#prepareFinalize(context); break;
    }
    return context;
  }

  async #prepareOrigin(context) {
    const [species, distinctions] = await Promise.all([
      game.packs.get("essence-system.species")?.getDocuments() ?? [],
      game.packs.get("essence-system.distinctions")?.getDocuments() ?? []
    ]);
    context.speciesOptions = species.sort((a, b) => a.name.localeCompare(b.name));
    context.distinctionOptions = distinctions.sort((a, b) => a.name.localeCompare(b.name));
  }

  #prepareAttributes(context) {
    const system = context.system;
    const spent = ATTRIBUTES.reduce((sum, key) => sum + (system[key] - 1), 0);
    context.attributePool = context.budget.attributePool;
    context.attributeSpent = spent;
    context.attributeRemaining = context.budget.attributePool - spent;
    context.attributes = ATTRIBUTES.map((key) => ({ key, label: capitalize(key), value: system[key] }));
  }

  #prepareCombatSkills(context, distinctionItem) {
    const system = context.system;
    const spent = SKILLS.reduce((sum, key) => sum + system[key], 0);
    context.skillPool = context.budget.skillPool;
    context.skillSpent = spent;
    context.skillRemaining = context.budget.skillPool - spent;
    context.skills = SKILLS.map((key) => {
      const gateDistinction = SKILL_GATE[key];
      const gateOpen = !gateDistinction || distinctionItem?.system.unlocks === key;
      return { key, label: capitalize(key), value: system[key], gateDistinction, gateOpen };
    });
  }

  async #prepareCards(context, distinctionItem) {
    const system = context.system;
    const ownedCards = this.document.items.filter((i) => i.type === "action-card" || i.type === "reaction-card");
    context.ownedActionCards = ownedCards.filter((i) => i.type === "action-card");
    context.ownedReactionCards = ownedCards.filter((i) => i.type === "reaction-card");
    context.actionCardBudget = context.budget.actionCards;
    context.reactionCardBudget = context.budget.reactionCards;

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
      if ((Number(cardSystem.rank) || 0) > 0 && (system[skill] ?? 0) < 1) return false;
      return true;
    };

    const toBrowserEntry = (type) => (doc) =>
      ({ id: doc.id, uuid: doc.uuid, name: doc.name, system: doc.system, type, pack: `essence-system.${type}s` });

    let combined = [
      ...actionPack.filter((d) => !ownedNames.has(d.name) && qualifies(d.system)).map(toBrowserEntry("action-card")),
      ...reactionPack.filter((d) => !ownedNames.has(d.name) && qualifies(d.system)).map(toBrowserEntry("reaction-card"))
    ];
    if (search) combined = combined.filter((c) => c.name.toLowerCase().includes(search));
    combined.sort((a, b) => a.system.rank - b.system.rank || a.name.localeCompare(b.name));

    context.browsableCards = combined;
    context.cardSearch = this.#cardSearch;
  }

  async #prepareEquipment(context) {
    const owned = this.document.items.filter((i) => i.type === "equipment");
    context.equipmentItems = owned.map((i) => ({ id: i.id, uuid: i.uuid, name: i.name, system: i.system }));
    context.equipmentBudget = context.budget.equipmentCount;

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

  #prepareFinalize(context) {
    const system = context.system;
    context.resources = system.resources;
    context.defenses = system.defenses;
    context.baseCombatDice = system.baseCombatDice;
    context.cardCount = this.document.items.filter((i) => i.type === "action-card" || i.type === "reaction-card").length;
    context.equipmentCount = this.document.items.filter((i) => i.type === "equipment").length;
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

  static #onAccept() {
    this.close();
  }

  static #onSetEmphasis(event, target) {
    this.#emphasis = target.dataset.domain;
    this.render();
  }

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
    const budget = getRoleBudget(system.role);
    const current = system[key];
    const spent = ATTRIBUTES.reduce((sum, k) => sum + (system[k] - 1), 0);
    if (delta > 0 && (current >= budget.attributeMax || spent >= budget.attributePool)) return;
    if (delta < 0 && current <= 1) return;
    await this.document.update({ [`system.${key}`]: current + delta });
  }

  static async #onAdjustSkill(event, target) {
    const key = target.dataset.skill;
    const delta = Number(target.dataset.delta);
    const system = this.document.system;
    const budget = getRoleBudget(system.role);
    const current = system[key];
    const spent = SKILLS.reduce((sum, k) => sum + system[k], 0);
    const gateDistinction = SKILL_GATE[key];
    const distinctionItem = this.document.items.find((i) => i.type === "distinction");
    const gateOpen = !gateDistinction || distinctionItem?.system.unlocks === key;
    if (delta > 0 && (!gateOpen || current >= budget.skillMax || spent >= budget.skillPool)) return;
    if (delta < 0 && current <= 0) return;
    await this.document.update({ [`system.${key}`]: current + delta });
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
    const budget = getRoleBudget(this.document.system.role);
    const owned = this.document.items.filter((i) => i.type === "action-card" || i.type === "reaction-card");
    const isReaction = sourceItem.type === "reaction-card";
    const count = owned.filter((i) => i.type === sourceItem.type).length;
    const limit = isReaction ? budget.reactionCards : budget.actionCards;
    if (count >= limit) {
      ui.notifications.warn(`Already at this Role's ${isReaction ? "Reaction" : "Action"} Card budget (${limit}) — remove one first, or raise it by hand.`);
      return;
    }
    await this.document.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
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
    const budget = getRoleBudget(this.document.system.role);
    const count = this.document.items.filter((i) => i.type === "equipment").length;
    if (count >= budget.equipmentCount) {
      ui.notifications.warn(`Already at this Role's Equipment budget (${budget.equipmentCount}) — remove one first, or raise it by hand.`);
      return;
    }
    await this.document.createEmbeddedDocuments("Item", [sourceItem.toObject()]);
  }

  /** Re-rolls just the Attribute point-buy, weighted toward the chosen Domain emphasis. */
  static async #onRerollAttributes() {
    await this.#rollAttributes();
    this.render();
  }

  async #rollAttributes() {
    const system = this.document.system;
    const budget = getRoleBudget(system.role);
    const domain = DOMAINS.find((d) => d.key === this.#emphasis);
    const emphasisAttrs = domain?.attrs ?? [];
    const alloc = distributePoints(budget.attributePool, () => budget.attributeMax - 1, ATTRIBUTES, emphasisAttrs);
    const update = {};
    for (const key of ATTRIBUTES) update[`system.${key}`] = 1 + alloc[key];
    await this.document.update(update);
  }

  static async #onRerollSkills() {
    await this.#rollSkills();
    this.render();
  }

  async #rollSkills() {
    const system = this.document.system;
    const budget = getRoleBudget(system.role);
    const distinctionItem = this.document.items.find((i) => i.type === "distinction");
    const eligible = SKILLS.filter((k) => {
      const gate = SKILL_GATE[k];
      return !gate || distinctionItem?.system.unlocks === k;
    });
    const domain = DOMAINS.find((d) => d.key === this.#emphasis);
    const emphasisSkills = (domain?.skills ?? []).filter((k) => eligible.includes(k));
    const alloc = distributePoints(budget.skillPool, () => budget.skillMax, eligible, emphasisSkills);
    const update = {};
    for (const key of SKILLS) update[`system.${key}`] = alloc[key] ?? 0;
    await this.document.update(update);
  }

  /** Deletes and re-picks every Combat Card, favoring the Skills the Attribute/Skill roll landed
   *  on so a Nemesis built around Ritualism tends to get Ritualism cards, not a random spread. */
  static async #onRerollCards() {
    await this.#rollCards();
    this.render();
  }

  async #rollCards() {
    const document = this.document;
    const system = document.system;
    const budget = getRoleBudget(system.role);
    const distinctionItem = document.items.find((i) => i.type === "distinction");
    const existing = document.items.filter((i) => i.type === "action-card" || i.type === "reaction-card");
    if (existing.length) await document.deleteEmbeddedDocuments("Item", existing.map((i) => i.id));

    const topSkills = [...SKILLS].sort((a, b) => system[b] - system[a]).slice(0, 3);

    const qualifies = (cardSystem) => {
      const skill = (cardSystem.skill || "").toLowerCase();
      if (!skill) return true;
      const gate = SKILL_GATE[skill];
      if (gate && distinctionItem?.system.unlocks !== skill) return false;
      if ((Number(cardSystem.rank) || 0) > 0 && (system[skill] ?? 0) < 1) return false;
      return true;
    };

    const weightedPick = (pool, n) => {
      const remaining = [...pool];
      const picked = [];
      while (remaining.length && picked.length < n) {
        const weighted = remaining.flatMap((d) =>
          Array(topSkills.includes((d.system.skill || "").toLowerCase()) ? 3 : 1).fill(d)
        );
        const choice = weighted[Math.floor(Math.random() * weighted.length)];
        picked.push(choice);
        remaining.splice(remaining.indexOf(choice), 1);
      }
      return picked;
    };

    const [actionPack, reactionPack] = await Promise.all([
      game.packs.get("essence-system.action-cards")?.getDocuments() ?? [],
      game.packs.get("essence-system.reaction-cards")?.getDocuments() ?? []
    ]);
    const actionChoices = weightedPick(actionPack.filter((d) => qualifies(d.system)), budget.actionCards);
    const reactionChoices = weightedPick(reactionPack.filter((d) => qualifies(d.system)), budget.reactionCards);
    const toCreate = [...actionChoices, ...reactionChoices].map((d) => d.toObject());
    if (toCreate.length) await document.createEmbeddedDocuments("Item", toCreate);
  }

  static async #onRerollEquipment() {
    await this.#rollEquipment();
    this.render();
  }

  async #rollEquipment() {
    const document = this.document;
    const budget = getRoleBudget(document.system.role);
    const existing = document.items.filter((i) => i.type === "equipment");
    if (existing.length) await document.deleteEmbeddedDocuments("Item", existing.map((i) => i.id));

    const pack = await (game.packs.get("essence-system.equipment")?.getDocuments() ?? []);
    const choices = pickRandom(pack, budget.equipmentCount);
    if (choices.length) await document.createEmbeddedDocuments("Item", choices.map((d) => d.toObject()));
  }

  /** The one-button path: rolls Attributes and Skills (in that order, since Card selection reads
   *  the Skill ranks Attributes don't affect), sets Resilience/Temporary Wounds/Equipment Limit
   *  from the Role budget, then rolls Cards and Equipment. Safe to run more than once — each part
   *  simply overwrites whatever was there before. */
  static async #onAutoGenerate() {
    const document = this.document;
    const budget = getRoleBudget(document.system.role);
    await this.#rollAttributes();
    await this.#rollSkills();
    await document.update({
      "system.resilience": budget.resilienceBase + Math.max(0, document.system.tier || 0) * budget.resiliencePerTier,
      "system.temporaryWoundsAvailable": budget.temporaryWoundsAvailable,
      "system.signatureEquipmentLimit": budget.equipmentCount
    });
    await this.#rollCards();
    await this.#rollEquipment();
    ui.notifications.info(`${document.name}: stat block generated from the ${document.system.role || "Standard"} budget.`);
    this.render();
  }
}
