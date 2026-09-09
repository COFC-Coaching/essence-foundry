const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

import { EQUIPMENT_CATEGORY_LABELS } from "../data/item-card.mjs";

/** Categories eligible for modular assembly (matches CHASSIS_LABELS/FITTING_LABELS's own keys in item-component.mjs). */
const MODULAR_EQUIPMENT_CATEGORIES = ["weapon", "armor", "shield", "implement"];

/** Which compendium each content type is authored into, and what the default new-row shape is per array field. */
const TYPE_CONFIG = {
  "action-card": {
    label: "Action Card", pack: "essence-system.action-cards", img: "icons/svg/card-hand.svg",
    steps: ["Type & Name", "Mechanics", "Body", "Surges & Rider", "Done"],
    arrayDefaults: { body: { label: "", html: "" }, surges: { n: "1", html: "" } }
  },
  "reaction-card": {
    label: "Reaction Card", pack: "essence-system.reaction-cards", img: "icons/svg/card-hand.svg",
    steps: ["Type & Name", "Mechanics", "Body", "Surges & Rider", "Done"],
    arrayDefaults: { body: { label: "", html: "" }, surges: { n: "1", html: "" } }
  },
  equipment: {
    label: "Equipment", pack: "essence-system.equipment", img: "icons/svg/item-bag.svg",
    steps: ["Type & Name", "Details", "Description", "Done"],
    // Consumable Kit only (part-viii-equipment-and-items.md § Consumable Kits) — see item-card.mjs's
    // `equipmentCards` field and EssenceEquipmentSheet's identical editor for owned items.
    arrayDefaults: { equipmentCards: { name: "", effect: "", uses: null, usesRemaining: null } },
    // Folder tracks system.category (Weapon/Armor/Tool/Gear — see build-packs.mjs's
    // writeCategoryFolders) rather than a fixed name, kept in sync as the Details step's Category
    // field changes — see #syncCategoryFolder().
    folderBy: "system.category"
  },
  condition: {
    label: "Condition", pack: "essence-system.conditions", img: "icons/svg/skull.svg",
    steps: ["Type & Name", "Sections", "Done"],
    arrayDefaults: { sections: { label: "", html: "" } }
  },
  chassis: {
    label: "Chassis", pack: "essence-system.equipment", img: "icons/svg/shield.svg",
    steps: ["Type & Name", "Details", "Mounts", "Description", "Done"],
    arrayDefaults: { mounts: { linkedWith: null } },
    // Chassis/Fitting/Augment used to be their own separate (always-empty) compendium packs —
    // folded into "equipment" as folders instead (see build-packs.mjs's COMPONENT_TYPES_FOR_FOLDERS)
    // so a GM authoring reusable Components has one shared library, not four mostly-empty tabs.
    folder: "Chassis"
  },
  fitting: {
    label: "Fitting", pack: "essence-system.equipment", img: "icons/svg/item-bag.svg",
    steps: ["Type & Name", "Details", "Description", "Done"],
    arrayDefaults: {},
    folder: "Fitting"
  },
  augment: {
    label: "Augment", pack: "essence-system.equipment", img: "icons/svg/upgrade.svg",
    steps: ["Type & Name", "Details", "Description", "Done"],
    arrayDefaults: {},
    folder: "Augment"
  }
};

/** Foundry's own assignable "Create Items" permission (World Settings > Configure Permissions) — GMs always pass. */
export function canCreateContent() {
  return game.user.can("ITEM_CREATE");
}

/**
 * Authors new Action/Reaction Cards, Equipment, and Conditions straight into the shared
 * compendium, for GMs or anyone granted Foundry's own "Create Items" permission.
 *
 * Unlike the character wizard, there's no existing Document to bind to at first — Step 1 (type +
 * name) creates the Item directly in its target pack, then every later step edits that same live
 * compendium document. This is a plain ApplicationV2 (not DocumentSheetV2): fields are wired
 * manually (see #onFieldChange/#onArrayFieldChange) rather than via Foundry's automatic
 * submit-on-change form handling, specifically so array-row edits (body/surges/sections) always
 * read-modify-write the WHOLE array — a standalone update to one array element's dotted path
 * (or a full-form submit that only contains some of an array's sub-fields, as ProseMirror's
 * built-in editor-target save does) silently replaces the entire array with just that one
 * reconstructed element, dropping every sibling row's data.
 */
export default class EssenceContentWizard extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "wizard"],
    position: { width: 640, height: 700 },
    window: { title: "Create Content" },
    actions: {
      chooseType: EssenceContentWizard.#onChooseType,
      createDraft: EssenceContentWizard.#onCreateDraft,
      wizardNext: EssenceContentWizard.#onNext,
      wizardBack: EssenceContentWizard.#onBack,
      addArrayRow: EssenceContentWizard.#onAddArrayRow,
      deleteArrayRow: EssenceContentWizard.#onDeleteArrayRow,
      openInCompendium: EssenceContentWizard.#onOpenInCompendium,
      createAnother: EssenceContentWizard.#onCreateAnother
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/wizard/content-wizard.hbs" }
  };

  #type = null;
  #doc = null;
  #step = 0;
  // Serializes every mutation to #doc. Blurring one field (e.g. a body row's HTML) kicks off an
  // async update(); clicking "Add Body Line" right after can start running before that update's
  // network round-trip resolves, so a naive read of this.#doc.system there sees stale data and
  // an add/delete would silently discard the still-in-flight edit. Routing every mutation through
  // this chain — with the "read current array" step happening *inside* the queued callback, not
  // before it's enqueued — guarantees each one sees the result of everything queued before it.
  #updateQueue = Promise.resolve();

  #queueUpdate(fn) {
    this.#updateQueue = this.#updateQueue.then(fn, fn);
    return this.#updateQueue;
  }

  get title() {
    return this.#doc ? `Create Content: ${this.#doc.name}` : "Create Content";
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.type = this.#type;
    context.typeConfig = this.#type ? TYPE_CONFIG[this.#type] : null;
    context.typeOptions = Object.entries(TYPE_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label, img: cfg.img }));
    context.doc = this.#doc;
    context.system = this.#doc?.system;
    context.step = this.#step;
    context.stepName = context.typeConfig?.steps[this.#step] ?? "Type & Name";
    context.isLast = context.typeConfig ? this.#step === context.typeConfig.steps.length - 1 : false;
    context.canCreate = canCreateContent();
    if (this.#type === "equipment") {
      context.categoryOptions = Object.entries(EQUIPMENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
      context.isWornCategory = MODULAR_EQUIPMENT_CATEGORIES.includes(context.system?.category);
      context.isToolkit = context.system?.category === "toolkit";
      context.isConsumableKit = context.system?.category === "consumable-kit";
      context.isGear = context.system?.category === "gear";
    }
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    // Simple (non-array) fields: data-field="system.x" -> this.#doc.update({[field]: value}).
    for (const el of this.element.querySelectorAll("[data-field]")) {
      el.addEventListener("change", (e) => this.#onFieldChange(e));
    }
    // Array-row fields: data-array/data-index/data-field -> read-modify-write the whole array.
    for (const el of this.element.querySelectorAll("[data-array][data-index]")) {
      el.addEventListener("change", (e) => this.#onArrayFieldChange(e));
    }
  }

  #onFieldChange(event) {
    if (!this.#doc) return;
    const el = event.currentTarget;
    let value = el.value;
    if (el.type === "checkbox") value = el.checked;
    else if (el.type === "number") value = value === "" ? null : Number(value);
    this.#queueUpdate(() => this.#doc.update({ [el.dataset.field]: value }));
    const cfg = TYPE_CONFIG[this.#type];
    if (cfg.folderBy === el.dataset.field) this.#syncCategoryFolder(value);
  }

  /**
   * Keeps an Equipment draft's Folder in sync with its Category field (see TYPE_CONFIG.equipment's
   * `folderBy`) — Weapon/Armor/Tool/Gear are the same folders build-packs.mjs's
   * writeCategoryFolders() seeds ahead of time, so a GM-authored item lands in the same folder
   * group a pre-loaded one with that Category would.
   */
  async #syncCategoryFolder(category) {
    const cfg = TYPE_CONFIG[this.#type];
    const pack = game.packs.get(cfg.pack);
    const folderName = category ? category[0].toUpperCase() + category.slice(1) : null;
    const folder = folderName ? pack.folders.find((f) => f.name === folderName) : null;
    await this.#doc.update({ folder: folder?.id ?? null });
  }

  #onArrayFieldChange(event) {
    if (!this.#doc) return;
    // No re-render here: the field's own value already shows what the user typed, and
    // re-rendering the whole step on every blur destroys and recreates every input in it —
    // losing focus (and any in-progress edit) in whatever field the user moves to next, since
    // that element gets replaced out from under them mid-interaction.
    const el = event.currentTarget;
    const key = el.dataset.array;
    const i = Number(el.dataset.index);
    const field = el.dataset.field;
    // Every pre-existing array row field (body/surges/sections) is a plain StringField, so a raw
    // el.value always worked. Chassis's new mounts[].linkedWith is a nullable NumberField — an
    // unconverted "" would otherwise coerce to 0 on save instead of null, wrongly linking Mount 0.
    const value = el.type === "number" ? (el.value === "" ? null : Number(el.value)) : el.value;
    this.#queueUpdate(() => {
      const rows = this.#doc.system[key].map((r) => ({ ...r }));
      rows[i][field] = value;
      return this.#doc.update({ [`system.${key}`]: rows });
    });
  }

  static #onChooseType(event, target) {
    this.#type = target.dataset.type;
    this.render();
  }

  static async #onCreateDraft(event, target) {
    if (!canCreateContent()) {
      ui.notifications.error("You don't have permission to create content (Foundry's \"Create Items\" permission).");
      return;
    }
    if (!this.#type) {
      ui.notifications.warn("Choose a content type first.");
      return;
    }
    const nameInput = this.element.querySelector('[data-field="name"]');
    const name = nameInput?.value?.trim();
    if (!name) {
      ui.notifications.warn("Give it a name first.");
      return;
    }
    const cfg = TYPE_CONFIG[this.#type];
    const pack = game.packs.get(cfg.pack);
    // System-bundled packs ship locked (Foundry's own safeguard against accidental edits to
    // shipped reference content) — creating or updating documents inside a locked compendium is
    // refused outright, GM or not, until it's unlocked.
    if (pack.locked) await pack.configure({ locked: false });
    // Fixed-folder types (Chassis/Fitting/Augment) get sorted immediately; category-tracking types
    // (Equipment) start unfoldered until the Details step's Category field is set — see
    // #syncCategoryFolder().
    const folder = cfg.folder ? pack.folders.find((f) => f.name === cfg.folder) : null;
    const [doc] = await Item.createDocuments([{ name, type: this.#type, img: cfg.img, folder: folder?.id ?? null }], { pack: pack.collection });
    this.#doc = doc;
    this.#step = 1;
    this.render();
  }

  static #onNext() {
    const cfg = TYPE_CONFIG[this.#type];
    this.#step = Math.min(cfg.steps.length - 1, this.#step + 1);
    this.render();
  }

  static #onBack() {
    this.#step = Math.max(this.#doc ? 1 : 0, this.#step - 1);
    this.render();
  }

  static async #onAddArrayRow(event, target) {
    const key = target.dataset.array;
    await this.#queueUpdate(() => {
      const rows = this.#doc.system[key].map((r) => ({ ...r }));
      rows.push(foundry.utils.deepClone(TYPE_CONFIG[this.#type].arrayDefaults[key]));
      return this.#doc.update({ [`system.${key}`]: rows });
    });
    this.render();
  }

  static async #onDeleteArrayRow(event, target) {
    const key = target.dataset.array;
    const i = Number(target.dataset.index);
    await this.#queueUpdate(() => {
      const rows = this.#doc.system[key].map((r) => ({ ...r }));
      rows.splice(i, 1);
      return this.#doc.update({ [`system.${key}`]: rows });
    });
    this.render();
  }

  static #onOpenInCompendium() {
    this.#doc?.sheet.render(true);
  }

  static #onCreateAnother() {
    this.#type = null;
    this.#doc = null;
    this.#step = 0;
    this.render();
  }
}
