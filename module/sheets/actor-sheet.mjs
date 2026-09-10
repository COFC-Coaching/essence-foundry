import { rollEssencePool } from "../dice/essence-roll.mjs";
import { EXPERTISE_DATABASE } from "../data/expertise-database.mjs";
import { deriveOriginFeatures } from "../data/origin-features.mjs";
import { ITEM_GRANT_REGISTRY, deriveActiveGrants, equipmentMatchesGrant, reachQualifiesForGrant } from "../data/item-grants.mjs";
import EssenceCharacterWizard from "../apps/character-wizard.mjs";
import { capitalize, cardSummary, domainResource, hasMastery, computeSlotUsage, computeReachGate, resetAdventureUses, SEVERITY_BY_INDEX, INFLUENCE_RECOVERY_TIME } from "../utils.mjs";

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

/** Magecraft's 10 fixed subtypes, grouped by family (part-iv-combat.md § Thread Families). */
const MAGECRAFT_THREAD_FAMILIES = [
  { label: "Elemental", threads: ["Fire", "Water", "Earth", "Air"] },
  { label: "Cosmic", threads: ["Time", "Space"] },
  { label: "Perceptual", threads: ["Light", "Shadow"] },
  { label: "Arcane", threads: ["Aether", "Chaos"] }
];

function pips(value, max = PIP_MAX) {
  return Array.from({ length: max }, (_, i) => i < value);
}

/** Default new-row shape for each free-length array field, keyed by the sheet's data-array value. */
const ARRAY_ROW_DEFAULTS = {
  nonCombatSkills: { name: "", rating: 0 },
  passiveFeatures: { name: "", source: "", text: "" },
  reachTriggers: { name: "", tempBonus: 1, tempInfluenceGrant: 0, usedThisAdventure: false, active: false }
};

export default class EssenceActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "actor", "character"],
    position: { width: 760, height: 820 },
    form: { submitOnChange: true },
    actions: {
      openWizard: EssenceActorSheet.#onOpenWizard,
      editTokenImage: EssenceActorSheet.#onEditTokenImage,
      toggleEditLock: EssenceActorSheet.#onToggleEditLock,
      rollSkill: EssenceActorSheet.#onRollSkill,
      rollItem: EssenceActorSheet.#onRollItem,
      rollInitiative: EssenceActorSheet.#onRollInitiative,
      endTurn: EssenceActorSheet.#onEndTurn,
      burnDice: EssenceActorSheet.#onBurnDice,
      applyDamage: EssenceActorSheet.#onApplyDamage,
      recoverWound: EssenceActorSheet.#onRecoverWound,
      adjustResource: EssenceActorSheet.#onAdjustResource,
      itemView: EssenceActorSheet.#onItemView,
      itemEdit: EssenceActorSheet.#onItemEdit,
      itemDelete: EssenceActorSheet.#onItemDelete,
      changeTab: EssenceActorSheet.#onChangeTab,
      toggleTempWound: EssenceActorSheet.#onToggleTempWound,
      toggleCoreWound: EssenceActorSheet.#onToggleCoreWound,
      toggleDeathTrack: EssenceActorSheet.#onToggleDeathTrack,
      toggleDeathTrackFrozen: EssenceActorSheet.#onToggleDeathTrackFrozen,
      toggleTempInfluence: EssenceActorSheet.#onToggleTempInfluence,
      toggleCoreInfluence: EssenceActorSheet.#onToggleCoreInfluence,
      applyInfluenceInjury: EssenceActorSheet.#onApplyInfluenceInjury,
      recoverInfluenceInjury: EssenceActorSheet.#onRecoverInfluenceInjury,
      spendInfluenceForSlot: EssenceActorSheet.#onSpendInfluenceForSlot,
      contributeToGoal: EssenceActorSheet.#onContributeToGoal,
      addArrayRow: EssenceActorSheet.#onAddArrayRow,
      deleteArrayRow: EssenceActorSheet.#onDeleteArrayRow,
      addExpertise: EssenceActorSheet.#onAddExpertise,
      toggleCombo: EssenceActorSheet.#onToggleCombo,
      clearLock: EssenceActorSheet.#onClearLock,
      endAdaptation: EssenceActorSheet.#onEndAdaptation,
      clearContingency: EssenceActorSheet.#onClearContingency,
      toggleThread: EssenceActorSheet.#onToggleThread,
      addAuthority: EssenceActorSheet.#onAddAuthority,
      removeAuthority: EssenceActorSheet.#onRemoveAuthority,
      addRite: EssenceActorSheet.#onAddRite,
      deleteRite: EssenceActorSheet.#onDeleteRite,
      activateReachTrigger: EssenceActorSheet.#onActivateReachTrigger,
      deactivateReachTrigger: EssenceActorSheet.#onDeactivateReachTrigger,
      resetAdventureUses: EssenceActorSheet.#onResetAdventureUses,
      chooseGrantedItem: EssenceActorSheet.#onChooseGrantedItem
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/actor/character-sheet.hbs" }
  };

  #activeTab = "core";
  /** Sheet-wide safety lock — see #applyEditable. Resets to locked every time the sheet is
   *  reopened; not persisted, since it's a "let me fix this right now" switch, not a setting. */
  #editUnlocked = false;

  _onRender(context, options) {
    super._onRender(context, options);
    this.#applyActiveTab();
    this.#applyEditable();
    this.#wireCardControls();
    this.#wireExpertiseSelects();
  }

  /**
   * An Expertise's name <select> used to submit as `system.expertises.{i}.name` and rely on
   * Foundry's own form-submission path to merge it into the array — but ArrayField sub-fields
   * don't merge that way: the update silently replaced the whole array element, wiping its
   * `skill` back to the schema default ("") and making the Expertise vanish from every skill's
   * list (it's filtered by `skill` in _prepareContext). Read-modify-write the whole array in JS
   * instead, the same safe pattern #onAddExpertise/#onAddRite/etc. already use elsewhere.
   */
  #wireExpertiseSelects() {
    for (const select of this.element.querySelectorAll(".expertise-name-select")) {
      select.addEventListener("change", async (event) => {
        const i = Number(event.currentTarget.dataset.index);
        const expertises = this.actor.system.expertises.map((e) => ({ name: e.name, skill: e.skill }));
        if (!expertises[i]) return;
        expertises[i].name = event.currentTarget.value;
        await this.actor.update({ "system.expertises": expertises });
      });
    }
  }

  /**
   * Client-side filter + sort over the Combat tab's Action/Reaction Card lists — no re-render, no
   * server round-trip. Filtering hides/shows <li> rows by substring match against the card's name
   * or its summary text; sorting reorders the actual DOM nodes by a data-card-* attribute stamped
   * on each row. The Character Wizard already has search+filters over the whole compendium for
   * building a hand; this is the same affordance for the hand you already picked, reachable
   * mid-combat.
   */
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
        const rows = [...list.querySelectorAll("li[data-card-name]")];
        const prop = `card${capitalize(key)}`;
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

  /**
   * Foundry's form only blocks a submitted update server-side — it doesn't stop the UI from
   * looking editable to someone without OWNER permission (e.g. a player with LIMITED/OBSERVER
   * access, or anyone viewing while the sheet isn't editable for another reason). Lock every
   * field and action button down to match `this.isEditable` so non-owners get a visibly
   * read-only sheet instead of controls that silently fail to save.
   *
   * Scoped to .window-content only: this.element is the whole ApplicationV2 window, and its
   * .window-header carries Foundry's own chrome (Close, Copy UUID, etc.), which also use
   * data-action — querying the full element previously locked those out too, so a read-only
   * sheet couldn't even be closed.
   *
   * For an Owner/GM, every raw field (Attributes, Skills, Tier/Level, Origin, resource pools,
   * Biography, etc.) is *also* locked by default — a safety rail against fat-fingering a build
   * value mid-session — until the header's lock toggle opens it back up (#onToggleEditLock).
   * Action buttons (Roll, Apply Damage, End Turn, and the Wound/Combo/Influence pip toggles used
   * constantly during combat) are never touched by that lock, only by the isEditable branch above,
   * so ordinary play is never blocked by forgetting to unlock the sheet.
   */
  #applyEditable() {
    const body = this.element.querySelector(".window-content") ?? this.element;
    if (!this.isEditable) {
      for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) el.disabled = true;
      for (const el of body.querySelectorAll('button[data-action]:not([data-action="changeTab"]), a[data-action]:not([data-action="changeTab"])')) {
        el.classList.add("locked");
        el.style.pointerEvents = "none";
      }
      return;
    }
    if (this.#editUnlocked) return;
    for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) el.disabled = true;
  }

  /** Owner/GM-only safety-lock toggle — see #applyEditable for what it does and doesn't affect. */
  static #onToggleEditLock() {
    this.#editUnlocked = !this.#editUnlocked;
    this.render();
  }

  #applyActiveTab() {
    for (const link of this.element.querySelectorAll(".sheet-tabs a")) {
      const active = link.dataset.tab === this.#activeTab;
      link.classList.toggle("active", active);
      link.setAttribute("aria-selected", active);
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

  static #onOpenWizard() {
    new EssenceCharacterWizard(this.actor).render(true);
  }

  /** Foundry's core "editImage" action (used by the Portrait above) only ever targets `img` —
   *  there's no built-in control for the canvas Token's own image, which lives on a completely
   *  separate field (`prototypeToken.texture.src`) that core only auto-copies from the Portrait
   *  once, on an Actor's very first customization. See the Game Master's Guide for the full
   *  explanation of why the two can drift apart afterward. */
  static #onEditTokenImage() {
    const current = this.actor.prototypeToken.texture.src;
    new foundry.applications.apps.FilePicker.implementation({
      type: "image",
      current,
      callback: (path) => this.actor.update({ "prototypeToken.texture.src": path })
    }).render(true);
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.actor = this.actor;
    context.isEditable = this.isEditable;
    context.editUnlocked = this.#editUnlocked;
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

    // The Species/Heritage/Distinction Origin cards are each item's own source of truth for
    // these traits — derived here rather than copied into system.passiveFeatures, so there's
    // nothing to keep in sync if the player swaps Species/Heritage/Distinction or picks
    // different Adaptations later.
    context.originFeatures = deriveOriginFeatures({ speciesItem, heritageItem, distinctionItem });

    context.domains = DOMAINS.map((d) => ({
      ...d,
      attrs: d.attrs.map((key) => ({ key, label: capitalize(key), value: system[key], pips: pips(system[key]) })),
      skills: d.skills.map((key) => {
        const gateDistinction = SKILL_GATE[key];
        const gateOpen = !gateDistinction || distinctionItem?.system.unlocks === key;
        const expertiseOptions = EXPERTISE_DATABASE[key] || [];
        return {
          key,
          label: capitalize(key),
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
      resourceMax: system.resources[d.resource].max,
      defenseLabel: d.defense,
      defenseValue: system.defenses[d.defense]
    }));

    context.keyAspects = system.keyAspects.map((value, i) => ({ value, i, n: i + 1 }));
    context.temporaryWoundPips = pips(system.playState.currentTemporaryWounds, system.temporaryWoundsAvailable);
    context.deathTrackPips = pips(system.playState.deathTrackStep, 5);
    context.temporaryInfluencePips = pips(system.playState.currentTemporaryInfluence, system.temporaryInfluence);
    context.coreInfluenceLabels = CORE_INFLUENCE_LABELS;
    // Adventure-Limited Reach Triggers (Letters of Standing et al. — see reachTriggers' schema
    // comment in actor-combatant.mjs). effectiveReach already folds in every `active` trigger's
    // tempBonus; exposed again here bare so the template doesn't need to reach through `system.`.
    context.reachTriggers = system.reachTriggers.map((t, i) => ({ ...t, i }));

    context.comboPips = pips(system.specialties.combo, 5);
    context.threadFamilies = MAGECRAFT_THREAD_FAMILIES.map((f) => ({
      label: f.label,
      threads: f.threads.map((t) => ({ name: t, active: system.specialties.threads.includes(t) }))
    }));
    context.authorityCap = Math.ceil((system.leadership ?? 0) / 2);
    context.authorityEntries = system.specialties.authority.map((value, i) => ({ value, i }));
    context.riteEntries = system.specialties.rites.map((r, i) => ({ ...r, i }));

    // Universal actions everyone can use (Hide, Strike, Brace, ...) are just Action/Reaction Cards
    // with no Combat Skill set — split those into their own "Basic" row of quick-access buttons
    // above the skill-gated hand instead of burying them in the same list.
    const cardView = (item) => ({ id: item.id, name: item.name, system: item.system, summary: cardSummary(item.system) });
    const allActionCards = this.actor.items.filter((i) => i.type === "action-card");
    const allReactionCards = this.actor.items.filter((i) => i.type === "reaction-card");
    const byName = (a, b) => a.name.localeCompare(b.name);
    context.basicActionCards = allActionCards.filter((i) => !i.system.skill).map(cardView).sort(byName);
    context.actionCards = allActionCards.filter((i) => i.system.skill).map(cardView);
    context.basicReactionCards = allReactionCards.filter((i) => !i.system.skill).map(cardView).sort(byName);
    context.reactionCards = allReactionCards.filter((i) => i.system.skill).map(cardView);
    context.conditions = this.actor.items.filter((i) => i.type === "condition");
    // Reach gating (see computeReachGate() in utils.mjs and design/reach-and-economy.md): an
    // equipment Item's `system.cost` field IS its Reach requirement — unrelated to `system.tier`,
    // which is a Chassis/Fitting/Component sophistication rating for the modular assembly system
    // (see the componentItems mapping below). Soft warning only, per this project's non-blocking
    // convention — never prevents assigning the item, just flags it. A non-empty
    // reachExceptionSource (Quartermaster's Due, Internal Compartment, ...) raises the allowed
    // ceiling by that feature's own stated margin instead of suppressing the check outright.
    const equipmentView = (item) => {
      const { reachCost, exceptionSource, overReach } = computeReachGate(item.system, system.effectiveReach);
      return {
        id: item.id,
        name: item.name,
        category: item.system.category,
        type: item.system.type,
        reachCost,
        exceptionSource,
        overReach,
        effectText: item.system.effect || item.system.passive || item.system.special || ""
      };
    };
    const equipment = this.actor.items.filter((i) => i.type === "equipment");
    context.signatureEquipment = equipment.filter((i) => i.system.slot === "signature").map(equipmentView);
    context.armoryEquipment = equipment.filter((i) => i.system.slot === "armory").map(equipmentView);
    context.temporaryEquipment = equipment.filter((i) => i.system.slot === "temporary").map(equipmentView);

    // Armory/Signature capacity accounting (part-viii-equipment-and-items.md § Armory and
    // Signature Capacity) — previously nothing read armoryLimit/signatureEquipmentLimit against
    // actual usage at all; see computeSlotUsage's own doc comment for the ½-slot Component rule.
    context.signatureUsed = computeSlotUsage(this.actor.items, "signature");
    context.armoryUsed = computeSlotUsage(this.actor.items, "armory");
    // § Bringing More Than Your Signature Limit — "spend 1 Temporary Influence for each additional
    // FULL Signature slot you prepare beyond your normal limit." Floored: a lone ½-slot spare
    // Component sitting over the line isn't itself "a full slot," so it doesn't trigger this on
    // its own — only whole-slot overage does.
    context.signatureOverLimit = Math.max(0, Math.floor(context.signatureUsed) - system.signatureEquipmentLimit);

    // Item Grants (Quartermaster's Due, Internal Compartment, ...) — see item-grants.mjs. Detected
    // from the actor's Heritage Legacy / chosen Species Adaptations, not a separate persisted list,
    // so nothing here goes stale if the player swaps Heritage/Species or un-chooses an Adaptation.
    context.itemGrants = deriveActiveGrants({ speciesItem, heritageItem }, equipment);

    // Chassis/Fitting/Augment are their own embedded Item sub-types (design/chassis-fitting-
    // augment-system.md), not fields nested in `equipment` — list them here so a spare Component
    // sitting loose in the Armory is actually visible somewhere on the sheet. Assigning one to a
    // specific equipment Item (chassisItemId/fittingItemId/mounts) is done from that equipment
    // Item's own sheet (see EssenceEquipmentSheet in item-sheet.mjs) rather than duplicated here,
    // to avoid adding to the actor-sheet/npc-sheet duplication debt build-history already flags —
    // the assignment UI is fundamentally a property of the equipment Item, not of which actor
    // sheet happens to have it open.
    context.componentItems = this.actor.items
      .filter((i) => ["chassis", "fitting", "augment"].includes(i.type))
      .map((i) => ({ id: i.id, name: i.name, type: i.type, category: i.system.category ?? "", slot: i.system.slot ?? "", tier: i.system.tier ?? null }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
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
        ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.NoActionDiceRemaining"));
        return;
      }
      const committed = await EssenceActorSheet.#promptDiceCount({
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

  /**
   * Defense belongs to whoever is being targeted, never to the roller. Uses Foundry's own
   * targeting system (game.user.targets — the same Set the core "target" tool and the T-key
   * shortcut populate) rather than a bespoke picker, per the standing rule to prefer existing
   * Foundry hooks/processes over custom ones where one already fits.
   *
   * - No targets: ask the GM to declare a single Defense (blank rolls open, 6+ threshold).
   * - One target: use its Defense directly (falls back to the GM dialog if it isn't an
   *   Essence actor / doesn't have that Defense).
   * - Multiple targets: resolve every one against the same roll — returns a `targets` array
   *   instead of a single `defense` so the chat card can show a per-target result table.
   * @returns {Promise<{defense: number|null, targets: Array<{name:string, defense:number|null}>|null}>}
   */
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
    return { defense: declared, targets: null };
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
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoPoolDiceRemaining", { label: poolLabel }));
      return;
    }
    if (cardMin > available) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardRequiresMoreDice", { name: item.name, min: cardMin, available, label: poolLabel }));
      return;
    }

    if (isReaction) EssenceActorSheet.#warnIfLikelySecondReaction(this.actor);

    const committed = await EssenceActorSheet.#promptDiceCount({
      title: `Use ${item.name}`,
      label: `Commit how many ${poolLabel} Dice? (min ${cardMin}, max ${available})`,
      min: cardMin, max: available, initial: cardMin
    });
    if (committed === null) return;

    const defenseKey = (sys.defense || "").toLowerCase();
    const { defense, targets } = await EssenceActorSheet.#resolveTargets(defenseKey);
    const update = { [`system.playState.${poolField}`]: available - committed };

    // A card's printed Cost is paid from its Domain's resource pool (Physical/Mental/Spiritual ->
    // Stamina/Focus/Mana) on top of the Action/Reaction Dice spent above — see the rules' own
    // card-anatomy reference ("Dice 2+ | 1 Stamina"). Deducted automatically so a player doesn't
    // have to remember to also hand-adjust the resource themselves every time.
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
    const bonusSurges = hasMastery(sys, this.actor.system.expertises) ? 1 : 0;
    await rollEssencePool({ pool: committed, defense, targets, label: item.name, actor: this.actor, surgeOptions: sys.surges, bonusSurges });
  }

  /**
   * Soft "one Reaction per Action" nudge — see the schema comment on lastReactionRound/
   * lastReactionCombatantId in actor-combatant.mjs for why this is approximate. Fires before the
   * dice-commit dialog opens rather than after, so the warning is visible while the player still
   * has the choice to cancel (the dialog can still be canceled after seeing it).
   */
  static #warnIfLikelySecondReaction(actor) {
    if (!game.combat) return; // no active encounter — nothing to compare against
    const ps = actor.system.playState;
    const sameRound = ps.lastReactionRound === game.combat.round;
    const sameActiveCombatant = ps.lastReactionCombatantId && ps.lastReactionCombatantId === game.combat.combatant?.id;
    if (sameRound && sameActiveCombatant) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.SecondReactionWarning", { name: actor.name }));
    }
  }

  /** Owner/GM/player quick-adjust for the Stamina/Focus/Mana current-value trackers — a plain
   *  +/- button pair so a player can spend/recover a resource without needing to unlock the
   *  sheet's safety lock (see #applyEditable; action buttons are always exempt from it). */
  static async #onAdjustResource(event, target) {
    const field = target.dataset.field; // e.g. "currentStamina"
    const delta = Number(target.dataset.delta) || 0;
    const resKey = field.replace(/^current/, "").toLowerCase();
    const resource = this.actor.system.resources[resKey];
    if (!resource) return;
    const next = Math.min(resource.max, Math.max(0, resource.value + delta));
    await this.actor.update({ [`system.playState.${field}`]: next });
  }

  /**
   * Rolls into Foundry's real Combat Tracker instead of a private pool: finds (or creates) this
   * actor's Combatant in the active encounter and sets its `initiative` so the tracker sorts it
   * correctly, alongside the same dice-face display the sheet already showed.
   */
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
        actorId: this.actor.id,
        tokenId: token?.id ?? null,
        sceneId: token?.scene?.id ?? null
      }]);
    }

    // EssenceCombat#rollInitiative owns the dice-commit dialog and roll — the Combat Tracker's
    // own dice icon and Roll All/Roll NPCs buttons call the exact same method, so this button and
    // the native tracker UI always produce the same result.
    await combat.rollInitiative(combatant.id);
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

  /**
   * Some costs (removing Burning, paying into a Rite's Echo, Extra Movement, establishing a
   * Ballistics Lock, etc.) spend dice straight from the pool without ever rolling them — card
   * text calls this "burning" dice. This is a standalone action (not tied to any one card)
   * since burns can be paid any time the printed cost says so, not just on a card use.
   */
  static async #onBurnDice() {
    const ps = this.actor.system.playState;
    const pools = [
      { key: "actionDice", label: "Action", available: ps.actionDice ?? 0 },
      { key: "reactionDice", label: "Reaction", available: ps.reactionDice ?? 0 }
    ].filter((p) => p.available > 0);

    if (!pools.length) {
      ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.NoDiceToBurn"));
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
    const coreWounds = this.actor.system.coreWounds.map((w) => ({ ...w }));
    coreWounds[i].filled = !coreWounds[i].filled;
    if (!coreWounds[i].filled) { coreWounds[i].domain = ""; coreWounds[i].severity = ""; coreWounds[i].condition = ""; }
    await this.actor.update({ "system.coreWounds": coreWounds, "system.playState.currentCoreWounds": coreWounds.filter((w) => w.filled).length });
  }

  static async #onToggleDeathTrack(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceActorSheet.#onTogglePip(this.actor.system.playState.deathTrackStep, i);
    await this.actor.update({ "system.playState.deathTrackStep": next });
  }

  static async #onToggleDeathTrackFrozen() {
    await this.actor.update({ "system.playState.deathTrackFrozen": !this.actor.system.playState.deathTrackFrozen });
  }

  /**
   * Applies incoming Damage per part-iv-combat.md: ordinary Damage accumulates against Resilience
   * between the starts of the character's own Turns (reset in EssenceCombat#_onStartTurn) and only
   * the portion beyond Resilience becomes Wounds; Breach Damage skips Resilience entirely and
   * converts straight to Wounds. Each Wound removes a Temporary Wound if one is available, else
   * fills the next Core Wound space in fixed severity order (Light, Light, Serious, Serious,
   * Critical), tagged with the Damage's domain. Once all 5 Core Wounds are full, further Wounds
   * advance the Death Track instead of creating new ones.
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
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CriticallyWounded", { name: this.actor.name }));
    }
  }

  /**
   * Core Wounds recover in reverse order — the most severe currently marked Wound must be
   * recovered before a less severe one beneath it (part-iv-combat.md § Recovering Core Wounds).
   * Recovering removes that Wound's Condition. Part VII (Downtime) doesn't yet specify recovery
   * timing/treatment procedures in canon, so this is a manual GM-triggered action representing
   * "this Wound has now been recovered," not an automatic timer.
   */
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

    const recovered = coreWounds[slot];
    coreWounds[slot] = { filled: false, domain: "", severity: "", condition: "" };

    const update = {
      "system.coreWounds": coreWounds,
      "system.playState.currentCoreWounds": coreWounds.filter((w) => w.filled).length
    };
    // The Death Track only runs while the Critical Wound remains untreated — recovering it ends the countdown.
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

  static async #onToggleTempInfluence(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceActorSheet.#onTogglePip(this.actor.system.playState.currentTemporaryInfluence, i);
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

  /**
   * Applies Influence harm per part-v-social-encounters.md § Influence: each Injury first spends a
   * Temporary Influence slot if one is open (mirrors how a Temporary Wound absorbs a Wound before
   * Core Wounds are touched); once Temporary Influence is exhausted — or the "Voluntary" box is
   * checked, representing choosing to force a play beyond your means straight away — the Injury
   * fills the next Core Influence space in fixed severity order (Light, Light, Serious, Serious,
   * Critical). There is no accumulation/Resilience step here (unlike Damage): Influence has no
   * numeric buffer to absorb into, only discrete slots.
   */
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
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CriticalInfluenceInjury", { name: this.actor.name }));
    }
  }

  /**
   * part-v-social-encounters.md § Collaborative Influence Pooling: several characters contribute
   * Temporary Influence toward one shared goal (funding a guildhall, uniting a fractured kingdom),
   * each "proportional to their Character Tier" — no universal fixed cost, no single pooled total
   * the system tracks ("the combined effort, mechanical and narrative, is what the GM weighs...
   * not a single pooled number"). A contribution beyond what a character's Temporary Influence can
   * absorb takes a Core Influence Injury the same way any other overextension does — so this reuses
   * #onApplyInfluenceInjury's exact Temp→Core spend logic, just labeled with the shared goal and
   * postable as pure narrative support at zero cost. Deliberately actor-scoped rather than a
   * cross-actor "pooling" window — see the design discussion in this session: the rules explicitly
   * reject a single pooled number, so a per-character contribution button posting to shared chat is
   * a more faithful (and much smaller) fit than inventing new multi-actor UI.
   */
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
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CriticalInfluenceInjuryGoal", { name: this.actor.name, goal: goalLabel }));
    }
  }

  /** Core Influence recovers in reverse order — same convention as #onRecoverWound — and is a
   *  manual GM-triggered action representing "this Injury's recovery time has passed," not an
   *  automatic timer (see INFLUENCE_RECOVERY_TIME for the reference durations by severity). */
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
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> recovers from their <strong>${recovered.condition}</strong>.</p>`
    });
  }

  /**
   * part-viii-equipment-and-items.md § Bringing More Than Your Signature Limit: "spend 1 Temporary
   * Influence for each additional full Signature slot you prepare beyond your normal limit." A
   * manual, trust-based action — like every other Apply/Spend button on this sheet — rather than a
   * hard block on assigning equipment past the limit; the sheet shows the overage (see
   * signatureOverLimit in _prepareContext) but doesn't prevent it, matching the rules' own framing
   * of Signature Limit as "a normal operating limit, not an absolute prohibition."
   */
  static async #onSpendInfluenceForSlot() {
    const sys = this.actor.system;
    const max = sys.temporaryInfluence ?? 5;
    const current = sys.playState.currentTemporaryInfluence ?? 0;
    if (current >= max) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoTempInfluenceSlots", { name: this.actor.name }));
      return;
    }
    await this.actor.update({ "system.playState.currentTemporaryInfluence": current + 1 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> spends 1 Temporary Influence to prepare an additional Signature slot beyond their normal limit.</p>`
    });
  }

  /**
   * Shared Temp→Core Influence overextension spend. #onApplyInfluenceInjury and #onContributeToGoal
   * above already duplicate this same ~15-line block once each (a deliberate call in an earlier
   * session, per build-history, following this project's general "duplicate small logic across
   * sheets rather than force a shared abstraction" convention) — a third near-identical copy for
   * Reach Triggers is where that stops paying for itself, so this factors it out instead. Existing
   * callers are left untouched (lower risk than refactoring already-verified code); only the new
   * Reach Trigger action below uses this. Returns the updated values plus a chat-log array and
   * critical flag, matching what the two inline copies already compute.
   */
  static #computeInfluenceOverextension(actor, amount) {
    let tempInfluence = actor.system.playState.currentTemporaryInfluence ?? 0;
    const coreInfluence = actor.system.coreInfluence.map((c) => ({ ...c }));
    const log = [];
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
      log.push(`Core Influence filled: <strong>${condition}</strong> (recovers in ${INFLUENCE_RECOVERY_TIME[severity]}).`);
      if (slot === 4) becameCritical = true;
    }
    return { tempInfluence, coreInfluence, log, becameCritical };
  }

  /**
   * Generic "Adventure-Limited Reach Trigger" activation (part-ii-character-creation.md §§ Noble
   * Household "Letters of Standing" and Frontier Household "Prepared Cache" — Underworld Raised's
   * "Fence's Cache" also references Reach but has no Adventure-limit/Breach cost in the current
   * text, so it doesn't belong here; part-iii-playing-the-game.md § Adventure-Limited Abilities for
   * the shared "resets when the Adventure ends" framing). First use each Adventure is free: marks
   * usedThisAdventure and turns the trigger active (folding tempBonus into effectiveReach) and
   * grants tempInfluenceGrant Temporary Influence, capped at the normal max. Every use after the
   * first still grants the same boost/Influence, but also applies 1 Influence Breach through the
   * same overextension mechanic Influence Injuries already use — "Breach" per the rules text, not
   * a full Injury dialog, since the cost here is fixed at exactly 1, unlike Apply Influence Injury's
   * player-chosen amount.
   */
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
    let coreInfluence = this.actor.system.coreInfluence;
    const log = [];

    if (trigger.tempInfluenceGrant) {
      tempInfluence = Math.min(maxTemp, tempInfluence + trigger.tempInfluenceGrant);
      log.push(`Grants ${trigger.tempInfluenceGrant} Temporary Influence usable only this Scene (capped at normal max).`);
    }

    let becameCritical = false;
    if (!wasFree) {
      const overextension = EssenceActorSheet.#computeInfluenceOverextension(
        { system: { playState: { currentTemporaryInfluence: tempInfluence }, coreInfluence } },
        1
      );
      tempInfluence = overextension.tempInfluence;
      coreInfluence = overextension.coreInfluence;
      becameCritical = overextension.becameCritical;
      log.push(...overextension.log.map((l) => `Additional use this Adventure — ${l}`));
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
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CriticalInfluenceInjuryBreach", { name: this.actor.name }));
    }
  }

  /** Ends the Scene for one active Reach Trigger — clears its temporary Reach boost. Manual, like
   *  everything else in this system's lifecycle tracking; there's no automated Scene boundary. */
  static async #onDeactivateReachTrigger(event, target) {
    const i = Number(target.dataset.index);
    const triggers = this.actor.system.reachTriggers.map((t) => ({ ...t }));
    if (!triggers[i]) return;
    triggers[i].active = false;
    await this.actor.update({ "system.reachTriggers": triggers });
  }

  /** See resetAdventureUses() in utils.mjs for what this actually resets (Reach Triggers, Function
   *  Augment Uses, Consumable Kit Equipment Card Uses) — a GM/player-driven action, matching how
   *  Death Track/Wound recovery are also all manual here rather than tied to any automatic
   *  Adventure-boundary detection this system doesn't have. */
  static async #onResetAdventureUses() {
    await resetAdventureUses(this.actor);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> resets Reach Triggers, Augment Uses, and Equipment Card Uses for a new Adventure.</p>`
    });
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

  // ---- Combat Style Specialties (part-iv-combat.md § Combat Styles) ----
  // All manually managed by the player, same as the rest of the sheet (Apply Damage, Burn Dice,
  // etc. are manual too) — there's no hook that reliably knows "this Action dealt Damage" or
  // "this is a Magecraft Action of subtype Fire" from here, so triggers stay player-driven.

  /** Prowess — Combo (0-5, each point adds 1 Movement, see totalMovement in actor-character.mjs). */
  static async #onToggleCombo(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceActorSheet.#onTogglePip(this.actor.system.specialties.combo, i);
    await this.actor.update({ "system.specialties.combo": next });
  }

  /** Ballistics — Lock is free text (the Locked creature's name); establishing is just typing a new one. */
  static async #onClearLock() {
    await this.actor.update({ "system.specialties.lock": "" });
  }

  /** Gestalt — Adaptation name/upkeep are bound directly via form inputs; this just ends it. */
  static async #onEndAdaptation() {
    await this.actor.update({ "system.specialties.adaptation": { name: "", upkeep: 0 } });
  }

  /** Cunning — Contingency is free text (trigger + effect); this clears it (used or expired). */
  static async #onClearContingency() {
    await this.actor.update({ "system.specialties.contingency": "" });
  }

  /** Magecraft — Threads: up to 3 of the 10 fixed family names (part-iv-combat.md § Thread Families). */
  static async #onToggleThread(event, target) {
    const thread = target.dataset.thread;
    const threads = [...this.actor.system.specialties.threads];
    const i = threads.indexOf(thread);
    if (i !== -1) {
      threads.splice(i, 1);
    } else {
      if (threads.length >= 3) {
        ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.AlreadyMaintaining3Threads"));
        return;
      }
      threads.push(thread);
    }
    await this.actor.update({ "system.specialties.threads": threads });
  }

  /** Leadership — Authority: stored die results, capped at half Leadership Rank (rounded up). */
  static async #onAddAuthority() {
    const rank = this.actor.system.leadership ?? 0;
    const cap = Math.ceil(rank / 2);
    const authority = this.actor.system.specialties.authority;
    if (authority.length >= cap) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.MaxAuthorityStored", { cap }));
      return;
    }
    const value = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Store Authority" },
        content: `<label>Rolled result to store <input type="number" name="value" value="1" min="1" max="10" autofocus></label>`,
        buttons: [{
          action: "store",
          label: "Store",
          default: true,
          callback: (event, button) => Number(button.form.elements.value.value)
        }],
        submit: (result) => resolve(result === "store" ? null : result)
      }).render(true);
    });
    if (value === null || !Number.isFinite(value)) return;
    await this.actor.update({ "system.specialties.authority": [...authority, value] });
  }

  static async #onRemoveAuthority(event, target) {
    const i = Number(target.dataset.index);
    const authority = [...this.actor.system.specialties.authority];
    authority.splice(i, 1);
    await this.actor.update({ "system.specialties.authority": authority });
  }

  /** Ritualism — Rites: up to 3 (trigger, Echo, Echo Limit). */
  static async #onAddRite() {
    const rites = this.actor.system.specialties.rites.map((r) => ({ ...r }));
    if (rites.length >= 3) {
      ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.AlreadyMaintaining3Rites"));
      return;
    }
    rites.push({ trigger: "", echo: "", echoLimit: 1 });
    await this.actor.update({ "system.specialties.rites": rites });
  }

  static async #onDeleteRite(event, target) {
    const i = Number(target.dataset.index);
    const rites = this.actor.system.specialties.rites.map((r) => ({ ...r }));
    rites.splice(i, 1);
    await this.actor.update({ "system.specialties.rites": rites });
  }

  /** Opens a Card in its read view — same sheet as Edit, just guaranteed to land on the
   *  formatted view instead of whatever form/view state a prior session left it in. */
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

  /**
   * Lets the player fulfill (or replace) an Item Grant — Quartermaster's Due, Internal
   * Compartment, ... (see item-grants.mjs) — by tagging one Equipment item the character already
   * owns as that grant's exception. Deliberately pulls from the actor's own Inventory rather than
   * browsing the shared Equipment compendium: the compendium is a big shared reference library
   * (any setting's full weapon/armor roster), not "what my character actually has," and offering
   * the whole thing here produced an irrelevant grab-bag unrelated to the character being played —
   * Quartermaster's Due is about which of YOUR things counts as the exception, not conjuring a new
   * item from thin air. A plain `<select>` is enough UI since the eligible set (this character's
   * owned Equipment matching the grant's matchers/Reach rule) is always small, matching this
   * sheet's existing DialogV2 pattern for short choices (see e.g. #onApplyDamage).
   */
  static async #onChooseGrantedItem(event, target) {
    const sourceName = target.dataset.grantSource;
    const grant = ITEM_GRANT_REGISTRY[sourceName];
    if (!grant) return;

    const reach = this.actor.system.effectiveReach;
    const owned = this.actor.items.filter((i) => i.type === "equipment" && i.system.reachExceptionSource !== sourceName);
    const eligible = owned.filter((i) => equipmentMatchesGrant(i.system, grant) && reachQualifiesForGrant(i.system, grant, reach));
    if (!eligible.length) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoQualifyingItemActor", { source: sourceName }));
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

    // Replacing (part-ii-character-creation.md's "you may replace it...") clears the exception off
    // whichever item held it before, rather than deleting anything — it's still a normal owned item.
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
