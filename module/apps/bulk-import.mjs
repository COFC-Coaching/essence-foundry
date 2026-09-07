import { canCreateContent } from "./content-wizard.mjs";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ApplicationV2 } = foundry.applications.api;

/**
 * One CSV template per content type. `columns` is the exact header row (and column order) of
 * both the downloadable template and whatever a GM uploads — an uploaded file's header row is
 * matched against these names, not position, so reordered/extra columns still work as long as
 * every name here is present. `example` is the one illustrative data row baked into the
 * downloaded template (see the xlsx skill's convention: a template file needs a legend + one
 * realistic example row).
 */
const TEMPLATES = {
  cards: {
    label: "Combat Cards (Action + Reaction)",
    filename: "essence-combat-cards-template.csv",
    columns: [
      "kind", "name", "domain", "rank", "style", "subtype", "attr", "skill", "defense", "min",
      "cost", "expertises", "expertises_mode", "tags", "flavor",
      "target_label", "target_html", "effect_label", "effect_html",
      "surge1_n", "surge1_html", "surge2_n", "surge2_html",
      "rider_title", "rider_html", "rider_meta"
    ],
    example: {
      kind: "action", name: "Example Strike", domain: "physical", rank: "0", style: "Prowess",
      subtype: "Opener", attr: "Vigor", skill: "Prowess", defense: "Fortitude", min: "2", cost: "",
      expertises: "", expertises_mode: "any", tags: "", flavor: "",
      target_label: "Target", target_html: "One creature within weapon range.",
      effect_label: "Effect", effect_html: "On a success, deal 1 weapon damage.",
      surge1_n: "1", surge1_html: "Deal +1 weapon damage.", surge2_n: "", surge2_html: "",
      rider_title: "", rider_html: "", rider_meta: ""
    }
  },
  equipment: {
    label: "Equipment",
    filename: "essence-equipment-template.csv",
    columns: [
      "name", "category", "slot", "tier", "type", "cost", "range", "effect", "passive", "special",
      "fortitude", "resilience", "movement", "tags", "flavor", "reachBonus", "uses", "slotCost",
      "isModular", "quantity"
    ],
    example: {
      name: "Example Blade", category: "weapon", slot: "armory", tier: "1", type: "Melee, 1h",
      cost: "1", range: "reach", effect: "On a hit, deal 1 weapon damage.", passive: "", special: "",
      fortitude: "", resilience: "", movement: "", tags: "melee", flavor: "", reachBonus: "0",
      uses: "", slotCost: "1", isModular: "false", quantity: "1"
    }
  },
  conditions: {
    label: "Conditions",
    filename: "essence-conditions-template.csv",
    columns: [
      "name", "section1_label", "section1_html", "section2_label", "section2_html",
      "section3_label", "section3_html"
    ],
    example: {
      name: "Example Condition", section1_label: "EFFECT", section1_html: "Movement -1.",
      section2_label: "DURATION", section2_html: "Until treated.", section3_label: "", section3_html: ""
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

function equipmentRowToSystem(row) {
  return {
    category: row.category || "gear",
    slot: row.slot || "armory",
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
    isModular: /^(true|1|yes)$/i.test(row.isModular || ""),
    quantity: row.quantity ? Number(row.quantity) : 1
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

/**
 * Bulk-creates or bulk-updates (matched by name, case-sensitive) Combat Cards, Equipment, or
 * Conditions from an uploaded CSV, using the same downloadable-template pattern as any other
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
    context.templates = Object.entries(TEMPLATES).map(([key, cfg]) => ({ key, label: cfg.label }));
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

  static async #onRunImport() {
    if (!canCreateContent()) {
      ui.notifications.error("You don't have permission to create content (Foundry's \"Create Items\" permission).");
      return;
    }
    if (!this.#parsed?.records?.length) return;

    const key = this.#templateKey;
    const errors = [];
    let created = 0, updated = 0;

    if (key === "cards") {
      const packs = {
        action: game.packs.get("essence-system.action-cards"),
        reaction: game.packs.get("essence-system.reaction-cards")
      };
      const unlocked = await EssenceBulkImport.#unlockAll(Object.values(packs));
      const existing = {
        action: await packs.action.getDocuments(),
        reaction: await packs.reaction.getDocuments()
      };
      for (const [i, row] of this.#parsed.records.entries()) {
        const kind = (row.kind || "").toLowerCase();
        if (kind !== "action" && kind !== "reaction") {
          errors.push({ row: i + 2, message: `kind must be "action" or "reaction", got "${row.kind}"` });
          continue;
        }
        if (!row.name) { errors.push({ row: i + 2, message: "missing name" }); continue; }
        const type = kind === "action" ? "action-card" : "reaction-card";
        const pack = packs[kind];
        const match = existing[kind].find((d) => d.name === row.name);
        const system = cardRowToSystem(row);
        if (match) { await match.update({ system }); updated++; }
        else {
          const [doc] = await Item.createDocuments(
            [{ name: row.name, type, img: "icons/svg/card-hand.svg", system }],
            { pack: pack.collection }
          );
          existing[kind].push(doc);
          created++;
        }
      }
      await EssenceBulkImport.#restoreLocks(unlocked);
    } else if (key === "equipment") {
      const pack = game.packs.get("essence-system.equipment");
      const unlocked = await EssenceBulkImport.#unlockAll([pack]);
      const existing = await pack.getDocuments();
      for (const [i, row] of this.#parsed.records.entries()) {
        if (!row.name) { errors.push({ row: i + 2, message: "missing name" }); continue; }
        const system = equipmentRowToSystem(row);
        const match = existing.find((d) => d.name === row.name);
        if (match) { await match.update({ system }); updated++; }
        else {
          const [doc] = await Item.createDocuments(
            [{ name: row.name, type: "equipment", img: "icons/svg/item-bag.svg", system }],
            { pack: pack.collection }
          );
          existing.push(doc);
          created++;
        }
      }
      await EssenceBulkImport.#restoreLocks(unlocked);
    } else if (key === "conditions") {
      const pack = game.packs.get("essence-system.conditions");
      const unlocked = await EssenceBulkImport.#unlockAll([pack]);
      const existing = await pack.getDocuments();
      for (const [i, row] of this.#parsed.records.entries()) {
        if (!row.name) { errors.push({ row: i + 2, message: "missing name" }); continue; }
        const system = conditionRowToSystem(row);
        const match = existing.find((d) => d.name === row.name);
        if (match) { await match.update({ system }); updated++; }
        else {
          const [doc] = await Item.createDocuments(
            [{ name: row.name, type: "condition", img: "icons/svg/skull.svg", system }],
            { pack: pack.collection }
          );
          existing.push(doc);
          created++;
        }
      }
      await EssenceBulkImport.#restoreLocks(unlocked);
    }

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
