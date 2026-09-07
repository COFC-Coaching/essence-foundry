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

function loadRows(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", ".cache", file), "utf8"));
  return raw[0].rows;
}

function writeSourceDoc(packName, doc) {
  const dir = path.join(SOURCE_DIR, packName);
  fs.mkdirSync(dir, { recursive: true });
  // Required by @foundryvtt/foundryvtt-cli's compilePack: identifies the doc's collection + id in the LevelDB key.
  doc._key = `!items!${doc._id}`;
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
  return {
    _id: row.id.replace(/-/g, "").slice(0, 16),
    name: row.name,
    type: "condition",
    img: "icons/svg/skull.svg",
    system: {
      sections: (d.sections || []).map((s) => ({ label: s.label || "", html: s.html || "" }))
    },
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
  return {
    _id: stableId(`distinction:${d.name}`),
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

  const origin = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", "origin-data.json"), "utf8"));
  for (const s of origin.species) writeSourceDoc("species", speciesToItem(s));
  for (const h of origin.heritages) writeSourceDoc("heritages", heritageToItem(h));
  for (const d of origin.distinctions) writeSourceDoc("distinctions", distinctionToItem(d));

  console.log(`Source docs written: ${actionCount} action cards, ${reactionCount} reaction cards, ${conditionCards.length} conditions, ${equipmentCards.length} equipment, ${origin.species.length} species, ${origin.heritages.length} heritages, ${origin.distinctions.length} distinctions.`);

  for (const packName of ["action-cards", "reaction-cards", "conditions", "equipment", "species", "heritages", "distinctions"]) {
    const srcDir = path.join(SOURCE_DIR, packName);
    const outDir = path.join(ROOT, "packs", packName);
    if (!fs.existsSync(srcDir)) continue;
    fs.rmSync(outDir, { recursive: true, force: true });
    await compilePack(srcDir, outDir, { type: "Item" });
    console.log(`Packed: ${packName} -> ${outDir}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
