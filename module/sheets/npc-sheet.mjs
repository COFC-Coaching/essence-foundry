import { rollEssencePool } from "../dice/essence-roll.mjs";
import { deriveOriginFeatures } from "../data/origin-features.mjs";
import { setOriginItem, clearOriginItem } from "../data/origin-select.mjs";
import { ITEM_GRANT_REGISTRY, deriveActiveGrants, equipmentMatchesGrant, reachQualifiesForGrant } from "../data/item-grants.mjs";
import EssenceMonsterWizard from "../apps/monster-wizard.mjs";
import { capitalize, cardSummary, domainResource, hasMastery, computeSlotUsage, computeReachGate, resetAdventureUses, SEVERITY_BY_INDEX, INFLUENCE_RECOVERY_TIME } from "../utils.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const ATTRIBUTES = ["might", "grace", "vigor", "intellect", "acuity", "resolve", "presence", "adaptability", "anima"];
const SKILL_GATE = { gestalt: "Gifted", magecraft: "Arcanist", psionics: "Psyker", ritualism: "Invoker", calling: "Summoner" };
const CORE_INFLUENCE_LABELS = ["L", "L", "S", "S", "C"];

const DOMAINS = [
  { key: "physical", label: "Physical", attrs: ["might", "grace", "vigor"], skills: ["prowess", "ballistics", "gestalt"], resource: "stamina", defense: "fortitude" },
  { key: "mental", label: "Mental", attrs: ["intellect", "acuity", "resolve"], skills: ["cunning", "magecraft", "psionics"], resource: "focus", defense: "composure" },
  { key: "spiritual", label: "Spiritual", attrs: ["presence", "adaptability", "anima"], skills: ["leadership", "ritualism", "calling"], resource: "mana", defense: "harmony" }
];

function pips(value, max = 5) {
  return Array.from({ length: max }, (_, i) => i < value);
}

/**
 * A compact, single-page sheet for NPCs/adversaries — same underlying combat mechanics as a
 * player character (see module/data/actor-combatant.mjs and welcome-to-the-essence-system.md:
 * "Game Masters will use those same rules when portraying... adversaries"), but without the
 * player-facing Character Wizard, Non-Combat Skills, or Expertise/Specialty editing UI, which a
 * GM juggling several NPCs at once generally doesn't need — a GM who wants that depth for one
 * important NPC can always use the player character sheet/type instead.
 */
export default class EssenceNpcSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "actor", "npc"],
    position: { width: 640, height: 720 },
    form: { submitOnChange: true },
    actions: {
      openWizard: EssenceNpcSheet.#onOpenWizard,
      editTokenImage: EssenceNpcSheet.#onEditTokenImage,
      toggleEditLock: EssenceNpcSheet.#onToggleEditLock,
      rollSkill: EssenceNpcSheet.#onRollSkill,
      rollItem: EssenceNpcSheet.#onRollItem,
      rollInitiative: EssenceNpcSheet.#onRollInitiative,
      endTurn: EssenceNpcSheet.#onEndTurn,
      burnDice: EssenceNpcSheet.#onBurnDice,
      applyDamage: EssenceNpcSheet.#onApplyDamage,
      recoverWound: EssenceNpcSheet.#onRecoverWound,
      adjustResource: EssenceNpcSheet.#onAdjustResource,
      toggleTempWound: EssenceNpcSheet.#onToggleTempWound,
      toggleCoreWound: EssenceNpcSheet.#onToggleCoreWound,
      toggleDeathTrack: EssenceNpcSheet.#onToggleDeathTrack,
      toggleDeathTrackFrozen: EssenceNpcSheet.#onToggleDeathTrackFrozen,
      toggleTempInfluence: EssenceNpcSheet.#onToggleTempInfluence,
      toggleCoreInfluence: EssenceNpcSheet.#onToggleCoreInfluence,
      applyInfluenceInjury: EssenceNpcSheet.#onApplyInfluenceInjury,
      recoverInfluenceInjury: EssenceNpcSheet.#onRecoverInfluenceInjury,
      spendInfluenceForSlot: EssenceNpcSheet.#onSpendInfluenceForSlot,
      contributeToGoal: EssenceNpcSheet.#onContributeToGoal,
      addReachTrigger: EssenceNpcSheet.#onAddReachTrigger,
      deleteReachTrigger: EssenceNpcSheet.#onDeleteReachTrigger,
      activateReachTrigger: EssenceNpcSheet.#onActivateReachTrigger,
      deactivateReachTrigger: EssenceNpcSheet.#onDeactivateReachTrigger,
      resetAdventureUses: EssenceNpcSheet.#onResetAdventureUses,
      itemView: EssenceNpcSheet.#onItemView,
      itemEdit: EssenceNpcSheet.#onItemEdit,
      itemDelete: EssenceNpcSheet.#onItemDelete,
      selectOrigin: EssenceNpcSheet.#onSelectOrigin,
      clearOrigin: EssenceNpcSheet.#onClearOrigin,
      chooseGrantedItem: EssenceNpcSheet.#onChooseGrantedItem
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/actor/npc-sheet.hbs" }
  };

  /** Sheet-wide safety lock — see EssenceActorSheet#applyEditable for the full rationale. */
  #editUnlocked = false;

  _onRender(context, options) {
    super._onRender(context, options);
    this.#applyEditable();
    this.#wireCardControls();
  }

  /** Mirrors EssenceActorSheet#applyEditable — see that class for why .window-content is scoped
   *  and why the default-locked-for-owners behavior never touches action buttons. */
  #applyEditable() {
    const body = this.element.querySelector(".window-content") ?? this.element;
    if (!this.isEditable) {
      for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) el.disabled = true;
      for (const el of body.querySelectorAll("button[data-action], a[data-action]")) {
        el.classList.add("locked");
        el.style.pointerEvents = "none";
      }
      return;
    }
    if (this.#editUnlocked) return;
    for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) el.disabled = true;
  }

  static #onToggleEditLock() {
    this.#editUnlocked = !this.#editUnlocked;
    this.render();
  }

  /** Mirrors EssenceActorSheet#wireCardControls — see that class for why. */
  #wireCardControls() {
    const input = this.element.querySelector("[data-card-filter]");
    input?.addEventListener("input", (e) => {
      const q = e.currentTarget.value.trim().toLowerCase();
      for (const li of this.element.querySelectorAll(".card-list li[data-card-name]")) {
        const haystack = `${li.dataset.cardName} ${li.dataset.cardSummary ?? ""}`.toLowerCase();
        li.hidden = !!q && !haystack.includes(q);
      }
    });

    for (const select of this.element.querySelectorAll("[data-card-sort]")) {
      select.addEventListener("change", () => {
        const list = this.element.querySelector(`.card-list[data-card-list="${select.dataset.cardSort}"]`);
        if (!list) return;
        const key = select.value;
        const prop = `card${capitalize(key)}`;
        const rows = [...list.querySelectorAll("li[data-card-name]")];
        rows.sort((a, b) => {
          if (key === "cost" || key === "rank") {
            return (Number(a.dataset[prop]) || 0) - (Number(b.dataset[prop]) || 0);
          }
          return (a.dataset[prop] ?? "").localeCompare(b.dataset[prop] ?? "");
        });
        for (const row of rows) list.appendChild(row);
      });
    }
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.isEditable = this.isEditable;
    context.editUnlocked = this.#editUnlocked;
    context.combatRound = game.combat?.round ?? null;
    const system = this.actor.system;
    context.system = system;

    const distinctionItem = this.actor.items.find((i) => i.type === "distinction");
    const speciesItem = this.actor.items.find((i) => i.type === "species");
    const heritageItem = this.actor.items.find((i) => i.type === "heritage");
    context.distinctionItem = distinctionItem;
    context.speciesItem = speciesItem;
    context.heritageItem = heritageItem;
    context.originFeatures = deriveOriginFeatures({ speciesItem, heritageItem, distinctionItem });

    context.domains = DOMAINS.map((d) => ({
      ...d,
      attrs: d.attrs.map((key) => ({ key, label: capitalize(key), value: system[key] })),
      skills: d.skills.map((key) => {
        const gateDistinction = SKILL_GATE[key];
        const gateOpen = !gateDistinction || distinctionItem?.system.unlocks === key;
        return { key, label: capitalize(key), value: system[key], pips: pips(system[key]), gateDistinction, gateOpen };
      }),
      resourceLabel: d.resource,
      resourceField: `current${d.resource[0].toUpperCase()}${d.resource.slice(1)}`,
      resourceCurrent: system.playState[`current${d.resource[0].toUpperCase()}${d.resource.slice(1)}`],
      resourceMax: system.resources[d.resource].max,
      defenseLabel: d.defense,
      defenseValue: system.defenses[d.defense]
    }));

    context.temporaryWoundPips = pips(system.playState.currentTemporaryWounds, system.temporaryWoundsAvailable);
    context.deathTrackPips = pips(system.playState.deathTrackStep, 5);
    context.temporaryInfluencePips = pips(system.playState.currentTemporaryInfluence, system.temporaryInfluence);
    context.coreInfluenceLabels = CORE_INFLUENCE_LABELS;
    // See EssenceActorSheet#_prepareContext — same Adventure-Limited Reach Trigger mapping.
    context.reachTriggers = system.reachTriggers.map((t, i) => ({ ...t, i }));

    // See EssenceActorSheet#_prepareContext — same Basic Actions/Reactions split for NPCs.
    const cardView = (item) => ({ id: item.id, name: item.name, system: item.system, summary: cardSummary(item.system) });
    const allActionCards = this.actor.items.filter((i) => i.type === "action-card");
    const allReactionCards = this.actor.items.filter((i) => i.type === "reaction-card");
    const byName = (a, b) => a.name.localeCompare(b.name);
    context.basicActionCards = allActionCards.filter((i) => !i.system.skill).map(cardView).sort(byName);
    context.actionCards = allActionCards.filter((i) => i.system.skill).map(cardView);
    context.basicReactionCards = allReactionCards.filter((i) => !i.system.skill).map(cardView).sort(byName);
    context.reactionCards = allReactionCards.filter((i) => i.system.skill).map(cardView);
    context.conditions = this.actor.items.filter((i) => i.type === "condition");

    // Split by slot + show usage against the limit, same as EssenceActorSheet — see that class's
    // _prepareContext comment for why Component assignment UI lives on the equipment Item's own
    // sheet instead of being duplicated here.
    // See EssenceActorSheet#_prepareContext for the full Reach-gating reasoning (computeReachGate()
    // in utils.mjs) — same soft, non-blocking over-Reach flag here, reading effectiveReach (base
    // Reach + any active Reach Triggers) rather than raw system.reach.
    const equipmentView = (item) => {
      const { reachCost, exceptionSource, overReach } = computeReachGate(item.system, system.effectiveReach);
      return { id: item.id, name: item.name, system: item.system, reachCost, exceptionSource, overReach };
    };
    const equipment = this.actor.items.filter((i) => i.type === "equipment");
    context.signatureEquipment = equipment.filter((i) => i.system.slot === "signature").map(equipmentView);
    context.armoryEquipment = equipment.filter((i) => i.system.slot === "armory");
    context.temporaryEquipment = equipment.filter((i) => i.system.slot === "temporary");
    context.signatureUsed = computeSlotUsage(this.actor.items, "signature");
    context.armoryUsed = computeSlotUsage(this.actor.items, "armory");
    context.signatureOverLimit = Math.max(0, Math.floor(context.signatureUsed) - system.signatureEquipmentLimit);
    context.itemGrants = deriveActiveGrants({ speciesItem, heritageItem }, equipment);
    context.componentItems = this.actor.items
      .filter((i) => ["chassis", "fitting", "augment"].includes(i.type))
      .map((i) => ({ id: i.id, name: i.name, type: i.type, category: i.system.category ?? "", slot: i.system.slot ?? "", tier: i.system.tier ?? null }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

    const speciesPack = game.packs.get("essence-system.species");
    const heritagePack = game.packs.get("essence-system.heritages");
    const distinctionPack = game.packs.get("essence-system.distinctions");
    context.speciesOptions = speciesPack ? (await speciesPack.getDocuments()).sort((a, b) => a.name.localeCompare(b.name)) : [];
    context.heritageOptions = heritagePack ? (await heritagePack.getDocuments()).sort((a, b) => a.name.localeCompare(b.name)) : [];
    context.distinctionOptions = distinctionPack ? (await distinctionPack.getDocuments()).sort((a, b) => a.name.localeCompare(b.name)) : [];

    return context;
  }

  static #onOpenWizard() {
    new EssenceMonsterWizard(this.actor).render(true);
  }

  /** See EssenceActorSheet#onEditTokenImage — same gap, more likely to bite here since a GM
   *  usually sets a Monster's Portrait well after it already has copies placed on scenes;
   *  those unlinked Tokens keep whatever art they were dropped with regardless either way. */
  static #onEditTokenImage() {
    const current = this.actor.prototypeToken.texture.src;
    new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: (path) => this.actor.update({ "prototypeToken.texture.src": path })
    }).render(true);
  }

  static async #onSelectOrigin(event, target) {
    const pack = game.packs.get(target.dataset.pack);
    const sourceItem = await pack?.getDocument(target.dataset.id);
    if (sourceItem) await setOriginItem(this.actor, sourceItem);
  }

  static async #onClearOrigin(event, target) {
    await clearOriginItem(this.actor, target.dataset.type);
  }

  /** Shared dice-commit prompt — see EssenceActorSheet#promptDiceCount for the full rationale. */
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

  static async #resolveTargets(defenseKey) {
    if (!defenseKey) return { defense: null, targets: null };
    const targeted = Array.from(game.user.targets);

    if (targeted.length > 1) {
      const targets = targeted.map((t) => {
        const d = t.actor?.system?.defenses?.[defenseKey];
        return { name: t.actor?.name ?? t.document.name, defense: typeof d === "number" ? d : null };
      });
      return { defense: null, targets };
    }

    const targetDefense = targeted[0]?.actor?.system?.defenses?.[defenseKey];
    if (typeof targetDefense === "number") return { defense: targetDefense, targets: null };

    const declared = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Declare ${defenseKey[0].toUpperCase()}${defenseKey.slice(1)}` },
        content: `<p>No target selected. Enter the target's ${defenseKey} (leave blank to roll open):</p>
          <input type="number" name="defense" autofocus>`,
        buttons: [{
          action: "roll",
          label: "Roll",
          default: true,
          callback: (event, button) => {
            const val = button.form.elements.defense.value;
            return val === "" ? "" : Number(val);
          }
        }],
        submit: (result) => resolve(result === "" || result === "roll" ? null : result)
      }).render(true);
    });
    return { defense: declared, targets: null };
  }

  static async #onRollSkill(event, target) {
    const skill = target.dataset.skill;
    const ps = this.actor.system.playState;

    if (ps.combatStarted && ps.actionDice !== null) {
      const available = ps.actionDice ?? 0;
      if (available <= 0) {
        ui.notifications.warn("No Action Dice remaining.");
        return;
      }
      const committed = await EssenceNpcSheet.#promptDiceCount({
        title: `Roll ${capitalize(skill)}`,
        label: `Commit how many Action Dice? (max ${available})`,
        min: 1, max: available, initial: available
      });
      if (committed === null) return;
      await this.actor.update({ "system.playState.actionDice": available - committed });
      await rollEssencePool({ pool: committed, label: capitalize(skill), actor: this.actor });
      return;
    }

    const attr = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Roll ${capitalize(skill)}` },
        content: `<select name="attr">${ATTRIBUTES.map((a) => `<option value="${a}">${capitalize(a)}</option>`).join("")}</select>`,
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
    await rollEssencePool({ pool, label: `${capitalize(attr)} + ${capitalize(skill)}`, actor: this.actor });
  }

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

    if (isReaction) EssenceNpcSheet.#warnIfLikelySecondReaction(this.actor);

    const committed = await EssenceNpcSheet.#promptDiceCount({
      title: `Use ${item.name}`,
      label: `Commit how many ${poolLabel} Dice? (min ${cardMin}, max ${available})`,
      min: cardMin, max: available, initial: cardMin
    });
    if (committed === null) return;

    const defenseKey = (sys.defense || "").toLowerCase();
    const { defense, targets } = await EssenceNpcSheet.#resolveTargets(defenseKey);
    const update = { [`system.playState.${poolField}`]: available - committed };

    // See EssenceActorSheet#onRollItem — a card's printed Cost is paid from its Domain's
    // resource pool on top of the Action/Reaction Dice spent above.
    const cost = Number(sys.cost) || 0;
    if (cost > 0) {
      const resKey = domainResource(sys.domain).toLowerCase();
      if (resKey) {
        const current = this.actor.system.resources[resKey].value;
        update[`system.playState.current${capitalize(resKey)}`] = Math.max(0, current - cost);
        if (cost > current) {
          ui.notifications.warn(`${item.name} costs ${cost} ${capitalize(resKey)}, but ${this.actor.name} only has ${current} remaining.`);
        }
      }
    }

    if (isReaction && game.combat) {
      update["system.playState.lastReactionRound"] = game.combat.round;
      update["system.playState.lastReactionCombatantId"] = game.combat.combatant?.id ?? "";
    }

    await this.actor.update(update);
    const bonusSurges = hasMastery(sys, this.actor.system.expertises) ? 1 : 0;
    await rollEssencePool({ pool: committed, defense, targets, label: item.name, actor: this.actor, surgeOptions: sys.surges, bonusSurges });
  }

  /** See EssenceActorSheet#warnIfLikelySecondReaction — same approximate check, same reasoning. */
  static #warnIfLikelySecondReaction(actor) {
    if (!game.combat) return;
    const ps = actor.system.playState;
    const sameRound = ps.lastReactionRound === game.combat.round;
    const sameActiveCombatant = ps.lastReactionCombatantId && ps.lastReactionCombatantId === game.combat.combatant?.id;
    if (sameRound && sameActiveCombatant) {
      ui.notifications.warn(`${actor.name} already used a Reaction during this Turn. Only one Reaction per Action is normally allowed — if this is responding to a different Action, this is fine to ignore.`);
    }
  }

  /** See EssenceActorSheet#onAdjustResource — same +/- quick-adjust, same reasoning. */
  static async #onAdjustResource(event, target) {
    const field = target.dataset.field;
    const delta = Number(target.dataset.delta) || 0;
    const resKey = field.replace(/^current/, "").toLowerCase();
    const resource = this.actor.system.resources[resKey];
    if (!resource) return;
    const next = Math.min(resource.max, Math.max(0, resource.value + delta));
    await this.actor.update({ [`system.playState.${field}`]: next });
  }

  static async #onRollInitiative() {
    const combat = game.combat;
    if (!combat) {
      ui.notifications.warn("Start a combat encounter from the Combat Tracker first.");
      return;
    }

    let combatant = combat.combatants.find((c) => c.actor?.id === this.actor.id);
    if (!combatant) {
      const token = this.actor.getActiveTokens()[0];
      [combatant] = await combat.createEmbeddedDocuments("Combatant", [{
        actorId: this.actor.id, tokenId: token?.id ?? null, sceneId: token?.scene?.id ?? null
      }]);
    }

    // EssenceCombat#rollInitiative owns the dice-commit dialog and roll — the Combat Tracker's
    // own dice icon and Roll All/Roll NPCs buttons call the exact same method, so this button and
    // the native tracker UI always produce the same result.
    await combat.rollInitiative(combatant.id);
  }

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

  static async #onBurnDice() {
    const ps = this.actor.system.playState;
    const pools = [
      { key: "actionDice", label: "Action", available: ps.actionDice ?? 0 },
      { key: "reactionDice", label: "Reaction", available: ps.reactionDice ?? 0 }
    ].filter((p) => p.available > 0);
    if (!pools.length) {
      ui.notifications.warn("No Action or Reaction Dice available to burn.");
      return;
    }
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Burn Dice" },
        content: `
          <p>Spend dice from a pool without rolling them (e.g. to remove Burning, pay an Echo, Extra Movement, a Ballistics Lock).</p>
          <label>Pool
            <select name="pool">${pools.map((p) => `<option value="${p.key}">${p.label} (${p.available} available)</option>`).join("")}</select>
          </label>
          <label>Dice to burn <input type="number" name="count" value="1" min="1" max="${Math.max(...pools.map((p) => p.available))}" autofocus></label>
          <label>Reason (optional) <input type="text" name="reason" placeholder="e.g. Remove Burning"></label>
        `,
        buttons: [{
          action: "burn",
          label: "Burn",
          default: true,
          callback: (event, button) => ({
            pool: button.form.elements.pool.value,
            count: Number(button.form.elements.count.value),
            reason: button.form.elements.reason.value.trim()
          })
        }],
        submit: (result) => resolve(result === "burn" ? null : result)
      }).render(true);
    });
    if (!result) return;
    const poolInfo = pools.find((p) => p.key === result.pool);
    const count = Math.max(1, Math.min(poolInfo.available, Math.floor(result.count) || 1));
    await this.actor.update({ [`system.playState.${result.pool}`]: poolInfo.available - count });
    const flavor = result.reason ? ` — ${result.reason}` : "";
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> burns ${count} ${poolInfo.label} ${count === 1 ? "Die" : "Dice"}${flavor}.</p>`
    });
  }

  static #onTogglePip(current, index) {
    return current === index + 1 ? index : index + 1;
  }

  static async #onToggleTempWound(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceNpcSheet.#onTogglePip(this.actor.system.playState.currentTemporaryWounds, i);
    await this.actor.update({ "system.playState.currentTemporaryWounds": next });
  }

  static async #onToggleCoreWound(event, target) {
    const i = Number(target.dataset.index);
    const coreWounds = this.actor.system.coreWounds.map((w) => ({ ...w }));
    coreWounds[i].filled = !coreWounds[i].filled;
    if (!coreWounds[i].filled) { coreWounds[i].domain = ""; coreWounds[i].severity = ""; coreWounds[i].condition = ""; }
    await this.actor.update({ "system.coreWounds": coreWounds, "system.playState.currentCoreWounds": coreWounds.filter((w) => w.filled).length });
  }

  static async #onToggleDeathTrack(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceNpcSheet.#onTogglePip(this.actor.system.playState.deathTrackStep, i);
    await this.actor.update({ "system.playState.deathTrackStep": next });
  }

  static async #onToggleDeathTrackFrozen() {
    await this.actor.update({ "system.playState.deathTrackFrozen": !this.actor.system.playState.deathTrackFrozen });
  }

  static async #onApplyDamage() {
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Apply Damage" },
        content: `
          <label>Amount <input type="number" name="amount" value="1" min="1" autofocus></label>
          <label>Domain
            <select name="domain">
              <option value="Physical">Physical</option>
              <option value="Mental">Mental</option>
              <option value="Spiritual">Spiritual</option>
            </select>
          </label>
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="breach"> Breach (bypasses Resilience)
          </label>
        `,
        buttons: [{
          action: "apply",
          label: "Apply",
          default: true,
          callback: (event, button) => ({
            amount: Math.max(1, Math.floor(Number(button.form.elements.amount.value)) || 1),
            domain: button.form.elements.domain.value,
            breach: button.form.elements.breach.checked
          })
        }],
        submit: (result) => resolve(result === "apply" ? null : result)
      }).render(true);
    });
    if (!result) return;

    const sys = this.actor.system;
    const resilience = sys.resilience ?? 0;
    const prevAccumulated = sys.playState.accumulatedDamage ?? 0;

    let wounds;
    let newAccumulated = prevAccumulated;
    if (result.breach) {
      wounds = result.amount;
    } else {
      newAccumulated = prevAccumulated + result.amount;
      const prevWounds = Math.max(0, prevAccumulated - resilience);
      const newWounds = Math.max(0, newAccumulated - resilience);
      wounds = newWounds - prevWounds;
    }

    const update = { "system.playState.accumulatedDamage": newAccumulated };
    const log = [];
    let becameCritical = false;

    if (wounds <= 0) {
      log.push(`Absorbed entirely by Resilience — no Wound.`);
    } else {
      let tempWounds = sys.playState.currentTemporaryWounds ?? 0;
      const coreWounds = sys.coreWounds.map((w) => ({ ...w }));
      const SEVERITY_BY_INDEX = ["Light", "Light", "Serious", "Serious", "Critical"];
      let deathTrackStep = sys.playState.deathTrackStep ?? 0;

      for (let i = 0; i < wounds; i++) {
        if (tempWounds > 0) {
          tempWounds -= 1;
          log.push("1 Wound absorbed by a Temporary Wound.");
          continue;
        }
        const slot = coreWounds.findIndex((w) => !w.filled);
        if (slot === -1) {
          deathTrackStep = Math.min(5, deathTrackStep + 1);
          log.push("Core Wound track already full — Death Track advances instead.");
          continue;
        }
        const severity = SEVERITY_BY_INDEX[slot];
        const label = `${severity} ${result.domain} Wound`;
        coreWounds[slot] = { filled: true, domain: result.domain, severity, condition: label };
        log.push(`Core Wound filled: <strong>${label}</strong>.`);
        if (slot === 4) becameCritical = true;
      }

      update["system.playState.currentTemporaryWounds"] = tempWounds;
      update["system.coreWounds"] = coreWounds;
      update["system.playState.currentCoreWounds"] = coreWounds.filter((w) => w.filled).length;
      if (deathTrackStep !== (sys.playState.deathTrackStep ?? 0)) update["system.playState.deathTrackStep"] = deathTrackStep;
    }

    await this.actor.update(update);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> takes ${result.amount} ${result.domain} Damage${result.breach ? " (Breach)" : ""}.</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (becameCritical) {
      ui.notifications.warn(`${this.actor.name} is Critically Wounded! The Death Track has begun.`);
    }
  }

  static async #onRecoverWound() {
    const coreWounds = this.actor.system.coreWounds.map((w) => ({ ...w }));
    let slot = -1;
    for (let i = coreWounds.length - 1; i >= 0; i--) {
      if (coreWounds[i].filled) { slot = i; break; }
    }
    if (slot === -1) {
      ui.notifications.warn(`${this.actor.name} has no Core Wounds to recover.`);
      return;
    }
    const recovered = coreWounds[slot];
    coreWounds[slot] = { filled: false, domain: "", severity: "", condition: "" };
    const update = {
      "system.coreWounds": coreWounds,
      "system.playState.currentCoreWounds": coreWounds.filter((w) => w.filled).length
    };
    if (slot === 4) {
      update["system.playState.deathTrackStep"] = 0;
      update["system.playState.deathTrackFrozen"] = false;
    }
    await this.actor.update(update);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> recovers from their <strong>${recovered.condition}</strong>.</p>`
    });
  }

  /** See EssenceActorSheet#onToggleTempInfluence/#onToggleCoreInfluence/#onApplyInfluenceInjury/
   *  #onRecoverInfluenceInjury — same Influence flow, same reasoning. */
  static async #onToggleTempInfluence(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceNpcSheet.#onTogglePip(this.actor.system.playState.currentTemporaryInfluence, i);
    await this.actor.update({ "system.playState.currentTemporaryInfluence": next });
  }

  static async #onToggleCoreInfluence(event, target) {
    const i = Number(target.dataset.index);
    const coreInfluence = this.actor.system.coreInfluence.map((c) => ({ ...c }));
    coreInfluence[i].filled = !coreInfluence[i].filled;
    if (coreInfluence[i].filled) {
      const severity = SEVERITY_BY_INDEX[i];
      coreInfluence[i].severity = severity;
      coreInfluence[i].condition = `${severity} Injury`;
    } else {
      coreInfluence[i].severity = "";
      coreInfluence[i].condition = "";
    }
    await this.actor.update({ "system.coreInfluence": coreInfluence });
  }

  static async #onApplyInfluenceInjury() {
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Apply Influence Injury" },
        content: `
          <label>Injuries <input type="number" name="amount" value="1" min="1" autofocus></label>
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="voluntary"> Voluntary (skip Temporary Influence, mark Core Influence directly)
          </label>
        `,
        buttons: [{
          action: "apply",
          label: "Apply",
          default: true,
          callback: (event, button) => ({
            amount: Math.max(1, Math.floor(Number(button.form.elements.amount.value)) || 1),
            voluntary: button.form.elements.voluntary.checked
          })
        }],
        submit: (result) => resolve(result === "apply" ? null : result)
      }).render(true);
    });
    if (!result) return;

    const sys = this.actor.system;
    let tempInfluence = sys.playState.currentTemporaryInfluence ?? 0;
    const coreInfluence = sys.coreInfluence.map((c) => ({ ...c }));
    const log = [];
    let becameCritical = false;

    for (let i = 0; i < result.amount; i++) {
      if (!result.voluntary && tempInfluence > 0) {
        tempInfluence -= 1;
        log.push("1 Injury absorbed by a Temporary Influence slot.");
        continue;
      }
      const slot = coreInfluence.findIndex((c) => !c.filled);
      if (slot === -1) {
        log.push("Core Influence track already full — the GM adjudicates any further consequence.");
        continue;
      }
      const severity = SEVERITY_BY_INDEX[slot];
      const condition = `${severity} Injury`;
      coreInfluence[slot] = { filled: true, severity, condition };
      log.push(`Core Influence filled: <strong>${condition}</strong> (recovers in ${INFLUENCE_RECOVERY_TIME[severity]}).`);
      if (slot === 4) becameCritical = true;
    }

    await this.actor.update({
      "system.playState.currentTemporaryInfluence": tempInfluence,
      "system.coreInfluence": coreInfluence
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> takes ${result.amount} Influence ${result.amount === 1 ? "Injury" : "Injuries"}${result.voluntary ? " (Voluntary)" : ""}.</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (becameCritical) {
      ui.notifications.warn(`${this.actor.name} has taken a Critical Influence Injury! This must be actively addressed in the fiction before recovery begins.`);
    }
  }

  static async #onRecoverInfluenceInjury() {
    const coreInfluence = this.actor.system.coreInfluence.map((c) => ({ ...c }));
    let slot = -1;
    for (let i = coreInfluence.length - 1; i >= 0; i--) {
      if (coreInfluence[i].filled) { slot = i; break; }
    }
    if (slot === -1) {
      ui.notifications.warn(`${this.actor.name} has no Core Influence Injuries to recover.`);
      return;
    }

    const recovered = coreInfluence[slot];
    coreInfluence[slot] = { filled: false, severity: "", condition: "" };
    await this.actor.update({ "system.coreInfluence": coreInfluence });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> recovers from their <strong>${recovered.condition}</strong>.</p>`
    });
  }

  /** See EssenceActorSheet#onSpendInfluenceForSlot — same rule, same reasoning. */
  static async #onSpendInfluenceForSlot() {
    const sys = this.actor.system;
    const max = sys.temporaryInfluence ?? 5;
    const current = sys.playState.currentTemporaryInfluence ?? 0;
    if (current >= max) {
      ui.notifications.warn(`${this.actor.name} has no open Temporary Influence slots left to spend.`);
      return;
    }
    await this.actor.update({ "system.playState.currentTemporaryInfluence": current + 1 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> spends 1 Temporary Influence to prepare an additional Signature slot beyond their normal limit.</p>`
    });
  }

  /** See EssenceActorSheet#onContributeToGoal — same rule, same reasoning. */
  static async #onContributeToGoal() {
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Contribute to Shared Goal" },
        content: `
          <label>Shared Goal <input type="text" name="goal" placeholder="e.g. Rebuilding the Guildhall" autofocus></label>
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="narrative"> Narrative only (no Temporary Influence spent, no cost)
          </label>
          <label>Temporary Influence Slots to Spend <input type="number" name="amount" value="1" min="1"></label>
        `,
        buttons: [{
          action: "contribute",
          label: "Contribute",
          default: true,
          callback: (event, button) => ({
            goal: button.form.elements.goal.value.trim(),
            narrative: button.form.elements.narrative.checked,
            amount: Math.max(1, Math.floor(Number(button.form.elements.amount.value)) || 1)
          })
        }],
        submit: (result) => resolve(result === "contribute" ? null : result)
      }).render(true);
    });
    if (!result) return;

    const goalLabel = result.goal || "a shared goal";

    if (result.narrative) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor: this.actor }),
        content: `<p><strong>${this.actor.name}</strong> contributes to <strong>${goalLabel}</strong> narratively (labor, connections, or information) — no Temporary Influence spent, no Injury risked.</p>`
      });
      return;
    }

    const sys = this.actor.system;
    let tempInfluence = sys.playState.currentTemporaryInfluence ?? 0;
    const coreInfluence = sys.coreInfluence.map((c) => ({ ...c }));
    const log = [];
    let becameCritical = false;

    for (let i = 0; i < result.amount; i++) {
      if (tempInfluence > 0) {
        tempInfluence -= 1;
        log.push("1 slot absorbed by a Temporary Influence slot.");
        continue;
      }
      const slot = coreInfluence.findIndex((c) => !c.filled);
      if (slot === -1) {
        log.push("Core Influence track already full — the GM adjudicates any further consequence.");
        continue;
      }
      const severity = SEVERITY_BY_INDEX[slot];
      const condition = `${severity} Injury`;
      coreInfluence[slot] = { filled: true, severity, condition };
      log.push(`Core Influence filled: <strong>${condition}</strong> (recovers in ${INFLUENCE_RECOVERY_TIME[severity]}).`);
      if (slot === 4) becameCritical = true;
    }

    await this.actor.update({
      "system.playState.currentTemporaryInfluence": tempInfluence,
      "system.coreInfluence": coreInfluence
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> contributes ${result.amount} Temporary Influence ${result.amount === 1 ? "slot" : "slots"} to <strong>${goalLabel}</strong>.</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (becameCritical) {
      ui.notifications.warn(`${this.actor.name} has taken a Critical Influence Injury contributing to "${goalLabel}"! This must be actively addressed in the fiction before recovery begins.`);
    }
  }

  /** See EssenceActorSheet's identically-named private methods for the full Adventure-Limited
   *  Reach Trigger reasoning — this NPC sheet has no generic addArrayRow/deleteArrayRow action
   *  (unlike the character sheet), so Add/Delete get their own small dedicated handlers instead. */
  static async #onAddReachTrigger() {
    const triggers = this.actor.system.reachTriggers.map((t) => ({ ...t }));
    triggers.push({ name: "", tempBonus: 1, tempInfluenceGrant: 0, usedThisAdventure: false, active: false });
    await this.actor.update({ "system.reachTriggers": triggers });
  }

  static async #onDeleteReachTrigger(event, target) {
    const i = Number(target.dataset.index);
    const triggers = this.actor.system.reachTriggers.map((t) => ({ ...t }));
    triggers.splice(i, 1);
    await this.actor.update({ "system.reachTriggers": triggers });
  }

  /** See EssenceActorSheet#onActivateReachTrigger — identical mechanic, duplicated per this
   *  project's actor-sheet/npc-sheet convention rather than shared across sheet classes. */
  static async #onActivateReachTrigger(event, target) {
    const i = Number(target.dataset.index);
    const triggers = this.actor.system.reachTriggers.map((t) => ({ ...t }));
    const trigger = triggers[i];
    if (!trigger) return;

    const wasFree = !trigger.usedThisAdventure;
    trigger.usedThisAdventure = true;
    trigger.active = true;

    const maxTemp = this.actor.system.temporaryInfluence ?? 5;
    let tempInfluence = this.actor.system.playState.currentTemporaryInfluence ?? 0;
    const coreInfluence = this.actor.system.coreInfluence.map((c) => ({ ...c }));
    const log = [];

    if (trigger.tempInfluenceGrant) {
      tempInfluence = Math.min(maxTemp, tempInfluence + trigger.tempInfluenceGrant);
      log.push(`Grants ${trigger.tempInfluenceGrant} Temporary Influence usable only this Scene (capped at normal max).`);
    }

    let becameCritical = false;
    if (!wasFree) {
      for (let n = 0; n < 1; n++) {
        if (tempInfluence > 0) {
          tempInfluence -= 1;
          log.push("Additional use this Adventure — 1 Breach absorbed by a Temporary Influence slot.");
          continue;
        }
        const slot = coreInfluence.findIndex((c) => !c.filled);
        if (slot === -1) {
          log.push("Additional use this Adventure — Core Influence track already full, GM adjudicates.");
          continue;
        }
        const severity = SEVERITY_BY_INDEX[slot];
        const condition = `${severity} Injury`;
        coreInfluence[slot] = { filled: true, severity, condition };
        log.push(`Additional use this Adventure — Core Influence filled: <strong>${condition}</strong> (recovers in ${INFLUENCE_RECOVERY_TIME[severity]}).`);
        if (slot === 4) becameCritical = true;
      }
    } else {
      log.push("First use this Adventure — free.");
    }

    await this.actor.update({
      "system.reachTriggers": triggers,
      "system.playState.currentTemporaryInfluence": tempInfluence,
      "system.coreInfluence": coreInfluence
    });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> activates <strong>${trigger.name || "a Reach Trigger"}</strong> (Reach +${trigger.tempBonus} for the current Scene).</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (becameCritical) {
      ui.notifications.warn(`${this.actor.name} has taken a Critical Influence Injury from Influence Breach! This must be actively addressed in the fiction before recovery begins.`);
    }
  }

  static async #onDeactivateReachTrigger(event, target) {
    const i = Number(target.dataset.index);
    const triggers = this.actor.system.reachTriggers.map((t) => ({ ...t }));
    if (!triggers[i]) return;
    triggers[i].active = false;
    await this.actor.update({ "system.reachTriggers": triggers });
  }

  /** See EssenceActorSheet#onResetAdventureUses / resetAdventureUses() in utils.mjs. */
  static async #onResetAdventureUses() {
    await resetAdventureUses(this.actor);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> resets Reach Triggers, Augment Uses, and Equipment Card Uses for a new Adventure.</p>`
    });
  }

  /** See EssenceActorSheet#onItemView — same "eye" View button, same reasoning. */
  static #onItemView(event, target) {
    const sheet = this.actor.items.get(target.dataset.itemId)?.sheet;
    if (sheet?.renderAsView) sheet.renderAsView();
    else sheet?.render(true);
  }

  static #onItemEdit(event, target) {
    this.actor.items.get(target.dataset.itemId)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const confirmed = await foundry.applications.api.DialogV2.confirm({
      window: { title: "Delete Item" },
      content: `<p>Delete <strong>${item.name}</strong>? This cannot be undone.</p>`
    });
    if (confirmed) await item.delete();
  }

  /** See EssenceActorSheet#onChooseGrantedItem for the full reasoning — identical behavior here:
   *  pulls eligible items from the actor's own owned Equipment, not the shared compendium. */
  static async #onChooseGrantedItem(event, target) {
    const sourceName = target.dataset.grantSource;
    const grant = ITEM_GRANT_REGISTRY[sourceName];
    if (!grant) return;

    const reach = this.actor.system.effectiveReach;
    const owned = this.actor.items.filter((i) => i.type === "equipment" && i.system.reachExceptionSource !== sourceName);
    const eligible = owned.filter((i) => equipmentMatchesGrant(i.system, grant) && reachQualifiesForGrant(i.system, grant, reach));
    if (!eligible.length) {
      ui.notifications.warn(`No item in this NPC's Inventory currently qualifies for ${sourceName}.`);
      return;
    }

    const chosenId = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Choose Item — ${sourceName}` },
        content: `<label>Item
          <select name="itemId">${eligible.map((i) => `<option value="${i.id}">${i.name} (Reach ${i.system.cost || 0})</option>`).join("")}</select>
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

    const previous = this.actor.items.filter((i) => i.type === "equipment" && i.system.reachExceptionSource === sourceName);
    for (const p of previous) await p.update({ "system.reachExceptionSource": "", "system.reachExceptionMargin": 0, "system.slotCost": 1 });

    const chosen = this.actor.items.get(chosenId);
    await chosen.update({
      "system.slot": "signature",
      "system.reachExceptionSource": sourceName,
      "system.reachExceptionMargin": grant.reachMargin,
      "system.slotCost": grant.countsAgainstLimit ? 1 : 0
    });
  }
}
