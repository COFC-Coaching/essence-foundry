// Pulls card/equipment content (fetched live from the Neon "Essence" Postgres project)
// out of scripts/raw-*.json and rebuilds the Foundry compendium source + LevelDB packs.
// Re-run `node scripts/build-packs.mjs` any time the game data changes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const SOURCE_DIR = path.join(ROOT, "packs/_source");

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function loadRows(file) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, "scripts", ".cache", file), "utf8"));
  return raw[0].rows;
}

function writeSourceDoc(packName, doc) {
  const dir = path.join(SOURCE_DIR, packName);
  fs.mkdirSync(dir, { recursive: true });
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

  console.log(`Source docs written: ${actionCount} action cards, ${reactionCount} reaction cards, ${conditionCards.length} conditions, ${equipmentCards.length} equipment.`);

  for (const packName of ["action-cards", "reaction-cards", "conditions", "equipment"]) {
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
