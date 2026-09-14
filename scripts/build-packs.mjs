// Pulls card/equipment content (fetched live from the Neon "Essence" Postgres project)
// out of scripts/raw-*.json and rebuilds the Foundry compendium source + LevelDB packs.
// Re-run `node scripts/build-packs.mjs` any time the game data changes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const SOURCE_DIR = path.join(ROOT, "packs/_source");

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Deterministic 16-char id for hand-authored content (species/heritages/distinctions) that has no DB row id. */
function stableId(seed) {
  return createHash("md5").update(seed).digest("hex").slice(0, 16);
}

/**
 * Builds transferred Active Effects for an Item source doc — Foundry's own mechanism for "this
 * owned Item changes these Actor fields while equipped/active," applied automatically by core
 * with no custom code needed on our end. Only used for effects that are genuinely a flat,
 * unconditional stat change (see part-iv-combat.md's Condition/Distinction text) — anything
 * trigger-based or conditional stays as reminder text on the sheet instead (see the "Conditions"
 * section of character-sheet.hbs), since Active Effects can't express "at the end of your turn"
 * or "the first time you use X."
 * @param {string} itemId
 * @param {Array<{label: string, key: string, mode: number, value: string}>} list
 */
function activeEffects(itemId, list) {
  return list.map(({ label, key, mode, value }) => {
    const effectId = stableId(`effect:${itemId}:${key}:${label}`);
    return {
      _id: effectId,
      _key: `!items.effects!${itemId}.${effectId}`,
      name: label,
      img: "icons/svg/upgrade.svg",
      changes: [{ key, mode, value: String(value), priority: 20 }],
      disabled: false,
      transfer: true,
      duration: {},
      origin: null,
      flags: {}
    };
  });
}

/** Foundry's Active Effect application modes — see CONST.ACTIVE_EFFECT_MODES. */
const AE_ADD = 2;

/**
 * Only Conditions with a genuinely flat, unconditional stat change get an Active Effect; the
 * rest (bleed/burn damage at end of turn, one-shot "next Action" penalties, etc.) are reminder
 * text only, per part-iv-combat.md's Conditions section — see the comment on activeEffects().
 */
const CONDITION_EFFECTS = {
  CHILLED: [{ label: "Chilled: Movement -2", key: "system.movement", mode: AE_ADD, value: -2 }]
};

function loadRows(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", ".cache", file), "utf8"));
  return raw[0].rows;
}

/**
 * Minimal RFC 4180 CSV parser — same logic as bulk-import.mjs's parseCsv/rowsToObjects (duplicated
 * rather than imported since that module is a Foundry client ApplicationV2 class that references
 * `foundry.applications.api` at load time and can't run under plain Node). Used to read the
 * hand-authored playtest combat-card CSVs in scripts/combat-cards/ — see PLAYTEST_CARD_FILES below.
 */
function loadCombatCardCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8");
  const rows = [];
  let row = [], field = "", inQuotes = false;
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') { if (s[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const dataRows = rows.filter((r) => r.some((f) => f.trim() !== ""));
  const header = dataRows[0].map((h) => h.trim());
  return dataRows.slice(1).map((r) => {
    const obj = {};
    header.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); });
    return obj;
  });
}

function writeSourceDoc(packName, doc, collection = "items") {
  const dir = path.join(SOURCE_DIR, packName);
  fs.mkdirSync(dir, { recursive: true });
  // Required by @foundryvtt/foundryvtt-cli's compilePack: identifies the doc's collection + id in the LevelDB key.
  doc._key = `!${collection}!${doc._id}`;
  fs.writeFileSync(path.join(dir, `${slugify(doc.name)}_${doc._id}.json`), JSON.stringify(doc, null, 2));
}

/**
 * The 9 Combat Skills, same fixed set item-sheet.mjs's COMBAT_SKILLS uses (capitalized, matching
 * how system.skill is actually stored on every card — see that file's comment on the casing
 * gotcha found during the Phase 1 live-verification pass; don't reintroduce a lowercase mismatch
 * here).
 */
const COMBAT_SKILLS_FOR_FOLDERS = ["Prowess", "Ballistics", "Gestalt", "Cunning", "Magecraft", "Psionics", "Leadership", "Ritualism", "Calling"];
/** Folder for skill-less universal cards (Hide, Strike, Brace, etc. — system.skill === ""). */
const BASIC_FOLDER_NAME = "Basic";

/**
 * Writes one Folder document per Combat Skill (plus "Basic") into the given pack, so
 * action-cards/reaction-cards browse grouped by skill in the compendium sidebar instead of as one
 * flat 194/67-item list. Foundry Folders belong to exactly one pack — they can't be shared across
 * action-cards and reaction-cards even though the skill names repeat — so this is called once per
 * pack and returns that pack's own skill-name -> folder-_id map for cardToItem to assign.
 * stableId() keeps folder ids deterministic across re-runs so they don't churn for no reason.
 * Minimal Folder source-doc shape per Foundry v14's schema: `type` here is the type of documents
 * the folder contains ("Item"), not the folder's own document type.
 */
function writeCombatSkillFolders(packName) {
  const map = {};
  for (const skill of [...COMBAT_SKILLS_FOR_FOLDERS, BASIC_FOLDER_NAME]) {
    const _id = stableId(`folder:${packName}:${skill}`);
    writeSourceDoc(packName, {
      _id,
      name: skill,
      type: "Item",
      folder: null,
      sorting: "a",
      color: null,
      flags: {}
    }, "folders");
    map[skill] = _id;
  }
  return map;
}

/** Every EssenceEquipmentData `category` value — order controls folder sort. "ranged" is its own
 *  assembled-item folder as of 2026-09-14 (previously folded into "weapon"; mapCategory() below
 *  still only ever produces "weapon" for legacy raw data, since no legacy source data used the
 *  distinct assembled category — the playtest catalog's Launcher/Payload chassis/fittings already
 *  carry `category: "ranged"` directly, bypassing mapCategory entirely). */
const EQUIPMENT_CATEGORIES_FOR_FOLDERS = ["weapon", "ranged", "armor", "shield", "implement", "toolkit", "consumable-kit", "gear"];
/**
 * Chassis/Fitting/Augment used to be their own separate (always-empty — there's no pre-authored
 * content for them, players build their own via the modular equipment system) compendium packs;
 * folded into "equipment" as three more top-level folders instead, so a GM authoring a reusable
 * Chassis/Fitting/Augment template via the Item Creation Wizard (content-wizard.mjs) has one
 * shared library instead of four mostly-empty compendium tabs. These never collide with
 * EQUIPMENT_CATEGORIES_FOR_FOLDERS's values since mapCategory() never returns them.
 */
const COMPONENT_TYPES_FOR_FOLDERS = ["chassis", "fitting", "augment"];

/**
 * Same purpose as writeCombatSkillFolders but keyed by Equipment's `category` field (weapon/armor/
 * shield/implement/toolkit/consumable-kit/gear — see item-card.mjs) instead of Combat Skill —
 * Equipment has no skill of its own. Folder names are capitalized (each hyphenated word, e.g.
 * "Consumable Kit") for display even though the stored category values stay lowercase/hyphenated.
 */
function writeCategoryFolders(packName, categories) {
  const map = {};
  for (const category of categories) {
    const _id = stableId(`folder:${packName}:${category}`);
    const name = category.split("-").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
    writeSourceDoc(packName, {
      _id,
      name,
      type: "Item",
      folder: null,
      sorting: "a",
      color: null,
      flags: {}
    }, "folders");
    map[category] = _id;
  }
  return map;
}

/**
 * The Neon "Essence" database's card builder stores each card's cheapest (cost-1) Surge as a
 * plain Body line with a bare numeric label ("1") instead of a real Surges-array entry — every
 * other Surge (cost 2+) comes through correctly. Confirmed across 10 cards during a compendium
 * audit (Collapsing Weight, Warp the Footing, Read the Body, Close Burst, Punish the Opening,
 * Dividing Wall, Gravity Lance, Catch the Tell, Warp Aside, Snap Shot) — this is a source-data
 * quirk in every one of them, not a one-off typo, so it's normalized here rather than hand-fixed
 * per card (which a future Neon re-sync would just reintroduce).
 */
function extractMisplacedSurges(body, surges) {
  const extracted = [];
  const cleanBody = [];
  for (const line of body || []) {
    if (/^\d+$/.test((line.label || "").trim())) extracted.push({ n: line.label.trim(), html: line.html || "" });
    else cleanBody.push(line);
  }
  return { body: cleanBody, surges: [...extracted, ...(surges || [])] };
}

function cardToItem(row, type, folderMap) {
  const d = row.data;
  const { body, surges } = extractMisplacedSurges(d.body, d.surges);
  const skill = d.skill || row.skill || "";
  return {
    _id: row.id.replace(/-/g, "").slice(0, 16),
    name: row.name,
    type,
    img: "icons/svg/card-hand.svg",
    system: {
      domain: d.domain || "physical",
      rank: Number(d.rank) || 0,
      style: d.style || "",
      subtype: d.subtype || "",
      attr: d.attr || "",
      skill,
      defense: d.defense || "",
      min: String(d.min ?? ""),
      cost: String(d.cost ?? ""),
      expertises: d.expertises || "",
      expertisesMode: d.expertises_mode || "any",
      tags: d.tags || "",
      flavor: d.flavor || "",
      body: body.map((b) => ({ label: b.label || "", html: b.html || "" })),
      surges: surges.map((s) => ({ n: String(s.n ?? "1"), html: s.html || "" })),
      rider: { title: d.rider?.title || "", html: d.rider?.html || "", meta: d.rider?.meta || "" }
    },
    // Grouped by Combat Skill in the compendium sidebar (see writeCombatSkillFolders) — skill-less
    // universal cards (Hide, Strike, Brace, etc.) fall into the "Basic" folder.
    folder: folderMap ? (folderMap[skill] ?? folderMap[BASIC_FOLDER_NAME] ?? null) : null,
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * The 396-card Rank 0-2 playtest catalogue (PLAYTEST_RULES.md) replacing the previous
 * Neon-sourced Style catalogue — hand-authored per domain/type as CSV in scripts/combat-cards/,
 * using the exact same column shape as bulk-import.mjs's downloadable templates (so the same CSV
 * a GM fills out by hand for a one-off homebrew card is also this catalogue's own source format).
 * `Basic` (skill-less) universal cards are NOT part of this set (see PLAYTEST_RULES.md §2 — "The
 * set excludes... the universal Basic set") and keep coming from raw-combat-cards.json as before.
 */
function bodyFromCsvRow(row) {
  const body = [];
  if (row.target_html) body.push({ label: row.target_label || "Target", html: row.target_html });
  if (row.effect_html) body.push({ label: row.effect_label || "Effect", html: row.effect_html });
  return body;
}

function surgesFromCsvRow(row) {
  const surges = [];
  if (row.surge1_html) surges.push({ n: row.surge1_n || "1", html: row.surge1_html });
  if (row.surge2_html) surges.push({ n: row.surge2_n || "1", html: row.surge2_html });
  return surges;
}

function playtestCardCsvToItem(row, type, folderMap) {
  const skill = row.skill || "";
  const system = {
    domain: row.domain || "physical",
    rank: Number(row.rank) || 0,
    style: row.style || "",
    subtype: row.subtype || "",
    attr: row.attr || "",
    skill,
    defense: row.defense || "",
    min: row.min || "",
    cost: row.cost || "",
    expertises: row.expertises || "",
    expertisesMode: row.expertises_mode || "any",
    tags: row.tags || "",
    flavor: row.flavor || "",
    body: bodyFromCsvRow(row),
    surges: surgesFromCsvRow(row),
    rider: { title: row.rider_title || "", html: row.rider_html || "", meta: row.rider_meta || "" }
  };
  return {
    _id: stableId(`playtest-card:${type}:${row.name}`).slice(0, 16),
    name: row.name,
    type,
    img: "icons/svg/card-hand.svg",
    system,
    folder: folderMap ? (folderMap[skill] ?? folderMap[BASIC_FOLDER_NAME] ?? null) : null,
    flags: {},
    ownership: { default: 0 }
  };
}

/** [filename in scripts/combat-cards/, "action" | "reaction"] — see loadCombatCardCsv(). */
const PLAYTEST_CARD_FILES = [
  ["mental-actions.csv", "action"], ["mental-reactions.csv", "reaction"],
  ["physical-actions.csv", "action"], ["physical-reactions.csv", "reaction"],
  ["spiritual-actions.csv", "action"], ["spiritual-reactions.csv", "reaction"]
];

function conditionToItem(row) {
  const d = row.data;
  const _id = row.id.replace(/-/g, "").slice(0, 16);
  return {
    _id,
    name: row.name,
    type: "condition",
    img: "icons/svg/skull.svg",
    system: {
      sections: (d.sections || []).map((s) => ({ label: s.label || "", html: s.html || "" }))
    },
    effects: activeEffects(_id, CONDITION_EFFECTS[row.name] || []),
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

function equipmentToItem(row, folderMap) {
  const d = row.data;
  const category = mapCategory(row.category || d.category);
  return {
    _id: row.id.replace(/-/g, "").slice(0, 16),
    name: row.name,
    type: "equipment",
    img: "icons/svg/item-bag.svg",
    system: {
      category,
      slot: "armory",
      tier: d.tier ?? null,
      type: d.type || "",
      cost: String(d.cost ?? ""),
      range: d.range || "",
      effect: d.effect || "",
      passive: d.passive || "",
      special: d.special || "",
      fortitude: String(d.fortitude ?? ""),
      resilience: String(d.resilience ?? ""),
      movement: String(d.movement ?? ""),
      tags: d.tags || "",
      flavor: d.flavor || "",
      reachBonus: 0,
      uses: d.uses ?? null,
      slotCost: 1,
      isModular: !!d.isModular,
      quantity: 1
    },
    // Grouped by category in the compendium sidebar (see writeCategoryFolders) — Equipment has no
    // Combat Skill of its own to group by like Action/Reaction Cards do.
    folder: folderMap ? (folderMap[category] ?? null) : null,
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * Hand-authored Equipment not yet in the Neon "Essence" database (see scripts/extra-equipment-data.json)
 * — same _id-stability approach as species/heritages/distinctions, so these survive a full
 * `node scripts/build-packs.mjs` re-run even though they don't come from raw-equipment-cards.json.
 */
function extraEquipmentToItem(e, folderMap) {
  const _id = stableId(`equipment:${e.name}`);
  const category = mapCategory(e.category);
  return {
    _id,
    name: e.name,
    type: "equipment",
    img: "icons/svg/item-bag.svg",
    system: {
      category,
      slot: "armory",
      tier: e.tier ?? null,
      type: e.type || "",
      cost: String(e.cost ?? ""),
      range: e.range || "",
      effect: e.effect || "",
      passive: e.passive || "",
      special: e.special || "",
      fortitude: String(e.fortitude ?? ""),
      resilience: String(e.resilience ?? ""),
      movement: String(e.movement ?? ""),
      tags: e.tags || "",
      flavor: e.flavor || "",
      reachBonus: 0,
      uses: e.uses ?? null,
      slotCost: 1,
      isModular: !!e.isModular,
      quantity: 1
    },
    folder: folderMap ? (folderMap[category] ?? null) : null,
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * Playtest draft 0.1 catalog (2026-09-13, "Essence_Equipment_Catalog") — 30 Chassis + 30 Fittings
 * + 24 Augments (12 Support + 12 Function) replacing the 26 flat combat-equipment rows that used
 * to come from raw-equipment-cards.json/extra-equipment-data.json (see the `wants("equipment")`
 * block below: weapon/armor/shield/implement rows from both those sources are now skipped —
 * migrated 1:1 into this catalog per its own migration ledger — while toolkit/consumable-kit/gear
 * rows from the same two sources are untouched, since the catalog explicitly leaves those alone).
 * Source data lives in scripts/component-catalog-data.json, hand-built from the catalog
 * spreadsheet/doc (stableId() keeps every id deterministic across re-runs, same convention as
 * extraEquipmentToItem above).
 */
function chassisToItem(c, folderMap) {
  const _id = stableId(`chassis:${c.id}`);
  return {
    _id,
    name: c.name,
    type: "chassis",
    img: "icons/svg/shield.svg",
    system: {
      category: c.category,
      slot: "armory",
      tier: c.tier,
      fortitude: c.fortitude || "",
      resilience: c.resilience || "",
      movement: c.movement || "",
      effect: c.effect || "",
      passive: "",
      special: c.special || "",
      flavor: c.flavor || "",
      grantsEquipmentCard: !!c.grantsEquipmentCard,
      mounts: Array.from({ length: c.mountCount || 1 }, () => ({ linkedWith: null })),
      compatibleFittingCategory: c.compatibleFittingCategory || ""
    },
    folder: folderMap ? (folderMap["chassis"] ?? null) : null,
    flags: {},
    ownership: { default: 0 }
  };
}

function fittingToItem(f, folderMap) {
  const _id = stableId(`fitting:${f.id}`);
  return {
    _id,
    name: f.name,
    type: "fitting",
    img: "icons/svg/item-bag.svg",
    system: {
      category: f.category,
      slot: "armory",
      tier: f.tier,
      fortitude: f.fortitude || "",
      resilience: f.resilience || "",
      movement: f.movement || "",
      effect: f.effect || "",
      passive: "",
      special: f.special || "",
      flavor: f.flavor || "",
      grantsEquipmentCard: !!f.grantsEquipmentCard,
      handedness: f.handedness || "",
      rangeModifier: f.rangeModifier || "",
      reconfigureCategory: f.reconfigureCategory || "simple",
      reconfigureCostOverride: null
    },
    folder: folderMap ? (folderMap["fitting"] ?? null) : null,
    flags: {},
    ownership: { default: 0 }
  };
}

function augmentToItem(a, folderMap) {
  const _id = stableId(`augment:${a.id}`);
  return {
    _id,
    name: a.name,
    type: "augment",
    img: "icons/svg/upgrade.svg",
    system: {
      kind: a.kind,
      compatibility: a.compatibility || "Any",
      uses: a.uses ?? null,
      usesRemaining: a.uses ?? null,
      effect: (a.effect || "") + (a.special || ""),
      flavor: a.flavor || ""
    },
    folder: folderMap ? (folderMap["augment"] ?? null) : null,
    flags: {},
    ownership: { default: 0 }
  };
}

function speciesToItem(s) {
  return {
    _id: stableId(`species:${s.name}`),
    name: s.name,
    type: "species",
    img: "icons/svg/wing.svg",
    system: {
      description: s.description,
      nature: s.nature,
      adaptationLabel: s.adaptationLabel,
      adaptationCount: s.adaptationCount,
      // subChoice passed through verbatim when present (see item-origin.mjs's subChoiceField()) —
      // defaults to {label:"",type:"none",options:[],count:1,selected:[]} via the schema itself
      // when an adaptation's origin-data.json entry has no subChoice at all, so omitting it here
      // for adaptations without one is safe.
      adaptations: s.adaptations.map((a) => ({ name: a.name, text: a.text, chosen: false, ...(a.subChoice ? { subChoice: a.subChoice } : {}) })),
      subspecies: s.subspecies || []
    },
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

function heritageToItem(h) {
  return {
    _id: stableId(`heritage:${h.name}`),
    name: h.name,
    type: "heritage",
    img: "icons/svg/house.svg",
    system: { description: h.description, legacy: h.legacy, familiarity: h.familiarity },
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

function distinctionToItem(d) {
  const _id = stableId(`distinction:${d.name}`);
  return {
    _id,
    name: d.name,
    type: "distinction",
    img: "icons/svg/star.svg",
    system: {
      description: d.description,
      keyCombatSkill: d.keyCombatSkill,
      primaryAttr: d.primaryAttr,
      unlocks: d.unlocks || "",
      benefit: d.benefit,
      // Structured counterpart to `benefit`'s prose — see item-origin.mjs's schema comment — read
      // by the Character Creation Wizard to raise its Expertise/Combat Card budgets at creation.
      creationExpertiseBonus: d.creationExpertiseBonus || 0,
      creationActionCardBonus: d.creationActionCardBonus || 0,
      origin: d.origin
    },
    // Only a flat, unconditional stat change goes here (see activeEffects()'s comment) — the
    // rest of each Distinction's origin trait is behavioral and stays as the reminder text
    // already shown in its Origin card on the sheet (system.origin.text above).
    effects: activeEffects(_id, (d.effects || []).map((e) => ({ ...e, mode: AE_ADD }))),
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

/** Icon per Calling Full Manifestation subtype — plain Foundry-core svg, matching every other
 *  pack's approach (skull.svg for Conditions, item-bag.svg for Equipment, etc.). */
const MANIFESTATION_ICONS = {
  Familiar: "icons/svg/wing.svg",
  Sprite: "icons/svg/light.svg",
  Beast: "icons/svg/blood.svg",
  Phantom: "icons/svg/invisible.svg",
  Golem: "icons/svg/mountain.svg",
  Elemental: "icons/svg/fire.svg",
  Ancestor: "icons/svg/holy-shield.svg",
  Fey: "icons/svg/moon.svg"
};

/**
 * One of a Full Manifestation profile's 2-3 built-in maneuvers, authored as a plain action-card/
 * reaction-card Item — the same schema the 396-card catalogue uses (see bulk-import.mjs's
 * cardRowToSystem) — so the existing card-rendering sheet UI, roll flow and dice-pool prompt all
 * work on these unmodified. `skill`/`style` are always "Calling" and `subtype` is the profile name,
 * matching how a catalogue card that triggers this profile's Full Manifestation Rider is tagged
 * (see e.g. "Bare Tooth and Claw"'s subtype "Beast"). `tags: "Manifestation"` marks these as not
 * part of the 396-card catalogue (CALLING_PROFILES.md's own count exclusion) so Bulk Import and any
 * future catalogue-wide tooling can filter them out by tag rather than by pack membership alone.
 * Per CALLING_PROFILES.md's shared manifestation procedure: no Expertise is required and no
 * Mastery Surge is granted, dice math uses the CALLER's own Calling Rank and Attribute (never a
 * stat on this template Actor), and a maneuver has no subtype Rider and cannot itself start
 * another Full Manifestation — `expertises`/`rider` are therefore always left blank.
 */
function manifestationManeuverToItem(m, profileName, rank, actorId) {
  const type = m.kind === "reaction" ? "reaction-card" : "action-card";
  const body = [{ label: "Target", html: m.target }];
  if (m.kind === "reaction") body.push({ label: "Trigger", html: m.trigger });
  body.push({ label: "Effect", html: m.effect });
  const itemId = stableId(`manifestation-maneuver:${profileName}:${m.name}`).slice(0, 16);
  return {
    _id: itemId,
    // Nested embedded docs need their own _key too (!<parentCollection>.<embeddedCollection>!<parentId>.<id>)
    // — see guideToJournal's identical note for JournalEntry pages; here the parent is the Actor
    // and the embedded collection is its owned Items.
    _key: `!actors.items!${actorId}.${itemId}`,
    name: m.name,
    type,
    img: "icons/svg/card-hand.svg",
    system: {
      domain: "spiritual",
      rank,
      style: "Calling",
      subtype: profileName,
      attr: m.attr,
      skill: "Calling",
      defense: m.defense || "",
      min: m.min,
      cost: m.mana,
      expertises: "",
      expertisesMode: "any",
      tags: "Manifestation",
      flavor: "",
      body,
      surges: [
        { n: m.surge1n, html: m.surge1 },
        { n: m.surge2n, html: m.surge2 }
      ],
      rider: { title: "", html: "", meta: "" }
    },
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * A Full Manifestation profile, authored as a dedicated "manifestation" Actor type
 * (EssenceManifestationData — see module/data/actor-manifestation.mjs) rather than a generic NPC.
 * A profile has no Species/Heritage/Distinction/Role/Non-Combat/Influence/build-a-monster tooling
 * to show, because none of it applies — every number here comes straight off the printed profile
 * table, not a GM's hand-built stat block, so Fortitude/Composure/Harmony/Resilience/Movement are
 * plain fields instead of the twoLowest()-derived values a Character/NPC uses. This template lives
 * in the "manifestations" compendium; the system auto-clones a copy into the world the first time
 * a character manifests that subtype (see module/apps/manifestation.mjs's getOrCreateProfileActor),
 * and that world copy becomes the character's own persistent record for the rest of the Adventure
 * (see CALLING_PROFILES.md's "one persistent Wound record per subtype").
 *
 * `coreWounds` is sized to the profile's own Wound capacity (3-5, not the usual fixed 5) by
 * slicing the same ["Light","Light","Serious","Serious","Critical"] pattern Apply Damage already
 * assigns by slot index (see utils.mjs's SEVERITY_BY_INDEX) — Apply Damage indexes by position,
 * not by array length, so a shorter track "just works" with the existing Wound-filling code.
 */
function manifestationProfileToActor(profile) {
  const _id = stableId(`manifestation:${profile.name}`).slice(0, 16);
  return {
    _id,
    name: profile.name,
    type: "manifestation",
    img: MANIFESTATION_ICONS[profile.name] ?? "icons/svg/upgrade.svg",
    system: {
      subtype: profile.name,
      rank: profile.rank,
      body: profile.body,
      purpose: profile.purpose,
      traitName: profile.traitName,
      traitText: profile.traitText,
      aspect: "",
      tier: 1,
      fortitude: profile.fortitude,
      composure: profile.composure,
      harmony: profile.harmony,
      resilience: profile.resilience,
      movement: profile.movement,
      coreWounds: Array.from({ length: profile.woundCapacity }, () => ({ filled: false, domain: "", severity: "", condition: "" }))
    },
    items: profile.maneuvers.map((m) => manifestationManeuverToItem(m, profile.name, profile.rank, _id)),
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

function combatStyleToJournal(cs) {
  const list = (items) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
  const content = `
    <p><strong>Domain:</strong> ${cs.domain} &mdash; <strong>Resource:</strong> ${cs.resource} &mdash;
    <strong>Specialty:</strong> ${cs.specialty} &mdash; <strong>Specialty Condition:</strong> ${cs.specialtyCondition}</p>
    <p>${cs.description}</p>
    <h3>${cs.specialty}</h3>
    <p>${cs.specialtyText}</p>
    <h3>Expertises</h3>
    ${list(cs.expertises)}
    ${cs.subtypes.length ? `<h3>Subtypes</h3>${list(cs.subtypes)}` : ""}
  `.trim();
  const entryId = stableId(`combat-style:${cs.name}`);
  const pageId = stableId(`combat-style-page:${cs.name}`);
  return {
    _id: entryId,
    name: cs.name,
    pages: [{
      _id: pageId,
      // Nested embedded docs need their own _key too (!<parentCollection>.<embeddedCollection>!<parentId>.<id>)
      // — see @foundryvtt/foundryvtt-cli's applyHierarchy, which recurses into `pages` for a "journal" doc.
      _key: `!journal.pages!${entryId}.${pageId}`,
      name: cs.name,
      type: "text",
      title: { show: true, level: 1 },
      text: { content, format: 1 },
      ownership: { default: -1 }
    }],
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

function guideToJournal(guide) {
  const entryId = stableId(`guide:${guide.name}`);
  return {
    _id: entryId,
    name: guide.name,
    pages: guide.pages.map((p) => {
      const pageId = stableId(`guide-page:${guide.name}:${p.name}`);
      return {
        _id: pageId,
        _key: `!journal.pages!${entryId}.${pageId}`,
        name: p.name,
        type: "text",
        title: { show: true, level: 1 },
        text: { content: p.content, format: 1 },
        ownership: { default: -1 }
      };
    }),
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

/** Maps a raw source-data category string onto EssenceEquipmentData's `category` enum
 *  (weapon/armor/shield/implement/toolkit/consumable-kit/gear — see item-card.mjs). */
function mapCategory(raw) {
  if (!raw) return "gear";
  if (raw.includes("weapon")) return "weapon";
  if (raw === "armor") return "armor";
  if (raw === "guard" || raw === "shield") return "shield";
  if (raw === "implement") return "implement";
  if (raw === "toolkit") return "toolkit";
  if (raw === "consumable-kit") return "consumable-kit";
  return "gear";
}

/**
 * `--only=pack-a,pack-b` scopes a run to just those pack(s) — both which source docs get written
 * and which packs get recompiled — leaving every other pack's `_source` and compiled LevelDB store
 * untouched. Added for the action-cards/reaction-cards Folder-grouping change so a re-run doesn't
 * unnecessarily rewrite unrelated packs (species/equipment/etc.) that happen to share this script.
 * Omit the flag to build everything, exactly as before.
 */
const ONLY = process.argv.slice(2).find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const wants = (packName) => !ONLY || ONLY.includes(packName);

async function main() {
  if (ONLY) {
    for (const packName of ONLY) fs.rmSync(path.join(SOURCE_DIR, packName), { recursive: true, force: true });
  } else {
    fs.rmSync(SOURCE_DIR, { recursive: true, force: true });
  }

  let actionCount = 0, reactionCount = 0, conditionCount = 0, equipmentCount = 0;
  let speciesCount = 0, heritageCount = 0, distinctionCount = 0, styleCount = 0, guideCount = 0, manifestationCount = 0;

  if (wants("action-cards") || wants("reaction-cards")) {
    const actionCardFolders = writeCombatSkillFolders("action-cards");
    const reactionCardFolders = writeCombatSkillFolders("reaction-cards");

    // Basic (skill-less) universal cards — Hide, Strike, Brace, Dash, etc. — still come from the
    // live Neon "Essence" database as before. Everything ELSE that used to come from that same
    // fetch (the old 9-Style catalogue) is now replaced wholesale by the hand-authored 396-card
    // playtest catalogue below (see PLAYTEST_CARD_FILES/playtestCardCsvToItem) — the hard mechanics
    // rework in PLAYTEST_RULES.md/CALLING_PROFILES.md made a straight content-only re-fetch
    // insufficient, so this filters raw-combat-cards.json down to just the still-current Basics.
    const combatCards = loadRows("raw-combat-cards.json").filter((row) => !(row.data.skill || row.skill));
    for (const row of combatCards) {
      const type = row.kind === "reaction" ? "reaction-card" : "action-card";
      const pack = row.kind === "reaction" ? "reaction-cards" : "action-cards";
      const folderMap = row.kind === "reaction" ? reactionCardFolders : actionCardFolders;
      writeSourceDoc(pack, cardToItem(row, type, folderMap));
      if (type === "action-card") actionCount++; else reactionCount++;
    }

    for (const [file, kind] of PLAYTEST_CARD_FILES) {
      const csvRows = loadCombatCardCsv(path.join(ROOT, "scripts", "combat-cards", file));
      const type = kind === "reaction" ? "reaction-card" : "action-card";
      const pack = kind === "reaction" ? "reaction-cards" : "action-cards";
      const folderMap = kind === "reaction" ? reactionCardFolders : actionCardFolders;
      for (const row of csvRows) {
        if (!row.name) continue;
        writeSourceDoc(pack, playtestCardCsvToItem(row, type, folderMap));
        if (type === "action-card") actionCount++; else reactionCount++;
      }
    }
  }

  if (wants("conditions")) {
    const conditionCards = loadRows("raw-condition-cards.json");
    for (const row of conditionCards) writeSourceDoc("conditions", conditionToItem(row));
    conditionCount = conditionCards.length;
  }

  if (wants("equipment")) {
    const equipmentFolders = writeCategoryFolders("equipment", EQUIPMENT_CATEGORIES_FOR_FOLDERS);
    // Chassis/Fitting/Augment folders (see COMPONENT_TYPES_FOR_FOLDERS) — the playtest catalog
    // below is the first pre-authored content for these types; a GM-authored one (via
    // content-wizard.mjs) lands in these same folders alongside it.
    const componentFolders = writeCategoryFolders("equipment", COMPONENT_TYPES_FOR_FOLDERS);

    // The old flat weapon/armor/shield/implement rows are retired: the playtest catalog below
    // (chassisData/fittingData/augmentData) migrates every one of them 1:1 into a Chassis+Fitting
    // pair per its own migration ledger (see scripts/component-catalog-data.json's `basis` field on
    // each Chassis/Fitting). Only toolkit/consumable-kit/gear rows survive from the old sources —
    // the catalog explicitly leaves Toolkits and Consumable Kits outside this pass (its own D8).
    const MIGRATED_CATEGORIES = new Set(["weapon", "ranged", "armor", "shield", "implement"]);
    const equipmentCards = loadRows("raw-equipment-cards.json")
      .filter((row) => !MIGRATED_CATEGORIES.has(mapCategory(row.category || row.data.category)));
    for (const row of equipmentCards) writeSourceDoc("equipment", equipmentToItem(row, equipmentFolders));

    const extraEquipment = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "extra-equipment-data.json"), "utf8"))
      .filter((e) => !MIGRATED_CATEGORIES.has(mapCategory(e.category)));
    for (const e of extraEquipment) writeSourceDoc("equipment", extraEquipmentToItem(e, equipmentFolders));

    const { chassis, fittings, augments } = JSON.parse(
      fs.readFileSync(path.join(ROOT, "scripts", "component-catalog-data.json"), "utf8")
    );
    for (const c of chassis) writeSourceDoc("equipment", chassisToItem(c, componentFolders));
    for (const f of fittings) writeSourceDoc("equipment", fittingToItem(f, componentFolders));
    for (const a of augments) writeSourceDoc("equipment", augmentToItem(a, componentFolders));

    equipmentCount = equipmentCards.length + extraEquipment.length + chassis.length + fittings.length + augments.length;
  }

  if (wants("species") || wants("heritages") || wants("distinctions")) {
    const origin = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "origin-data.json"), "utf8"));
    if (wants("species")) { for (const s of origin.species) writeSourceDoc("species", speciesToItem(s)); speciesCount = origin.species.length; }
    if (wants("heritages")) { for (const h of origin.heritages) writeSourceDoc("heritages", heritageToItem(h)); heritageCount = origin.heritages.length; }
    if (wants("distinctions")) { for (const d of origin.distinctions) writeSourceDoc("distinctions", distinctionToItem(d)); distinctionCount = origin.distinctions.length; }
  }

  if (wants("combat-styles")) {
    const combatStyles = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "combat-styles-data.json"), "utf8"));
    for (const cs of combatStyles) writeSourceDoc("combat-styles", combatStyleToJournal(cs), "journal");
    styleCount = combatStyles.length;
  }

  if (wants("manifestations")) {
    const profiles = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "calling-profiles-data.json"), "utf8"));
    for (const p of profiles) writeSourceDoc("manifestations", manifestationProfileToActor(p), "actors");
    manifestationCount = profiles.length;
  }

  if (wants("guide")) {
    const guides = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "guide-data.json"), "utf8"));
    for (const g of guides) writeSourceDoc("guide", guideToJournal(g), "journal");
    guideCount = guides.length;
  }

  console.log(`Source docs written: ${actionCount} action cards, ${reactionCount} reaction cards, ${conditionCount} conditions, ${equipmentCount} equipment, ${speciesCount} species, ${heritageCount} heritages, ${distinctionCount} distinctions, ${styleCount} combat styles, ${manifestationCount} manifestation profiles, ${guideCount} guide entries.`);

  const packTypes = {
    "action-cards": "Item", "reaction-cards": "Item", conditions: "Item", equipment: "Item",
    species: "Item", heritages: "Item", distinctions: "Item",
    "combat-styles": "JournalEntry", guide: "JournalEntry",
    manifestations: "Actor"
  };
  for (const [packName, type] of Object.entries(packTypes)) {
    if (!wants(packName)) continue;
    const srcDir = path.join(SOURCE_DIR, packName);
    const outDir = path.join(ROOT, "packs", packName);
    if (!fs.existsSync(srcDir)) continue;
    fs.rmSync(outDir, { recursive: true, force: true });
    await compilePack(srcDir, outDir, { type });
    console.log(`Packed: ${packName} -> ${outDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
