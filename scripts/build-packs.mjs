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

/** The 4 Equipment categories mapCategory() ever produces — order controls folder sort. */
const EQUIPMENT_CATEGORIES_FOR_FOLDERS = ["weapon", "armor", "shield", "implement", "toolkit", "consumable-kit", "gear"];
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
  let speciesCount = 0, heritageCount = 0, distinctionCount = 0, styleCount = 0, guideCount = 0;

  if (wants("action-cards") || wants("reaction-cards")) {
    const actionCardFolders = writeCombatSkillFolders("action-cards");
    const reactionCardFolders = writeCombatSkillFolders("reaction-cards");

    const combatCards = loadRows("raw-combat-cards.json");
    for (const row of combatCards) {
      const type = row.kind === "reaction" ? "reaction-card" : "action-card";
      const pack = row.kind === "reaction" ? "reaction-cards" : "action-cards";
      const folderMap = row.kind === "reaction" ? reactionCardFolders : actionCardFolders;
      writeSourceDoc(pack, cardToItem(row, type, folderMap));
      if (type === "action-card") actionCount++; else reactionCount++;
    }
  }

  if (wants("conditions")) {
    const conditionCards = loadRows("raw-condition-cards.json");
    for (const row of conditionCards) writeSourceDoc("conditions", conditionToItem(row));
    conditionCount = conditionCards.length;
  }

  if (wants("equipment")) {
    const equipmentFolders = writeCategoryFolders("equipment", EQUIPMENT_CATEGORIES_FOR_FOLDERS);
    // Chassis/Fitting/Augment folders (see COMPONENT_TYPES_FOR_FOLDERS) — no source data writes
    // any items into them here since there's no pre-authored content for those types; they exist
    // so a GM-authored one (via content-wizard.mjs) has somewhere to land.
    writeCategoryFolders("equipment", COMPONENT_TYPES_FOR_FOLDERS);

    const equipmentCards = loadRows("raw-equipment-cards.json");
    for (const row of equipmentCards) writeSourceDoc("equipment", equipmentToItem(row, equipmentFolders));

    const extraEquipment = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "extra-equipment-data.json"), "utf8"));
    for (const e of extraEquipment) writeSourceDoc("equipment", extraEquipmentToItem(e, equipmentFolders));
    equipmentCount = equipmentCards.length + extraEquipment.length;
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

  if (wants("guide")) {
    const guides = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "guide-data.json"), "utf8"));
    for (const g of guides) writeSourceDoc("guide", guideToJournal(g), "journal");
    guideCount = guides.length;
  }

  console.log(`Source docs written: ${actionCount} action cards, ${reactionCount} reaction cards, ${conditionCount} conditions, ${equipmentCount} equipment, ${speciesCount} species, ${heritageCount} heritages, ${distinctionCount} distinctions, ${styleCount} combat styles, ${guideCount} guide entries.`);

  const packTypes = {
    "action-cards": "Item", "reaction-cards": "Item", conditions: "Item", equipment: "Item",
    species: "Item", heritages: "Item", distinctions: "Item",
    "combat-styles": "JournalEntry", guide: "JournalEntry"
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
