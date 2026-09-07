import { rollEssencePool } from "../dice/essence-roll.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const ATTRIBUTES = ["might", "grace", "vigor", "intellect", "acuity", "resolve", "presence", "adaptability", "anima"];
const SKILLS = ["prowess", "ballistics", "gestalt", "cunning", "magecraft", "psionics", "leadership", "ritualism", "calling"];

export default class EssenceActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "actor", "character"],
    position: { width: 720, height: 780 },
    actions: {
      rollSkill: EssenceActorSheet.#onRollSkill,
      rollItem: EssenceActorSheet.#onRollItem,
      startCombat: EssenceActorSheet.#onStartCombat,
      endCombat: EssenceActorSheet.#onEndCombat,
      rollInitiative: EssenceActorSheet.#onRollInitiative,
      startTurn: EssenceActorSheet.#onStartTurn,
      endTurn: EssenceActorSheet.#onEndTurn,
      itemEdit: EssenceActorSheet.#onItemEdit,
      itemDelete: EssenceActorSheet.#onItemDelete
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/actor/character-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    context.system = system;
    context.attributes = ATTRIBUTES.map((key) => ({ key, label: key, value: system[key] }));
    context.skills = SKILLS.map((key) => ({ key, label: key, value: system[key] }));
    context.attributeOptions = ATTRIBUTES;
    context.actionCards = this.actor.items.filter((i) => i.type === "action-card");
    context.reactionCards = this.actor.items.filter((i) => i.type === "reaction-card");
    context.conditions = this.actor.items.filter((i) => i.type === "condition");
    context.equipment = this.actor.items.filter((i) => i.type === "equipment");
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

  static #onItemEdit(event, target) {
    this.actor.items.get(target.dataset.itemId)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    await this.actor.items.get(target.dataset.itemId)?.delete();
  }
}
