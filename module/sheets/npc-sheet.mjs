import { rollEssencePool } from "../dice/essence-roll.mjs";
import { deriveOriginFeatures } from "../data/origin-features.mjs";
import { setOriginItem, clearOriginItem } from "../data/origin-select.mjs";
import EssenceMonsterWizard from "../apps/monster-wizard.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const ATTRIBUTES = ["might", "grace", "vigor", "intellect", "acuity", "resolve", "presence", "adaptability", "anima"];
const SKILL_GATE = { gestalt: "Gifted", magecraft: "Arcanist", psionics: "Psyker", ritualism: "Invoker", calling: "Summoner" };

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
      rollSkill: EssenceNpcSheet.#onRollSkill,
      rollItem: EssenceNpcSheet.#onRollItem,
      rollInitiative: EssenceNpcSheet.#onRollInitiative,
      endTurn: EssenceNpcSheet.#onEndTurn,
      burnDice: EssenceNpcSheet.#onBurnDice,
      applyDamage: EssenceNpcSheet.#onApplyDamage,
      recoverWound: EssenceNpcSheet.#onRecoverWound,
      toggleTempWound: EssenceNpcSheet.#onToggleTempWound,
      toggleCoreWound: EssenceNpcSheet.#onToggleCoreWound,
      toggleDeathTrack: EssenceNpcSheet.#onToggleDeathTrack,
      toggleDeathTrackFrozen: EssenceNpcSheet.#onToggleDeathTrackFrozen,
      itemEdit: EssenceNpcSheet.#onItemEdit,
      itemDelete: EssenceNpcSheet.#onItemDelete,
      selectOrigin: EssenceNpcSheet.#onSelectOrigin,
      clearOrigin: EssenceNpcSheet.#onClearOrigin
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/actor/npc-sheet.hbs" }
  };

  _onRender(context, options) {
    super._onRender(context, options);
    this.#applyEditable();
    this.#wireCardFilter();
  }

  /** Mirrors EssenceActorSheet#applyEditable — see that class for why .window-content is scoped. */
  #applyEditable() {
    if (this.isEditable) return;
    const body = this.element.querySelector(".window-content") ?? this.element;
    for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) el.disabled = true;
    for (const el of body.querySelectorAll("button[data-action], a[data-action]")) {
      el.classList.add("locked");
      el.style.pointerEvents = "none";
    }
  }

  /** Mirrors EssenceActorSheet#wireCardFilter — see that class for why. */
  #wireCardFilter() {
    const input = this.element.querySelector("[data-card-filter]");
    if (!input) return;
    input.addEventListener("input", (e) => {
      const q = e.currentTarget.value.trim().toLowerCase();
      for (const li of this.element.querySelectorAll(".card-list li[data-card-name]")) {
        li.hidden = !!q && !li.dataset.cardName.toLowerCase().includes(q);
      }
    });
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
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
      attrs: d.attrs.map((key) => ({ key, label: key, value: system[key] })),
      skills: d.skills.map((key) => {
        const gateDistinction = SKILL_GATE[key];
        const gateOpen = !gateDistinction || distinctionItem?.system.unlocks === key;
        return { key, label: key, value: system[key], pips: pips(system[key]), gateDistinction, gateOpen };
      }),
      resourceLabel: d.resource,
      resourceCurrent: system.playState[`current${d.resource[0].toUpperCase()}${d.resource.slice(1)}`],
      resourceMax: system.resources[d.resource].max,
      defenseLabel: d.defense,
      defenseValue: system.defenses[d.defense]
    }));

    context.temporaryWoundPips = pips(system.playState.currentTemporaryWounds, system.temporaryWoundsAvailable);
    context.deathTrackPips = pips(system.playState.deathTrackStep, 5);

    context.actionCards = this.actor.items.filter((i) => i.type === "action-card");
    context.reactionCards = this.actor.items.filter((i) => i.type === "reaction-card");
    context.conditions = this.actor.items.filter((i) => i.type === "condition");
    context.equipment = this.actor.items.filter((i) => i.type === "equipment");

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

    const committed = await EssenceNpcSheet.#promptDiceCount({
      title: `Use ${item.name}`,
      label: `Commit how many ${poolLabel} Dice? (min ${cardMin}, max ${available})`,
      min: cardMin, max: available, initial: cardMin
    });
    if (committed === null) return;

    const defenseKey = (sys.defense || "").toLowerCase();
    const { defense, targets } = await EssenceNpcSheet.#resolveTargets(defenseKey);
    await this.actor.update({ [`system.playState.${poolField}`]: available - committed });
    await rollEssencePool({ pool: committed, defense, targets, label: item.name, actor: this.actor, surgeOptions: sys.surges });
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
}
