import { rollEssencePool } from "../dice/essence-roll.mjs";
import { EXPERTISE_DATABASE, THREAD_EFFECTS } from "../data/expertise-database.mjs";
import { deriveOriginFeatures } from "../data/origin-features.mjs";
import { ITEM_GRANT_REGISTRY, deriveActiveGrants, equipmentMatchesGrant, reachQualifiesForGrant } from "../data/item-grants.mjs";
import { deriveEquipmentStats, equipmentEffectSummary, buildEquipmentResolver } from "../data/equipment-features.mjs";
import { EQUIPMENT_CATEGORY_LABELS } from "../data/item-card.mjs";
import EssenceCharacterWizard from "../apps/character-wizard.mjs";
import { capitalize, cardSummary, domainResource, hasMastery, computeSlotUsage, computeReachGate, computeEquipmentBonusSources, resetAdventureUses, resolveEquipmentDropSlot, stripHtml, SEVERITY_BY_INDEX, deathTrackAfterWoundRemoval, deathTrackAfterWoundFilled, deathTrackAfterCardWhileDying, attachWoundCards, removeWoundCard, removeWoundCards, attachConsequenceCard, attachConsequenceCards, removeConsequenceCard, removeConsequenceCards, applyResistanceVulnerability, DAMAGE_TYPES, cardOnCooldown, applyCardCooldown, resetEncounterCooldowns } from "../utils.mjs";
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

/** Gated combat styles can only be raised above 0 with the matching Distinction attached. */
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

// V6's five remaining per-Attribute benefits (Might/Grace/Vigor/Acuity/Resolve) — one short
// localized reminder line per Attribute, sourced from the derived reference values computed in
// EssenceCombatantData#prepareDerivedData (actor-combatant.mjs). Character-sheet only: NPC/Monster
// sheets have no comparable derived-Attribute display to extend (their attr-row is a bare label +
// input, see npc-sheet.mjs/monster-sheet.mjs), matching this project's existing display-scoping
// convention (e.g. the Adaptability reroll checkbox is PC-only for the same reason).
const ATTR_BENEFIT = {
  might: (s) => game.i18n.format("ESSENCE.Sheet.ExceptionalLoad", { lb: s.exceptionalLoad }),
  grace: (s) => game.i18n.format("ESSENCE.Sheet.RunningJump", { units: s.runningJumpDistance }),
  vigor: (s) => game.i18n.format("ESSENCE.Sheet.ExtremeExertion", { minutes: s.extremeExertionMinutes, rounds: s.extremeExertionRounds }),
  acuity: (s) => game.i18n.format("ESSENCE.Sheet.ExtendedSenses", { bonus: s.extendedSensesBonus, range: s.preciseVisionRange }),
  resolve: (s) => game.i18n.format("ESSENCE.Sheet.SustainedAttention", { hours: s.sustainedAttentionHours })
};

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
    // data-item-id without being meant to drag — only the Equipment tab's Inventory/Temporary/
    // Armory rows opt in.
    dragDrop: [{ dragSelector: ".draggable-row", dropSelector: null }],
    actions: {
      openWizard: EssenceActorSheet.#onOpenWizard,
      editTokenImage: EssenceActorSheet.#onEditTokenImage,
      toggleEditLock: EssenceActorSheet.#onToggleEditLock,
      rollSkill: EssenceActorSheet.#onRollSkill,
      rollItem: EssenceActorSheet.#onRollItem,
      rollEquipmentCard: EssenceActorSheet.#onRollEquipmentCard,
      toggleEquipmentCard: EssenceActorSheet.#onToggleEquipmentCard,
      postEquipmentToChat: EssenceActorSheet.#onPostEquipmentToChat,
      moveEquipmentSlot: EssenceActorSheet.#onMoveEquipmentSlot,
      createEquipment: EssenceActorSheet.#onCreateEquipment,
      reconfigureItem: EssenceActorSheet.#onReconfigureItem,
      releaseItem: EssenceActorSheet.#onReleaseItem,
      toggleItemUsed: EssenceActorSheet.#onToggleItemUsed,
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
      toggleDeathTrackStabilized: EssenceActorSheet.#onToggleDeathTrackStabilized,
      toggleTempInfluence: EssenceActorSheet.#onToggleTempInfluence,
      toggleCoreInfluence: EssenceActorSheet.#onToggleCoreInfluence,
      applyInfluenceInjury: EssenceActorSheet.#onApplyInfluenceInjury,
      recoverInfluenceInjury: EssenceActorSheet.#onRecoverInfluenceInjury,
      payInventorySupport: EssenceActorSheet.#onPayInventorySupport,
      contributeToGoal: EssenceActorSheet.#onContributeToGoal,
      addArrayRow: EssenceActorSheet.#onAddArrayRow,
      deleteArrayRow: EssenceActorSheet.#onDeleteArrayRow,
      rollNonCombatSkill: EssenceActorSheet.#onRollNonCombatSkill,
      rollKeyAspect: EssenceActorSheet.#onRollKeyAspect,
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
      newEncounter: EssenceActorSheet.#onNewEncounter,
      takePresenceGrant: EssenceActorSheet.#onTakePresenceGrant,
      adjustPresenceGrant: EssenceActorSheet.#onAdjustPresenceGrant,
      chooseGrantedItem: EssenceActorSheet.#onChooseGrantedItem,
      openManifestation: EssenceActorSheet.#onOpenManifestation,
      addResistance: EssenceActorSheet.#onAddResistance,
      removeResistance: EssenceActorSheet.#onRemoveResistance,
      addVulnerability: EssenceActorSheet.#onAddVulnerability,
      removeVulnerability: EssenceActorSheet.#onRemoveVulnerability,
      toggleAdaptabilityReroll: EssenceActorSheet.#onToggleAdaptabilityReroll
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
   * Also handles the Equipment tab's Inventory/Temporary/Armory drop zones (see
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
    // different Species Traits later.
    context.originFeatures = deriveOriginFeatures({ speciesItem, heritageItem, distinctionItem });

    context.domains = DOMAINS.map((d) => ({
      ...d,
      attrs: d.attrs.map((key) => ({
        key, label: capitalize(key), value: system[key], pips: pips(system[key]),
        benefit: ATTR_BENEFIT[key] ? ATTR_BENEFIT[key](system) : null
      })),
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
    // V6: track length is deathTrackMax (5, or 7 for Deathless — design/v6-revision-delta.md §2.3).
    context.deathTrackPips = pips(system.playState.deathTrackStep, system.deathTrackMax);
    // V6: the Death Track block only shows once ALL Core Wound spaces are filled — not merely on a
    // Critical Wound (see actor-combatant.mjs's coreWoundsFilled/deathTrackState schema comments).
    context.deathTrackActive = system.coreWoundsFilled === system.coreWounds.length;
    context.temporaryInfluencePips = pips(system.playState.currentTemporaryInfluence, system.temporaryInfluence);
    context.coreInfluenceLabels = CORE_INFLUENCE_LABELS;
    // Adventure-Limited Reach Triggers (Letters of Standing et al. — see reachTriggers' schema
    // comment in actor-combatant.mjs). effectiveReach already folds in every `active` trigger's
    // tempBonus; exposed again here bare so the template doesn't need to reach through `system.`.
    context.reachTriggers = system.reachTriggers.map((t, i) => ({ ...t, i }));

    context.comboPips = pips(system.specialties.combo, 5);
    context.threadFamilies = MAGECRAFT_THREAD_FAMILIES.map((f) => ({
      label: f.label,
      threads: f.threads.map((t) => ({
        name: t,
        active: system.specialties.threads.includes(t),
        effect: THREAD_EFFECTS[t] ?? "",
        title: `${f.label} — ${THREAD_EFFECTS[t] ?? ""}`
      }))
    }));
    // V6 Appendix G (plan §6.12): the effect text beside each currently-STORED Thread (as opposed
    // to the toggle chips above, which show every available Thread). A Thread may be stored more
    // than once (duplicates allowed, effects stack), so this lists every entry in the array, not a
    // deduped set.
    context.activeThreads = system.specialties.threads.map((t) => ({ name: t, effect: THREAD_EFFECTS[t] ?? "" }));
    // max(1, half Rank rounded up) — the plain half-rank formula gives 0 slots at Leadership Rank
    // 0, an unusable result PLAYTEST_RULES.md §13 explicitly patches with this floor.
    context.authorityCap = Math.max(1, Math.ceil((system.leadership ?? 0) / 2));
    context.authorityEntries = system.specialties.authority.map((value, i) => ({ value, i }));
    context.riteEntries = system.specialties.rites.map((r, i) => ({ ...r, i }));
    // Read-only status for the Calling specialty row — entering/dismissing a Full Manifestation
    // happens through this sheet's own header dropdown (see manifestation.mjs), not here.
    context.brokenManifestations = system.specialties.manifestationRecords.filter((r) => r.broken).map((r) => r.subtype);

    // Universal actions everyone can use (Hide, Strike, Brace, ...) are just Action/Reaction Cards
    // with no Combat Style set — split those into their own "Basic" row of quick-access buttons
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
        // Used-vs-unused preparation commitment (design/v6-revision-delta.md §3.5) — see
        // usedThisAdventure's own doc comment (item-card.mjs) for why this is a visible badge/
        // manual toggle rather than automated Armory-access-swap enforcement.
        tracksUsedFlag: true,
        usedThisAdventure: item.system.usedThisAdventure ?? false,
        effectText: equipmentEffectSummary(equipmentResolver, item)
      };
    };
    // Chassis/Fitting/Augment are "just a part of Equipment or things that go into the Armory" —
    // not a separate inventory concept — so they're folded into the same three Inventory/Temporary/
    // Armory lists Equipment uses, rather than a fourth standalone section. Chassis/Fitting carry
    // their own real `system.slot` (item-component.mjs — same inventory/temporary/armory
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
      // Augments are always 0 capacity (item-component.mjs) and don't carry usedThisAdventure —
      // tracksUsedFlag lets the template skip the badge/toggle for them instead of showing a
      // misleading always-"Unused" state.
      tracksUsedFlag: item.type !== "augment",
      usedThisAdventure: item.system.usedThisAdventure ?? false,
      effectText: equipmentEffectSummary(equipmentResolver, item)
    });
    const equipment = this.actor.items.filter((i) => i.type === "equipment");
    const chassisAndFittings = this.actor.items.filter((i) => ["chassis", "fitting"].includes(i.type));
    const augments = this.actor.items.filter((i) => i.type === "augment").map(componentView);
    context.inventoryEquipment = [
      ...equipment.filter((i) => i.system.slot === "inventory").map(equipmentView),
      ...chassisAndFittings.filter((i) => i.system.slot === "inventory").map(componentView)
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

    // Armory/Inventory capacity accounting (part-viii-equipment-and-items.md § Armory and
    // Inventory Capacity) — previously nothing read armoryLimit/inventoryLimit against
    // actual usage at all; see computeSlotUsage's own doc comment for the ½-slot Component rule.
    context.inventoryUsed = computeSlotUsage(this.actor.items, "inventory");
    // Inventory, Temporary and Armory are three SEPARATE containers you move items between, so
    // each counts only what is actually in it — an item in your Loadout occupies an Inventory slot
    // and nothing else. A 2026-09-08 pass read plan §5.7's "It is not eight reserve items plus
    // four carried items" as meaning Armory's 8 was inclusive of Inventory's 4 and added the two
    // buckets together here; that reading is wrong (confirmed by the system's author), and it made
    // the Armory header count items the Armory list doesn't even show. The Character Wizard's own
    // Armory figure (character-wizard.mjs) always counted the one bucket, so this also puts the
    // two screens back in agreement.
    context.armoryUsed = computeSlotUsage(this.actor.items, "armory");
    // § Bringing More Than Your Inventory Limit — pays 1 ordinary Influence pressure for each
    // additional slot of capacity prepared beyond the normal limit. V6 (plan §5.3.5): excess
    // capacity rounds UP on the TOTAL (4.5 over supported capacity = 1 pressure, 5.5 = 2) — a
    // change from V5's floor, where a lone ½-slot spare Component sitting past the line didn't
    // trigger this on its own.
    context.inventoryOverLimit = Math.max(0, Math.ceil(context.inventoryUsed) - system.inventoryLimit);

    // Item Grants (Quartermaster's Due, Internal Compartment, ...) — see item-grants.mjs. Detected
    // from the actor's Heritage Legacy / chosen Species Traits, not a separate persisted list,
    // so nothing here goes stale if the player swaps Heritage/Species or un-chooses a Trait.
    context.itemGrants = deriveActiveGrants({ speciesItem, heritageItem }, equipment);

    // Equipment-granted cards (§ Function Augment Uses, § Consumable Kits, § Ordinary Equipment
    // Cards) belong in the same card list a player reads their whole hand from, not buried on each
    // item's own sheet — but they're deliberately never Item documents (deriveEquipmentStats'
    // grantedCards / EssenceEquipmentData.equipmentCards are plain text), so they never touch
    // CARD_LIMIT/nonBasicCardCount in character-wizard.mjs, which only ever counts real
    // action-card/reaction-card Items — same "exclusion is automatic because it isn't a card Item"
    // shape as isBasicCard's Basic-card exclusion, just one layer earlier. Covers every owned
    // equipment Item regardless of Inventory/Temporary/Armory — unlike the passive Fortitude/
    // Resilience/Movement bonuses equipment-effects.mjs gates to Inventory only, a card here is
    // something the player actively chooses to spend a Use/roll on, not a background bonus that
    // needs "currently carried" to make sense; Armory gear's kit/augment cards should still be
    // usable, not hidden just because that item isn't this Adventure's prepared loadout.
    // summary mirrors cardSummary()'s own truncation, just off a flat effect string instead of a
    // Card's sectioned `body` — same "short line collapsed, full text on demand" shape a real
    // Combat Card gets from its own `summary` field above.
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
    return context;
  }

  /**
   * Prompts for how many dice to commit to a roll, bounded [min, max]. Used for Initiative
   * (0 = Pass, up to the base Tier+5 pool) and for spending Action/Reaction Dice on a card or
   * combat style check — the rules let a player commit anywhere from a card's minimum up to
   * whatever they have left in the pool, and *that* commitment is both the dice rolled and the
   * amount deducted from the pool (see condition text like "commit 4 or more dice to a single
   * Action"). Returns null if the dialog is dismissed without committing.
   */
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
   * V6 §5.2.2: a card's maximum ROLLED dice is Attribute + Style Rank, floored at 2 (so Rank 0 still
   * allows 2). No enforcement exists today — the dialog only caps at the Pool — and per this
   * project's standing "warn, never block" convention (see the Inventory-over-limit warning in
   * `_prepareContext`), this stays advisory text rather than a hard input cap. Returns "" when the
   * card has no attr/skill pairing to compute from (Equipment Cards, which are prose-only).
   */
  static #maxRolledDiceNote(actor, sys) {
    // design/v6-revision-delta.md §2.5: three cases, in priority order — (a) a card with a PRINTED
    // roll limit uses it verbatim instead of Attribute + Style Rank; (b) a Basic or Rank 0 card
    // floors its Attribute + Style Rank maximum at 2; (c) every other ranked card uses
    // Attribute + Style Rank with NO floor (the old code applied the floor-of-2 to every card,
    // which was only ever correct for Basic/Rank 0 under the revised text).
    if (typeof sys?.rollLimit === "number") {
      return `Advisory: this card's printed roll limit is ${sys.rollLimit} dice. Committing more is allowed but exceeds the printed maximum.`;
    }
    if (!sys?.attr || !sys?.skill) return "";
    const raw = (actor.system[sys.attr] ?? 0) + (actor.system[sys.skill] ?? 0);
    const isBasicOrRank0 = !sys.style || (Number(sys.rank) || 0) === 0;
    const maxRolled = isBasicOrRank0 ? Math.max(2, raw) : raw;
    return `Advisory: this card's normal maximum is ${maxRolled} dice (${capitalize(sys.attr)} + ${capitalize(sys.skill)} Rank${isBasicOrRank0 ? ", floored at 2 for a Basic/Rank 0 card" : ""}). Committing more is allowed but exceeds the printed maximum.`;
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

    const picked = await EssenceActorSheet.#promptAttrAndCooperation(`Roll ${capitalize(skill)}`);
    if (!picked) return;
    const pool = (this.actor.system[picked.attr] ?? 0) + (this.actor.system[skill] ?? 0);
    await rollEssencePool({ pool, freeDice: picked.freeDice, label: `${capitalize(picked.attr)} + ${capitalize(skill)}`, actor: this.actor, nonCombat: true });
  }

  /**
   * Shared attribute picker for every non-combat roll (open Attribute check, Non-Combat Skill,
   * Key Aspect). Also asks for Cooperation free dice (V6 §5.5, plan): each meaningfully-helping
   * character grants 1 free die to the lead roller's non-combat roll. No shared multi-actor-picker
   * component exists in this codebase yet (build-history's 0.6.81/0.6.100 both flagged this same
   * gap), so rather than inventing per-helper actor selection UI this asks the roller directly for
   * the total number of helpers/free dice to add — the GM/table still tracks who actually helped,
   * same "simplest dialog shape that satisfies the rule" call the Anima-distribution UI made.
   * @returns {Promise<{attr: string, freeDice: number}|null>}
   */
  static async #promptAttrAndCooperation(title) {
    return new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title },
        content: `<select name="attr">${ATTRIBUTES.map((a) => `<option value="${a}">${capitalize(a)}</option>`).join("")}</select>
          <label>Free dice from Cooperation (helpers)<input type="number" name="freeDice" value="0" min="0" step="1"></label>`,
        buttons: [{
          action: "roll",
          label: "Roll",
          default: true,
          callback: (event, button) => ({
            attr: button.form.elements.attr.value,
            freeDice: Math.max(0, parseInt(button.form.elements.freeDice.value, 10) || 0)
          })
        }],
        submit: (result) => resolve(result ?? null)
      }).render(true);
    });
  }

  /**
   * A Non-Combat Skill rolls exactly like a Combat Style's own open check (see #onRollSkill's
   * final branch above) — pick an Attribute to pair it with, then roll Attribute + the skill's own
   * rating as the dice pool. Unlike Combat Styles, Non-Combat Skills are freeform (name typed by
   * the player, not one of a fixed list), so this reads the row's current name/rating directly
   * from the actor rather than off a fixed `data-skill` key.
   */
  static async #onRollNonCombatSkill(event, target) {
    const i = Number(target.dataset.index);
    const entry = this.actor.system.nonCombatSkills[i];
    if (!entry?.name) return;

    const picked = await EssenceActorSheet.#promptAttrAndCooperation(`Roll ${entry.name}`);
    if (!picked) return;
    const pool = (this.actor.system[picked.attr] ?? 0) + (entry.rating ?? 0);
    await rollEssencePool({ pool, freeDice: picked.freeDice, label: `${capitalize(picked.attr)} + ${entry.name}`, actor: this.actor, nonCombat: true });
  }

  /**
   * V6 §5.5 (plan): a Key Aspect rolls relevant Attribute + 5, REPLACING (not stacking with) a
   * Non-Combat Skill Rank for the same check — the single largest non-combat buff in V6. Mirrors
   * #onRollNonCombatSkill's exact pattern, just with a flat +5 instead of a skill rating.
   */
  static async #onRollKeyAspect(event, target) {
    const i = Number(target.dataset.index);
    const value = this.actor.system.keyAspects[i];
    if (!value) return;

    const picked = await EssenceActorSheet.#promptAttrAndCooperation(`Roll Key Aspect: ${value}`);
    if (!picked) return;
    const pool = (this.actor.system[picked.attr] ?? 0) + 5;
    await rollEssencePool({ pool, freeDice: picked.freeDice, label: `${capitalize(picked.attr)} + 5 (${value})`, actor: this.actor, nonCombat: true });
  }

  /**
   * Perform Task (design/v6-revision-delta.md §3.3): "Burn 2 Action dice... If a roll is needed,
   * roll the full relevant Attribute + Non-Combat Skill, or Attribute + 5 for a directly applicable
   * Key Aspect... This task roll does not consume further Action dice or use a Combat Style
   * maximum... it generates no Surges. The two burned Action dice remain spent even if the attempt
   * fails or is interrupted." The 2 burned dice are a flat cost, never rolled themselves — the
   * actual roll pool comes entirely from the separate Attribute+Skill/Key-Aspect prompt below,
   * routed through the same non-combat roll path #onRollNonCombatSkill/#onRollKeyAspect use
   * (including Cooperation free dice and Surge suppression), NOT the Combat Card roll path, even
   * though this card is played from inside Combat.
   */
  static async #onPerformTask(actor, item) {
    const ps = actor.system.playState;
    const available = ps.actionDice ?? 0;
    const burnCost = 2;
    if (available < burnCost) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoPoolDiceRemaining", { label: "Action" }));
      return;
    }

    const keyAspectOptions = actor.system.keyAspects
      .map((v, i) => ({ kind: "keyAspect", index: i, label: `Key Aspect: ${v}` }))
      .filter((o) => actor.system.keyAspects[o.index]);
    const skillOptions = actor.system.nonCombatSkills
      .map((s, i) => ({ kind: "skill", index: i, label: `Skill: ${s.name} (Rank ${s.rating})` }))
      .filter((o) => actor.system.nonCombatSkills[o.index].name);
    const basisOptions = [...keyAspectOptions, ...skillOptions];
    if (!basisOptions.length) {
      ui.notifications.warn("No Non-Combat Skills or Key Aspects are set on this character to perform the task with.");
      return;
    }

    const picked = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: `Perform Task: ${item.name}` },
        content: `<p>Burns ${burnCost} Action dice (spent even on failure). If a roll is needed:</p>
          <select name="basis">${basisOptions.map((o, i) => `<option value="${i}">${o.label}</option>`).join("")}</select>
          <select name="attr">${ATTRIBUTES.map((a) => `<option value="${a}">${capitalize(a)}</option>`).join("")}</select>
          <label>Free dice from Cooperation (helpers)<input type="number" name="freeDice" value="0" min="0" step="1"></label>`,
        buttons: [{
          action: "roll",
          label: "Attempt",
          default: true,
          callback: (event, button) => ({
            basis: basisOptions[Number(button.form.elements.basis.value)],
            attr: button.form.elements.attr.value,
            freeDice: Math.max(0, parseInt(button.form.elements.freeDice.value, 10) || 0)
          })
        }],
        submit: (result) => resolve(result ?? null)
      }).render(true);
    });
    if (!picked) return;

    // The 2 burned Action dice are spent now, unconditionally — before the roll, so they remain
    // spent even on a failed/interrupted attempt per the card's own text.
    await actor.update({ "system.playState.actionDice": available - burnCost });

    const { basis, attr, freeDice } = picked;
    const pool = basis.kind === "keyAspect"
      ? (actor.system[attr] ?? 0) + 5
      : (actor.system[attr] ?? 0) + (actor.system.nonCombatSkills[basis.index]?.rating ?? 0);
    const label = basis.kind === "keyAspect"
      ? `Perform Task — ${capitalize(attr)} + 5 (${actor.system.keyAspects[basis.index]})`
      : `Perform Task — ${capitalize(attr)} + ${actor.system.nonCombatSkills[basis.index].name}`;
    await rollEssencePool({ pool, freeDice, label, actor, nonCombat: true });
    await EssenceActorSheet.#applyDyingExertion(actor);
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
    // Perform Task (design/v6-revision-delta.md §3.3): the first Basic Card whose own roll runs
    // through the NON-COMBAT path from inside Combat — burn 2 Action dice flat (not "commit up to
    // N and roll them"), then roll the full Attribute + Non-Combat Skill (or Attribute + 5 for a
    // Key Aspect) separately, consuming no further Action dice. Routed to its own handler entirely,
    // rather than threading a special case through every line below, since its cost/roll shape is
    // genuinely different (burned dice never become the rolled pool).
    if (sys.nonCombatTask) return EssenceActorSheet.#onPerformTask(this.actor, item);
    if (cardOnCooldown(item)) {
      ui.notifications.warn(`${item.name} is on cooldown (${sys.cooldownFrequency === "perEncounter" ? "once per Encounter" : "once per Round"}) and isn't available yet.`);
      return;
    }
    const isReaction = item.type === "reaction-card";
    const poolField = isReaction ? "reactionDice" : "actionDice";
    const poolLabel = isReaction ? "Reaction" : "Action";
    const available = this.actor.system.playState[poolField] ?? 0;
    // V6 §5.2.1: every Combat Card commitment has a hard floor of 2 dice — a card's own printed
    // minimum can only raise that floor, never lower it. (Initiative stays 0 via combat.mjs's own
    // dialog; a non-combat open Skill/Key Aspect roll stays 1 via #onRollSkill/rollEssencePool's own
    // floor — neither goes through this method.)
    const cardMin = Math.max(2, parseInt(sys.min, 10) || 1);

    if (available <= 0) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoPoolDiceRemaining", { label: poolLabel }));
      return;
    }
    if (cardMin > available) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardRequiresMoreDice", { name: item.name, min: cardMin, available, label: poolLabel }));
      return;
    }

    if (isReaction) EssenceActorSheet.#warnIfLikelySecondReaction(this.actor);

    // V6 §5.2.8: an unaware target no longer blocks a Reaction outright — it's now a cost (burn 1
    // additional Reaction die on top of whatever's committed to the roll itself). Action Cards have
    // no such concept, so the checkbox only appears for Reaction Cards.
    const promptResult = await EssenceActorSheet.#promptDiceCount({
      title: `Use ${item.name}`,
      label: `Commit how many ${poolLabel} Dice? (min ${cardMin}, max ${available})`,
      min: cardMin, max: available, initial: cardMin,
      note: EssenceActorSheet.#maxRolledDiceNote(this.actor, sys),
      extraCheckbox: isReaction ? { label: "Target is unaware (burn 1 additional Reaction die)" } : null
    });
    if (promptResult === null) return;
    const committed = isReaction ? promptResult.count : promptResult;
    const unawareTax = isReaction && promptResult.extra ? 1 : 0;

    const defenseKey = (sys.defense || "").toLowerCase();
    const { defense, targets } = await EssenceActorSheet.#resolveTargets(defenseKey);
    const poolSpend = Math.min(available, committed + unawareTax);
    const update = { [`system.playState.${poolField}`]: available - poolSpend };

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
    // V6 §6.8 (plan): a cooldown starts the moment the card is PLAYED (here — dice committed and
    // spent), even if the roll below fails or is interrupted, so this fires unconditionally before
    // rollEssencePool resolves.
    await applyCardCooldown(this.actor, item);
    const bonusSurges = hasMastery(sys, this.actor.system.expertises) ? 1 : 0;
    await rollEssencePool({ pool: committed, defense, targets, label: item.name, actor: this.actor, surgeOptions: sys.surges, bonusSurges, unopposed: !!sys.unopposed, nonCombat: !!sys.noSurges });
    // V6 "Acting While Dying" (design/v6-revision-delta.md §2.4): this Combat/Reaction Card is an
    // Action or Reaction, so it's eligible — see #applyDyingExertion for the once-per-Round gate.
    // Fires even if the roll above failed or was interrupted (the book: "a failed or interrupted
    // card still counts"), since this line runs unconditionally after rollEssencePool resolves.
    await EssenceActorSheet.#applyDyingExertion(this.actor);
  }

  /**
   * V6 §9.6 (plan): Equipment Cards resolve through the identical rules as Combat Cards — same
   * 2-die minimum, same Action Dice pool spend — so this no longer prompts for a free-typed "Dice"
   * count with no pool interaction (the v0.6.68 special-case this used to be). Equipment Cards are
   * still prose-only (no domain/defense/min schema, unlike a real action-card/reaction-card Item),
   * so the Domain — the one piece of information they don't carry structurally — is still asked for
   * up front; dice commitment then goes through the same #promptDiceCount flow and Action Dice pool
   * as #onRollItem. Uses (when the card tracks them) are spent first via the card's real source
   * Item, resolved from `itemId`/`cardIndex` set in the equipmentCards context loop — `cardIndex` is
   * null for a modular grantedCard's Uses (tracked as a top-level field on its own Item, per
   * deriveEquipmentStats), and set for a flat `equipmentCards` array entry (Uses live inside that
   * array, addressed by index).
   */
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

    const committed = await EssenceActorSheet.#promptDiceCount({
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
        // Used-vs-unused preparation commitment (design/v6-revision-delta.md §3.5) — rolling an
        // Equipment Card is a "meaningful use" of whichever equipment/chassis/fitting Item granted
        // it, so its Inventory/Armory allocation is now committed for the rest of the Adventure.
        // Augments never carry this flag (they're always 0 capacity — nothing to commit).
        if (["equipment", "chassis", "fitting"].includes(item.type) && !item.system.usedThisAdventure) {
          await item.update({ "system.usedThisAdventure": true });
        }
      }
    }

    await this.actor.update({ "system.playState.actionDice": available - committed });
    const domain = DOMAINS.find((d) => d.key === domainKey);
    const { defense, targets } = await EssenceActorSheet.#resolveTargets(domain.defense);
    await rollEssencePool({ pool: committed, defense, targets, label: name, actor: this.actor });
    // V6 "Acting While Dying" (design/v6-revision-delta.md §2.4) — see #onRollItem's identical hook
    // above and #applyDyingExertion for the once-per-Round gate.
    await EssenceActorSheet.#applyDyingExertion(this.actor);
  }

  /** Purely a display toggle — no actor data involved, so a plain DOM mutation is enough; no need
   *  to route this through an actor update just to re-show text that was already sent to the client
   *  in `effect`. */
  static #onToggleEquipmentCard(event, target) {
    const full = target.closest("li")?.querySelector(".card-summary-full");
    if (!full) return;
    full.hidden = !full.hidden;
    target.classList.toggle("expanded", !full.hidden);
  }

  /**
   * Soft "one response per chain" nudge (V6, plan §5.2.7 — was V5's "one Reaction per Action") — see
   * the schema comment on lastReactionRound/lastReactionCombatantId in actor-combatant.mjs for why
   * this is approximate. Fires before the dice-commit dialog opens rather than after, so the warning
   * is visible while the player still has the choice to cancel (the dialog can still be canceled
   * after seeing it).
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

  /** Natural recovery is order-free (V6) — this pip toggle lets a GM/owner clear (or set) any
   *  chosen Core Wound space directly, unlike #onRecoverWound's active-healing lowest-first rule. */
  static async #onToggleCoreWound(event, target) {
    const i = Number(target.dataset.index);
    const coreWounds = this.actor.system.coreWounds.map((w) => ({ ...w }));
    const wasFull = coreWounds.every((w) => w.filled);
    coreWounds[i].filled = !coreWounds[i].filled;
    const wasCleared = !coreWounds[i].filled;
    if (wasCleared) { coreWounds[i].domain = ""; coreWounds[i].severity = ""; coreWounds[i].condition = ""; }
    const nowFull = coreWounds.every((w) => w.filled);

    const update = {
      "system.coreWounds": coreWounds,
      "system.playState.currentCoreWounds": coreWounds.filter((w) => w.filled).length
    };
    // V6: a manual toggle-clear stops automatic Death Track advancement the same way #onRecoverWound's
    // active healing does; a manual toggle-fill that completes the 5th space activates it the same way
    // #onApplyDamage's own wasFull/nowFull check does — both share the deathTrackAfterWoundRemoval /
    // deathTrackAfterWoundFilled helpers rather than reimplementing the transition a third time.
    if (wasCleared) {
      const dtChange = deathTrackAfterWoundRemoval(this.actor.system.playState.deathTrackState, i);
      if (dtChange) {
        update["system.playState.deathTrackState"] = dtChange.state;
        if (dtChange.resetStep) update["system.playState.deathTrackStep"] = 0;
      }
    } else {
      const dtChange = deathTrackAfterWoundFilled(this.actor.system.playState.deathTrackState, wasFull, nowFull);
      if (dtChange) {
        update["system.playState.deathTrackState"] = dtChange.deathTrackState;
        if (dtChange.deathTrackStep !== undefined) update["system.playState.deathTrackStep"] = dtChange.deathTrackStep;
      }
    }

    await this.actor.update(update);
    // A manual toggle-fill has no Damage domain to attach a Wound Card from; a manual toggle-clear
    // still removes one if this space had one (e.g. the space was filled by #onApplyDamage earlier).
    if (wasCleared) await removeWoundCard(this.actor, i);
  }

  static async #onToggleDeathTrack(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceActorSheet.#onTogglePip(this.actor.system.playState.deathTrackStep, i);
    await this.actor.update({ "system.playState.deathTrackStep": next });
  }

  /** Manual GM control over the "stabilized" state (V6, part-iv-combat.md § The Death Track) —
   *  toggles between "dying" and "stabilized". The dedicated Stabilize Basic Action Card (burn 3
   *  Action dice) is a later-phase deliverable; this checkbox is the usable stand-in until it ships. */
  /**
   * V6 "Acting While Dying - Provisional Playtest" (design/v6-revision-delta.md §2.4): the first
   * Action or Reaction Card used each Combat Round while Dying advances the Death Track by 1 AFTER
   * it resolves, at most once per Round, even across stopping/re-starting Dying within that Round.
   * Called unconditionally after a card's roll resolves (success, failure, or interruption all
   * count) from #onRollItem and #onRollEquipmentCard — see deathTrackAfterCardWhileDying (utils.mjs)
   * for the actual once-per-Round gate this just applies. No-ops outside an active Combat, for a
   * non-Dying actor, or once this Round's advance has already fired.
   */
  static async #applyDyingExertion(actor) {
    const ps = actor.system.playState;
    const { advance, dyingExertionRound } = deathTrackAfterCardWhileDying(
      ps.deathTrackState, ps.dyingExertionRound ?? null, game.combat?.round ?? null
    );
    const update = {};
    if (dyingExertionRound !== (ps.dyingExertionRound ?? null)) {
      update["system.playState.dyingExertionRound"] = dyingExertionRound;
    }

    const max = actor.system.deathTrackMax ?? 5;
    const next = advance ? Math.min(max, (ps.deathTrackStep ?? 0) + 1) : null;
    if (advance) update["system.playState.deathTrackStep"] = next;

    if (Object.keys(update).length) await actor.update(update);
    if (!advance) return;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${actor.name}</strong> exerts themself while Dying — Death Track advances by 1.</p>`
    });
    if (next >= max) {
      ui.notifications.error(game.i18n.format("ESSENCE.Notify.EndOfDeathTrack", { name: actor.name }));
    }
  }

  static async #onToggleDeathTrackStabilized() {
    const current = this.actor.system.playState.deathTrackState;
    const next = current === "stabilized" ? "dying" : "stabilized";
    await this.actor.update({ "system.playState.deathTrackState": next });
  }

  /**
   * V6 Adaptability benefit (design/v6-revision-delta.md §2.2): a player-facing manual toggle for
   * "used my one Exploration reroll this Adventure" — a plain boolean per the book's explicit
   * non-accumulation rule, restored automatically by #onGrantRecovery. Mirrors
   * #onToggleDeathTrackStabilized's own checkbox-toggle shape.
   */
  static async #onToggleAdaptabilityReroll() {
    const current = this.actor.system.playState.adaptabilityRerollAvailable;
    await this.actor.update({ "system.playState.adaptabilityRerollAvailable": !current });
  }

  /**
   * V6 §6.2 (plan): a Resistance/Vulnerability is a short list of {damageType, source} entries —
   * granted by a Distinction Origin Benefit, a Manifestation profile, or equipment (part-viii/part-x
   * references). Added/removed via a small prompt rather than an inline array editor with per-field
   * `name=` attributes, deliberately avoiding this project's own documented ArrayField dotted-path
   * submission bug (build-history's "Recurring bug patterns" #1) — there's nothing here worth the
   * weight of a full read-modify-write change-listener editor for what's normally a 0-2 entry list.
   */
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
          <label>Source <input type="text" name="source" placeholder="e.g. Origin Benefit, Reinforced Armor" autofocus></label>
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
    await EssenceActorSheet.#onAddResistanceOrVulnerability.call(this, "resistances", "Add Resistance");
  }

  static async #onAddVulnerability() {
    await EssenceActorSheet.#onAddResistanceOrVulnerability.call(this, "vulnerabilities", "Add Vulnerability");
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

  /**
   * Applies incoming Damage per part-iv-combat.md: ordinary Damage accumulates against Resilience
   * between the starts of the character's own Turns (reset in EssenceCombat#_onStartTurn) and only
   * the portion beyond Resilience becomes Wounds; Breach Damage skips Resilience entirely and
   * converts straight to Wounds. Each Wound removes a Temporary Wound if one is available, else
   * fills the next Core Wound space in fixed severity order (Light, Light, Serious, Serious,
   * Critical), tagged with the Damage's domain. Once all 5 Core Wounds are full, further Wounds
   * advance the Death Track instead of creating new ones.
   */
  /**
   * V6 Mixed-Domain Damage (plan §6.11/§5.6, confirmed unchanged by design/v6-revision-delta.md
   * §2.8: "Current cards should normally deal one Damage domain at a time... the cycle
   * Spiritual -> Mental -> Physical -> repeat, skipping absent domains" is now a live rule, not
   * hedged design guidance). Kept deliberately small per the task's own scope: the single shared
   * Domain dropdown becomes three per-domain amount fields; Resistance/Vulnerability, Breach, and
   * Resilience math below are UNCHANGED and still operate on one combined total (this system has
   * always modeled Resilience/accumulated Damage as domain-agnostic — see the surrounding code's
   * own comments — Mixed-Domain Damage only changes which DOMAIN LABEL each resulting Wound gets,
   * not a second per-domain Resilience pool). A single shared Damage Type/Breach still applies to
   * the whole application, since per-domain Damage Types would be a second axis of complexity the
   * task explicitly says not to build here.
   */
  static async #onApplyDamage() {
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Apply Damage" },
        content: `
          <p class="muted">Mixed-Domain Damage: enter an amount for each domain involved. Resulting Wounds are assigned Spiritual -> Mental -> Physical -> repeat, skipping domains with 0.</p>
          <label>Spiritual Amount <input type="number" name="spiritual" value="0" min="0"></label>
          <label>Mental Amount <input type="number" name="mental" value="0" min="0"></label>
          <label>Physical Amount <input type="number" name="physical" value="1" min="0" autofocus></label>
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
          callback: (event, button) => {
            const domainAmounts = {
              Spiritual: Math.max(0, Math.floor(Number(button.form.elements.spiritual.value)) || 0),
              Mental: Math.max(0, Math.floor(Number(button.form.elements.mental.value)) || 0),
              Physical: Math.max(0, Math.floor(Number(button.form.elements.physical.value)) || 0)
            };
            return {
              domainAmounts,
              amount: domainAmounts.Spiritual + domainAmounts.Mental + domainAmounts.Physical,
              damageType: button.form.elements.damageType.value,
              breach: button.form.elements.breach.checked
            };
          }
        }],
        submit: (result) => resolve(result === "apply" ? null : result)
      }).render(true);
    });
    if (!result || result.amount <= 0) return;

    // Spiritual -> Mental -> Physical -> repeat, skipping absent domains — one queue entry per
    // point of Damage submitted, popped in order below to label each resulting filled Wound.
    const domainQueue = [];
    {
      const remaining = { ...result.domainAmounts };
      const cycle = ["Spiritual", "Mental", "Physical"];
      while (remaining.Spiritual > 0 || remaining.Mental > 0 || remaining.Physical > 0) {
        for (const d of cycle) {
          if (remaining[d] > 0) { domainQueue.push(d); remaining[d] -= 1; }
        }
      }
    }

    const sys = this.actor.system;
    const resilience = sys.effectiveResilience ?? sys.resilience ?? 0;
    const prevAccumulated = sys.playState.accumulatedDamage ?? 0;
    // Stored, not re-derived (0.6.85 fix, plan §5.6): the count of Wounds already extracted from
    // accumulatedDamage as of the LAST Apply Damage this Turn-interval. The pre-0.6.85 code instead
    // recomputed `prevWounds = prevAccumulated - resilience` using the CURRENT (possibly
    // just-changed) Resilience every time, so a mid-interval Resilience change silently rewrote how
    // much of the ALREADY-accumulated Damage counted as Wounds, retroactively creating or removing
    // Wounds that had already been resolved — V6 makes explicit that this must never happen.
    const prevWounds = sys.playState.accumulatedDamageWounds ?? 0;

    const log = [];
    // V6 §6.2 (plan; revised per design/v6-revision-delta.md §2.1): Resistance/Vulnerability apply
    // BEFORE Resilience or Breach, to both branches, and key off the named Damage Type — NOT the
    // Domain, which is a separate field used only for Wound Card labeling/coreWounds.domain below.
    const { amount: adjustedAmount, log: rvLog } = applyResistanceVulnerability(this.actor, result.damageType, result.amount);
    log.push(...rvLog);

    let wounds;
    let newAccumulated = prevAccumulated;
    let newWounds = prevWounds;
    if (result.breach) {
      // Breach bypasses Resilience, not Resistance/Vulnerability (0.6.85 fix, plan §5.6) — the
      // pre-0.6.85 code used `result.amount` directly here, skipping the adjustment above entirely.
      // Breach Damage also does not add to accumulated ordinary Damage (already correct — untouched).
      wounds = adjustedAmount;
    } else {
      newAccumulated = prevAccumulated + adjustedAmount;
      // Clamped to never fall BELOW what's already been converted: a mid-interval Resilience
      // *increase* can make (newAccumulated - resilience) smaller than prevWounds, and storing that
      // smaller figure would quietly "un-convert" Wounds that were already applied to the track —
      // they'd then be counted a second time by the next Apply Damage in the same interval. The
      // max() keeps the stored count monotonic within an interval, which is what makes "a Resilience
      // change never retroactively creates or removes Wounds" true in BOTH directions.
      newWounds = Math.max(prevWounds, Math.max(0, newAccumulated - resilience));
      wounds = newWounds - prevWounds;
    }

    const update = {
      "system.playState.accumulatedDamage": newAccumulated,
      "system.playState.accumulatedDamageWounds": newWounds
    };
    let becameCritical = false;
    const filledSlots = []; // V6 Wound Cards (see utils.mjs#attachWoundCard) — attached after the actor update below.

    if (wounds <= 0) {
      log.push(`Absorbed entirely by Resilience — no Wound.`);
    } else {
      let tempWounds = sys.playState.currentTemporaryWounds ?? 0;
      const coreWounds = sys.coreWounds.map((w) => ({ ...w }));
      const SEVERITY_BY_INDEX = ["Light", "Light", "Serious", "Serious", "Critical"];
      let deathTrackStep = sys.playState.deathTrackStep ?? 0;
      let deathTrackState = sys.playState.deathTrackState ?? "none";
      const wasFull = coreWounds.length > 0 && coreWounds.every((w) => w.filled);

      for (let i = 0; i < wounds; i++) {
        // Mixed-Domain Damage: consume the queue in submission order — the first N submitted
        // points of Damage are treated as the ones that became Wounds this call, N = this call's
        // delta. Simplification, not a per-domain Resilience split (see #onApplyDamage's own doc
        // comment): the domain-agnostic Resilience/accumulated-Damage math above is unchanged.
        const domain = domainQueue.shift() ?? "Physical";
        if (tempWounds > 0) {
          tempWounds -= 1;
          log.push(`1 ${domain} Wound absorbed by a Temporary Wound.`);
          continue;
        }
        const slot = coreWounds.findIndex((w) => !w.filled);
        if (slot === -1) {
          // V6: an extra Wound landing on an already-full track advances the Death Track — and, if
          // the character was Stabilized, breaks Stabilization back to Dying (see
          // actor-combatant.mjs's deathTrackState schema comment). Shares deathTrackAfterWoundFilled
          // with #onToggleCoreWound and applyManifestationDefeat rather than reimplementing this.
          // Ceiling is deathTrackMax (5, or 7 for Deathless — design/v6-revision-delta.md §2.3).
          deathTrackStep = Math.min(sys.deathTrackMax ?? 5, deathTrackStep + 1);
          const overflowChange = deathTrackAfterWoundFilled(deathTrackState, true, true);
          if (overflowChange) deathTrackState = overflowChange.deathTrackState;
          log.push("Core Wound track already full — Death Track advances instead.");
          continue;
        }
        const severity = SEVERITY_BY_INDEX[slot];
        const label = `${severity} ${domain} Wound`;
        coreWounds[slot] = { filled: true, domain, severity, condition: label };
        filledSlots.push({ slot, domain, severity });
        log.push(`Core Wound filled: <strong>${label}</strong>.`);
        if (slot === 4) becameCritical = true;
      }

      // V6: the Death Track activates the instant the 5th Core Wound space fills — at step 0,
      // without advancing it. The first automatic advance happens at the start of the character's
      // NEXT Turn (EssenceCombat#_onStartTurn), not immediately here.
      const nowFull = coreWounds.length > 0 && coreWounds.every((w) => w.filled);
      const fillChange = deathTrackAfterWoundFilled(deathTrackState, wasFull, nowFull);
      if (fillChange) {
        deathTrackState = fillChange.deathTrackState;
        if (fillChange.deathTrackStep !== undefined) deathTrackStep = fillChange.deathTrackStep;
      }

      update["system.playState.currentTemporaryWounds"] = tempWounds;
      update["system.coreWounds"] = coreWounds;
      update["system.playState.currentCoreWounds"] = coreWounds.filter((w) => w.filled).length;
      if (deathTrackStep !== (sys.playState.deathTrackStep ?? 0)) update["system.playState.deathTrackStep"] = deathTrackStep;
      if (deathTrackState !== (sys.playState.deathTrackState ?? "none")) update["system.playState.deathTrackState"] = deathTrackState;
    }

    await this.actor.update(update);

    // V6 Wound Cards: attach the matching Condition Item for each newly filled Core Wound space —
    // batched into one createEmbeddedDocuments call rather than one call per Wound (Finding 7).
    if (filledSlots.length) await attachWoundCards(this.actor, filledSlots);

    const domainSummary = Object.entries(result.domainAmounts).filter(([, n]) => n > 0).map(([d, n]) => `${n} ${d}`).join(" + ");
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> takes ${result.amount} Damage (${domainSummary}, ${result.damageType})${result.breach ? " (Breach)" : ""}.</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (becameCritical) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CriticallyWounded", { name: this.actor.name }));
    }
  }

  /**
   * Active healing clears the LOWEST-severity marked Wound first (V6, part-iv-combat.md §
   * Recovering Core Wounds — inverted from V5, which healed most-severe-first). Recovering removes
   * that Wound's Condition. Part VII (Downtime) doesn't yet specify recovery timing/treatment
   * procedures in canon, so this is a manual GM-triggered action representing "this Wound has now
   * been recovered," not an automatic timer. Natural recovery (no fixed order) is the separate
   * pip-toggle path — see #onToggleCoreWound, which lets a GM/owner clear any chosen space directly.
   */
  static async #onRecoverWound() {
    const coreWounds = this.actor.system.coreWounds.map((w) => ({ ...w }));
    let slot = -1;
    for (let i = 0; i < coreWounds.length; i++) {
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
    // V6: removing ANY Core Wound stops automatic Death Track advancement; removing the Critical
    // Wound specifically also resets the recorded step, while removing any other Wound preserves it.
    const dtChange = deathTrackAfterWoundRemoval(this.actor.system.playState.deathTrackState, slot);
    if (dtChange) {
      update["system.playState.deathTrackState"] = dtChange.state;
      if (dtChange.resetStep) update["system.playState.deathTrackStep"] = 0;
    }

    await this.actor.update(update);
    await removeWoundCard(this.actor, slot);
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
    const anima = this.actor.system.anima ?? 0;
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Grant Recovery" },
        content: `
          <p class="muted">Per Part III, Recovery follows what the situation provides — judge how much this one grants.
          Restores 25% of max Stamina/Focus/Mana (rounded up), plus up to ${anima} additional Resource points from
          your Anima benefit (distribute below — any that can't land at a full Resource are lost), reduces the
          Death Track by 1, clears Psionic Strain, removes 1 Manifestation Wound, and restores your one
          Adaptability Exploration reroll (does not stack with an unused one). It does not restore Temporary
          Wounds or Temporary Influence, clear Core Influence, reset Reach pressure, or refill Consumable Kits.
          One fictional opportunity = one Recovery — it cannot be subdivided into partial grants.</p>
          <label>Stamina / Focus / Mana Restored <input type="number" name="pct" value="25" min="0" max="100" autofocus> %</label>
          <p class="muted">Distribute up to ${anima} additional Anima points among Stamina/Focus/Mana:</p>
          <label>Stamina <input type="number" name="animaStamina" value="0" min="0" max="${anima}"></label>
          <label>Focus <input type="number" name="animaFocus" value="0" min="0" max="${anima}"></label>
          <label>Mana <input type="number" name="animaMana" value="0" min="0" max="${anima}"></label>
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" name="healWounds"> Recover Core Wounds
          </label>
          <label>Core Wounds to Recover <input type="number" name="woundCount" value="1" min="1" max="5"></label>
        `,
        buttons: [{
          action: "grant",
          label: "Grant Recovery",
          default: true,
          callback: (event, button) => {
            // V6 Anima benefit (design/v6-revision-delta.md §2.2): "restore additional Resource
            // points equal to Anima in total, distributed among those three Resources as you
            // choose." Clamped to the Anima total here (not per-field) so three maxed-out inputs
            // can't sum to more than the character's actual Anima score.
            const rawStamina = Math.max(0, Math.floor(Number(button.form.elements.animaStamina.value)) || 0);
            const rawFocus = Math.max(0, Math.floor(Number(button.form.elements.animaFocus.value)) || 0);
            const rawMana = Math.max(0, Math.floor(Number(button.form.elements.animaMana.value)) || 0);
            let remaining = anima;
            const clamp = (n) => { const v = Math.min(n, Math.max(0, remaining)); remaining -= v; return v; };
            return {
              pct: Math.min(100, Math.max(0, Math.floor(Number(button.form.elements.pct.value)) || 0)),
              animaStamina: clamp(rawStamina),
              animaFocus: clamp(rawFocus),
              animaMana: clamp(rawMana),
              healWounds: button.form.elements.healWounds.checked,
              woundCount: Math.max(1, Math.floor(Number(button.form.elements.woundCount.value)) || 1)
            };
          }
        }],
        submit: (result) => resolve(result === "grant" ? null : result)
      }).render(true);
    });
    if (!result) return;

    const sys = this.actor.system;
    const update = {};
    const resourceLog = [];
    const animaByKey = { stamina: result.animaStamina, focus: result.animaFocus, mana: result.animaMana };
    let animaLost = 0;

    for (const key of ["stamina", "focus", "mana"]) {
      const resource = sys.resources[key];
      // V6: "restore 25% of maximum, rounded up" — was Math.round, silently shorting a GM who left
      // the default 25% in place on any max not divisible by 4.
      const restored = Math.ceil(resource.max * (result.pct / 100));
      const afterPct = Math.min(resource.max, resource.value + restored);
      // V6 Anima benefit: extra points land AFTER the 25% restoration, clamped at this Resource's
      // max same as the 25% step — "allocate Anima's extra points only where capacity remains; any
      // points that cannot be restored are lost and cannot be saved for later," so overflow here is
      // simply dropped, never banked or redirected to another Resource.
      const requestedAnima = animaByKey[key] ?? 0;
      const next = Math.min(resource.max, afterPct + requestedAnima);
      animaLost += requestedAnima - (next - afterPct);
      const gained = next - resource.value;
      if (gained <= 0) continue;
      const field = `current${key.charAt(0).toUpperCase()}${key.slice(1)}`;
      update[`system.playState.${field}`] = next;
      resourceLog.push(`+${gained} ${key.charAt(0).toUpperCase()}${key.slice(1)}`);
    }

    const woundsRecovered = [];
    const woundSlotsRecovered = []; // V6 Wound Cards — removed after the actor update below.
    if (result.healWounds) {
      const coreWounds = sys.coreWounds.map((w) => ({ ...w }));
      let deathTrackState = sys.playState.deathTrackState;
      let deathTrackStep = sys.playState.deathTrackStep;
      for (let n = 0; n < result.woundCount; n++) {
        let slot = -1;
        for (let i = 0; i < coreWounds.length; i++) {
          if (coreWounds[i].filled) { slot = i; break; }
        }
        if (slot === -1) break;
        woundsRecovered.push(coreWounds[slot].condition);
        woundSlotsRecovered.push(slot);
        coreWounds[slot] = { filled: false, domain: "", severity: "", condition: "" };
        const dtChange = deathTrackAfterWoundRemoval(deathTrackState, slot);
        if (dtChange) {
          deathTrackState = dtChange.state;
          if (dtChange.resetStep) deathTrackStep = 0;
        }
      }
      if (deathTrackState !== sys.playState.deathTrackState) update["system.playState.deathTrackState"] = deathTrackState;
      if (deathTrackStep !== sys.playState.deathTrackStep) update["system.playState.deathTrackStep"] = deathTrackStep;
      update["system.coreWounds"] = coreWounds;
      update["system.playState.currentCoreWounds"] = coreWounds.filter((w) => w.filled).length;
    }

    // V6 additions (plan §5.4): clears Psionic Strain outright — no partial-clear reading in the
    // rules text, unlike the % resources above.
    const strainLog = [];
    const strain = sys.specialties?.strain ?? 0;
    if (strain > 0) {
      update["system.specialties.strain"] = 0;
      strainLog.push("Psionic Strain cleared");
    }

    // V6 Adaptability benefit (design/v6-revision-delta.md §2.2): "Completing a Recovery also
    // restores your one use of Adaptability's Exploration reroll." A plain boolean set back to
    // true — an already-available reroll simply stays true, so this never "stacks" a second use.
    const adaptabilityRestored = sys.playState.adaptabilityRerollAvailable === false;
    if (adaptabilityRestored) update["system.playState.adaptabilityRerollAvailable"] = true;

    if (!resourceLog.length && !woundsRecovered.length && !strainLog.length && !adaptabilityRestored) {
      ui.notifications.info(game.i18n.format("ESSENCE.Notify.NothingToRecover", { name: this.actor.name }));
      return;
    }

    await this.actor.update(update);
    // Batched into one deleteEmbeddedDocuments call (and one linear scan of actor.items) rather
    // than one scan-and-delete per recovered Wound (Finding 7).
    if (woundSlotsRecovered.length) await removeWoundCards(this.actor, woundSlotsRecovered);

    // Reduce the Death Track by 1 (non-Dying only, including a full-track Stabilized character) —
    // EssenceActor#reduceDeathTrack is the "ready extension point" the Phase 3 review-fix pass left
    // for this exact call site; it performs its own atomic update and no-ops if there's nothing to
    // reduce (state "dying", or step already 0), so it's safe to call unconditionally here.
    const deathTrackReduced = await this.actor.reduceDeathTrack();

    // Removes 1 Manifestation Wound from this character's currently-active Full Manifestation
    // profile actor, if any — see the report for why this stays a minimal single-slot decrement
    // rather than new Manifestation infrastructure (Calling/Summoner content is deprioritized,
    // plan §9.4).
    const manifestationWoundRecovered = await EssenceActorSheet.#reduceOneManifestationWound(this.actor);

    const parts = [];
    if (resourceLog.length) parts.push(resourceLog.join(", "));
    if (animaLost > 0) parts.push(`${animaLost} Anima point${animaLost === 1 ? "" : "s"} could not be restored (no capacity remaining) and are lost`);
    if (woundsRecovered.length) parts.push(`recovers from ${woundsRecovered.join(", ")}`);
    if (strainLog.length) parts.push(strainLog.join(", "));
    if (deathTrackReduced) parts.push("Death Track reduced by 1");
    if (manifestationWoundRecovered) parts.push("1 Manifestation Wound removed");
    if (adaptabilityRestored) parts.push("Adaptability Exploration reroll restored");

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> secures a Recovery: ${parts.join("; ")}.</p>`
    });
  }

  /**
   * Minimal single-slot decrement for V6's "Recovery removes 1 Manifestation Wound" (plan §5.4).
   * Manifestation Wounds live on the character's own persistent per-subtype profile Actor (see
   * module/apps/manifestation.mjs), not on the character itself, so this only touches the currently
   * ACTIVE manifestation's coreWounds (the same "any length just works" array Apply Damage already
   * indexes by slot position) — clearing the first filled slot it finds, same convention as this
   * method's own Core Wound loop above. Deliberately does not attempt to pick a "most severe" slot,
   * walk every recorded manifestation regardless of active state, or build any new Manifestation
   * bookkeeping — Calling/Summoner content is explicitly deprioritized (plan §9.4/§6.10), and this
   * is scoped to the smallest change that satisfies the V6 rule text.
   */
  static async #reduceOneManifestationWound(actor) {
    const subtype = actor.system.specialties?.activeManifestation;
    if (!subtype) return false;
    const record = actor.system.specialties.manifestationRecords.find((r) => r.subtype === subtype);
    if (!record?.actorId) return false;
    const manifestation = game.actors.get(record.actorId);
    if (!manifestation) return false;
    const coreWounds = manifestation.system.coreWounds.map((w) => ({ ...w }));
    const slot = coreWounds.findIndex((w) => w.filled);
    if (slot === -1) return false;
    coreWounds[slot] = { filled: false, domain: "", severity: "", condition: "" };
    await manifestation.update({ "system.coreWounds": coreWounds });
    return true;
  }

  static async #onToggleTempInfluence(event, target) {
    const i = Number(target.dataset.index);
    const next = EssenceActorSheet.#onTogglePip(this.actor.system.playState.currentTemporaryInfluence, i);
    await this.actor.update({ "system.playState.currentTemporaryInfluence": next });
  }

  /** Natural Influence recovery is order-free, same as Core Wounds' manual pip toggle — this lets a
   *  GM/owner clear (or set) any chosen Core Influence space directly. Severity is always derivable
   *  from the slot index alone (SEVERITY_BY_INDEX), so unlike a Wound Card (whose Damage domain is
   *  only known when Apply Damage is actually rolled), a manual fill here can still attach the
   *  right Influence Consequence Card — see attachConsequenceCard/removeConsequenceCard. */
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

  /**
   * V6's 3-layer ordinary-pressure resolution (part-v-social-encounters.md § Reach, plan §5.3.1):
   * ordinary Influence pressure is absorbed by remaining Reach capacity first (effectiveReach minus
   * whatever pressure is already recorded against it — see actor-combatant.mjs's `reachPressure`
   * field), THEN Temporary Influence, THEN Core Influence. Reach itself never decreases — only the
   * separate reachPressure accumulator advances, per V6's explicit "Record the accumulated pressure
   * instead." Shared by every ordinary-pressure spend on this sheet (#onApplyInfluenceInjury,
   * #onContributeToGoal, #onPayInventorySupport) the same way #computeInfluenceOverextension below
   * is shared by every Breach-type spend (which skips this Reach layer entirely). Returns the
   * updated values, a chat-log array, a critical flag, and `filledSlots` (the Core Influence spaces
   * newly filled this call) so a caller can attach the matching Influence Consequence Card(s).
   */
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

  /**
   * Applies Influence harm per part-v-social-encounters.md § Influence, now V6's 3-layer sequence
   * (plan §5.3.1) instead of V5's 2-layer Temp→Core spend: **Ordinary pressure** is absorbed by
   * Reach first, then Temporary Influence, then Core Influence (#computeOrdinaryPressure);
   * **Influence Breach** skips Reach entirely and goes straight to Temporary Influence, then Core
   * Influence (#computeInfluenceOverextension). The dialog's old "Voluntary (skip Temporary
   * Influence)" checkbox was a V5-shaped concept — replaced with a Pressure Type selector, since
   * that's the actual V6 branch point now (whether Reach absorbs first), not whether Temporary
   * Influence gets skipped (both types still spend Temporary Influence before Core Influence).
   */
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
      ? EssenceActorSheet.#computeInfluenceOverextension(this.actor, result.amount)
      : EssenceActorSheet.#computeOrdinaryPressure(this.actor, result.amount);

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

  /**
   * V6 deleted § Collaborative Influence Pooling outright: "Essence does not use a pooled Team
   * Influence track... characters do not add their Reach together" (plan §5.3.4). This method's own
   * doc comment already argued for a per-character, non-pooled model before V6 existed — the
   * BEHAVIOUR survives intact, so the only real change here is routing the spend through the new
   * 3-layer ordinary-pressure sequence (#computeOrdinaryPressure) instead of a bespoke inline
   * Temp→Core loop, plus dropping every "Pooling"/"Collaborative" citation from this comment. Each
   * contributing character still gives "proportional to their Character Tier" — no universal fixed
   * cost, no single pooled total the system tracks. A contribution beyond what Reach/Temporary
   * Influence can absorb takes a Core Influence Injury the same way any other overextension does.
   * Deliberately actor-scoped rather than a cross-actor "pooling" window, per the same reasoning V6
   * later codified: a per-character contribution button posting to shared chat is a more faithful
   * fit than inventing new multi-actor UI.
   */
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

    const overextension = EssenceActorSheet.#computeOrdinaryPressure(this.actor, result.amount);

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

  /** Core Influence recovers in reverse order — same convention as #onRecoverWound — and is a
   *  manual GM-triggered action, since V6 does not use a universal day/week/month recovery
   *  schedule (Essence has no fixed recovery timer for Influence Injuries of any severity; each
   *  Influence Consequence Card states its own repair requirement instead — see attachConsequenceCard). */
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

  /**
   * part-viii-equipment-and-items.md § Bringing More Than Your Inventory Limit: excess capacity
   * pays ordinary Influence pressure (V6, plan §5.3.5) instead of V5's flat "spend 1 Temporary
   * Influence," so this now routes through #computeOrdinaryPressure — Reach absorbs first — rather
   * than incrementing Temporary Influence directly. The old `current >= max` guard is gone with it:
   * Temporary Influence has no universal cap in V6 (see actor-combatant.mjs), and overflow past
   * whatever capacity IS available now correctly spills into Core Influence like any other
   * overextension, instead of just refusing. A manual, trust-based action either way — like every
   * other Apply/Spend button on this sheet — rather than a hard block on assigning equipment past
   * the limit; the sheet shows the overage (see inventoryOverLimit in _prepareContext) but doesn't
   * prevent it, matching the rules' own framing of Inventory Limit as "a normal operating limit,
   * not an absolute prohibition." V6 also allows "another character can pay the support cost" using
   * their own Reach/Influence, while the capacity itself still belongs to this actor — modeled here
   * as a simple optional payer dropdown on the dialog (judgment call: no existing multi-actor-picker
   * UI pattern exists anywhere in this codebase to extend, so this is the simplest reasonable
   * version rather than new drag/target infrastructure — see build-history for the full note).
   */
  static async #onPayInventorySupport() {
    const others = game.actors.filter((a) => a.id !== this.actor.id && a.isOwner && ["character", "npc", "monster"].includes(a.type));
    const result = await new Promise((resolve) => {
      new foundry.applications.api.DialogV2({
        window: { title: "Pay Inventory Support Cost" },
        content: `
          <p class="muted">Pays 1 ordinary Influence pressure (Reach absorbs first) to prepare an additional Inventory slot beyond ${this.actor.name}'s normal limit.</p>
          <label>Paid By
            <select name="payerId">
              <option value="">${this.actor.name} (self)</option>
              ${others.map((a) => `<option value="${a.id}">${a.name}</option>`).join("")}
            </select>
          </label>
        `,
        buttons: [{
          action: "pay",
          label: "Pay",
          default: true,
          callback: (event, button) => ({ payerId: button.form.elements.payerId.value })
        }],
        submit: (result) => resolve(result === "pay" ? null : result)
      }).render(true);
    });
    if (!result) return;

    const payer = (result.payerId && game.actors.get(result.payerId)) || this.actor;
    const overextension = EssenceActorSheet.#computeOrdinaryPressure(payer, 1);

    await payer.update({
      "system.reachPressure": overextension.reachPressure,
      "system.playState.currentTemporaryInfluence": overextension.tempInfluence,
      "system.coreInfluence": overextension.coreInfluence
    });
    if (overextension.filledSlots.length) await attachConsequenceCards(payer, overextension.filledSlots);

    const byOther = payer.id !== this.actor.id;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> prepares an additional Inventory slot beyond their normal limit${byOther ? `, its support cost paid by <strong>${payer.name}</strong>` : ""}.</p><ul>${overextension.log.map((l) => `<li>${l}</li>`).join("")}</ul>`
    });

    if (overextension.becameCritical) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CriticalInfluenceInjury", { name: payer.name }));
    }
  }

  /**
   * Shared Temp→Core Influence overextension spend, used by every Breach-type spend (Influence
   * Breach proper, and a Reach Trigger's Breach cost past its first free use) — this layer
   * deliberately SKIPS Reach per V6's "Influence Breach... skips Reach" (plan §5.3.1), unlike
   * #computeOrdinaryPressure above. Returns the updated values plus a chat-log array, a critical
   * flag, and `filledSlots` so a caller can attach the matching Influence Consequence Card(s), same
   * shape as #computeOrdinaryPressure.
   */
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
      log.push(`Grants ${trigger.tempInfluenceGrant} Temporary Influence usable only this Encounter (capped at normal max).`);
    }

    let becameCritical = false;
    let filledSlots = [];
    if (!wasFree) {
      const overextension = EssenceActorSheet.#computeInfluenceOverextension(
        { system: { playState: { currentTemporaryInfluence: tempInfluence }, coreInfluence } },
        1
      );
      tempInfluence = overextension.tempInfluence;
      coreInfluence = overextension.coreInfluence;
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

  /** Ends the Encounter for one active Reach Trigger — clears its temporary Reach boost. Manual, like
   *  everything else in this system's lifecycle tracking; there's no automated Encounter boundary. */
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
      content: `<p><strong>${this.actor.name}</strong> resets Reach pressure, Reach Triggers, Augment Uses, and Equipment Card Uses for a new Adventure.</p>`
    });
  }

  /**
   * V6 §6.8 (plan): the explicit GM "New Encounter" action — see resetEncounterCooldowns() in
   * utils.mjs. Deliberately separate from #onResetAdventureUses and from any Combat-start hook:
   * starting a new Combat inside the same Encounter must NOT reset once-per-Encounter cards, only
   * this manual action does, matching this project's standing manual-lifecycle convention.
   */
  static async #onNewEncounter() {
    await resetEncounterCooldowns(this.actor);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> begins a new Encounter — once-per-Encounter Combat/Reaction Cards are available again.</p>`
    });
  }

  /**
   * V6 Presence benefit (design/v6-revision-delta.md §3.4): "Once during preparation for each
   * Adventure, gain Temporary Influence equal to your Presence." One-shot per Adventure — the
   * button only renders while `presenceGrantActive` is true (see character-sheet.hbs), and this
   * flips it false so the grant can't be taken twice for the same Adventure. Availability resets
   * only via resetAdventureUses() at the explicit "new Adventure" boundary.
   */
  static async #onTakePresenceGrant() {
    const amount = this.actor.system.presence ?? 0;
    await this.actor.update({
      "system.playState.presenceGrantRemaining": amount,
      "system.playState.presenceGrantActive": false
    });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> gains ${amount} Temporary Influence from Presence (Adventure preparation). Tracked separately; unspent when this Adventure ends is lost.</p>`
    });
  }

  /** Manual spend-down for the Presence grant bucket — this system tracks Influence spend by hand
   *  throughout (Temporary Influence's own pip toggles included), so a +/- stepper matches the
   *  established convention rather than wiring an automated spend-priority order (see design/
   *  v6-revision-delta.md §2.7's own recommendation against rebuilding that model here). */
  static async #onAdjustPresenceGrant(event, target) {
    const delta = Number(target.dataset.delta);
    const current = this.actor.system.playState.presenceGrantRemaining ?? 0;
    const next = Math.max(0, current + delta);
    await this.actor.update({ "system.playState.presenceGrantRemaining": next });
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

  /** Adds a new Expertise slot nested under a specific Combat Style's box. */
  /**
   * V6 (design/v6-revision-delta.md's own framing; book: "Your Expertise limit for a Style equals
   * its Rank, increased by 1 if you possess the associated Distinction") — same per-Style cap
   * character-wizard.mjs's #onToggleExpertise enforces at creation, checked here too since the
   * rule is standing ("Expertise limits still apply" even after Skill Tree advancement, per the
   * book's own Skill Tree section), not creation-only. This method previously had NO cap at all —
   * a real, previously-unenforced gap found while building this, not a "partially built" rule.
   */
  static async #onAddExpertise(event, target) {
    const skill = target.dataset.skill;
    const expertises = this.actor.system.expertises.map((e) => ({ name: e.name, skill: e.skill }));
    const distinctionItem = this.actor.items.find((i) => i.type === "distinction");
    const rank = this.actor.system[skill] ?? 0;
    const bonus = distinctionItem?.system.keyCombatSkill === skill ? 1 : 0;
    const styleLimit = rank + bonus;
    const styleChosen = expertises.filter((e) => e.skill === skill).length;
    if (styleChosen >= styleLimit) {
      ui.notifications.warn(`${capitalize(skill)}'s Expertise limit is ${styleLimit} (its Rank${bonus ? ", +1 for your Distinction" : ""}).`);
      return;
    }
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
   * Inventory Equipment table (and the action column on Temporary/Armory) served no purpose
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
   * Moves an equipment Item between the Inventory/Temporary/Armory tables — same underlying change
   * as dragging its row into a different `[data-drop-slot]` zone (`_onDropItem` above), added as an
   * explicit button per row because native HTML5 drag-and-drop between three separately-scrolling
   * tables is fragile to actually land (confirmed live: a real mouse drag between zones didn't
   * register). No Inventory-capacity block here, matching drag-and-drop's own behavior — the
   * sheet's existing "over Inventory limit" note and Spend-Influence button already handle that
   * reactively once the move lands, rather than refusing the move up front.
   */
  static async #onMoveEquipmentSlot(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    const slot = target.dataset.slot;
    if (!item || !["inventory", "temporary", "armory"].includes(slot)) return;
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
    if (!["inventory", "temporary", "armory"].includes(slot)) return;
    const [created] = await this.actor.createEmbeddedDocuments("Item", [{
      name: game.i18n.localize("ESSENCE.Sheet.NewEquipmentName"),
      type: "equipment",
      img: "icons/svg/item-bag.svg",
      system: { slot }
    }]);
    created?.sheet.render(true);
  }

  /**
   * V6 Reconfigure, widened (design/v6-revision-delta.md §3.1, superseding plan §4.9's
   * swap/exchange-only reading): "Choose one: ready, stow, recover, or hand over one complete
   * physically accessible combat-ready item; swap one such item you are using for another; or
   * exchange one installed Augment or one combat-replaceable Fitting for a compatible replacement."
   * This handler covers the first two choices (ready/stow/recover/hand-over and swap-a-complete-
   * item) for a complete `equipment` Item; exchanging an installed Augment or Fitting is still the
   * modular-assembly item sheet's own job (#onSwapAugmentCost/#onReconfigureFittingCost,
   * item-sheet.mjs) since that data (chassisItemId/fittingItemId/mounts) lives on the equipment
   * Item itself, not here — see that file's own doc comment for why modular assembly stays there
   * rather than being duplicated onto this sheet.
   *
   * This system has no "held in hand" vs "stowed" state to actually transition (no prior session
   * ever modeled one, and the V6 text itself says ready/stow/recover/hand-over "without changing
   * their Inventory accounting" — Inventory/Temporary/Armory slot bookkeeping is unaffected either
   * way). So, consistent with this project's trust-based, all-manual convention (Apply Damage, Burn
   * Dice, the Combat Style Specialty trackers), this is a costed chat-log action: burn 3 Action
   * dice, post what happened, and let the table track the fictional detail themselves — matching
   * the plan's own "if you have the Components, access, and time... you do it" reading of
   * Reconfigure elsewhere. Hand Over asks for a recipient using the same plain actor-picker pattern
   * #onPayInventorySupport already established (no shared multi-actor-picker component exists yet
   * in this codebase — see that method's own judgment-call note; this is now a SECOND call site for
   * the same shape of picker, strengthening the case for eventually building one).
   */
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

  /**
   * V6 Equipment in Combat — "Simply releasing a held item during your own Turn requires no
   * Action: it falls where released." A DISTINCT, zero-cost action from Reconfigure above (which
   * always burns 3 dice) — no prior "drop"/"unequip" control existed for equipment (only
   * itemDelete, which destroys the Item entirely, a completely different and destructive
   * operation), so this is genuinely new. No dialog needed; matches #onPostEquipmentToChat's own
   * single-click log-and-done shape.
   */
  static async #onReleaseItem(event, target) {
    const item = this.actor.items.get(target.dataset.itemId);
    if (!item) return;
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this.actor }),
      content: `<p><strong>${this.actor.name}</strong> releases <strong>${item.name}</strong> — it falls where released. No Action required.</p>`
    });
  }

  /**
   * Manual mark/unmark for `usedThisAdventure` (design/v6-revision-delta.md §3.5) — covers every
   * "meaningful use" the code has no hook for (worn and hit in combat, used as a Card's Source,
   * rolled as part of a Combat/Reaction Card, ...), since #onRollEquipmentCard only ever sees
   * Equipment Card rolls. A plain toggle, not a one-way flag, so a GM/player can correct a mistaken
   * mark — the rule itself has no code-enforced consequence either way (see the field's own doc
   * comment), so nothing is lost by allowing it to be reversed.
   */
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
      "system.slot": "inventory",
      "system.reachExceptionSource": sourceName,
      "system.reachExceptionMargin": grant.reachMargin,
      "system.slotCost": grant.countsAgainstLimit ? 1 : 0
    });
  }
}
