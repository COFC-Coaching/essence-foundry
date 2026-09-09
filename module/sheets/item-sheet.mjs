import { deriveEquipmentStats } from "../data/equipment-features.mjs";
import { SUBTYPE_DATABASE } from "../data/expertise-database.mjs";
import { CHASSIS_LABELS, FITTING_LABELS } from "../data/item-component.mjs";
import { EQUIPMENT_CATEGORY_LABELS } from "../data/item-card.mjs";

/** Categories eligible for modular assembly (matches CHASSIS_LABELS/FITTING_LABELS's own keys). */
const MODULAR_EQUIPMENT_CATEGORIES = ["weapon", "armor", "shield", "implement"];

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * The 9 Combat Skills, in the same fixed order used throughout the sheets (actor-sheet.mjs's
 * DOMAINS constant groups them by domain; this flat list is just for a plain <select>).
 * Capitalized ("Magecraft", not "magecraft") to match how `system.skill` is actually stored on
 * every existing Action/Reaction Card (confirmed against live compendium data) — SUBTYPE_DATABASE
 * and EXPERTISE_DATABASE's own keys are lowercase, so any lookup into either always needs
 * `.toLowerCase()` first; see subtypesForSkill() below rather than indexing SUBTYPE_DATABASE directly.
 */
const COMBAT_SKILLS = ["Prowess", "Ballistics", "Gestalt", "Cunning", "Magecraft", "Psionics", "Leadership", "Ritualism", "Calling"];

/** SUBTYPE_DATABASE's keys are lowercase; `skillName` as actually stored on a card is capitalized
 *  ("Magecraft") — normalize here so every lookup site doesn't have to remember to. */
function subtypesForSkill(skillName) {
  return SUBTYPE_DATABASE[(skillName || "").toLowerCase()] ?? [];
}

const ARRAY_ROW_DEFAULTS = {
  adaptations: { name: "", text: "", chosen: false },
  body: { label: "", html: "" },
  surges: { n: "1", html: "" },
  sections: { label: "", html: "" }
};

class EssenceItemSheetBase extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "item"],
    position: { width: 480, height: 600 },
    form: { submitOnChange: true },
    actions: {
      addArrayRow: EssenceItemSheetBase.#onAddArrayRow,
      deleteArrayRow: EssenceItemSheetBase.#onDeleteArrayRow,
      toggleCardView: EssenceItemSheetBase.#onToggleView
    }
  };

  /**
   * Read-first "card" display mode. Originally EssenceCardSheet-only; pulled up here so Condition/
   * Equipment/Component(Chassis+Fitting)/Augment sheets all get the same read/edit toggle for free
   * instead of re-implementing #viewMode/toggleCardView/_toggleDisabled/renderAsView five more
   * times. This is a plain instance field, not a true `#private` one — private class fields aren't
   * inherited across a hierarchy in JS, and every subclass needs to read/flip the SAME state via
   * the single copy of #onToggleView/renderAsView/_toggleDisabled defined once here. Not persisted
   * document data — Foundry caches one sheet instance per document, so toggling to edit mode
   * sticks for the rest of the session but resets for a fresh client.
   */
  _viewMode = true;

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.item = this.item;
    context.system = this.item.system;
    context.viewMode = this._viewMode;
    return context;
  }

  /**
   * Mirrors EssenceActorSheet#applyEditable — lock the sheet down for anyone without edit
   * permission. Scoped to .window-content only: this.element is the whole ApplicationV2 window,
   * and its .window-header carries Foundry's own chrome (Close, Copy UUID, etc.), which also use
   * data-action — querying the full element previously locked those out too, so a read-only
   * (e.g. compendium) sheet couldn't even be closed.
   */
  _onRender(context, options) {
    super._onRender(context, options);
    if (this.isEditable) return;
    const body = this.element.querySelector(".window-content") ?? this.element;
    for (const el of body.querySelectorAll("input, select, textarea, prose-mirror")) el.disabled = true;
    // toggleCardView only flips local read/edit display state — it doesn't write to the
    // document, so a locked compendium (or any non-editable) card must still be viewable.
    for (const el of body.querySelectorAll('button[data-action]:not([data-action="toggleCardView"]), a[data-action]')) {
      el.classList.add("locked");
      el.style.pointerEvents = "none";
    }
  }

  /**
   * Core's own DocumentSheetV2#_onRender disables every form-associated element (including plain
   * <button>s, via `form.elements`) whenever `!isEditable` — e.g. a locked system compendium,
   * which every one of these Item types lives in by default. That's the right call for anything
   * that writes to the document, but toggleCardView only flips local display state, so a GM must
   * still be able to view an Item they can't edit.
   */
  _toggleDisabled(disabled) {
    super._toggleDisabled(disabled);
    const toggle = this.element.querySelector('[data-action="toggleCardView"]');
    if (toggle) toggle.disabled = false;
  }

  static #onToggleView() {
    this._viewMode = !this._viewMode;
    this.render();
  }

  /** Used by callers that want to force the read view open even if this session had previously
   *  left the sheet toggled onto the edit form (_viewMode otherwise persists per sheet instance
   *  for the rest of the session, per the field's own comment above). */
  renderAsView(options) {
    this._viewMode = true;
    return this.render({ force: true, ...options });
  }

  static async #onAddArrayRow(event, target) {
    const key = target.dataset.array;
    const rows = this.item.system[key].map((row) => foundry.utils.deepClone(row));
    rows.push(foundry.utils.deepClone(ARRAY_ROW_DEFAULTS[key]));
    await this.item.update({ [`system.${key}`]: rows });
  }

  static async #onDeleteArrayRow(event, target) {
    const key = target.dataset.array;
    const i = Number(target.dataset.index);
    const rows = this.item.system[key].map((row) => foundry.utils.deepClone(row));
    rows.splice(i, 1);
    await this.item.update({ [`system.${key}`]: rows });
  }
}

/**
 * Cards are opened to be read far more often than they're edited — a player or GM checking a
 * card's text mid-turn shouldn't land on a form of bare inputs. Defaults to a read-only "card"
 * view (stat chips, labeled body lines, amber Surge badges reusing the chat roll-card's own
 * styling, a bordered Rider callout) with a toggle into the existing edit form. The read/edit
 * toggle mechanism itself (_viewMode field, toggleCardView action, _toggleDisabled override,
 * renderAsView()) lives on EssenceItemSheetBase now — shared by every Item sheet in this file.
 */
export class EssenceCardSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/card-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.skillOptions = COMBAT_SKILLS.map((key) => ({ key, label: key }));
    // Action Subtypes are nested under the card's own Combat Skill (each skill has its own fixed
    // set — see expertise-database.mjs's SUBTYPE_DATABASE) rather than being free text — a Basic/
    // Universal card (no skill set) has no subtype list to offer. If the stored subtype isn't in
    // the current skill's list (stale data, or the skill was just changed), it's still included so
    // the field never silently shows something other than what's actually saved.
    const validSubtypes = subtypesForSkill(context.system.skill);
    context.subtypeOptions = context.system.subtype && !validSubtypes.includes(context.system.subtype)
      ? [context.system.subtype, ...validSubtypes]
      : validSubtypes;
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#wireSkillSelect();
  }

  /**
   * The Skill <select> has no `name` attribute — deliberately outside the form's normal
   * submitOnChange, same reasoning as EssenceEquipmentSheet#wireModularSelects — because changing
   * Skill can invalidate the currently stored Subtype (each skill has its own fixed set of 7, see
   * SUBTYPE_DATABASE) and both fields need to land in a single atomic update. Letting the form
   * submit the Skill change on its own first would briefly save an (old skill, old-now-invalid
   * subtype) pair, and Subtype's own re-rendered options wouldn't even include that stale value.
   */
  #wireSkillSelect() {
    const select = this.element.querySelector(".skill-select");
    select?.addEventListener("change", async (event) => {
      const skill = event.currentTarget.value;
      const validSubtypes = subtypesForSkill(skill);
      const update = { "system.skill": skill };
      if (!validSubtypes.includes(this.item.system.subtype)) update["system.subtype"] = "";
      await this.item.update(update);
    });
  }

}

/**
 * Conditions read as a printed reference card far more often than they're edited — the rules'
 * own card-anatomy convention boxes/shades the first Section (see condition-sheet.hbs's
 * card-view-section-primary). Read/edit toggle is inherited from EssenceItemSheetBase.
 */
export class EssenceConditionSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/condition-sheet.hbs" }
  };
}

/**
 * Modular assembly (assigning a Chassis/Fitting, installing an Augment into a Mount, toggling a
 * Linked Mount) lives on the equipment Item's OWN sheet rather than duplicated into both
 * actor-sheet.mjs and npc-sheet.mjs — it's fundamentally a property of this Item, and both actor
 * sheets already reach it via the existing "itemEdit" action, so there's nothing sheet-specific
 * to duplicate. This deliberately avoids adding a third copy to the documented actor-sheet/
 * npc-sheet duplication debt (see build-history's Known gaps #2).
 */
export class EssenceEquipmentSheet extends EssenceItemSheetBase {
  static DEFAULT_OPTIONS = {
    actions: {
      toggleMountLink: EssenceEquipmentSheet.#onToggleMountLink,
      swapAugmentCost: EssenceEquipmentSheet.#onSwapAugmentCost,
      reconfigureFittingCost: EssenceEquipmentSheet.#onReconfigureFittingCost,
      addEquipmentCard: EssenceEquipmentSheet.#onAddEquipmentCard,
      deleteEquipmentCard: EssenceEquipmentSheet.#onDeleteEquipmentCard
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/item/equipment-sheet.hbs" }
  };

  _onRender(context, options) {
    super._onRender(context, options);
    this.#wireModularSelects();
    this.#wireEquipmentCardFields();
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.item.actor;
    context.chassisOptions = actor ? actor.items.filter((i) => i.type === "chassis") : [];
    context.fittingOptions = actor ? actor.items.filter((i) => i.type === "fitting") : [];
    context.augmentOptions = actor ? actor.items.filter((i) => i.type === "augment") : [];
    context.stats = actor ? deriveEquipmentStats(actor, this.item) : null;
    // See EssenceComponentSheet's own comment on CHASSIS_LABELS/FITTING_LABELS — once a Chassis/
    // Fitting is assigned, ITS category is the authority on which in-fiction term to show (a
    // weapon's Chassis could be melee "weapon" or "ranged", which this equipment Item's own
    // broader weapon/armor/tool/gear category can't distinguish). Before one's assigned, fall back
    // to the generic word. Read independently rather than always from the Chassis, since a Fitting
    // can be assigned on its own before a Chassis is.
    context.chassisLabel = context.stats?.chassis ? CHASSIS_LABELS[context.stats.chassis.system.category] : "Chassis";
    context.fittingLabel = context.stats?.fitting ? FITTING_LABELS[context.stats.fitting.system.category] : "Fitting";
    context.categoryOptions = Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
    // Which fields are relevant depends on what this item fundamentally IS (category) — a Toolkit
    // has no combat stats or Uses; a Consumable Kit has Equipment Cards instead of a flat Uses;
    // only the worn/wielded categories can be modular or carry Fortitude/Resilience/Movement/Reach
    // Bonus. Showing every field on every item regardless of category was the actual complaint
    // that led to this split — a Toolkit's edit form doesn't need Range or Reach Bonus inputs.
    context.isWornCategory = MODULAR_EQUIPMENT_CATEGORIES.includes(context.system.category);
    context.isToolkit = context.system.category === "toolkit";
    context.isConsumableKit = context.system.category === "consumable-kit";
    context.isGear = context.system.category === "gear";
    return context;
  }

  /**
   * Chassis/Fitting/Mount-Augment assignment writes straight to this Item's own fields — this is
   * the "you have the Components, you do it, no roll" case (part-viii-equipment-and-items.md §
   * Reconfiguring Equipment's closing line), separate from the costed mid-Adventure reconfiguration
   * actions below (#onSwapAugmentCost/#onReconfigureFittingCost). Wired manually rather than through
   * submitOnChange because chassisItemId/fittingItemId/mounts live on the equipment Item itself
   * (not the actor this sheet's form would otherwise submit to), and a Mount's augmentItemId sits
   * inside an ArrayField sub-object — the same dotted-path ArrayField bug documented in
   * build-history's "Recurring bug patterns" #1 applies here too, so it gets the same
   * read-modify-write treatment instead of a `name="system.mounts.{i}.augmentItemId"` input.
   */
  #wireModularSelects() {
    const chassisSelect = this.element.querySelector(".chassis-select");
    chassisSelect?.addEventListener("change", async (event) => {
      await this.item.update({ "system.chassisItemId": event.currentTarget.value });
    });
    const fittingSelect = this.element.querySelector(".fitting-select");
    fittingSelect?.addEventListener("change", async (event) => {
      await this.item.update({ "system.fittingItemId": event.currentTarget.value });
    });
    for (const select of this.element.querySelectorAll(".mount-augment-select")) {
      select.addEventListener("change", async (event) => {
        const i = Number(event.currentTarget.dataset.mountIndex);
        const mounts = this.item.system.mounts.map((m) => ({ ...m }));
        while (mounts.length <= i) mounts.push({ augmentItemId: "", linkOn: true });
        mounts[i].augmentItemId = event.currentTarget.value;
        await this.item.update({ "system.mounts": mounts });
      });
    }
  }

  /**
   * A Consumable Kit's `equipmentCards` is an ArrayField of {name, effect, uses, usesRemaining} —
   * same read-modify-write treatment as #wireModularSelects's Mounts, and the same reasoning
   * (build-history's documented ArrayField-dotted-path bug: a bare `name="system.equipmentCards.
   * {i}.name"` input would silently replace the whole array element instead of merging just that
   * field). Mirrors content-wizard.mjs's #onArrayFieldChange convention (data-array/data-index/
   * data-field), reused here rather than invented fresh since it's already this project's
   * established pattern for exactly this shape of field.
   */
  #wireEquipmentCardFields() {
    for (const el of this.element.querySelectorAll('[data-array="equipmentCards"][data-index]')) {
      el.addEventListener("change", async (event) => {
        const target = event.currentTarget;
        const i = Number(target.dataset.index);
        const field = target.dataset.field;
        const value = target.type === "number" ? (target.value === "" ? null : Number(target.value)) : target.value;
        const cards = this.item.system.equipmentCards.map((c) => ({ ...c }));
        if (!cards[i]) return;
        cards[i][field] = value;
        await this.item.update({ "system.equipmentCards": cards });
      });
    }
  }

  static async #onAddEquipmentCard() {
    const cards = this.item.system.equipmentCards.map((c) => ({ ...c }));
    cards.push({ name: "", effect: "", uses: null, usesRemaining: null });
    await this.item.update({ "system.equipmentCards": cards });
  }

  static async #onDeleteEquipmentCard(event, target) {
    const i = Number(target.dataset.index);
    const cards = this.item.system.equipmentCards.map((c) => ({ ...c }));
    cards.splice(i, 1);
    await this.item.update({ "system.equipmentCards": cards });
  }

  /**
   * § Linked Mounts — "turning an existing Link On or Off is designed to be extremely quick...
   * not replacing equipment, only changing how already-installed Augments interact," so this is
   * free (no dice cost), unlike the two reconfiguration actions below. The Link is a single
   * On/Off state for the WHOLE pair, not per-Mount — flips both sides together (found via the
   * Chassis's own mounts[i].linkedWith) so the two installs can't drift into disagreeing about
   * whether the pair is Linked.
   */
  static async #onToggleMountLink(event, target) {
    const i = Number(target.dataset.mountIndex);
    const actor = this.item.actor;
    const chassis = actor && this.item.system.chassisItemId ? actor.items.get(this.item.system.chassisItemId) : null;
    const partnerIndex = chassis?.system.mounts?.[i]?.linkedWith ?? null;
    const mounts = this.item.system.mounts.map((m) => ({ ...m }));
    const maxIndex = Math.max(i, partnerIndex ?? 0);
    while (mounts.length <= maxIndex) mounts.push({ augmentItemId: "", linkOn: true });
    const next = !mounts[i].linkOn;
    mounts[i].linkOn = next;
    if (partnerIndex !== null) mounts[partnerIndex].linkOn = next;
    await this.item.update({ "system.mounts": mounts });
  }

  /**
   * § Reconfiguring Equipment — "Augments are intentionally easier to replace than major
   * Components. The current standard is: burn 1 Action die to exchange an installed Augment for
   * another compatible Augment you have available." A standalone cost-and-log action (mirrors the
   * actor sheet's #onBurnDice pattern) rather than something auto-triggered by the Mount select
   * above, since that same select is also how an Augment gets installed into an empty Mount for
   * the first time (free — not an "exchange") — only the player knows which case actually applies
   * in the fiction, the same trust-based convention every other manual action on this sheet uses.
   */
  static async #onSwapAugmentCost() {
    const actor = this.item.actor;
    if (!actor) {
      ui.notifications.warn("This item isn't owned by an Actor — no Action Dice pool to burn from.");
      return;
    }
    const available = actor.system.playState.actionDice ?? 0;
    if (available < 1) {
      ui.notifications.warn("No Action Dice remaining to spend on an Augment swap.");
      return;
    }
    await actor.update({ "system.playState.actionDice": available - 1 });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${actor.name}</strong> burns 1 Action Die to swap an Augment on <strong>${this.item.name}</strong>.</p>`
    });
  }

  /**
   * § Reconfiguring Equipment — "a Simple Fitting Change costs approximately 1 Action die, while a
   * Structural Fitting Change costs approximately 3 Action dice. The specific Fitting may state
   * otherwise" (reconfigureCostOverride, see item-component.mjs). Uses the CURRENTLY installed
   * Fitting's own category/override to determine cost — that's the Fitting whose printed text
   * actually governs how hard it is to remove (e.g. "a ranged Payload might be exchanged very
   * quickly" vs. one that "requires substantial disassembly").
   */
  static async #onReconfigureFittingCost() {
    const actor = this.item.actor;
    if (!actor) {
      ui.notifications.warn("This item isn't owned by an Actor — no Action Dice pool to burn from.");
      return;
    }
    const fitting = this.item.system.fittingItemId ? actor.items.get(this.item.system.fittingItemId) : null;
    const cost = fitting?.system.reconfigureCostOverride ?? (fitting?.system.reconfigureCategory === "structural" ? 3 : 1);
    const available = actor.system.playState.actionDice ?? 0;
    if (available < cost) {
      ui.notifications.warn(`Changing this Fitting costs ${cost} Action ${cost === 1 ? "Die" : "Dice"}, but only ${available} remain.`);
      return;
    }
    await actor.update({ "system.playState.actionDice": available - cost });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<p><strong>${actor.name}</strong> burns ${cost} Action ${cost === 1 ? "Die" : "Dice"} to change the Fitting on <strong>${this.item.name}</strong>.</p>`
    });
  }
}

/**
 * A Species Nature and each of its Adaptations may carry an optional nested "sub-choice" (see
 * item-origin.mjs's subChoiceField() comment) — e.g. Mortal-Kin's Keen ("choose two: low-light
 * vision, keen hearing, keen scent"). `subChoice.options` is an ArrayField(StringField), which has
 * no natural single-`<input name>` binding for Foundry's default form submission (same ArrayField
 * dotted-path limitation already documented for Mounts in build-history) — authored here as one
 * comma-separated text field with no `name` attribute, converted to an array on change and written
 * back with a single `item.update()`, mirroring the Mounts editor's manual-listener pattern.
 */
export class EssenceSpeciesSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/species-sheet.hbs" }
  };

  /** No "join" Handlebars helper exists in this project (core Foundry doesn't register one) —
   *  precompute the comma-joined display strings here instead of adding a one-off helper. */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.natureOptionsText = (context.system.nature.subChoice?.options ?? []).join(", ");
    context.adaptationOptionsText = context.system.adaptations.map((a) => (a.subChoice?.options ?? []).join(", "));
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#wireSubChoiceOptions();
  }

  /**
   * Every `.subchoice-options-field` (one per Nature + one per Adaptation row) has no `name`
   * attribute — same reasoning as EssenceCardSheet#wireSkillSelect: the field is a single
   * comma-separated text box standing in for an ArrayField(StringField) with no natural
   * single-input binding, so it needs a manual change listener + explicit item.update() rather than
   * relying on submitOnChange to serialize it.
   */
  #wireSubChoiceOptions() {
    for (const el of this.element.querySelectorAll(".subchoice-options-field")) {
      el.addEventListener("change", async (event) => {
        const path = event.currentTarget.dataset.path; // e.g. "nature" or "adaptations.2"
        const options = event.currentTarget.value.split(",").map((s) => s.trim()).filter((s) => s.length);
        await this.item.update({ [`system.${path}.subChoice.options`]: options });
      });
    }
  }
}

export class EssenceHeritageSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/heritage-sheet.hbs" }
  };
}

export class EssenceDistinctionSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/distinction-sheet.hbs" }
  };
}

/**
 * Shared sheet for Chassis and Fitting — both are "Components" per the rules' own term
 * (item-component.mjs's EssenceComponentData base) and differ only in a handful of fields
 * (Chassis: Mounts + compatibleFittingCategory; Fitting: handedness/rangeModifier/reconfigure
 * cost), so one sheet branching on `item.type` in the template is simpler than two near-identical
 * classes, matching the design doc's suggestion.
 */
export class EssenceComponentSheet extends EssenceItemSheetBase {
  static DEFAULT_OPTIONS = {
    actions: {
      addMount: EssenceComponentSheet.#onAddMount,
      deleteMount: EssenceComponentSheet.#onDeleteMount
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/item/component-sheet.hbs" }
  };

  /**
   * Category names differ per equipment type (Striker/Handling for Melee Weapon, Launcher/Payload
   * for Ranged, Shell/Rigging for Armor, Shield/Handling for Shields, Focus/Interface for Magical
   * Implements — see CHASSIS_LABELS/FITTING_LABELS in item-component.mjs). The sheet should show
   * these instead of the generic words "Chassis"/"Fitting" wherever a category is known — both for
   * the category dropdown's own option labels (every category, since the player is choosing among
   * them) and for this item's current label (its own chosen category).
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const isChassis = this.item.type === "chassis";
    context.componentLabel = (isChassis ? CHASSIS_LABELS : FITTING_LABELS)[context.system.category] ?? (isChassis ? "Chassis" : "Fitting");
    context.categoryOptions = Object.keys(CHASSIS_LABELS).map((category) => ({
      category,
      label: `${category} (${isChassis ? CHASSIS_LABELS[category] : FITTING_LABELS[category]})`
    }));
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    this.#wireMountLinkSelects();
  }

  /** Same read-modify-write pattern as EssenceActorSheet#wireExpertiseSelects — a Mount's
   *  `linkedWith` <select> must not submit as `system.mounts.{i}.linkedWith` directly, since
   *  Foundry's ArrayField dotted-path form submission replaces the whole array element instead of
   *  merging just that field (build-history's documented bug #1). */
  #wireMountLinkSelects() {
    for (const select of this.element.querySelectorAll(".mount-linked-select")) {
      select.addEventListener("change", async (event) => {
        const i = Number(event.currentTarget.dataset.index);
        const mounts = this.item.system.mounts.map((m) => ({ ...m }));
        if (!mounts[i]) return;
        const raw = event.currentTarget.value;
        mounts[i].linkedWith = raw === "" ? null : Number(raw);
        await this.item.update({ "system.mounts": mounts });
      });
    }
  }

  /** Chassis Mounts are an ArrayField of {linkedWith} — read-modify-write the whole array rather
   *  than let a `linkedWith` <select> submit through the form directly, per the project's own
   *  documented ArrayField-dotted-path bug (build-history's "Recurring bug patterns" #1). */
  static async #onAddMount() {
    const mounts = this.item.system.mounts.map((m) => ({ ...m }));
    mounts.push({ linkedWith: null });
    await this.item.update({ "system.mounts": mounts });
  }

  static async #onDeleteMount(event, target) {
    const mounts = this.item.system.mounts.map((m) => ({ ...m }));
    // § Augment Mounts — "a Chassis must have at least one Augment Mount." Refuse rather than warn:
    // unlike the soft over-Reach flags elsewhere, a Chassis with 0 Mounts isn't a valid Chassis at
    // all, so there's nothing useful to do with it if allowed.
    if (mounts.length <= 1) {
      ui.notifications.warn("A Chassis must have at least one Augment Mount.");
      return;
    }
    const i = Number(target.dataset.index);
    mounts.splice(i, 1);
    // Any other Mount linked to the removed one (or to a now-shifted index) must be unlinked/
    // reindexed, or a stale linkedWith would point at the wrong Mount (or past the array's end).
    for (const m of mounts) {
      if (m.linkedWith === i) m.linkedWith = null;
      else if (m.linkedWith !== null && m.linkedWith > i) m.linkedWith -= 1;
    }
    await this.item.update({ "system.mounts": mounts });
  }
}

export class EssenceAugmentSheet extends EssenceItemSheetBase {
  static PARTS = {
    body: { template: "systems/essence-system/templates/item/augment-sheet.hbs" }
  };
}
