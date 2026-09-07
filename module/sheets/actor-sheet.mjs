import { rollEssencePool } from "../dice/essence-roll.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const ATTRIBUTES = ["might", "grace", "vigor", "intellect", "acuity", "resolve", "presence", "adaptability", "anima"];
const SKILLS = ["prowess", "ballistics", "gestalt", "cunning", "magecraft", "psionics", "leadership", "ritualism", "calling"];
const PIP_MAX = 5;
const CORE_INFLUENCE_LABELS = ["L", "L", "S", "S", "C"];

const DOMAINS = [
  { key: "physical", label: "Physical", attrs: ["might", "grace", "vigor"], skills: ["prowess", "ballistics", "gestalt"], resource: "stamina", defense: "fortitude" },
  { key: "mental", label: "Mental", attrs: ["intellect", "acuity", "resolve"], skills: ["cunning", "magecraft", "psionics"], resource: "focus", defense: "composure" },
  { key: "spiritual", label: "Spiritual", attrs: ["presence", "adaptability", "anima"], skills: ["leadership", "ritualism", "calling"], resource: "mana", defense: "harmony" }
];

function pips(value, max = PIP_MAX) {
  return Array.from({ length: max }, (_, i) => i < value);
}

export default class EssenceActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "actor", "character"],
    position: { width: 760, height: 820 },
    form: { submitOnChange: true },
    actions: {
      rollSkill: EssenceActorSheet.#onRollSkill,
      rollItem: EssenceActorSheet.#onRollItem,
      startCombat: EssenceActorSheet.#onStartCombat,
      endCombat: EssenceActorSheet.#onEndCombat,
      rollInitiative: EssenceActorSheet.#onRollInitiative,
      startTurn: EssenceActorSheet.#onStartTurn,
      endTurn: EssenceActorSheet.#onEndTurn,
      itemEdit: EssenceActorSheet.#onItemEdit,
      itemDelete: EssenceActorSheet.#onItemDelete,
      changeTab: EssenceActorSheet.#onChangeTab,
      toggleTempWound: EssenceActorSheet.#onToggleTempWound,
      toggleCoreWound: EssenceActorSheet.#onToggleCoreWound,
      toggleTempInfluence: EssenceActorSheet.#onToggleTempInfluence,
      toggleCoreInfluence: EssenceActorSheet.#onToggleCoreInfluence
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/actor/character-sheet.hbs" }
  };

  #activeTab = "main";

  _onRender(context, options) {
    super._onRender(context, options);
    this.#applyActiveTab();
  }

  #applyActiveTab() {
    for (const link of this.element.querySelectorAll(".sheet-tabs a")) {
      link.classList.toggle("active", link.dataset.tab === this.#activeTab);
    }
    for (const section of this.element.querySelectorAll("section.tab")) {
      section.classList.toggle("active", section.dataset.tab === this.#activeTab);
    }
  }

  static #onChangeTab(event, target) {
    this.#activeTab = target.dataset.tab;
    this.#applyActiveTab();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    const system = this.actor.system;
    context.system = system;
    context.attributeOptions = ATTRIBUTES;

    context.domains = DOMAINS.map((d) => ({
      ...d,
      attrs: d.attrs.map((key) => ({ key, label: key, value: system[key], pips: pips(system[key]) })),
      skills: d.skills.map((key) => ({
        key,
        label: key,
        value: system[key],
        pips: pips(system[key]),
        expertises: system.expertises.filter((e) => (e.skill || "").toLowerCase() === key)
      })),
      resourceLabel: d.resource,
      resourceField: `current${d.resource[0].toUpperCase()}${d.resource.slice(1)}`,
      resourceCurrent: system.playState[`current${d.resource[0].toUpperCase()}${d.resource.slice(1)}`],
      resourceMax: system.resources[d.resource],
      defenseLabel: d.defense,
      defenseValue: system.defenses[d.defense]
    }));

    context.keyAspects = system.keyAspects.map((value, i) => ({ value, i, n: i + 1 }));
    context.temporaryWoundPips = pips(system.playState.currentTemporaryWounds, system.temporaryWoundsAvailable);
    context.temporaryInfluencePips = pips(system.playState.currentTemporaryInfluence, system.temporaryInfluence);
    context.coreInfluenceLabels = CORE_INFLUENCE_LABELS;

    context.actionCards = this.actor.items.filter((i) => i.type === "action-card");
    context.reactionCards = this.actor.items.filter((i) => i.type === "reaction-card");
    context.conditions = this.actor.items.filter((i) => i.type === "condition");
    const equipmentView = (item) => ({
      id: item.id,
      name: item.name,
      category: item.system.category,
      type: item.system.type,
      effectText: item.system.effect || item.system.passive || item.system.special || ""
    });
    const equipment = this.actor.items.filter((i) => i.type === "equipment");
    context.signatureEquipment = equipment.filter((i) => i.system.slot === "signature").map(equipmentView);
    context.armoryEquipment = equipment.filter((i) => i.system.slot === "armory").map(equipmentView);
    context.temporaryEquipment = equipment.filter((i) => i.system.slot === "temporary").map(equipmentView);
    return context;
  }

  /**
   * Quick roll from the sheet: the player picks which attribute pairs with the skill
   * for this action, since the rules don't fix one attribute per skill (a card's own
   * `attr` field determines that when rolling from a card instead — see #onRollItem).
   */
  static async #onRollSkill(event, target) {
    const skill = target.dataset.skill;
    const attr = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Roll ${skill}` },
        content: `<select name="attr">${ATTRIBUTES.map((a) => `<option value="${a}">${a}</option>`).join("")}</select>`,
        buttons: [{
          action: "roll",
          label: "Roll",
          default: true,
          callback: (event, button) => button.form.elements.attr.value
        }],
        submit: (result) => resolve(result ?? null)
      }).render(true);
    });
    if (!attr) return;
    const pool = (this.actor.system[attr] ?? 0) + (this.actor.system[skill] ?? 0);
    await rollEssencePool({ pool, label: `${attr} + ${skill}`, actor: this.actor });
  }

  static async #onRollItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const sys = item.system;
    const attrKey = (sys.attr || "").toLowerCase();
    const skillKey = (sys.skill || "").toLowerCase();
    const pool = (this.actor.system[attrKey] ?? 0) + (this.actor.system[skillKey] ?? 0);
    const defenseKey = (sys.defense || "").toLowerCase();
    const defense = this.actor.system.defenses?.[defenseKey] ?? null;
    await rollEssencePool({ pool, defense, label: item.name, actor: this.actor });
  }

  static async #onStartCombat() {
    await this.actor.update({
      "system.playState.combatStarted": true,
      "system.playState.combatRound": 0,
      "system.playState.combatTurn": "notStarted",
      "system.playState.initiativeDice": null,
      "system.playState.initiativeFaces": [],
      "system.playState.initiativeTotal": null,
      "system.playState.initiativeCommitted": false,
      "system.playState.actionDice": null,
      "system.playState.reactionDice": 0
    });
  }

  static async #onEndCombat() {
    await this.actor.update({ "system.playState.combatStarted": false, "system.playState.combatTurn": "notStarted" });
  }

  static async #onRollInitiative() {
    const base = this.actor.system.baseCombatDice;
    const roll = new Roll(`${base}d10`);
    await roll.evaluate();
    const faces = roll.terms[0].results.map((r) => r.result);
    const total = faces.reduce((a, b) => a + b, 0);
    await this.actor.update({
      "system.playState.initiativeDice": base,
      "system.playState.initiativeFaces": faces,
      "system.playState.initiativeTotal": total,
      "system.playState.initiativeCommitted": true
    });
    await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: "Initiative" });
  }

  static async #onStartTurn() {
    const ps = this.actor.system.playState;
    const base = this.actor.system.baseCombatDice;
    const round = (ps.combatRound || 0) + 1;
    const isFirst = (ps.combatRound || 0) === 0;
    await this.actor.update({
      "system.playState.combatRound": round,
      "system.playState.combatTurn": isFirst ? "first" : "active",
      "system.playState.actionDice": base - (isFirst ? (ps.initiativeDice || 0) : 0),
      "system.playState.reactionDice": 0
    });
  }

  static async #onEndTurn() {
    const ps = this.actor.system.playState;
    const base = this.actor.system.baseCombatDice;
    await this.actor.update({
      "system.playState.combatTurn": "ended",
      "system.playState.reactionDice": base + (ps.actionDice ?? 0),
      "system.playState.actionDice": null
    });
  }

  /** Clicking pip i sets the current count to i+1, or to i if that pip was already the last filled one. */
  static #onTogglePip(current, index) {
    return current === index + 1 ? index : index + 1;
  }

  static async #onToggleTempWound(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceActorSheet.#onTogglePip(this.actor.system.playState.currentTemporaryWounds, i);
    await this.actor.update({ "system.playState.currentTemporaryWounds": next });
  }

  static async #onToggleCoreWound(event, target) {
    const i = Number(target.dataset.index);
    const coreWounds = this.actor.system.coreWounds.map((w) => ({ filled: w.filled, condition: w.condition }));
    coreWounds[i].filled = !coreWounds[i].filled;
    await this.actor.update({ "system.coreWounds": coreWounds });
  }

  static async #onToggleTempInfluence(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceActorSheet.#onTogglePip(this.actor.system.playState.currentTemporaryInfluence, i);
    await this.actor.update({ "system.playState.currentTemporaryInfluence": next });
  }

  static async #onToggleCoreInfluence(event, target) {
    const i = Number(target.dataset.index);
    const coreInfluence = this.actor.system.coreInfluence.map((c) => ({ filled: c.filled }));
    coreInfluence[i].filled = !coreInfluence[i].filled;
    await this.actor.update({ "system.coreInfluence": coreInfluence });
  }

  static #onItemEdit(event, target) {
    this.actor.items.get(target.dataset.itemId)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    await this.actor.items.get(target.dataset.itemId)?.delete();
  }
}
