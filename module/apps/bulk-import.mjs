import { canCreateContent } from "./content-wizard.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

/**
 * One CSV template per content TYPE — not per pack, and not lumped together (a single "Combat
 * Cards" template with a `kind` column used to cover both Action and Reaction Cards; a GM filling
 * it out had to know that "kind" existed and what to put there, and got a template header row
 * that was really two different cards' worth of columns interleaved). Every content type the
 * single-item Item Creation Wizard supports (content-wizard.mjs's TYPE_CONFIG) now has its own
 * matching template here, with only the columns relevant to that type — Chassis/Fitting/Augment
 * previously had no Bulk Import template at all despite being fully supported one-at-a-time.
 *
 * `columns` is the exact header row (and column order) of both the downloadable template and
 * whatever a GM uploads — an uploaded file's header row is matched against these names, not
 * position, so reordered/extra columns still work as long as every name here is present.
 * `example` is the one illustrative data row baked into the downloaded template. `pack`/`type`/
 * `img`/`toSystem` drive the shared #runImportFor() below — one generic create-or-update loop
 * instead of a near-identical branch repeated per type.
 */
const TEMPLATES = {
  "action-card": {
    label: "Action Cards",
    filename: "essence-action-cards-template.csv",
    pack: "essence-system.action-cards",
    type: "action-card",
    img: "icons/svg/card-hand.svg",
    toSystem: cardRowToSystem,
    columns: [
      "name", "domain", "rank", "style", "subtype", "attr", "skill", "defense", "min",
      "cost", "expertises", "expertises_mode", "tags", "flavor",
      "target_label", "target_html", "effect_label", "effect_html",
      "surge1_n", "surge1_html", "surge2_n", "surge2_html",
      "rider_title", "rider_html", "rider_meta"
    ],
    example: {
      name: "Example Strike", domain: "physical", rank: "0", style: "Prowess",
      subtype: "Opener", attr: "Vigor", skill: "Prowess", defense: "Fortitude", min: "2", cost: "",
      expertises: "", expertises_mode: "any", tags: "", flavor: "",
      target_label: "Target", target_html: "One creature within weapon range.",
      effect_label: "Effect", effect_html: "On a success, deal 1 weapon damage.",
      surge1_n: "1", surge1_html: "Deal +1 weapon damage.", surge2_n: "", surge2_html: "",
      rider_title: "", rider_html: "", rider_meta: ""
    }
  },
  "reaction-card": {
    label: "Reaction Cards",
    filename: "essence-reaction-cards-template.csv",
    pack: "essence-system.reaction-cards",
    type: "reaction-card",
    img: "icons/svg/card-hand.svg",
    toSystem: cardRowToSystem,
    columns: [
      "name", "domain", "rank", "style", "subtype", "attr", "skill", "defense", "min",
      "cost", "expertises", "expertises_mode", "tags", "flavor",
      "target_label", "target_html", "effect_label", "effect_html",
      "surge1_n", "surge1_html", "surge2_n", "surge2_html",
      "rider_title", "rider_html", "rider_meta"
    ],
    example: {
      name: "Example Parry", domain: "physical", rank: "0", style: "Prowess",
      subtype: "", attr: "Grace", skill: "Prowess", defense: "Fortitude", min: "2", cost: "",
      expertises: "", expertises_mode: "any", tags: "", flavor: "",
      target_label: "Target", target_html: "One attacker targeting you in melee range.",
      effect_label: "Effect", effect_html: "Reduce the incoming hit's severity by one step.",
      surge1_n: "1", surge1_html: "Reposition 1 unit.", surge2_n: "", surge2_html: "",
      rider_title: "", rider_html: "", rider_meta: ""
    }
  },
  equipment: {
    label: "Equipment",
    filename: "essence-equipment-template.csv",
    pack: "essence-system.equipment",
    type: "equipment",
    img: "icons/svg/item-bag.svg",
    toSystem: equipmentRowToSystem,
    columns: [
      "name", "category", "tier", "type", "cost", "range", "effect", "passive", "special",
      "fortitude", "resilience", "movement", "tags", "flavor", "reachBonus", "uses", "slotCost",
      "isModular"
    ],
    // No `slot` or `quantity` column — both are properties of an owned COPY of an item (which
    // Signature/Temporary/Armory slot it's carried in; how many you happen to have), assigned once
    // a player actually acquires it, not properties of the template being authored here. `category`
    // (weapon/armor/shield/implement/toolkit/consumable-kit/gear — see item-card.mjs) is what this
    // item fundamentally is; a Toolkit never has Uses regardless of what this row's `uses` column
    // says. A Consumable Kit's actual granted Equipment Cards are richer than a flat CSV row
    // supports well (each needs its own name/effect/Uses), so authoring those stays on the Item
    // Creation Wizard/item sheet — this template can only mark a row `category: consumable-kit`,
    // not populate its cards.
    example: {
      name: "Example Blade", category: "weapon", tier: "1", type: "Melee, 1h",
      cost: "1", range: "reach", effect: "On a hit, deal 1 weapon damage.", passive: "", special: "",
      fortitude: "", resilience: "", movement: "", tags: "melee", flavor: "", reachBonus: "0",
      uses: "", slotCost: "1", isModular: "false"
    }
  },
  condition: {
    label: "Conditions",
    filename: "essence-conditions-template.csv",
    pack: "essence-system.conditions",
    type: "condition",
    img: "icons/svg/skull.svg",
    toSystem: conditionRowToSystem,
    columns: [
      "name", "section1_label", "section1_html", "section2_label", "section2_html",
      "section3_label", "section3_html"
    ],
    example: {
      name: "Example Condition", section1_label: "EFFECT", section1_html: "Movement -1.",
      section2_label: "DURATION", section2_html: "Until treated.", section3_label: "", section3_html: ""
    }
  },
  chassis: {
    label: "Chassis",
    filename: "essence-chassis-template.csv",
    pack: "essence-system.equipment",
    type: "chassis",
    img: "icons/svg/shield.svg",
    toSystem: componentRowToSystem,
    columns: [
      "name", "category", "tier", "fortitude", "resilience", "movement", "effect",
      "passive", "special", "flavor", "grantsEquipmentCard", "compatibleFittingCategory", "mountCount"
    ],
    // No `slot` column — which Signature/Temporary/Armory slot a Component sits in is assigned
    // once a player actually owns it, not a property of the template. `mountCount` creates that
    // many independent Mounts (§ Augment Mounts) — a Linked Mount pair is a rarer, more specific
    // shape not worth CSV-izing; add one after import via the item sheet.
    example: {
      name: "Edge Striker", category: "weapon", tier: "2", fortitude: "", resilience: "",
      movement: "", effect: "", passive: "", special: "", flavor: "", grantsEquipmentCard: "false",
      compatibleFittingCategory: "Handling", mountCount: "2"
    }
  },
  fitting: {
    label: "Fittings",
    filename: "essence-fittings-template.csv",
    pack: "essence-system.equipment",
    type: "fitting",
    img: "icons/svg/item-bag.svg",
    toSystem: componentRowToSystem,
    columns: [
      "name", "category", "tier", "fortitude", "resilience", "movement", "effect",
      "passive", "special", "flavor", "grantsEquipmentCard", "handedness", "rangeModifier",
      "reconfigureCategory", "reconfigureCostOverride"
    ],
    example: {
      name: "Swift Handling", category: "weapon", tier: "1", fortitude: "", resilience: "",
      movement: "", effect: "", passive: "One-handed, positioning bonus.", special: "", flavor: "",
      grantsEquipmentCard: "false", handedness: "one-handed", rangeModifier: "",
      reconfigureCategory: "simple", reconfigureCostOverride: ""
    }
  },
  augment: {
    label: "Augments",
    filename: "essence-augments-template.csv",
    pack: "essence-system.equipment",
    type: "augment",
    img: "icons/svg/upgrade.svg",
    toSystem: augmentRowToSystem,
    columns: ["name", "kind", "compatibility", "uses", "effect", "flavor"],
    example: {
      name: "Rapid Draw", kind: "function", compatibility: "Any", uses: "2",
      effect: "Equipment Action — draw and attack without additional action economy cost.", flavor: ""
    }
  }
};

/** Quote a CSV field only when it needs it (RFC 4180): contains a comma, quote, or newline. */
function csvField(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildTemplateCsv(cfg) {
  const rows = [cfg.columns, cfg.columns.map((c) => cfg.example[c] ?? "")];
  return rows.map((r) => r.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/** Minimal RFC 4180 CSV parser — handles quoted fields with embedded commas/newlines/escaped quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  // Normalize line endings so \r\n inside/outside quotes doesn't produce phantom blank rows.
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((f) => f.trim() !== ""));
}

function rowsToObjects(rows, expectedColumns) {
  if (!rows.length) return { header: [], records: [], missingColumns: expectedColumns };
  const header = rows[0].map((h) => h.trim());
  const missingColumns = expectedColumns.filter((c) => !header.includes(c));
  const records = rows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
  return { header, records, missingColumns };
}

function bodyFromRow(row) {
  const body = [];
  if (row.target_html) body.push({ label: row.target_label || "Target", html: row.target_html });
  if (row.effect_html) body.push({ label: row.effect_label || "Effect", html: row.effect_html });
  return body;
}

function surgesFromRow(row) {
  const surges = [];
  if (row.surge1_html) surges.push({ n: row.surge1_n || "1", html: row.surge1_html });
  if (row.surge2_html) surges.push({ n: row.surge2_n || "1", html: row.surge2_html });
  return surges;
}

function cardRowToSystem(row) {
  return {
    domain: row.domain || "physical",
    rank: Number(row.rank) || 0,
    style: row.style || "",
    subtype: row.subtype || "",
    attr: row.attr || "",
    skill: row.skill || "",
    defense: row.defense || "",
    min: row.min || "",
    cost: row.cost || "",
    expertises: row.expertises || "",
    expertisesMode: row.expertises_mode || "any",
    tags: row.tags || "",
    flavor: row.flavor || "",
    body: bodyFromRow(row),
    surges: surgesFromRow(row),
    rider: { title: row.rider_title || "", html: row.rider_html || "", meta: row.rider_meta || "" }
  };
}

const EQUIPMENT_CATEGORIES = ["weapon", "armor", "shield", "implement", "toolkit", "consumable-kit", "gear"];

/** No `slot`/`quantity` here — both are per-owned-copy properties (which Signature/Temporary/
 *  Armory slot it's carried in; how many you own) assigned once a player acquires the item, not
 *  properties of the template being authored/imported. Omitting them from the returned object
 *  means an update() leaves an existing item's own slot/quantity untouched, and a newly-created
 *  item just gets the schema's defaults (armory / 1). */
function equipmentRowToSystem(row) {
  return {
    category: EQUIPMENT_CATEGORIES.includes(row.category) ? row.category : "gear",
    tier: row.tier ? Number(row.tier) : null,
    type: row.type || "",
    cost: row.cost || "",
    range: row.range || "",
    effect: row.effect || "",
    passive: row.passive || "",
    special: row.special || "",
    fortitude: row.fortitude || "",
    resilience: row.resilience || "",
    movement: row.movement || "",
    tags: row.tags || "",
    flavor: row.flavor || "",
    reachBonus: Number(row.reachBonus) || 0,
    uses: row.uses ? Number(row.uses) : null,
    slotCost: row.slotCost ? Number(row.slotCost) : 1,
    isModular: /^(true|1|yes)$/i.test(row.isModular || "")
  };
}

function conditionRowToSystem(row) {
  const sections = [];
  for (const n of [1, 2, 3]) {
    const html = row[`section${n}_html`];
    if (html) sections.push({ label: row[`section${n}_label`] || "", html });
  }
  return { sections };
}

const COMPONENT_CATEGORIES = ["weapon", "ranged", "armor", "shield", "implement"];

/** Shared by both Chassis and Fitting rows — see EssenceComponentData in item-component.mjs. No
 *  `slot` column, same reasoning as equipmentRowToSystem — which slot a Component sits in is
 *  assigned once a player owns it. `mountCount` (Chassis only; ignored for Fitting rows, which
 *  have no Mounts) creates that many independent Mounts — see the "chassis" template's own column
 *  comment for why Linked pairs aren't CSV-able here. */
function componentRowToSystem(row) {
  return {
    category: COMPONENT_CATEGORIES.includes(row.category) ? row.category : "weapon",
    tier: row.tier ? Math.min(5, Math.max(1, Number(row.tier))) : 1,
    fortitude: row.fortitude || "",
    resilience: row.resilience || "",
    movement: row.movement || "",
    effect: row.effect || "",
    passive: row.passive || "",
    special: row.special || "",
    flavor: row.flavor || "",
    grantsEquipmentCard: /^(true|1|yes)$/i.test(row.grantsEquipmentCard || ""),
    ...("mountCount" in row
      ? { mounts: Array.from({ length: Math.max(1, Number(row.mountCount) || 1) }, () => ({ linkedWith: null })) }
      : {}),
    ...("compatibleFittingCategory" in row ? { compatibleFittingCategory: row.compatibleFittingCategory || "" } : {}),
    ...("handedness" in row ? { handedness: ["one-handed", "two-handed"].includes(row.handedness) ? row.handedness : "" } : {}),
    ...("rangeModifier" in row ? { rangeModifier: row.rangeModifier || "" } : {}),
    ...("reconfigureCategory" in row ? { reconfigureCategory: row.reconfigureCategory === "structural" ? "structural" : "simple" } : {}),
    ...("reconfigureCostOverride" in row ? { reconfigureCostOverride: row.reconfigureCostOverride ? Number(row.reconfigureCostOverride) : null } : {})
  };
}

function augmentRowToSystem(row) {
  return {
    kind: row.kind === "support" ? "support" : "function",
    compatibility: row.compatibility || "Any",
    uses: row.uses ? Number(row.uses) : null,
    effect: row.effect || "",
    flavor: row.flavor || ""
  };
}

/**
 * Bulk-creates or bulk-updates (matched by name, case-sensitive) any of the content types in
 * TEMPLATES above — Action Cards, Reaction Cards, Equipment, Conditions, Chassis, Fittings,
 * Augments — from an uploaded CSV, using the same downloadable-template pattern as any other
 * spreadsheet-driven content pipeline: download the template, fill it out in Excel/Sheets/etc.,
 * export as CSV, upload here. Existing items are updated in place (their _id and any fields the
 * template doesn't cover are preserved); new names are created fresh.
 */
export default class EssenceBulkImport extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    classes: ["essence", "wizard"],
    position: { width: 620, height: 640 },
    window: { title: "Bulk Import Content" },
    actions: {
      chooseTemplate: EssenceBulkImport.#onChooseTemplate,
      downloadTemplate: EssenceBulkImport.#onDownloadTemplate,
      runImport: EssenceBulkImport.#onRunImport,
      reset: EssenceBulkImport.#onReset
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/wizard/bulk-import.hbs" }
  };

  #templateKey = null;
  #fileName = null;
  #parsed = null; // { records, missingColumns }
  #results = null; // { created, updated, errors: [{row, message}] }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.templates = Object.entries(TEMPLATES).map(([key, cfg]) => ({ key, label: cfg.label, img: cfg.img }));
    context.templateKey = this.#templateKey;
    context.templateConfig = this.#templateKey ? TEMPLATES[this.#templateKey] : null;
    context.fileName = this.#fileName;
    context.parsed = this.#parsed;
    context.results = this.#results;
    context.canCreate = canCreateContent();
    return context;
  }

  _onRender(context, options) {
    super._onRender(context, options);
    const fileInput = this.element.querySelector('[data-role="file-input"]');
    fileInput?.addEventListener("change", (e) => this.#onFileSelected(e));
  }

  async #onFileSelected(event) {
    const file = event.currentTarget.files?.[0];
    if (!file || !this.#templateKey) return;
    this.#fileName = file.name;
    const text = await file.text();
    const rows = parseCsv(text);
    const { records, missingColumns } = rowsToObjects(rows, TEMPLATES[this.#templateKey].columns);
    this.#parsed = { records, missingColumns };
    this.#results = null;
    this.render();
  }

  static #onChooseTemplate(event, target) {
    this.#templateKey = target.dataset.key;
    this.#fileName = null;
    this.#parsed = null;
    this.#results = null;
    this.render();
  }

  static #onDownloadTemplate(event, target) {
    const cfg = TEMPLATES[target.dataset.key];
    const csv = buildTemplateCsv(cfg);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = cfg.filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  static #onReset() {
    this.#templateKey = null;
    this.#fileName = null;
    this.#parsed = null;
    this.#results = null;
    this.render();
  }

  /**
   * One generic create-or-update loop shared by every template — each TEMPLATES entry supplies
   * which pack, which Item `type`, a default `img`, and its own `toSystem` row-mapper, so this
   * doesn't need a per-type branch the way it used to (three near-identical blocks that would
   * have become seven once Chassis/Fitting/Augment were added the same way).
   * Chassis/Fitting/Augment share the Equipment pack as folders (build-packs.mjs's
   * COMPONENT_TYPES_FOR_FOLDERS) — matching existing docs by name is scoped to this template's own
   * `type` so a same-named Equipment/Chassis/Fitting/Augment never gets mistaken for each other.
   */
  static async #onRunImport() {
    if (!canCreateContent()) {
      ui.notifications.error(game.i18n.localize("ESSENCE.Notify.NoCreatePermission"));
      return;
    }
    if (!this.#parsed?.records?.length) return;

    const cfg = TEMPLATES[this.#templateKey];
    const pack = game.packs.get(cfg.pack);
    const unlocked = await EssenceBulkImport.#unlockAll([pack]);
    const existing = (await pack.getDocuments()).filter((d) => d.type === cfg.type);
    const errors = [];
    let created = 0, updated = 0;

    for (const [i, row] of this.#parsed.records.entries()) {
      if (!row.name) { errors.push({ row: i + 2, message: "missing name" }); continue; }
      const system = cfg.toSystem(row);
      const match = existing.find((d) => d.name === row.name);
      if (match) { await match.update({ system }); updated++; }
      else {
        const [doc] = await Item.createDocuments([{ name: row.name, type: cfg.type, img: cfg.img, system }], { pack: pack.collection });
        existing.push(doc);
        created++;
      }
    }
    await EssenceBulkImport.#restoreLocks(unlocked);

    this.#results = { created, updated, errors };
    this.render();
  }

  /** Unlocks any of the given packs that were locked, returning the ones this call unlocked (so they can be re-locked after). */
  static async #unlockAll(packs) {
    const unlocked = [];
    for (const pack of packs) {
      if (pack.locked) { await pack.configure({ locked: false }); unlocked.push(pack); }
    }
    return unlocked;
  }

  static async #restoreLocks(packs) {
    for (const pack of packs) await pack.configure({ locked: true });
  }
}
