import { rollEssencePool } from "../dice/essence-roll.mjs";
import { deriveOriginFeatures } from "../data/origin-features.mjs";
import { setOriginItem, clearOriginItem } from "../data/origin-select.mjs";
import { ITEM_GRANT_REGISTRY, deriveActiveGrants, equipmentMatchesGrant, reachQualifiesForGrant } from "../data/item-grants.mjs";
import { deriveEquipmentStats, equipmentEffectSummary, buildEquipmentResolver } from "../data/equipment-features.mjs";
import { EQUIPMENT_CATEGORY_LABELS } from "../data/item-card.mjs";
import EssenceMonsterWizard from "../apps/monster-wizard.mjs";
import { capitalize, cardSummary, domainResource, hasMastery, computeReachGate, computeEquipmentBonusSources, resetAdventureUses, resolveEquipmentDropSlot, stripHtml, buildEnemyHeaderLabel, SEVERITY_BY_INDEX, attachConsequenceCard, attachConsequenceCards, removeConsequenceCard, applyResistanceVulnerability, DAMAGE_TYPES, cardOnCooldown, applyCardCooldown, resetEncounterCooldowns } from "../utils.mjs";
import { dismissManifestation, applyManifestationDefeat, MANIFESTATION_FLAG_SCOPE } from "../apps/manifestation.mjs";

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
    position: { width: 760, height: 720 },
    form: { submitOnChange: true },
    // Scoped to .draggable-row rather than a bare [data-item-id] selector — see the matching
    // comment in actor-sheet.mjs's DEFAULT_OPTIONS.
    dragDrop: [{ dragSelector: ".draggable-row", dropSelector: null }],
    actions: {
      openWizard: EssenceNpcSheet.#onOpenWizard,
      editTokenImage: EssenceNpcSheet.#onEditTokenImage,
      toggleEditLock: EssenceNpcSheet.#onToggleEditLock,
      rollSkill: EssenceNpcSheet.#onRollSkill,
      rollItem: EssenceNpcSheet.#onRollItem,
      rollEquipmentCard: EssenceNpcSheet.#onRollEquipmentCard,
      toggleEquipmentCard: EssenceNpcSheet.#onToggleEquipmentCard,
      rollInitiative: EssenceNpcSheet.#onRollInitiative,
      endTurn: EssenceNpcSheet.#onEndTurn,
      applyDamage: EssenceNpcSheet.#onApplyDamage,
      recoverWound: EssenceNpcSheet.#onRecoverWound,
      adjustResource: EssenceNpcSheet.#onAdjustResource,
      adjustPoolDice: EssenceNpcSheet.#onAdjustPoolDice,
      toggleTempWound: EssenceNpcSheet.#onToggleTempWound,
      toggleCoreWound: EssenceNpcSheet.#onToggleCoreWound,
      toggleDeathTrack: EssenceNpcSheet.#onToggleDeathTrack,
      toggleDeathTrackStabilized: EssenceNpcSheet.#onToggleDeathTrackStabilized,
      toggleTempInfluence: EssenceNpcSheet.#onToggleTempInfluence,
      toggleCoreInfluence: EssenceNpcSheet.#onToggleCoreInfluence,
      applyInfluenceInjury: EssenceNpcSheet.#onApplyInfluenceInjury,
      recoverInfluenceInjury: EssenceNpcSheet.#onRecoverInfluenceInjury,
      contributeToGoal: EssenceNpcSheet.#onContributeToGoal,
      addReachTrigger: EssenceNpcSheet.#onAddReachTrigger,
      deleteReachTrigger: EssenceNpcSheet.#onDeleteReachTrigger,
      activateReachTrigger: EssenceNpcSheet.#onActivateReachTrigger,
      deactivateReachTrigger: EssenceNpcSheet.#onDeactivateReachTrigger,
      resetAdventureUses: EssenceNpcSheet.#onResetAdventureUses,
      newEncounter: EssenceNpcSheet.#onNewEncounter,
      addTactic: EssenceNpcSheet.#onAddTactic,
      deleteTactic: EssenceNpcSheet.#onDeleteTactic,
      addLeaderAbility: EssenceNpcSheet.#onAddLeaderAbility,
      deleteLeaderAbility: EssenceNpcSheet.#onDeleteLeaderAbility,
      addSoloAbility: EssenceNpcSheet.#onAddSoloAbility,
      deleteSoloAbility: EssenceNpcSheet.#onDeleteSoloAbility,
      addAbility: EssenceNpcSheet.#onAddAbility,
      deleteAbility: EssenceNpcSheet.#onDeleteAbility,
      useAbility: EssenceNpcSheet.#onUseAbility,
      itemView: EssenceNpcSheet.#onItemView,
      itemEdit: EssenceNpcSheet.#onItemEdit,
      itemDelete: EssenceNpcSheet.#onItemDelete,
      postEquipmentToChat: EssenceNpcSheet.#onPostEquipmentToChat,
      createEquipment: EssenceNpcSheet.#onCreateEquipment,
      reconfigureItem: EssenceNpcSheet.#onReconfigureItem,
      releaseItem: EssenceNpcSheet.#onReleaseItem,
      toggleItemUsed: EssenceNpcSheet.#onToggleItemUsed,
      selectOrigin: EssenceNpcSheet.#onSelectOrigin,
      clearOrigin: EssenceNpcSheet.#onClearOrigin,
      chooseGrantedItem: EssenceNpcSheet.#onChooseGrantedItem,
      dismissManifestation: EssenceNpcSheet.#onDismissManifestation,
      applyManifestationDefeat: EssenceNpcSheet.#onApplyManifestationDefeat,
      addResistance: EssenceNpcSheet.#onAddResistance,
      removeResistance: EssenceNpcSheet.#onRemoveResistance,
      addVulnerability: EssenceNpcSheet.#onAddVulnerability,
      removeVulnerability: EssenceNpcSheet.#onRemoveVulnerability
    }
  };

  /** The reverse side of EssenceActorSheet's "Full Manifestation" header control — shown only on
   *  an NPC Actor that IS a manifestation clone (see manifestation.mjs's essence-system flags),
   *  never on an ordinary monster/adversary NPC. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    const callerId = this.actor.getFlag(MANIFESTATION_FLAG_SCOPE, "manifestationOf");
    if (!callerId) return controls;
    const caller = game.actors.get(callerId);
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

  /** Equipment tab Inventory/Temporary/Armory drop zones — see the matching, more fully commented
   *  override in actor-sheet.mjs; identical behavior here. */
  async _onDropItem(event, item) {
    const dropSlot = resolveEquipmentDropSlot(event);
    if (item.type !== "equipment" || !dropSlot) return super._onDropItem(event, item);

    if (item.actor?.id === this.actor.id) {
      if (item.system.slot !== dropSlot) await item.update({ "system.slot": dropSlot });
      return item;
    }
    const created = await super._onDropItem(event, item);
    if (created?.type === "equipment" && created.system.slot !== dropSlot) {
      await created.update({ "system.slot": dropSlot });
    }
    return created;
  }

  /** See the matching override in actor-sheet.mjs. */
  _onDragStart(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
  }

  /** Mirrors EssenceActorSheet#applyEditable — see that class for why .window-content is scoped
   *  and why the default-locked-for-owners behavior never touches action buttons. */
  #applyEditable() {
    const body = this.element.querySelector(".window-content") ?? this.element;
    if (!this.isEditable) {
      // See EssenceActorSheet#applyEditable — [data-card-filter]/[data-card-sort] are pure
    // client-side view controls with no `name` attribute, so the safety lock has nothing to
    // protect by disabling them.
    for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) {
      if (el.matches("[data-card-filter], [data-card-sort]")) continue;
      el.disabled = true;
    }
      for (const el of body.querySelectorAll("button[data-action], a[data-action]")) {
        el.classList.add("locked");
        el.style.pointerEvents = "none";
      }
      return;
    }
    if (this.#editUnlocked) return;
    // See EssenceActorSheet#applyEditable — [data-card-filter]/[data-card-sort] are pure
    // client-side view controls with no `name` attribute, so the safety lock has nothing to
    // protect by disabling them.
    for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) {
      if (el.matches("[data-card-filter], [data-card-sort]")) continue;
      el.disabled = true;
    }
  }

  static #onToggleEditLock() {
    this.#editUnlocked = !this.#editUnlocked;
    this.render();
  }

  /** Mirrors EssenceActorSheet#wireCardControls — see that class for why. */
  #wireCardControls() {
    const input = this.element.querySelector("[data-card-filter]");
    input?.addEventListener("input", (e) => {
      // See EssenceActorSheet#wireCardControls — stops this reaching the form-level
      // submitOnChange listener, which otherwise re-rendered the whole sheet on every keystroke/
      // selection and silently undid the filter/sort just applied.
      e.stopPropagation();
      const q = e.currentTarget.value.trim().toLowerCase();
      for (const li of this.element.querySelectorAll(".card-list li[data-card-name]")) {
        const haystack = `${li.dataset.cardName} ${li.dataset.cardSummary ?? ""}`.toLowerCase();
        li.hidden = !!q && !haystack.includes(q);
      }
    });

    for (const select of this.element.querySelectorAll("[data-card-sort]")) {
      select.addEventListener("change", (e) => {
        e.stopPropagation();
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
    // See buildEquipmentResolver's own doc comment (equipment-features.mjs) — falls back to the
    // compendium for a modular item's chassisItemId/fittingItemId that was never actually
    // embedded on this actor.
    const equipmentResolver = await buildEquipmentResolver(this.actor);
    context.equipmentBonusSources = computeEquipmentBonusSources(this.actor.items, (item) => deriveEquipmentStats(equipmentResolver, item));

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

    context.headerLabel = buildEnemyHeaderLabel(system);
    context.tactics = (system.tactics ?? []).map((text, i) => ({ text, i }));
    context.leaderAbilities = (system.leaderAbilities ?? []).map((a, i) => ({ ...a, i }));
    context.soloAbilities = (system.soloAbilities ?? []).map((a, i) => ({ ...a, i }));

    // V6: every Grade rolls the same way now (plan §5.1.4/§9.5) — the old Mook/Normal-only
    // Reduced Engine template split is gone, so this list is just a plain general-purpose ability
    // reference available on any Grade (see actor-adversary.mjs's class doc comment).
    context.abilities = (system.abilities ?? []).map((a, i) => ({ ...a, i }));

    context.temporaryWoundPips = pips(system.playState.currentTemporaryWounds, system.temporaryWoundsAvailable);
    // V6: track length is deathTrackMax (5, or 7 for Deathless — design/v6-revision-delta.md §2.3).
    context.deathTrackPips = pips(system.playState.deathTrackStep, system.deathTrackMax);
    // V6: the Death Track block only shows once ALL Core Wound spaces are filled — see
    // EssenceActorSheet's identical context.deathTrackActive for the full comment. Adversaries stop
    // using the Death Track entirely once usesSimplifiedWounds lands (0.6.78) — see that flag below.
    context.deathTrackActive = system.coreWoundsFilled === system.coreWounds.length && !system.usesSimplifiedWounds;
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

    // An NPC/Monster has one Equipment container, not the PC's Inventory/Temporary/Armory
    // loadout-preparation split (see part-iii-playing-the-game.md § Preparing Equipment — a
    // Planning-phase concept that doesn't apply to an adversary). Chassis/Fitting/Augment are
    // likewise "just a part of Equipment," not a separate inventory concept, so they're folded
    // into the same flat list. Everything here still lives in the "inventory" slot under the hood
    // (see #onCreateEquipment/EssenceActorSheet's identical _onDropItem override) purely so
    // equipment-effects.mjs's active-bonus gate treats it as equipped rather than silently inert —
    // the GM never sees or manages that distinction.
    // See EssenceActorSheet#_prepareContext for the full Reach-gating reasoning (computeReachGate()
    // in utils.mjs) — same soft, non-blocking over-Reach flag here, reading effectiveReach (base
    // Reach + any active Reach Triggers) rather than raw system.reach.
    const equipmentView = (item) => {
      const { reachCost, exceptionSource, overReach } = computeReachGate(item.system, system.effectiveReach);
      return { id: item.id, name: item.name, system: item.system, reachCost, exceptionSource, overReach, tracksUsedFlag: true };
    };
    const componentView = (item) => ({
      id: item.id,
      name: item.name,
      system: { category: capitalize(item.type), usedThisAdventure: item.system.usedThisAdventure ?? false },
      reachCost: null,
      exceptionSource: "",
      overReach: false,
      // See EssenceActorSheet's componentView for the full rationale — Augments are always 0
      // capacity and don't carry usedThisAdventure.
      tracksUsedFlag: item.type !== "augment"
    });
    const equipment = this.actor.items.filter((i) => i.type === "equipment");
    context.equipment = [
      ...equipment.map(equipmentView),
      ...this.actor.items.filter((i) => ["chassis", "fitting", "augment"].includes(i.type)).map(componentView)
    ];
    context.itemGrants = deriveActiveGrants({ speciesItem, heritageItem }, equipment);

    // See EssenceActorSheet#_prepareContext's identical block for the full reasoning.
    const equipmentCardSummary = (effect) => {
      const text = stripHtml(effect);
      return text.length > 140 ? `${text.slice(0, 139)}…` : text;
    };
    context.equipmentCards = [];
    for (const item of equipment) {
      if (item.system.isModular) {
        for (const g of deriveEquipmentStats(equipmentResolver, item).grantedCards) {
          context.equipmentCards.push({ source: item.name, name: g.source, effect: g.effect, summary: equipmentCardSummary(g.effect), uses: g.uses, usesRemaining: g.usesRemaining, itemId: g.itemId ?? null, cardIndex: null });
        }
      }
      (item.system.equipmentCards ?? []).forEach((c, cardIndex) => {
        context.equipmentCards.push({ source: item.name, name: c.name, effect: c.effect, summary: equipmentCardSummary(c.effect), uses: c.uses, usesRemaining: c.usesRemaining, itemId: item.id, cardIndex });
      });
    }

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
  static async #promptDiceCount({ title, label, min, max, initial, note = "", extraCheckbox = null }) {
    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title },
        content: `<p>${label}</p>${note ? `<p class="muted">${note}</p>` : ""}<input type="number" name="count" value="${initial}" min="${min}" max="${max}" autofocus>${extraCheckbox ? `<label style="display:flex;align-items:center;gap:6px;margin-top:6px;"><input type="checkbox" name="extra"> ${extraCheckbox.label}</label>` : ""}`,
        buttons: [
          {
            action: "commit",
            label: "Roll",
            default: true,
            callback: (event, button) => {
              const raw = Number(button.form.elements.count.value);
              const n = Number.isFinite(raw) ? raw : initial;
              const count = Math.min(max, Math.max(min, n));
              return extraCheckbox ? { count, extra: button.form.elements.extra.checked } : count;
            }
          },
          { action: "cancel", label: "Cancel", callback: () => "essence-cancelled" }
        ],
        submit: (result) => resolve(result === "essence-cancelled" ? null : result)
      }).render(true);
    });
  }

  /**
   * See EssenceActorSheet#maxRolledDiceNote — same V6 §5.2.2/design/v6-revision-delta.md §2.5-§2.6
   * advisory, same reasoning. An enemy profile's Roll Limit (§2.6: "a per-card maximum, not a
   * separate pool") is exactly this same `rollLimit` field on the card, so no separate handling is
   * needed for NPCs/Monsters.
   */
  static #maxRolledDiceNote(actor, sys) {
    if (typeof sys?.rollLimit === "number") {
      return `Advisory: this card's printed roll limit is ${sys.rollLimit} dice. Committing more is allowed but exceeds the printed maximum.`;
    }
    if (!sys?.attr || !sys?.skill) return "";
    const raw = (actor.system[sys.attr] ?? 0) + (actor.system[sys.skill] ?? 0);
    const isBasicOrRank0 = !sys.style || (Number(sys.rank) || 0) === 0;
    const maxRolled = isBasicOrRank0 ? Math.max(2, raw) : raw;
    return `Advisory: this card's normal maximum is ${maxRolled} dice (${capitalize(sys.attr)} + ${capitalize(sys.skill)} Rank${isBasicOrRank0 ? ", floored at 2 for a Basic/Rank 0 card" : ""}). Committing more is allowed but exceeds the printed maximum.`;
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
        ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.NoActionDiceRemaining"));
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
    await rollEssencePool({ pool, label: `${capitalize(attr)} + ${capitalize(skill)}`, actor: this.actor, nonCombat: true });
  }

  static async #onRollItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const sys = item.system;
    // See EssenceActorSheet#onRollItem — V6 §6.8's cooldown rule applies identically to an Elite's
    // explicitly-granted learned cards.
    if (cardOnCooldown(item)) {
      ui.notifications.warn(`${item.name} is on cooldown (${sys.cooldownFrequency === "perEncounter" ? "once per Encounter" : "once per Round"}) and isn't available yet.`);
      return;
    }
    const isReaction = item.type === "reaction-card";
    const poolField = isReaction ? "reactionDice" : "actionDice";
    const poolLabel = isReaction ? "Reaction" : "Action";
    const available = this.actor.system.playState[poolField] ?? 0;
    // See EssenceActorSheet#onRollItem — V6 §5.2.1's 2-die floor applies here identically.
    const cardMin = Math.max(2, parseInt(sys.min, 10) || 1);

    if (available <= 0) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoPoolDiceRemaining", { label: poolLabel }));
      return;
    }
    if (cardMin > available) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardRequiresMoreDice", { name: item.name, min: cardMin, available, label: poolLabel }));
      return;
    }

    if (isReaction) EssenceNpcSheet.#warnIfLikelySecondReaction(this.actor);

    // See EssenceActorSheet#onRollItem — V6 §5.2.8's unaware tax applies here identically.
    const promptResult = await EssenceNpcSheet.#promptDiceCount({
      title: `Use ${item.name}`,
      label: `Commit how many ${poolLabel} Dice? (min ${cardMin}, max ${available})`,
      min: cardMin, max: available, initial: cardMin,
      note: EssenceNpcSheet.#maxRolledDiceNote(this.actor, sys),
      extraCheckbox: isReaction ? { label: "Target is unaware (burn 1 additional Reaction die)" } : null
    });
    if (promptResult === null) return;
    const committed = isReaction ? promptResult.count : promptResult;
    const unawareTax = isReaction && promptResult.extra ? 1 : 0;

    const defenseKey = (sys.defense || "").toLowerCase();
    const { defense, targets } = await EssenceNpcSheet.#resolveTargets(defenseKey);
    const poolSpend = Math.min(available, committed + unawareTax);
    const update = { [`system.playState.${poolField}`]: available - poolSpend };

    // See EssenceActorSheet#onRollItem — a card's printed Cost is paid from its Domain's
    // resource pool on top of the Action/Reaction Dice spent above.
    const cost = Number(sys.cost) || 0;
    if (cost > 0) {
      const resKey = domainResource(sys.domain).toLowerCase();
      if (resKey) {
        const current = this.actor.system.resources[resKey].value;
        update[`system.playState.current${capitalize(resKey)}`] = Math.max(0, current - cost);
        if (cost > current) {
          ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardCostExceedsResource", { name: item.name, cost, resource: capitalize(resKey), actorName: this.actor.name, current }));
        }
      }
    }

    if (isReaction && game.combat) {
      update["system.playState.lastReactionRound"] = game.combat.round;
      update["system.playState.lastReactionCombatantId"] = game.combat.combatant?.id ?? "";
    }

    await this.actor.update(update);
    // See EssenceActorSheet#onRollItem — cooldown starts on play, unconditionally.
    await applyCardCooldown(this.actor, item);
    const bonusSurges = hasMastery(sys, this.actor.system.expertises) ? 1 : 0;
    await rollEssencePool({ pool: committed, defense, targets, label: item.name, actor: this.actor, surgeOptions: sys.surges, bonusSurges, unopposed: !!sys.unopposed, nonCombat: !!sys.noSurges });
  }

  /** See EssenceActorSheet#onRollEquipmentCard — same V6 §9.6 fold-into-Combat-Card-flow, same
   *  implementation (2-die minimum, Action Dice pool spend, Domain asked separately since Equipment
   *  Cards carry no domain/defense/min schema of their own). */
  static async #onRollEquipmentCard(event, target) {
    const name = target.dataset.cardName;
    const itemId = target.dataset.itemId || null;
    const cardIndex = target.dataset.cardIndex !== "" ? Number(target.dataset.cardIndex) : null;

    const available = this.actor.system.playState.actionDice ?? 0;
    const cardMin = 2;
    if (available <= 0) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoPoolDiceRemaining", { label: "Action" }));
      return;
    }
    if (cardMin > available) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardRequiresMoreDice", { name, min: cardMin, available, label: "Action" }));
      return;
    }

    const domainKey = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Use ${name}` },
        content: `
          <label>Domain
            <select name="domain">
              <option value="physical">Physical</option>
              <option value="mental">Mental</option>
              <option value="spiritual">Spiritual</option>
            </select>
          </label>
        `,
        buttons: [{
          action: "next",
          label: "Continue",
          default: true,
          callback: (event, button) => button.form.elements.domain.value
        }],
        submit: (result) => resolve(result === "next" ? null : result)
      }).render(true);
    });
    if (!domainKey) return;

    const committed = await EssenceNpcSheet.#promptDiceCount({
      title: `Use ${name}`,
      label: `Commit how many Action Dice? (min ${cardMin}, max ${available})`,
      min: cardMin, max: available, initial: cardMin
    });
    if (committed === null) return;

    if (itemId) {
      const item = this.actor.items.get(itemId);
      if (item) {
        if (cardIndex !== null) {
          const cards = (item.system.equipmentCards ?? []).map((c) => ({ ...c }));
          const card = cards[cardIndex];
          if (card?.uses != null) {
            if ((card.usesRemaining ?? 0) <= 0) {
              ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoUsesRemaining", { name }));
              return;
            }
            card.usesRemaining -= 1;
            await item.update({ "system.equipmentCards": cards });
          }
        } else if (item.system.uses != null) {
          if ((item.system.usesRemaining ?? 0) <= 0) {
            ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoUsesRemaining", { name }));
            return;
          }
          await item.update({ "system.usesRemaining": item.system.usesRemaining - 1 });
        }
        // See EssenceActorSheet#onRollEquipmentCard's identical hook for the used-vs-unused
        // preparation commitment (design/v6-revision-delta.md §3.5) — same reasoning here.
        if (["equipment", "chassis", "fitting"].includes(item.type) && !item.system.usedThisAdventure) {
          await item.update({ "system.usedThisAdventure": true });
        }
      }
    }

    await this.actor.update({ "system.playState.actionDice": available - committed });
    const domain = DOMAINS.find((d) => d.key === domainKey);
    const { defense, targets } = await EssenceNpcSheet.#resolveTargets(domain.defense);
    await rollEssencePool({ pool: committed, defense, targets, label: name, actor: this.actor });
  }

  /** See EssenceActorSheet#onToggleEquipmentCard — same reasoning, same implementation. */
  static #onToggleEquipmentCard(event, target) {
    const full = target.closest("li")?.querySelector(".card-summary-full");
    if (!full) return;
    full.hidden = !full.hidden;
    target.classList.toggle("expanded", !full.hidden);
  }

  /** See EssenceActorSheet#warnIfLikelySecondReaction — same approximate check, same reasoning. */
  static #warnIfLikelySecondReaction(actor) {
    if (!game.combat) return;
    const ps = actor.system.playState;
    const sameRound = ps.lastReactionRound === game.combat.round;
    const sameActiveCombatant = ps.lastReactionCombatantId && ps.lastReactionCombatantId === game.combat.combatant?.id;
    if (sameRound && sameActiveCombatant) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.SecondReactionWarning", { name: actor.name }));
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
      ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.StartCombatFirst"));
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

  /** See EssenceActorSheet#onAdjustPoolDice — same +/- quick-adjust, same reasoning. */
  static async #onAdjustPoolDice(event, target) {
    const field = target.dataset.field;
    const delta = Number(target.dataset.delta) || 0;
    const current = this.actor.system.playState[field] ?? 0;
    const next = Math.max(0, current + delta);
    await this.actor.update({ [`system.playState.${field}`]: next });
  }

  static #onTogglePip(current, index) {
    return current === index + 1 ? index : index + 1;
  }

  static async #onToggleTempWound(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceNpcSheet.#onTogglePip(this.actor.system.playState.currentTemporaryWounds, i);
    await this.actor.update({ "system.playState.currentTemporaryWounds": next });
  }

  /**
   * `EssenceAdversaryData#prepareDerivedData` (actor-adversary.mjs) re-views `system.coreWounds` at
   * the current Grade's `woundCapacity` (2/4/5) every prepare cycle — a VIEW-only resize for
   * display, explicitly documented there as becoming permanent data loss only if a handler persists
   * that shorter view back to the actor. Reading/writing `this.actor.system.coreWounds` directly (as
   * this sheet's damage/recovery/toggle handlers used to) does exactly that: fill a Wound on an
   * Elite, downgrade to Mook, and the 3 excess Wound slots are gone forever on the next Apply
   * Damage/Recover/toggle. This reads the actor's actual STORED array via `Actor#_source` (Foundry's
   * standard un-derived accessor) instead, padding it (never truncating it) up to the current
   * capacity so a handler can freely operate within the active window — indices `0` to `capacity-1`,
   * the only ones the sheet ever renders a pip for — without ever deleting stored slots beyond it.
   * `EssenceManifestationData#coreWounds` (actor-manifestation.mjs) is the reference for "any
   * coreWounds length just works" for this same slot-indexed Apply Damage/Recover logic — the only
   * gap here was resizing the STORED array instead of the DERIVED one.
   * @param {Actor} actor
   * @returns {{coreWounds: object[], capacity: number}} `coreWounds` is a fresh deep-cloned working
   *   copy at least `capacity` long (preserving any stored slots beyond it untouched); `capacity` is
   *   the current Grade's `woundCapacity` (read off the derived `system.coreWounds.length`, which
   *   `prepareDerivedData` already clamps correctly).
   */
  static #storedCoreWoundsAndCapacity(actor) {
    const capacity = actor.system.coreWounds.length;
    const coreWounds = (actor._source.system.coreWounds ?? []).map((w) => ({ ...w }));
    while (coreWounds.length < capacity) coreWounds.push({ filled: false, domain: "", severity: "", condition: "" });
    return { coreWounds, capacity };
  }

  /** Natural recovery is order-free (V6) — this pip toggle lets a GM/owner clear (or set) any
   *  chosen Core Wound space directly, unlike #onRecoverWound's active-healing lowest-first rule. */
  static async #onToggleCoreWound(event, target) {
    const i = Number(target.dataset.index);
    const { coreWounds, capacity } = EssenceNpcSheet.#storedCoreWoundsAndCapacity(this.actor);
    coreWounds[i].filled = !coreWounds[i].filled;
    if (!coreWounds[i].filled) { coreWounds[i].domain = ""; coreWounds[i].severity = ""; coreWounds[i].condition = ""; }
    const filled = coreWounds.slice(0, capacity).filter((w) => w.filled).length;
    await this.actor.update({ "system.coreWounds": coreWounds, "system.playState.currentCoreWounds": filled });
  }

  static async #onToggleDeathTrack(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceNpcSheet.#onTogglePip(this.actor.system.playState.deathTrackStep, i);
    await this.actor.update({ "system.playState.deathTrackStep": next });
  }

  /** Manual GM control over "stabilized" — see EssenceActorSheet's identical method for the doc comment. */
  static async #onToggleDeathTrackStabilized() {
    const current = this.actor.system.playState.deathTrackState;
    const next = current === "stabilized" ? "dying" : "stabilized";
    await this.actor.update({ "system.playState.deathTrackState": next });
  }

  /**
   * V6 §2415: adversaries (both People and Monster actor types share this sheet class) use a
   * simplified Wound model — a flat filled/capacity counter (system.usesSimplifiedWounds, see
   * EssenceAdversaryData#prepareDerivedData), no Light/Serious/Critical severity, no Wound Cards,
   * no Death Track. This is a simplified version of EssenceActorSheet's identical-looking method.
   */
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
          <label>Damage Type <span class="muted">(for Resistance/Vulnerability — V6 §6.2)</span>
            <select name="damageType">
              ${DAMAGE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
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
            damageType: button.form.elements.damageType.value,
            breach: button.form.elements.breach.checked
          })
        }],
        submit: (result) => resolve(result === "apply" ? null : result)
      }).render(true);
    });
    if (!result) return;

    const sys = this.actor.system;
    const resilience = sys.effectiveResilience ?? sys.resilience ?? 0;
    const prevAccumulated = sys.playState.accumulatedDamage ?? 0;
    // See EssenceActorSheet#onApplyDamage — 0.6.85 fix, plan §5.6: stored, not re-derived from the
    // current (possibly just-changed) Resilience.
    const prevWounds = sys.playState.accumulatedDamageWounds ?? 0;

    const log = [];
    // V6 §6.2 (plan; revised per design/v6-revision-delta.md §2.1): Resistance/Vulnerability apply
    // BEFORE Resilience or Breach, to both branches, and key off the named Damage Type — NOT the
    // Domain, which stays a separate field used only for the simplified Wound record below.
    const { amount: adjustedAmount, log: rvLog } = applyResistanceVulnerability(this.actor, result.damageType, result.amount);
    log.push(...rvLog);

    let wounds;
    let newAccumulated = prevAccumulated;
    let newWounds = prevWounds;
    if (result.breach) {
      // Breach bypasses Resilience, not Resistance/Vulnerability (0.6.85 fix).
      wounds = adjustedAmount;
    } else {
      newAccumulated = prevAccumulated + adjustedAmount;
      // See EssenceActorSheet#onApplyDamage — clamped to never fall below the already-converted
      // count, so a mid-interval Resilience increase can't cause the same Wounds to be counted twice.
      newWounds = Math.max(prevWounds, Math.max(0, newAccumulated - resilience));
      wounds = newWounds - prevWounds;
    }

    const update = {
      "system.playState.accumulatedDamage": newAccumulated,
      "system.playState.accumulatedDamageWounds": newWounds
    };
    let becameDefeated = false;

    if (wounds <= 0) {
      log.push(`Absorbed entirely by Resilience — no Wound.`);
    } else {
      let tempWounds = sys.playState.currentTemporaryWounds ?? 0;
      const { coreWounds, capacity } = EssenceNpcSheet.#storedCoreWoundsAndCapacity(this.actor);

      for (let i = 0; i < wounds; i++) {
        if (tempWounds > 0) {
          tempWounds -= 1;
          log.push("1 Wound absorbed by a Temporary Wound.");
          continue;
        }
        const slot = coreWounds.slice(0, capacity).findIndex((w) => !w.filled);
        if (slot === -1) {
          log.push("Wound capacity already full.");
          continue;
        }
        coreWounds[slot] = { filled: true, domain: result.domain, severity: "", condition: "" };
        log.push(`Wound capacity filled: ${coreWounds.slice(0, capacity).filter((w) => w.filled).length}/${capacity}.`);
      }

      const filled = coreWounds.slice(0, capacity).filter((w) => w.filled).length;
      becameDefeated = filled >= capacity;

      update["system.playState.currentTemporaryWounds"] = tempWounds;
      update["system.coreWounds"] = coreWounds;
      update["system.playState.currentCoreWounds"] = filled;
    }

    await this.actor.update(update);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> takes ${result.amount} ${result.domain} (${result.damageType}) Damage${result.breach ? " (Breach)" : ""}.</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (becameDefeated) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.EnemyDefeated", { name: this.actor.name }));
    }
  }

  /** V6 §2415: adversaries recover Wounds order-free too (no severity to sequence by) — this is a
   *  simplified version of EssenceActorSheet's identical-looking #onRecoverWound. */
  static async #onRecoverWound() {
    const { coreWounds, capacity } = EssenceNpcSheet.#storedCoreWoundsAndCapacity(this.actor);
    let slot = -1;
    for (let i = 0; i < capacity; i++) {
      if (coreWounds[i].filled) { slot = i; break; }
    }
    if (slot === -1) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoCoreWoundsToRecover", { name: this.actor.name }));
      return;
    }
    const recovered = coreWounds[slot];
    coreWounds[slot] = { filled: false, domain: "", severity: "", condition: "" };
    const update = {
      "system.coreWounds": coreWounds,
      "system.playState.currentCoreWounds": coreWounds.slice(0, capacity).filter((w) => w.filled).length
    };
    await this.actor.update(update);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> recovers a ${recovered.domain || ""} Wound.</p>`
    });
  }

  /** See EssenceActorSheet#onAddResistanceOrVulnerability — same reasoning, same implementation. */
  static async #onAddResistanceOrVulnerability(fieldKey, dialogTitle) {
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: dialogTitle },
        content: `
          <label>Damage Type
            <select name="damageType">
              ${DAMAGE_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
            </select>
          </label>
          <label>Source <input type="text" name="source" placeholder="e.g. Manifestation profile, equipment" autofocus></label>
        `,
        buttons: [{
          action: "add",
          label: "Add",
          default: true,
          callback: (event, button) => ({
            damageType: button.form.elements.damageType.value,
            source: button.form.elements.source.value.trim()
          })
        }],
        submit: (result) => resolve(result === "add" ? null : result)
      }).render(true);
    });
    if (!result) return;
    const list = (this.actor.system[fieldKey] ?? []).map((r) => ({ ...r }));
    list.push(result);
    await this.actor.update({ [`system.${fieldKey}`]: list });
  }

  static async #onAddResistance() {
    await EssenceNpcSheet.#onAddResistanceOrVulnerability.call(this, "resistances", "Add Resistance");
  }

  static async #onAddVulnerability() {
    await EssenceNpcSheet.#onAddResistanceOrVulnerability.call(this, "vulnerabilities", "Add Vulnerability");
  }

  static async #onRemoveResistance(event, target) {
    const i = Number(target.dataset.index);
    const list = this.actor.system.resistances.map((r) => ({ ...r }));
    list.splice(i, 1);
    await this.actor.update({ "system.resistances": list });
  }

  static async #onRemoveVulnerability(event, target) {
    const i = Number(target.dataset.index);
    const list = this.actor.system.vulnerabilities.map((r) => ({ ...r }));
    list.splice(i, 1);
    await this.actor.update({ "system.vulnerabilities": list });
  }

  /** See EssenceActorSheet#onToggleTempInfluence/#onToggleCoreInfluence/#onApplyInfluenceInjury/
   *  #onRecoverInfluenceInjury — same Influence flow, same reasoning. */
  static async #onToggleTempInfluence(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceNpcSheet.#onTogglePip(this.actor.system.playState.currentTemporaryInfluence, i);
    await this.actor.update({ "system.playState.currentTemporaryInfluence": next });
  }

  /** See EssenceActorSheet#onToggleCoreInfluence — same rule, same reasoning (severity is always
   *  derivable from the slot index, so a manual toggle can still attach/remove the right Influence
   *  Consequence Card). */
  static async #onToggleCoreInfluence(event, target) {
    const i = Number(target.dataset.index);
    const coreInfluence = this.actor.system.coreInfluence.map((c) => ({ ...c }));
    coreInfluence[i].filled = !coreInfluence[i].filled;
    let severity = "";
    if (coreInfluence[i].filled) {
      severity = SEVERITY_BY_INDEX[i];
      coreInfluence[i].severity = severity;
      coreInfluence[i].condition = `${severity} Injury`;
    } else {
      coreInfluence[i].severity = "";
      coreInfluence[i].condition = "";
    }
    await this.actor.update({ "system.coreInfluence": coreInfluence });
    if (severity) await attachConsequenceCard(this.actor, severity, i);
    else await removeConsequenceCard(this.actor, i);
  }

  /** See EssenceActorSheet#computeOrdinaryPressure — identical V6 3-layer ordinary-pressure
   *  resolution, duplicated per this project's actor-sheet/npc-sheet convention. */
  static #computeOrdinaryPressure(actor, amount) {
    let reachPressure = actor.system.reachPressure ?? 0;
    const effectiveReach = actor.system.effectiveReach ?? 0;
    let tempInfluence = actor.system.playState.currentTemporaryInfluence ?? 0;
    const coreInfluence = actor.system.coreInfluence.map((c) => ({ ...c }));
    const log = [];
    const filledSlots = [];
    let becameCritical = false;
    for (let i = 0; i < amount; i++) {
      if (reachPressure < effectiveReach) {
        reachPressure += 1;
        log.push("1 pressure absorbed by Reach.");
        continue;
      }
      if (tempInfluence > 0) {
        tempInfluence -= 1;
        log.push("1 pressure absorbed by a Temporary Influence slot.");
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
      filledSlots.push({ severity, slot });
      log.push(`Core Influence filled: <strong>${condition}</strong>.`);
      if (slot === 4) becameCritical = true;
    }
    return { reachPressure, tempInfluence, coreInfluence, log, filledSlots, becameCritical };
  }

  /** See EssenceActorSheet#onApplyInfluenceInjury — same V6 3-layer Pressure Type selector
   *  (Ordinary pressure vs. Influence Breach) replacing V5's "Voluntary" checkbox. */
  static async #onApplyInfluenceInjury() {
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Apply Influence Injury" },
        content: `
          <label>Injuries <input type="number" name="amount" value="1" min="1" autofocus></label>
          <label>Pressure Type
            <select name="pressureType">
              <option value="ordinary">Ordinary pressure (Reach absorbs first)</option>
              <option value="breach">Influence Breach (skips Reach)</option>
            </select>
          </label>
        `,
        buttons: [{
          action: "apply",
          label: "Apply",
          default: true,
          callback: (event, button) => ({
            amount: Math.max(1, Math.floor(Number(button.form.elements.amount.value)) || 1),
            breach: button.form.elements.pressureType.value === "breach"
          })
        }],
        submit: (result) => resolve(result === "apply" ? null : result)
      }).render(true);
    });
    if (!result) return;

    const overextension = result.breach
      ? EssenceNpcSheet.#computeInfluenceOverextension(this.actor, result.amount)
      : EssenceNpcSheet.#computeOrdinaryPressure(this.actor, result.amount);

    const update = {
      "system.playState.currentTemporaryInfluence": overextension.tempInfluence,
      "system.coreInfluence": overextension.coreInfluence
    };
    if (overextension.reachPressure !== undefined) update["system.reachPressure"] = overextension.reachPressure;
    await this.actor.update(update);
    if (overextension.filledSlots.length) await attachConsequenceCards(this.actor, overextension.filledSlots);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> takes ${result.amount} Influence ${result.amount === 1 ? "Injury" : "Injuries"}${result.breach ? " (Influence Breach)" : " (Ordinary pressure)"}.</p><ul>${overextension.log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (overextension.becameCritical) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CriticalInfluenceInjury", { name: this.actor.name }));
    }
  }

  static async #onRecoverInfluenceInjury() {
    const coreInfluence = this.actor.system.coreInfluence.map((c) => ({ ...c }));
    let slot = -1;
    for (let i = coreInfluence.length - 1; i >= 0; i--) {
      if (coreInfluence[i].filled) { slot = i; break; }
    }
    if (slot === -1) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoCoreInfluenceToRecover", { name: this.actor.name }));
      return;
    }

    const recovered = coreInfluence[slot];
    coreInfluence[slot] = { filled: false, severity: "", condition: "" };
    await this.actor.update({ "system.coreInfluence": coreInfluence });
    await removeConsequenceCard(this.actor, slot);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> recovers from their <strong>${recovered.condition}</strong>.</p>`
    });
  }

  /** See EssenceActorSheet#onContributeToGoal — same rule (V6 deleted § Collaborative Influence
   *  Pooling; this per-character behaviour already matched what V6 codified), same routing through
   *  #computeOrdinaryPressure instead of a bespoke Temp→Core loop. */
  static async #onContributeToGoal() {
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Contribute to Shared Goal" },
        content: `
          <label>Shared Goal <input type="text" name="goal" placeholder="e.g. Rebuilding the Guildhall" autofocus></label>
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="narrative"> Narrative only (no Influence spent, no cost)
          </label>
          <label>Pressure to Spend <input type="number" name="amount" value="1" min="1"></label>
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
        content: `<p><strong>${this.actor.name}</strong> contributes to <strong>${goalLabel}</strong> narratively (labor, connections, or information) — no Influence spent, no Injury risked.</p>`
      });
      return;
    }

    const overextension = EssenceNpcSheet.#computeOrdinaryPressure(this.actor, result.amount);

    await this.actor.update({
      "system.reachPressure": overextension.reachPressure,
      "system.playState.currentTemporaryInfluence": overextension.tempInfluence,
      "system.coreInfluence": overextension.coreInfluence
    });
    if (overextension.filledSlots.length) await attachConsequenceCards(this.actor, overextension.filledSlots);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> contributes ${result.amount} ${result.amount === 1 ? "point" : "points"} of pressure to <strong>${goalLabel}</strong>.</p><ul>${overextension.log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (overextension.becameCritical) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CriticalInfluenceInjuryGoal", { name: this.actor.name, goal: goalLabel }));
    }
  }

  /** See EssenceActorSheet#computeInfluenceOverextension — the Breach-type (skip-Reach) Temp→Core
   *  spend shared by Influence Breach proper and a Reach Trigger's Breach cost past its first free
   *  use, duplicated per this project's actor-sheet/npc-sheet convention. */
  static #computeInfluenceOverextension(actor, amount) {
    let tempInfluence = actor.system.playState.currentTemporaryInfluence ?? 0;
    const coreInfluence = actor.system.coreInfluence.map((c) => ({ ...c }));
    const log = [];
    const filledSlots = [];
    let becameCritical = false;
    for (let i = 0; i < amount; i++) {
      if (tempInfluence > 0) {
        tempInfluence -= 1;
        log.push("1 Breach absorbed by a Temporary Influence slot.");
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
      filledSlots.push({ severity, slot });
      log.push(`Core Influence filled: <strong>${condition}</strong>.`);
      if (slot === 4) becameCritical = true;
    }
    return { tempInfluence, coreInfluence, log, filledSlots, becameCritical };
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
      log.push(`Grants ${trigger.tempInfluenceGrant} Temporary Influence usable only this Encounter (capped at normal max).`);
    }

    let becameCritical = false;
    let filledSlots = [];
    if (!wasFree) {
      const overextension = EssenceNpcSheet.#computeInfluenceOverextension(
        { system: { playState: { currentTemporaryInfluence: tempInfluence }, coreInfluence } },
        1
      );
      tempInfluence = overextension.tempInfluence;
      coreInfluence.splice(0, coreInfluence.length, ...overextension.coreInfluence);
      becameCritical = overextension.becameCritical;
      filledSlots = overextension.filledSlots;
      log.push(...overextension.log.map((l) => `Additional use this Adventure — ${l}`));
    } else {
      log.push("First use this Adventure — free.");
    }

    await this.actor.update({
      "system.reachTriggers": triggers,
      "system.playState.currentTemporaryInfluence": tempInfluence,
      "system.coreInfluence": coreInfluence
    });
    if (filledSlots.length) await attachConsequenceCards(this.actor, filledSlots);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> activates <strong>${trigger.name || "a Reach Trigger"}</strong> (Reach +${trigger.tempBonus} for the current Encounter).</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (becameCritical) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CriticalInfluenceInjuryBreach", { name: this.actor.name }));
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
      content: `<p><strong>${this.actor.name}</strong> resets Reach pressure, Reach Triggers, Augment Uses, and Equipment Card Uses for a new Adventure.</p>`
    });
  }

  /** See EssenceActorSheet#onNewEncounter / resetEncounterCooldowns() in utils.mjs. */
  static async #onNewEncounter() {
    await resetEncounterCooldowns(this.actor);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> begins a new Encounter — once-per-Encounter Combat/Reaction Cards are available again.</p>`
    });
  }

  /** Mook Tactics is an ordered list of plain instructions (design doc § Mook) — add/delete rather
   *  than a generic array-row helper since that's all this list needs. */
  static async #onAddTactic() {
    const tactics = [...(this.actor.system.tactics ?? []), ""];
    await this.actor.update({ "system.tactics": tactics });
  }

  static async #onDeleteTactic(event, target) {
    const tactics = [...(this.actor.system.tactics ?? [])];
    tactics.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.tactics": tactics });
  }

  /** Leader/Solo abilities (design doc §§ Leader, Solo) — same add/delete-by-index shape as
   *  Tactics above, just with a name + rich-text field per entry instead of plain text. */
  static async #onAddLeaderAbility() {
    const abilities = [...(this.actor.system.leaderAbilities ?? []), { name: "", text: "" }];
    await this.actor.update({ "system.leaderAbilities": abilities });
  }

  static async #onDeleteLeaderAbility(event, target) {
    const abilities = [...(this.actor.system.leaderAbilities ?? [])];
    abilities.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.leaderAbilities": abilities });
  }

  static async #onAddSoloAbility() {
    const abilities = [...(this.actor.system.soloAbilities ?? []), { name: "", text: "" }];
    await this.actor.update({ "system.soloAbilities": abilities });
  }

  static async #onDeleteSoloAbility(event, target) {
    const abilities = [...(this.actor.system.soloAbilities ?? [])];
    abilities.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.soloAbilities": abilities });
  }

  /** See #onAddLeaderAbility/#onAddSoloAbility — same add/delete-by-index shape, for the
   *  general-purpose frequency-tagged Ability list, available on every Grade (see
   *  actor-adversary.mjs's class doc comment — this stopped being a Mook/Normal-only "Reduced
   *  Engine" concept in V6). An empty list is just an empty list on any Grade that hasn't used it. */
  static async #onAddAbility() {
    const abilities = [...(this.actor.system.abilities ?? []), { name: "", text: "", frequency: "atWill", usesMax: 1, usesRemaining: 1, usedThisRound: false }];
    await this.actor.update({ "system.abilities": abilities });
  }

  static async #onDeleteAbility(event, target) {
    const abilities = [...(this.actor.system.abilities ?? [])];
    abilities.splice(Number(target.dataset.index), 1);
    await this.actor.update({ "system.abilities": abilities });
  }

  /** "At Will" tracks nothing and just posts to chat. "1 per Round" and "X per Combat" enforce
   *  their own limit here and reset on the normal combat cadence — see EssenceCombat#_onStartTurn
   *  (perRound) and #_onStartRound (perCombat) in documents/combat.mjs. */
  static async #onUseAbility(event, target) {
    const i = Number(target.dataset.index);
    const abilities = [...(this.actor.system.abilities ?? [])];
    const ability = abilities[i];
    if (!ability) return;

    if (ability.frequency === "perRound" && ability.usedThisRound) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.AbilityAlreadyUsedThisRound", { name: ability.name || "Ability" }));
      return;
    }
    if (ability.frequency === "perCombat" && ability.usesRemaining <= 0) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.AbilityNoUsesRemaining", { name: ability.name || "Ability" }));
      return;
    }

    if (ability.frequency === "perRound") abilities[i] = { ...ability, usedThisRound: true };
    else if (ability.frequency === "perCombat") abilities[i] = { ...ability, usesRemaining: ability.usesRemaining - 1 };
    await this.actor.update({ "system.abilities": abilities });

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> uses <strong>${ability.name || "an Ability"}</strong>.</p>${ability.text ? `<p>${ability.text}</p>` : ""}`
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

  /** See EssenceActorSheet#onPostEquipmentToChat's identical implementation for the reasoning. */
  static async #onPostEquipmentToChat(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const category = EQUIPMENT_CATEGORY_LABELS[item.system.category] ?? capitalize(item.system.category);
    const resolver = await buildEquipmentResolver(this.actor);
    const summary = equipmentEffectSummary(resolver, item);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${item.name}</strong> <span class="muted">(${category})</span></p>${summary ? `<p>${summary}</p>` : ""}`
    });
  }

  /** See EssenceActorSheet#onCreateEquipment's identical implementation for the reasoning. */
  static async #onCreateEquipment(event, target) {
    const slot = target.dataset.slot;
    if (!["inventory", "temporary", "armory"].includes(slot)) return;
    const [created] = await this.actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.localize("ESSENCE.Sheet.NewEquipmentName"),
      type: "equipment",
      img: "icons/svg/item-bag.svg",
      system: { slot }
    }]);
    created?.sheet.render(true);
  }

  /** See EssenceActorSheet#onReconfigureItem's identical implementation for the reasoning — this
   *  system has no "held in hand" vs "stowed" state to actually transition, so this is a costed
   *  chat-log action like every other manual action on this sheet. NPCs have no separate
   *  Temporary/Armory equipment sections (only one flat Equipment list), so there's no other-slot
   *  swap-item filtering needed beyond excluding the item itself. */
  static async #onReconfigureItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    const others = this.actor.items.filter((i) => i.type === "equipment" && i.id !== item.id);
    const otherActors = game.actors.filter((a) => a.id !== this.actor.id && a.isOwner && ["character", "npc", "monster"].includes(a.type));

    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Reconfigure: ${item.name}` },
        content: `
          <p class="muted">Burns 3 Action Dice. Choose one — ready it into an empty hand, stow it,
          recover it from the ground within reach, hand it to an adjacent willing creature, or swap
          it for another prepared item.</p>
          <label>Action
            <select name="mode">
              <option value="ready">Ready (draw into an empty hand)</option>
              <option value="stow">Stow</option>
              <option value="recover">Recover (pick up from the ground within reach)</option>
              <option value="handover">Hand Over to an adjacent willing creature</option>
              <option value="swap">Swap for another prepared item</option>
            </select>
          </label>
          <label class="reconfigure-swap-target">Swap For
            <select name="swapItemId">
              <option value="">— ${game.i18n.localize("ESSENCE.Common.None")} —</option>
              ${others.map((i) => `<option value="${i.id}">${i.name}</option>`).join("")}
            </select>
          </label>
          <label class="reconfigure-handover-target">Hand To
            <select name="targetActorId">
              <option value="">— ${game.i18n.localize("ESSENCE.Common.None")} —</option>
              ${otherActors.map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}
            </select>
          </label>
        `,
        buttons: [{
          action: "reconfigure",
          label: "Reconfigure",
          default: true,
          callback: (event, button) => ({
            mode: button.form.elements.mode.value,
            swapItemId: button.form.elements.swapItemId.value,
            targetActorId: button.form.elements.targetActorId.value
          })
        }],
        submit: (result) => resolve(result === "reconfigure" ? null : result)
      }).render(true);
    });
    if (!result) return;

    const cost = 3;
    const available = this.actor.system.playState.actionDice ?? 0;
    if (available < cost) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.ReconfigureItemCost", { cost, available }));
      return;
    }

    let message;
    if (result.mode === "ready") message = `draws <strong>${item.name}</strong> into an empty hand`;
    else if (result.mode === "stow") message = `stows <strong>${item.name}</strong>`;
    else if (result.mode === "recover") message = `recovers <strong>${item.name}</strong> from the ground within reach`;
    else if (result.mode === "handover") {
      const targetActor = result.targetActorId ? game.actors.get(result.targetActorId) : null;
      if (!targetActor) {
        ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.ReconfigureHandOverNoTarget"));
        return;
      }
      message = `hands <strong>${item.name}</strong> to <strong>${targetActor.name}</strong>. It remains attached to ${this.actor.name}'s own Inventory allocation — handing an item over does not change its accounting`;
    } else if (result.mode === "swap") {
      const swapItem = result.swapItemId ? this.actor.items.get(result.swapItemId) : null;
      if (!swapItem) {
        ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.ReconfigureSwapNoTarget"));
        return;
      }
      message = `swaps out <strong>${item.name}</strong> for <strong>${swapItem.name}</strong>`;
    } else {
      return;
    }

    await this.actor.update({ "system.playState.actionDice": available - cost });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> uses Reconfigure (burns ${cost} Action Dice) and ${message}.</p>`
    });
  }

  /** See EssenceActorSheet#onReleaseItem's identical implementation for the reasoning. */
  static async #onReleaseItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> releases <strong>${item.name}</strong> — it falls where released. No Action required.</p>`
    });
  }

  /** See EssenceActorSheet#onToggleItemUsed's identical implementation for the reasoning. */
  static async #onToggleItemUsed(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item || !["equipment", "chassis", "fitting"].includes(item.type)) return;
    await item.update({ "system.usedThisAdventure": !item.system.usedThisAdventure });
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
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoQualifyingItemNpc", { source: sourceName }));
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
      "system.slot": "inventory",
      "system.reachExceptionSource": sourceName,
      "system.reachExceptionMargin": grant.reachMargin,
      "system.slotCost": grant.countsAgainstLimit ? 1 : 0
    });
  }

  /** Voluntary Dismiss — burn 1 Action Die on the caller's turn, paid by hand like every other
   *  cost here (see manifestation.mjs's dismissManifestation). */
  static async #onDismissManifestation() {
    await dismissManifestation(this.actor);
  }

  static async #onApplyManifestationDefeat() {
    await applyManifestationDefeat(this.actor);
  }
}
