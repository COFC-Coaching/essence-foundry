import { rollEssencePool } from "../dice/essence-roll.mjs";
import { EXPERTISE_DATABASE } from "../data/expertise-database.mjs";

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

/** Gated combat skills can only be raised above 0 with the matching Distinction attached. */
const SKILL_GATE = { gestalt: "Gifted", magecraft: "Arcanist", psionics: "Psyker", ritualism: "Invoker", calling: "Summoner" };
const ORIGIN_TYPES = ["species", "heritage", "distinction"];

function pips(value, max = PIP_MAX) {
  return Array.from({ length: max }, (_, i) => i < value);
}

/** Default new-row shape for each free-length array field, keyed by the sheet's data-array value. */
const ARRAY_ROW_DEFAULTS = {
  nonCombatSkills: { name: "", rating: 0 },
  passiveFeatures: { name: "", source: "", text: "" }
};

export default class EssenceActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "actor", "character"],
    position: { width: 760, height: 820 },
    form: { submitOnChange: true },
    actions: {
      rollSkill: EssenceActorSheet.#onRollSkill,
      rollItem: EssenceActorSheet.#onRollItem,
      rollInitiative: EssenceActorSheet.#onRollInitiative,
      endTurn: EssenceActorSheet.#onEndTurn,
      itemEdit: EssenceActorSheet.#onItemEdit,
      itemDelete: EssenceActorSheet.#onItemDelete,
      changeTab: EssenceActorSheet.#onChangeTab,
      toggleTempWound: EssenceActorSheet.#onToggleTempWound,
      toggleCoreWound: EssenceActorSheet.#onToggleCoreWound,
      toggleTempInfluence: EssenceActorSheet.#onToggleTempInfluence,
      toggleCoreInfluence: EssenceActorSheet.#onToggleCoreInfluence,
      addArrayRow: EssenceActorSheet.#onAddArrayRow,
      deleteArrayRow: EssenceActorSheet.#onDeleteArrayRow,
      addExpertise: EssenceActorSheet.#onAddExpertise
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/actor/character-sheet.hbs" }
  };

  #activeTab = "core";

  _onRender(context, options) {
    super._onRender(context, options);
    this.#applyActiveTab();
    this.#applyEditable();
  }

  /**
   * Foundry's form only blocks a submitted update server-side — it doesn't stop the UI from
   * looking editable to someone without OWNER permission (e.g. a player with LIMITED/OBSERVER
   * access, or anyone viewing while the sheet isn't editable for another reason). Lock every
   * field and action button down to match `this.isEditable` so non-owners get a visibly
   * read-only sheet instead of controls that silently fail to save.
   */
  #applyEditable() {
    if (this.isEditable) return;
    for (const el of this.element.querySelectorAll("input, select, textarea")) el.disabled = true;
    for (const el of this.element.querySelectorAll('button[data-action]:not([data-action="changeTab"]), a[data-action]:not([data-action="changeTab"])')) {
      el.classList.add("locked");
      el.style.pointerEvents = "none";
    }
    for (const el of this.element.querySelectorAll(".editor-edit")) el.style.display = "none";
  }

  #applyActiveTab() {
    for (const link of this.element.querySelectorAll(".sheet-tabs a")) {
      link.classList.toggle("active", link.dataset.tab === this.#activeTab);
    }
    for (const section of this.element.querySelectorAll("section.tab")) {
      section.classList.toggle("active", section.dataset.tab === this.#activeTab);
    }
  }

  /** A character has exactly one Species/Heritage/Distinction — dropping a new one replaces the old. */
  async _onDropItem(event, item) {
    const created = await super._onDropItem(event, item);
    if (created && ORIGIN_TYPES.includes(created.type)) {
      const stale = this.actor.items.filter((i) => i.type === created.type && i.id !== created.id);
      if (stale.length) await this.actor.deleteEmbeddedDocuments("Item", stale.map((i) => i.id));
      const field = created.type === "distinction" ? "distinction" : created.type;
      await this.actor.update({ [`system.${field}`]: created.name });
    }
    return created;
  }

  static #onChangeTab(event, target) {
    this.#activeTab = target.dataset.tab;
    this.#applyActiveTab();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.combatRound = game.combat?.round ?? null;
    const system = this.actor.system;
    context.system = system;
    context.attributeOptions = ATTRIBUTES;
    context.skillOptions = SKILLS;

    const distinctionItem = this.actor.items.find((i) => i.type === "distinction");
    const speciesItem = this.actor.items.find((i) => i.type === "species");
    const heritageItem = this.actor.items.find((i) => i.type === "heritage");
    context.distinctionItem = distinctionItem;
    context.speciesItem = speciesItem;
    context.heritageItem = heritageItem;

    context.domains = DOMAINS.map((d) => ({
      ...d,
      attrs: d.attrs.map((key) => ({ key, label: key, value: system[key], pips: pips(system[key]) })),
      skills: d.skills.map((key) => {
        const gateDistinction = SKILL_GATE[key];
        const gateOpen = !gateDistinction || distinctionItem?.system.unlocks === key;
        const expertiseOptions = EXPERTISE_DATABASE[key] || [];
        return {
          key,
          label: key,
          value: system[key],
          pips: pips(system[key]),
          expertiseOptions,
          expertises: system.expertises
            .map((e, i) => ({ i, name: e.name, skill: e.skill }))
            .filter((e) => (e.skill || "").toLowerCase() === key),
          gateDistinction,
          gateOpen
        };
      }),
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
   * Prompts for how many dice to commit to a roll, bounded [min, max]. Used for Initiative
   * (0 = Pass, up to the base Tier+5 pool) and for spending Action/Reaction Dice on a card or
   * combat skill check — the rules let a player commit anywhere from a card's minimum up to
   * whatever they have left in the pool, and *that* commitment is both the dice rolled and the
   * amount deducted from the pool (see condition text like "commit 4 or more dice to a single
   * Action"). Returns null if the dialog is dismissed without committing.
   */
  static async #promptDiceCount({ title, label, min, max, initial }) {
    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title },
        content: `<p>${label}</p><input type="number" name="count" value="${initial}" min="${min}" max="${max}" autofocus>`,
        buttons: [
          {
            action: "commit",
            label: "Roll",
            default: true,
            callback: (event, button) => {
              const raw = Number(button.form.elements.count.value);
              const n = Number.isFinite(raw) ? raw : initial;
              return Math.min(max, Math.max(min, n));
            }
          },
          { action: "cancel", label: "Cancel", callback: () => "essence-cancelled" }
        ],
        submit: (result) => resolve(result === "essence-cancelled" ? null : result)
      }).render(true);
    });
  }

  /**
   * Quick roll from the sheet. During combat this spends Action Dice like a card does (player
   * commits however many they want, up to what's left, no fixed formula). Outside combat it
   * falls back to an open Attribute + Skill check, since there's no Action Dice pool to spend.
   */
  static async #onRollSkill(event, target) {
    const skill = target.dataset.skill;
    const ps = this.actor.system.playState;

    if (ps.combatStarted && ps.actionDice !== null) {
      const available = ps.actionDice ?? 0;
      if (available <= 0) {
        ui.notifications.warn("No Action Dice remaining.");
        return;
      }
      const committed = await EssenceActorSheet.#promptDiceCount({
        title: `Roll ${skill}`,
        label: `Commit how many Action Dice? (max ${available})`,
        min: 1, max: available, initial: available
      });
      if (committed === null) return;
      await this.actor.update({ "system.playState.actionDice": available - committed });
      await rollEssencePool({ pool: committed, label: skill, actor: this.actor });
      return;
    }

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

  /**
   * Defense belongs to whoever is being targeted, never to the roller. Prefer a Foundry
   * target if one is selected (and it's an Essence character with that Defense); otherwise
   * ask the GM to declare it, since we don't yet have a way to resolve targeting/opposition
   * automatically. Leaving it blank rolls open (6+ threshold) rather than guessing.
   */
  static async #resolveDefense(defenseKey) {
    if (!defenseKey) return null;

    const target = game.user.targets.first();
    const targetDefense = target?.actor?.system?.defenses?.[defenseKey];
    if (typeof targetDefense === "number") return targetDefense;

    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Declare ${defenseKey[0].toUpperCase()}${defenseKey.slice(1)}` },
        content: `<p>No target selected. Enter the target's ${defenseKey} (leave blank to roll open):</p>
          <input type="number" name="defense" autofocus>`,
        buttons: [{
          action: "roll",
          label: "Roll",
          default: true,
          // DialogV2 falls back to the button's own `action` ("roll") whenever a callback
          // returns null/undefined, so an empty string (not null) means "roll open".
          callback: (event, button) => {
            const val = button.form.elements.defense.value;
            return val === "" ? "" : Number(val);
          }
        }],
        submit: (result) => resolve(result === "" || result === "roll" ? null : result)
      }).render(true);
    });
  }

  /**
   * Using a card spends dice from the matching pool (Action for an Action Card, Reaction for a
   * Reaction Card) — the player commits anywhere from the card's declared minimum up to whatever
   * remains in the pool, and that commitment is the roll itself.
   */
  static async #onRollItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const sys = item.system;
    const isReaction = item.type === "reaction-card";
    const poolField = isReaction ? "reactionDice" : "actionDice";
    const poolLabel = isReaction ? "Reaction" : "Action";
    const available = this.actor.system.playState[poolField] ?? 0;
    const cardMin = Math.max(1, parseInt(sys.min, 10) || 1);

    if (available <= 0) {
      ui.notifications.warn(`No ${poolLabel} Dice remaining.`);
      return;
    }
    if (cardMin > available) {
      ui.notifications.warn(`${item.name} requires at least ${cardMin} dice, but only ${available} ${poolLabel} Dice remain.`);
      return;
    }

    const committed = await EssenceActorSheet.#promptDiceCount({
      title: `Use ${item.name}`,
      label: `Commit how many ${poolLabel} Dice? (min ${cardMin}, max ${available})`,
      min: cardMin, max: available, initial: cardMin
    });
    if (committed === null) return;

    const defenseKey = (sys.defense || "").toLowerCase();
    const defense = await EssenceActorSheet.#resolveDefense(defenseKey);
    await this.actor.update({ [`system.playState.${poolField}`]: available - committed });
    await rollEssencePool({ pool: committed, defense, label: item.name, actor: this.actor });
  }

  /**
   * Rolls into Foundry's real Combat Tracker instead of a private pool: finds (or creates) this
   * actor's Combatant in the active encounter and sets its `initiative` so the tracker sorts it
   * correctly, alongside the same dice-face display the sheet already showed.
   */
  static async #onRollInitiative() {
    const combat = game.combat;
    if (!combat) {
      ui.notifications.warn("Start a combat encounter from the Combat Tracker first.");
      return;
    }

    const base = this.actor.system.baseCombatDice;
    const committed = await EssenceActorSheet.#promptDiceCount({
      title: "Roll Initiative",
      label: `Commit how many dice to Initiative? (0 = Pass, max ${base}). Whatever you don't commit here carries over as your first turn's Action Dice.`,
      min: 0, max: base, initial: base
    });
    if (committed === null) return;

    let combatant = combat.combatants.find((c) => c.actor?.id === this.actor.id);
    if (!combatant) {
      const token = this.actor.getActiveTokens()[0];
      [combatant] = await combat.createEmbeddedDocuments("Combatant", [{
        actorId: this.actor.id,
        tokenId: token?.id ?? null,
        sceneId: token?.scene?.id ?? null
      }]);
    }

    let faces = [];
    let total = 0;
    if (committed > 0) {
      const roll = new Roll(`${committed}d10`);
      await roll.evaluate();
      faces = roll.terms[0].results.map((r) => r.result);
      total = faces.reduce((a, b) => a + b, 0);
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor: this.actor }), flavor: "Initiative" });
    } else {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<p><strong>${this.actor.name}</strong> passes on Initiative.</p>`
      });
    }

    await this.actor.update({
      "system.playState.initiativeDice": committed,
      "system.playState.initiativeFaces": faces,
      "system.playState.initiativeTotal": total,
      "system.playState.initiativeCommitted": true
    });
    await combatant.update({ initiative: total });
  }

  /**
   * Converts leftover Action Dice into the Reaction pool (see EssenceCombat#_onStartTurn for the
   * matching start-of-turn math), then advances Foundry's own tracker if it's currently this
   * actor's turn — Start Combat/End Combat/Start Turn all now live in the native Combat Tracker.
   */
  static async #onEndTurn() {
    const ps = this.actor.system.playState;
    const base = this.actor.system.baseCombatDice;
    await this.actor.update({
      "system.playState.combatTurn": "ended",
      "system.playState.reactionDice": base + (ps.actionDice ?? 0),
      "system.playState.actionDice": null
    });
    if (game.combat?.combatant?.actor?.id === this.actor.id) {
      await game.combat.nextTurn();
    }
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

  static async #onAddArrayRow(event, target) {
    const key = target.dataset.array;
    const rows = this.actor.system[key].map((row) => foundry.utils.deepClone(row));
    rows.push(foundry.utils.deepClone(ARRAY_ROW_DEFAULTS[key]));
    await this.actor.update({ [`system.${key}`]: rows });
  }

  static async #onDeleteArrayRow(event, target) {
    const key = target.dataset.array;
    const i = Number(target.dataset.index);
    const rows = this.actor.system[key].map((row) => foundry.utils.deepClone(row));
    rows.splice(i, 1);
    await this.actor.update({ [`system.${key}`]: rows });
  }

  /** Adds a new Expertise slot nested under a specific Combat Skill's box. */
  static async #onAddExpertise(event, target) {
    const skill = target.dataset.skill;
    const expertises = this.actor.system.expertises.map((e) => ({ name: e.name, skill: e.skill }));
    expertises.push({ name: "", skill });
    await this.actor.update({ "system.expertises": expertises });
  }

  static #onItemEdit(event, target) {
    this.actor.items.get(target.dataset.itemId)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    await this.actor.items.get(target.dataset.itemId)?.delete();
  }
}
