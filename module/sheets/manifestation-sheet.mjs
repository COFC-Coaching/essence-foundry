import { rollEssencePool } from "../dice/essence-roll.mjs";
import { SEVERITY_BY_INDEX, cardSummary } from "../utils.mjs";
import { dismissManifestation, applyManifestationDefeat, MANIFESTATION_FLAG_SCOPE } from "../apps/manifestation.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/**
 * A compact, purpose-built sheet for Calling Full Manifestation profiles (EssenceManifestationData)
 * — deliberately NOT built on top of EssenceNpcSheet. A profile has no Species/Heritage/Distinction,
 * no Role, no Non-Combat Skills, no Influence, and no build-a-monster tooling (Monster Creator,
 * Attribute/Skill point-buy) to show, because none of it applies: every number here comes straight
 * from the printed profile table, not a GM's hand-built stat block. See module/apps/manifestation.mjs
 * for the swap mechanism this sheet's header controls drive.
 */
export default class EssenceManifestationSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "actor", "manifestation"],
    position: { width: 520, height: 640 },
    form: { submitOnChange: true },
    actions: {
      editTokenImage: EssenceManifestationSheet.#onEditTokenImage,
      toggleEditLock: EssenceManifestationSheet.#onToggleEditLock,
      rollItem: EssenceManifestationSheet.#onRollItem,
      endTurn: EssenceManifestationSheet.#onEndTurn,
      adjustPoolDice: EssenceManifestationSheet.#onAdjustPoolDice,
      applyDamage: EssenceManifestationSheet.#onApplyDamage,
      recoverWound: EssenceManifestationSheet.#onRecoverWound,
      toggleCoreWound: EssenceManifestationSheet.#onToggleCoreWound,
      itemView: EssenceManifestationSheet.#onItemView,
      itemEdit: EssenceManifestationSheet.#onItemEdit,
      itemDelete: EssenceManifestationSheet.#onItemDelete,
      dismissManifestation: EssenceManifestationSheet.#onDismissManifestation,
      applyManifestationDefeat: EssenceManifestationSheet.#onApplyManifestationDefeat
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/actor/manifestation-sheet.hbs" }
  };

  #editUnlocked = false;

  /** Every manifestation Actor IS a manifestation clone by construction (see
   *  manifestationProfileToActor()/getOrCreateProfileActor()) — unlike the NPC sheet's identical
   *  controls, these never need an `if` guard for whether the flag is set. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    const callerId = this.actor.getFlag(MANIFESTATION_FLAG_SCOPE, "manifestationOf");
    const caller = callerId ? game.actors.get(callerId) : null;
    controls.push({
      icon: "fa-solid fa-arrow-rotate-left",
      label: game.i18n.format("ESSENCE.Character.ReturnToCallerControl", { name: caller?.name ?? "Caller" }),
      action: "dismissManifestation"
    });
    controls.push({
      icon: "fa-solid fa-skull",
      label: game.i18n.localize("ESSENCE.Character.ApplyManifestationDefeatControl"),
      action: "applyManifestationDefeat"
    });
    return controls;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#applyEditable();
  }

  /** Mirrors EssenceActorSheet#applyEditable — action buttons stay live even while locked. */
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

  static async #onEditTokenImage() {
    const fp = new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current: this.actor.prototypeToken.texture.src,
      callback: (path) => this.actor.prototypeToken.update({ "texture.src": path })
    });
    return fp.browse();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const system = this.actor.system;
    context.actor = this.actor;
    context.system = system;
    context.isEditable = this.isEditable;
    context.editUnlocked = this.#editUnlocked;
    context.woundBoxes = system.coreWounds.map((w, i) => ({ ...w, i }));

    const callerId = this.actor.getFlag(MANIFESTATION_FLAG_SCOPE, "manifestationOf");
    context.caller = callerId ? game.actors.get(callerId) : null;

    context.maneuvers = this.actor.items
      .filter((i) => i.type === "action-card" || i.type === "reaction-card")
      .map((i) => ({ id: i.id, name: i.name, type: i.type, summary: cardSummary(i.system) }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)));

    return context;
  }

  static async #onAdjustPoolDice(event, target) {
    const field = target.dataset.field;
    const delta = Number(target.dataset.delta) || 0;
    const current = this.actor.system.playState[field] ?? 0;
    const next = Math.max(0, current + delta);
    await this.actor.update({ [`system.playState.${field}`]: next });
  }

  /** No Roll Initiative here — the same Combatant slot the caller already holds in the tracker
   *  carries over unchanged (see manifestation.mjs's enterManifestation); re-rolling would only
   *  confuse turn order. End Turn still applies normally. */
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

  static async #promptDiceCount({ title, label, min, max, initial }) {
    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title },
        content: `<p>${label}</p><input type="number" name="count" value="${initial}" min="${min}" max="${max}" autofocus>`,
        buttons: [{
          action: "commit",
          label: "Roll",
          default: true,
          callback: (event, button) => {
            const raw = Number(button.form.elements.count.value);
            const n = Number.isFinite(raw) ? raw : initial;
            return Math.min(max, Math.max(min, n));
          }
        }],
        submit: (result) => resolve(result)
      }).render(true);
    });
  }

  /** Identical to EssenceActorSheet's own #resolveTargets — see that copy for the full rationale. */
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

  /**
   * Rolling a maneuver spends from THIS actor's own Action/Reaction Dice pool (copied over from
   * the caller at entry, see manifestation.mjs) — that part is identical to any other card roll.
   * Its printed Mana cost is different: a maneuver has no Resource pool of its own to pay from
   * ("uses your existing... Resources" per the shared manifestation procedure), so that cost comes
   * out of the CALLER's actual Mana, found via this actor's own essence-system flag.
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
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoPoolDiceRemaining", { label: poolLabel }));
      return;
    }
    if (cardMin > available) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardRequiresMoreDice", { name: item.name, min: cardMin, available, label: poolLabel }));
      return;
    }

    const committed = await EssenceManifestationSheet.#promptDiceCount({
      title: `Use ${item.name}`,
      label: `Commit how many ${poolLabel} Dice? (min ${cardMin}, max ${available})`,
      min: cardMin, max: available, initial: cardMin
    });
    if (committed === null) return;

    const defenseKey = (sys.defense || "").toLowerCase();
    const { defense, targets } = await EssenceManifestationSheet.#resolveTargets(defenseKey);

    await this.actor.update({ [`system.playState.${poolField}`]: available - committed });

    const cost = Number(sys.cost) || 0;
    const callerId = this.actor.getFlag(MANIFESTATION_FLAG_SCOPE, "manifestationOf");
    const caller = callerId ? game.actors.get(callerId) : null;
    if (cost > 0 && caller) {
      const current = caller.system.resources.mana.value;
      await caller.update({ "system.playState.currentMana": Math.max(0, current - cost) });
      if (cost > current) {
        ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardCostExceedsResource", { name: item.name, cost, resource: "Mana", actorName: caller.name, current }));
      }
    }

    await rollEssencePool({ pool: committed, defense, targets, label: item.name, actor: this.actor, surgeOptions: sys.surges, bonusSurges: 0 });
  }

  /**
   * Same accumulation math as every other Apply Damage (see actor-sheet.mjs's identical, more
   * fully-commented version) with one difference: once coreWounds is completely full, further
   * Wounds increment `overflowWounds` instead of advancing a Death Track — a manifestation has none
   * (see EssenceManifestationData) — for applyManifestationDefeat() to read once the GM/player
   * resolves the defeat from this sheet's header menu.
   */
  static async #onApplyDamage() {
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Apply Damage" },
        content: `
          <label>Amount <input type="number" name="amount" value="1" min="1" autofocus></label>
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
            breach: button.form.elements.breach.checked
          })
        }],
        submit: (result) => resolve(result)
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

    if (wounds <= 0) {
      log.push("Absorbed entirely by Resilience — no Wound.");
    } else {
      let tempWounds = sys.playState.currentTemporaryWounds ?? 0;
      const coreWounds = sys.coreWounds.map((w) => ({ ...w }));
      let overflowWounds = sys.playState.overflowWounds ?? 0;

      for (let i = 0; i < wounds; i++) {
        if (tempWounds > 0) {
          tempWounds -= 1;
          log.push("1 Wound absorbed by a Temporary Wound.");
          continue;
        }
        const slot = coreWounds.findIndex((w) => !w.filled);
        if (slot === -1) {
          overflowWounds += 1;
          log.push("Wound Track already full — this Wound will overflow to the caller on defeat.");
          continue;
        }
        const severity = SEVERITY_BY_INDEX[slot];
        const label = `${severity} Wound`;
        coreWounds[slot] = { filled: true, domain: "", severity, condition: label };
        log.push(`Wound filled: <strong>${label}</strong>.`);
      }

      update["system.playState.currentTemporaryWounds"] = tempWounds;
      update["system.coreWounds"] = coreWounds;
      update["system.playState.overflowWounds"] = overflowWounds;
    }

    await this.actor.update(update);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> takes ${result.amount} Damage${result.breach ? " (Breach)" : ""}.</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (this.actor.system.defeated) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.ManifestationDefeated", { name: this.actor.name }));
    }
  }

  static async #onRecoverWound() {
    const coreWounds = this.actor.system.coreWounds.map((w) => ({ ...w }));
    let slot = -1;
    for (let i = coreWounds.length - 1; i >= 0; i--) {
      if (coreWounds[i].filled) { slot = i; break; }
    }
    if (slot === -1) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoCoreWoundsToRecover", { name: this.actor.name }));
      return;
    }
    coreWounds[slot] = { filled: false, domain: "", severity: "", condition: "" };
    await this.actor.update({ "system.coreWounds": coreWounds });
  }

  static async #onToggleCoreWound(event, target) {
    const i = Number(target.dataset.index);
    const coreWounds = this.actor.system.coreWounds.map((w) => ({ ...w }));
    coreWounds[i].filled = !coreWounds[i].filled;
    if (!coreWounds[i].filled) { coreWounds[i].domain = ""; coreWounds[i].severity = ""; coreWounds[i].condition = ""; }
    await this.actor.update({ "system.coreWounds": coreWounds });
  }

  static #onItemView(event, target) {
    this.actor.items.get(target.dataset.itemId)?.sheet.render(true);
  }

  static #onItemEdit(event, target) {
    this.actor.items.get(target.dataset.itemId)?.sheet.render(true);
  }

  static async #onItemDelete(event, target) {
    await this.actor.items.get(target.dataset.itemId)?.delete();
  }

  static async #onDismissManifestation() {
    await dismissManifestation(this.actor);
  }

  static async #onApplyManifestationDefeat() {
    await applyManifestationDefeat(this.actor);
  }
}
