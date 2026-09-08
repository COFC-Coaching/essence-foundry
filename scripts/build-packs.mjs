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

function cardToItem(row, type) {
  const d = row.data;
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
      skill: d.skill || row.skill || "",
      defense: d.defense || "",
      min: String(d.min ?? ""),
      cost: String(d.cost ?? ""),
      expertises: d.expertises || "",
      expertisesMode: d.expertises_mode || "any",
      tags: d.tags || "",
      flavor: d.flavor || "",
      body: (d.body || []).map((b) => ({ label: b.label || "", html: b.html || "" })),
      surges: (d.surges || []).map((s) => ({ n: String(s.n ?? "1"), html: s.html || "" })),
      rider: { title: d.rider?.title || "", html: d.rider?.html || "", meta: d.rider?.meta || "" }
    },
    folder: null,
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

function equipmentToItem(row) {
  const d = row.data;
  return {
    _id: row.id.replace(/-/g, "").slice(0, 16),
    name: row.name,
    type: "equipment",
    img: "icons/svg/item-bag.svg",
    system: {
      category: mapCategory(row.category || d.category),
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
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * Hand-authored Equipment not yet in the Neon "Essence" database (see scripts/extra-equipment-data.json)
 * — same _id-stability approach as species/heritages/distinctions, so these survive a full
 * `node scripts/build-packs.mjs` re-run even though they don't come from raw-equipment-cards.json.
 */
function extraEquipmentToItem(e) {
  const _id = stableId(`equipment:${e.name}`);
  return {
    _id,
    name: e.name,
    type: "equipment",
    img: "icons/svg/item-bag.svg",
    system: {
      category: mapCategory(e.category),
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
    folder: null,
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
      adaptations: s.adaptations.map((a) => ({ name: a.name, text: a.text, chosen: false })),
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

function mapCategory(raw) {
  if (!raw) return "gear";
  if (raw.includes("weapon")) return "weapon";
  if (raw === "armor") return "armor";
  if (raw === "implement" || raw === "guard" || raw === "toolkit") return "tool";
  return "gear";
}

async function main() {
  fs.rmSync(SOURCE_DIR, { recursive: true, force: true });

  const combatCards = loadRows("raw-combat-cards.json");
  let actionCount = 0, reactionCount = 0;
  for (const row of combatCards) {
    const type = row.kind === "reaction" ? "reaction-card" : "action-card";
    const pack = row.kind === "reaction" ? "reaction-cards" : "action-cards";
    writeSourceDoc(pack, cardToItem(row, type));
    if (type === "action-card") actionCount++; else reactionCount++;
  }

  const conditionCards = loadRows("raw-condition-cards.json");
  for (const row of conditionCards) writeSourceDoc("conditions", conditionToItem(row));

  const equipmentCards = loadRows("raw-equipment-cards.json");
  for (const row of equipmentCards) writeSourceDoc("equipment", equipmentToItem(row));

  const extraEquipment = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "extra-equipment-data.json"), "utf8"));
  for (const e of extraEquipment) writeSourceDoc("equipment", extraEquipmentToItem(e));

  const origin = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "origin-data.json"), "utf8"));
  for (const s of origin.species) writeSourceDoc("species", speciesToItem(s));
  for (const h of origin.heritages) writeSourceDoc("heritages", heritageToItem(h));
  for (const d of origin.distinctions) writeSourceDoc("distinctions", distinctionToItem(d));

  const combatStyles = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "combat-styles-data.json"), "utf8"));
  for (const cs of combatStyles) writeSourceDoc("combat-styles", combatStyleToJournal(cs), "journal");

  const guides = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "guide-data.json"), "utf8"));
  for (const g of guides) writeSourceDoc("guide", guideToJournal(g), "journal");

  console.log(`Source docs written: ${actionCount} action cards, ${reactionCount} reaction cards, ${conditionCards.length} conditions, ${equipmentCards.length + extraEquipment.length} equipment, ${origin.species.length} species, ${origin.heritages.length} heritages, ${origin.distinctions.length} distinctions, ${combatStyles.length} combat styles, ${guides.length} guide entries.`);

  const packTypes = {
    "action-cards": "Item", "reaction-cards": "Item", conditions: "Item", equipment: "Item",
    species: "Item", heritages: "Item", distinctions: "Item", "combat-styles": "JournalEntry",
    guide: "JournalEntry"
  };
  for (const [packName, type] of Object.entries(packTypes)) {
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
