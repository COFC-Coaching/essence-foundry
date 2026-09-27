import { rollEssencePool } from "../dice/essence-roll.mjs";
import { cardSummary, resolveDamageComponents, applyFlatReduction, DAMAGE_TYPES, MANIFESTATION_ENTRY_COSTS, MANIFESTATION_TRACK } from "../utils.mjs";
import { promptDamageComponents } from "./card-play.mjs";
import { returnFromManifestation, collapseManifestation, applyManifestationDefeat, MANIFESTATION_FLAG_SCOPE } from "../apps/manifestation.mjs";

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
    window: { resizable: true },
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
    body: { template: "systems/essence-system/templates/actor/manifestation-sheet.hbs", scrollable: [".sheet-scroll"] }
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
    // See EssenceActor#formEndOfTurnReactionPool — shared with EssenceCombat#_onEndTurn, which
    // fires again when the tracker advances below and then does nothing (the Turn is already over).
    await this.actor.formEndOfTurnReactionPool();
    if (game.combat?.combatant?.actor?.id === this.actor.id) {
      await game.combat.nextTurn();
    }
  }

  static async #promptDiceCount({ title, label, min, max, initial, note = "" }) {
    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title },
        content: `<p>${label}</p>${note ? `<p class="muted">${note}</p>` : ""}<input type="number" name="count" value="${initial}" min="${min}" max="${max}" autofocus>`,
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
    // Doc L6323-L6331: the form's native Action and Reaction minimums by Rank (Rank 2 Reactions
    // stay at 2); a card's own printed minimum can only raise them.
    const row = MANIFESTATION_ENTRY_COSTS[Math.min(5, Math.max(0, this.actor.system.rank ?? 0))];
    const nativeMin = isReaction ? row.reactionMin : row.actionMin;
    const cardMin = Math.max(nativeMin, parseInt(sys.min, 10) || 1);

    if (available <= 0) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoPoolDiceRemaining", { label: poolLabel }));
      return;
    }
    if (cardMin > available) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardRequiresMoreDice", { name: item.name, min: cardMin, available, label: poolLabel }));
      return;
    }

    // Doc L6321: a printed Roll Limit replaces Attribute + Style Rank; free dice may exceed it.
    const rollLimit = this.actor.system.rollLimit;
    const note = typeof rollLimit === "number" ? `Advisory: this form's Roll Limit is ${rollLimit} dice (native minimum ${nativeMin}). Committing more is allowed but exceeds the printed maximum.` : `Native minimum for a Rank ${this.actor.system.rank ?? 0} form: ${nativeMin} dice.`;
    const committed = await EssenceManifestationSheet.#promptDiceCount({
      title: `Use ${item.name}`,
      label: `Commit how many ${poolLabel} Dice? (min ${cardMin}, max ${available})`,
      min: cardMin, max: available, initial: cardMin, note
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
   * Apply Damage for a Full Manifestation (Doc L3896-L3918, L6381-L6385). The flat reduction is
   * applied once across the whole hit, then components resolve one at a time against the shared
   * Manifestation Wound track. The component that fills the track collapses the form at once: its
   * surplus Wounds are discarded, the caller returns and takes the direct Spiritual Core Wound, and
   * any later components are posted for the GM to recheck against the returned caller by hand.
   * Ordinary accumulated Damage is not reset by the collapse.
   */
  static async #onApplyDamage() {
    const picked = await promptDamageComponents({ types: DAMAGE_TYPES });
    if (!picked) return;

    const sys = this.actor.system;
    const live = picked.components.filter((c) => (c.amount | 0) > 0);
    // Reduction first, across the whole hit (Doc L3900), so each component below carries its
    // reduced amount into its own resolution.
    const reducedAmounts = applyFlatReduction(live.map((c) => c.amount), picked.reduction);
    let state = {
      resilience: sys.resilience ?? 0,
      accumulated: sys.playState.accumulatedDamage ?? 0,
      tempWounds: sys.playState.currentTemporaryWounds ?? 0,
      coreWounds: sys.coreWounds,
      capacity: MANIFESTATION_TRACK,
      overflow: "none",
      resistances: sys.resistances,
      vulnerabilities: sys.vulnerabilities
    };
    const log = [];
    if (picked.reduction > 0) log.push(`Flat reduction −${picked.reduction} applied once to the total: ${reducedAmounts.map((n, i) => `${n} ${live[i].type}`).join(" + ")}.`);
    let collapsedAt = -1;
    for (let i = 0; i < live.length; i++) {
      const result = resolveDamageComponents(state, [{ ...live[i], amount: reducedAmounts[i] }], 0);
      log.push(...result.log);
      state = { ...state, accumulated: result.accumulated, tempWounds: result.tempWounds, coreWounds: result.coreWounds };
      const filled = result.coreWounds.filter((w) => w.filled).length;
      if (filled >= MANIFESTATION_TRACK) {
        collapsedAt = i;
        if (result.overflowCount > 0) log.push(`${result.overflowCount} surplus Wound(s) from this component are discarded (Doc: collapse).`);
        break;
      }
    }

    await this.actor.update({
      "system.playState.accumulatedDamage": state.accumulated,
      "system.playState.currentTemporaryWounds": state.tempWounds,
      "system.coreWounds": state.coreWounds
    });

    const summary = live.map((c) => `${c.amount} ${c.type}${c.breach ? " (Breach)" : ""}${c.nonlethal ? " (nonlethal)" : ""}`).join(" + ");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> takes ${summary}${picked.reduction ? `, reduced by ${picked.reduction}` : ""}.</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (collapsedAt >= 0) {
      const remaining = live.slice(collapsedAt + 1).map((c, j) => ({ ...c, amount: reducedAmounts[collapsedAt + 1 + j] }));
      await collapseManifestation(this.actor, { remaining });
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

  /** Doc L6361: a voluntary return during the Turn burns 1 Action die. */
  static async #onDismissManifestation() {
    await returnFromManifestation(this.actor, { reason: "voluntary" });
  }

  static async #onApplyManifestationDefeat() {
    await applyManifestationDefeat(this.actor);
  }
}
