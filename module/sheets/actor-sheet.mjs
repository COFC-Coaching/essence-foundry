import { rollEssencePool } from "../dice/essence-roll.mjs";
import { EXPERTISE_DATABASE } from "../data/expertise-database.mjs";
import { deriveOriginFeatures } from "../data/origin-features.mjs";
import { ITEM_GRANT_REGISTRY, deriveActiveGrants, equipmentMatchesGrant, reachQualifiesForGrant } from "../data/item-grants.mjs";
import { deriveEquipmentStats, equipmentEffectSummary, buildEquipmentResolver } from "../data/equipment-features.mjs";
import { EQUIPMENT_CATEGORY_LABELS } from "../data/item-card.mjs";
import EssenceCharacterWizard from "../apps/character-wizard.mjs";
import { capitalize, cardSummary, domainResource, hasMastery, computeSlotUsage, computeReachGate, computeEquipmentBonusSources, resetAdventureUses, resolveEquipmentDropSlot, SEVERITY_BY_INDEX, INFLUENCE_RECOVERY_TIME } from "../utils.mjs";
import { availableSubtypes, enterManifestation } from "../apps/manifestation.mjs";

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
    // Scoped to .draggable-row rather than a bare [data-item-id] selector, since plenty of other
    // elements on this sheet (Edit/Delete buttons on card rows, condition entries, etc.) also carry
    // data-item-id without being meant to drag — only the Equipment tab's Signature/Temporary/
    // Armory rows opt in.
    dragDrop: [{ dragSelector: ".draggable-row", dropSelector: null }],
    actions: {
      openWizard: EssenceActorSheet.#onOpenWizard,
      editTokenImage: EssenceActorSheet.#onEditTokenImage,
      toggleEditLock: EssenceActorSheet.#onToggleEditLock,
      rollSkill: EssenceActorSheet.#onRollSkill,
      rollItem: EssenceActorSheet.#onRollItem,
      postEquipmentToChat: EssenceActorSheet.#onPostEquipmentToChat,
      moveEquipmentSlot: EssenceActorSheet.#onMoveEquipmentSlot,
      createEquipment: EssenceActorSheet.#onCreateEquipment,
      rollInitiative: EssenceActorSheet.#onRollInitiative,
      endTurn: EssenceActorSheet.#onEndTurn,
      applyDamage: EssenceActorSheet.#onApplyDamage,
      recoverWound: EssenceActorSheet.#onRecoverWound,
      grantRecovery: EssenceActorSheet.#onGrantRecovery,
      adjustResource: EssenceActorSheet.#onAdjustResource,
      adjustPoolDice: EssenceActorSheet.#onAdjustPoolDice,
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
      rollNonCombatSkill: EssenceActorSheet.#onRollNonCombatSkill,
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
      chooseGrantedItem: EssenceActorSheet.#onChooseGrantedItem,
      openManifestation: EssenceActorSheet.#onOpenManifestation
    }
  };

  /** Adds a "Full Manifestation" entry to the sheet's own header dropdown (alongside core's
   *  Configure Ownership/Prototype Token/etc.) for any character with Calling — the entry point
   *  the player uses to enter one of the 8 CALLING_PROFILES.md forms (see manifestation.mjs). Not
   *  shown for Rank 0-without-Calling characters, since there's nothing to manifest into yet. */
  _getHeaderControls() {
    const controls = super._getHeaderControls();
    if ((this.actor.system.calling ?? 0) > 0) {
      const active = this.actor.system.specialties.activeManifestation;
      controls.push({
        icon: "fa-solid fa-mask",
        label: active ? game.i18n.format("ESSENCE.Character.ManifestedAsControl", { subtype: active }) : game.i18n.localize("ESSENCE.Character.FullManifestationControl"),
        action: "openManifestation"
      });
    }
    return controls;
  }

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
      // Stops this reaching the form-level submitOnChange listener (see the ApplicationV2 `form`
      // option in DEFAULT_OPTIONS) — without this, typing/selecting here triggered a full form
      // submit-and-re-render on every keystroke/selection, which rebuilds the card list from
      // scratch and silently undoes the filter/sort that change was supposed to apply, along with
      // resetting scroll position. Neither control has a `name` attribute (nothing here is actual
      // actor data to save), so nothing is lost by keeping the event local to this listener.
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
      // [data-card-filter]/[data-card-sort] are pure client-side view controls (see #wireCardControls)
    // with no `name` attribute — nothing they touch is actor data, so the safety lock that guards
    // against fat-fingering a build value has nothing to protect here, and disabling them just
    // blocked sorting/filtering your own card list for no reason.
    for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) {
      if (el.matches("[data-card-filter], [data-card-sort]")) continue;
      el.disabled = true;
    }
      for (const el of body.querySelectorAll('button[data-action]:not([data-action="changeTab"]), a[data-action]:not([data-action="changeTab"])')) {
        el.classList.add("locked");
        el.style.pointerEvents = "none";
      }
      return;
    }
    if (this.#editUnlocked) return;
    // [data-card-filter]/[data-card-sort] are pure client-side view controls (see #wireCardControls)
    // with no `name` attribute — nothing they touch is actor data, so the safety lock that guards
    // against fat-fingering a build value has nothing to protect here, and disabling them just
    // blocked sorting/filtering your own card list for no reason.
    for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) {
      if (el.matches("[data-card-filter], [data-card-sort]")) continue;
      el.disabled = true;
    }
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

  /**
   * A character has exactly one Species/Heritage/Distinction — dropping a new one replaces the old.
   *
   * Also handles the Equipment tab's Signature/Temporary/Armory drop zones (see
   * `resolveEquipmentDropSlot` in utils.mjs): dropping a NEW equipment Item (from a compendium, the
   * world Items directory, or another actor) into one of those zones creates it and sets its
   * `system.slot` to match; dragging an equipment Item this actor ALREADY owns into a different zone
   * just reassigns its slot in place — a real move, not a duplicate. Foundry's own default
   * `_onDropItem` treats a drop of an already-owned item as a same-list reorder, which isn't
   * meaningful for three separate slot categories, so that case is handled directly instead of
   * calling super().
   */
  async _onDropItem(event, item) {
    const dropSlot = resolveEquipmentDropSlot(event);

    if (item.type === "equipment" && dropSlot) {
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

    const created = await super._onDropItem(event, item);
    if (created && ORIGIN_TYPES.includes(created.type)) {
      const stale = this.actor.items.filter((i) => i.type === created.type && i.id !== created.id);
      if (stale.length) await this.actor.deleteEmbeddedDocuments("Item", stale.map((i) => i.id));
      const field = created.type === "distinction" ? "distinction" : created.type;
      await this.actor.update({ [`system.${field}`]: created.name });
    }
    return created;
  }

  /** Populates the drag payload for the Equipment tab's draggable rows (see dragDrop in
   *  DEFAULT_OPTIONS) — Foundry's Document#toDragData() is the standard {type, uuid} shape every
   *  drop target (including this sheet's own zones, and any other actor's sheet) already expects. */
  _onDragStart(event) {
    const itemId = event.currentTarget.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if (!item) return;
    event.dataTransfer.setData("text/plain", JSON.stringify(item.toDragData()));
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
    // See buildEquipmentResolver's own doc comment — falls back to the compendium for a modular
    // item's chassisItemId/fittingItemId that was never actually embedded on this actor, so its
    // Effect/bonuses still resolve to something instead of silently rendering blank.
    const equipmentResolver = await buildEquipmentResolver(this.actor);
    context.equipmentBonusSources = computeEquipmentBonusSources(this.actor.items, (item) => deriveEquipmentStats(equipmentResolver, item));

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
    // max(1, half Rank rounded up) — the plain half-rank formula gives 0 slots at Leadership Rank
    // 0, an unusable result PLAYTEST_RULES.md §13 explicitly patches with this floor.
    context.authorityCap = Math.max(1, Math.ceil((system.leadership ?? 0) / 2));
    context.authorityEntries = system.specialties.authority.map((value, i) => ({ value, i }));
    context.riteEntries = system.specialties.rites.map((r, i) => ({ ...r, i }));
    // Read-only status for the Calling specialty row — entering/dismissing a Full Manifestation
    // happens through this sheet's own header dropdown (see manifestation.mjs), not here.
    context.brokenManifestations = system.specialties.manifestationRecords.filter((r) => r.broken).map((r) => r.subtype);

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
    // (see componentView below). Soft warning only, per this project's non-blocking
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
        effectText: equipmentEffectSummary(equipmentResolver, item)
      };
    };
    // Chassis/Fitting/Augment are "just a part of Equipment or things that go into the Armory" —
    // not a separate inventory concept — so they're folded into the same three Signature/Temporary/
    // Armory lists Equipment uses, rather than a fourth standalone section. Chassis/Fitting carry
    // their own real `system.slot` (item-component.mjs — same signature/temporary/armory
    // vocabulary computeSlotUsage already reads), so they bucket normally; Augments have no slot at
    // all (they're never "carried" independently of what they're mounted in) and always land in
    // Armory. `category` here reuses the equipmentCategoryLabel helper's own capitalize() fallback
    // (unrecognized keys just render as-is) rather than needing a second label lookup.
    const componentView = (item) => ({
      id: item.id,
      name: item.name,
      category: capitalize(item.type),
      type: item.system.category ? capitalize(item.system.category) : "",
      reachCost: null,
      exceptionSource: "",
      overReach: false,
      effectText: equipmentEffectSummary(equipmentResolver, item)
    });
    const equipment = this.actor.items.filter((i) => i.type === "equipment");
    const chassisAndFittings = this.actor.items.filter((i) => ["chassis", "fitting"].includes(i.type));
    const augments = this.actor.items.filter((i) => i.type === "augment").map(componentView);
    context.signatureEquipment = [
      ...equipment.filter((i) => i.system.slot === "signature").map(equipmentView),
      ...chassisAndFittings.filter((i) => i.system.slot === "signature").map(componentView)
    ];
    context.temporaryEquipment = [
      ...equipment.filter((i) => i.system.slot === "temporary").map(equipmentView),
      ...chassisAndFittings.filter((i) => i.system.slot === "temporary").map(componentView)
    ];
    context.armoryEquipment = [
      ...equipment.filter((i) => i.system.slot === "armory").map(equipmentView),
      ...chassisAndFittings.filter((i) => i.system.slot === "armory").map(componentView),
      ...augments
    ];

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

    // Equipment-granted cards (§ Function Augment Uses, § Consumable Kits, § Ordinary Equipment
    // Cards) belong in the same card list a player reads their whole hand from, not buried on each
    // item's own sheet — but they're deliberately never Item documents (deriveEquipmentStats'
    // grantedCards / EssenceEquipmentData.equipmentCards are plain text), so they never touch
    // CARD_LIMIT/nonBasicCardCount in character-wizard.mjs, which only ever counts real
    // action-card/reaction-card Items — same "exclusion is automatic because it isn't a card Item"
    // shape as isBasicCard's Basic-card exclusion, just one layer earlier. Scoped to Signature
    // equipment only, matching equipment-effects.mjs's own signature-only gate (Armory/Temporary
    // gear you own but aren't carrying for the Adventure shouldn't contribute).
    context.equipmentCards = [];
    for (const item of equipment.filter((i) => i.system.slot === "signature")) {
      if (item.system.isModular) {
        for (const g of deriveEquipmentStats(equipmentResolver, item).grantedCards) {
          context.equipmentCards.push({ source: item.name, name: g.source, effect: g.effect, uses: g.uses, usesRemaining: g.usesRemaining });
        }
      }
      for (const c of item.system.equipmentCards ?? []) {
        context.equipmentCards.push({ source: item.name, name: c.name, effect: c.effect, uses: c.uses, usesRemaining: c.usesRemaining });
      }
    }
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
   * A Non-Combat Skill rolls exactly like a Combat Skill's own open check (see #onRollSkill's
   * final branch above) — pick an Attribute to pair it with, then roll Attribute + the skill's own
   * rating as the dice pool. Unlike Combat Skills, Non-Combat Skills are freeform (name typed by
   * the player, not one of a fixed list), so this reads the row's current name/rating directly
   * from the actor rather than off a fixed `data-skill` key.
   */
  static async #onRollNonCombatSkill(event, target) {
    const i = Number(target.dataset.index);
    const entry = this.actor.system.nonCombatSkills[i];
    if (!entry?.name) return;

    const attr = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Roll ${entry.name}` },
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
    const pool = (this.actor.system[attr] ?? 0) + (entry.rating ?? 0);
    await rollEssencePool({ pool, label: `${capitalize(attr)} + ${entry.name}`, actor: this.actor });
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

  /** Owner/GM/player quick-adjust for the Action/Reaction Dice pools — lets dice be added (e.g. a
   *  card or effect grants extra dice) or spent without rolling, without needing to unlock the
   *  sheet's safety lock. */
  static async #onAdjustPoolDice(event, target) {
    const field = target.dataset.field; // "actionDice" or "reactionDice"
    const delta = Number(target.dataset.delta) || 0;
    const current = this.actor.system.playState[field] ?? 0;
    const next = Math.max(0, current + delta);
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
    const resilience = sys.effectiveResilience ?? sys.resilience ?? 0;
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

  /**
   * A Recovery per part-iii-playing-the-game.md § Recovery During an Adventure: "a meaningful
   * opportunity... to regain some renewable capability," granted only when "circumstances provide
   * enough safety, time, treatment, supplies, or support" — deliberately not tied to a session
   * boundary or a fixed formula. Part VII (where the numeric Stamina/Focus/Mana restoration and
   * Wound treatment timing were meant to live) is still an unfinished placeholder, so rather than
   * invent a canon-less percentage, this hands the GM a lever: they judge from the fiction how much
   * this particular Recovery restores and enter it here. Wound recovery reuses #onRecoverWound's
   * same reverse-order rule (most severe filled Wound first), just repeated per the GM's count.
   */
  static async #onGrantRecovery() {
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Grant Recovery" },
        content: `
          <p class="muted">Per Part III, Recovery follows what the situation provides — judge how much this one grants.</p>
          <label>Stamina / Focus / Mana Restored <input type="number" name="pct" value="25" min="0" max="100" autofocus> %</label>
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="healWounds"> Recover Core Wounds
          </label>
          <label>Core Wounds to Recover <input type="number" name="woundCount" value="1" min="1" max="5"></label>
        `,
        buttons: [{
          action: "grant",
          label: "Grant Recovery",
          default: true,
          callback: (event, button) => ({
            pct: Math.min(100, Math.max(0, Math.floor(Number(button.form.elements.pct.value)) || 0)),
            healWounds: button.form.elements.healWounds.checked,
            woundCount: Math.max(1, Math.floor(Number(button.form.elements.woundCount.value)) || 1)
          })
        }],
        submit: (result) => resolve(result === "grant" ? null : result)
      }).render(true);
    });
    if (!result) return;

    const sys = this.actor.system;
    const update = {};
    const resourceLog = [];

    for (const key of ["stamina", "focus", "mana"]) {
      const resource = sys.resources[key];
      const restored = Math.round(resource.max * (result.pct / 100));
      const next = Math.min(resource.max, resource.value + restored);
      const gained = next - resource.value;
      if (gained <= 0) continue;
      const field = `current${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      update[`system.playState.${field}`] = next;
      resourceLog.push(`+${gained} ${key.charAt(0).toUpperCase()}${key.slice(1)}`);
    }

    const woundsRecovered = [];
    if (result.healWounds) {
      const coreWounds = sys.coreWounds.map((w) => ({ ...w }));
      for (let n = 0; n < result.woundCount; n++) {
        let slot = -1;
        for (let i = coreWounds.length - 1; i >= 0; i--) {
          if (coreWounds[i].filled) { slot = i; break; }
        }
        if (slot === -1) break;
        woundsRecovered.push(coreWounds[slot].condition);
        coreWounds[slot] = { filled: false, domain: "", severity: "", condition: "" };
        if (slot === 4) {
          update["system.playState.deathTrackStep"] = 0;
          update["system.playState.deathTrackFrozen"] = false;
        }
      }
      update["system.coreWounds"] = coreWounds;
      update["system.playState.currentCoreWounds"] = coreWounds.filter((w) => w.filled).length;
    }

    if (!resourceLog.length && !woundsRecovered.length) {
      ui.notifications.info(game.i18n.format("ESSENCE.Notify.NothingToRecover", { name: this.actor.name }));
      return;
    }

    await this.actor.update(update);

    const parts = [];
    if (resourceLog.length) parts.push(resourceLog.join(", "));
    if (woundsRecovered.length) parts.push(`recovers from ${woundsRecovered.join(", ")}`);

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> secures a Recovery: ${parts.join("; ")}.</p>`
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

  /** Leadership — Authority: stored die results, capped at max(1, half Leadership Rank rounded up). */
  static async #onAddAuthority() {
    const rank = this.actor.system.leadership ?? 0;
    const cap = Math.max(1, Math.ceil(rank / 2));
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

  /**
   * Calling — Full Manifestation entry point (see manifestation.mjs). Already-manifested is
   * handled by pointing the player at the profile's own sheet instead of offering a second Enter
   * here — Dismiss/Apply Defeat live on that NPC sheet's matching header control, not this one.
   */
  static async #onOpenManifestation() {
    const actor = this.actor;
    const active = actor.system.specialties.activeManifestation;
    if (active) {
      ui.notifications.info(game.i18n.format("ESSENCE.Notify.AlreadyManifested", { name: actor.name, subtype: active }));
      return;
    }
    const subtypes = availableSubtypes(actor);
    if (!subtypes.length) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoManifestationRank", { name: actor.name }));
      return;
    }
    const options = subtypes.map((s) => {
      const record = actor.system.specialties.manifestationRecords.find((r) => r.subtype === s.name);
      const broken = record?.broken;
      return `<option value="${s.name}" ${broken ? "disabled" : ""}>${s.name} (Rank ${s.rank})${broken ? " — Broken until Downtime" : ""}</option>`;
    }).join("");
    const subtype = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: game.i18n.localize("ESSENCE.Character.FullManifestationControl") },
        content: `<p>${game.i18n.localize("ESSENCE.Character.ManifestationDialogHint")}</p><label>${game.i18n.localize("ESSENCE.Character.ManifestAsLabel")} <select name="subtype">${options}</select></label>`,
        buttons: [{
          action: "enter",
          label: game.i18n.localize("ESSENCE.Character.EnterManifestation"),
          default: true,
          callback: (event, button) => button.form.elements.subtype.value
        }],
        submit: (result) => resolve(result)
      }).render(true);
    });
    if (!subtype) return;
    await enterManifestation(actor, subtype);
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

  /**
   * Posts an equipment Item's full description to chat — the "#" row-index column on the
   * Signature Equipment table (and the action column on Temporary/Armory) served no purpose
   * (reported live: "the # column is useless"), so it's replaced with this instead. Reuses
   * equipmentEffectSummary() (equipment-features.mjs) rather than the table's own already-computed
   * `effectText` so this also works for Armory/Temporary rows, whose table markup doesn't pass
   * that context through to the action buttons.
   */
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

  /**
   * Moves an equipment Item between the Signature/Temporary/Armory tables — same underlying change
   * as dragging its row into a different `[data-drop-slot]` zone (`_onDropItem` above), added as an
   * explicit button per row because native HTML5 drag-and-drop between three separately-scrolling
   * tables is fragile to actually land (confirmed live: a real mouse drag between zones didn't
   * register). No Signature-capacity block here, matching drag-and-drop's own behavior — the
   * sheet's existing "over Signature limit" note and Spend-Influence button already handle that
   * reactively once the move lands, rather than refusing the move up front.
   */
  static async #onMoveEquipmentSlot(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    const slot = target.dataset.slot;
    if (!item || !["signature", "temporary", "armory"].includes(slot)) return;
    await item.update({ "system.slot": slot });
  }

  /**
   * "+ Add Item" for each of the three Equipment tables — previously the only way to get an item
   * into Temporary (or any slot) was dragging one in from a compendium/another actor; there was no
   * way to just create a new one straight in a slot (reported live: "I need to be able to add to
   * the Temporary Items"). Creates a blank `equipment` Item (category defaults to "gear" — the
   * sheet's own Category dropdown covers picking a real one) and opens it straight into its edit
   * view, matching the Item Creation Wizard's own "create then immediately edit" flow.
   */
  static async #onCreateEquipment(event, target) {
    const slot = target.dataset.slot;
    if (!["signature", "temporary", "armory"].includes(slot)) return;
    const [created] = await this.actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.localize("ESSENCE.Sheet.NewEquipmentName"),
      type: "equipment",
      img: "icons/svg/item-bag.svg",
      system: { slot }
    }]);
    created?.sheet.render(true);
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
