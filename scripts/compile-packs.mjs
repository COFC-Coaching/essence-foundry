// Compiles packs/_source/<pack>/ into packs/<pack>/ (LevelDB) WITHOUT regenerating the source
// docs from Neon. build-packs.mjs does both, but its source step needs scripts/.cache/raw-*.json,
// which a fresh clone doesn't have. Use this after a hand edit to a `_source` JSON (a rules-text
// fix, a hand-authored card), and keep build-packs.mjs's own hand-authored lists in step so the
// next full rebuild reproduces the same docs.
//
//   node scripts/compile-packs.mjs --only=conditions,action-cards
//   node scripts/compile-packs.mjs            (every pack with a _source folder)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compilePack } from "@foundryvtt/foundryvtt-cli";

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const SOURCE_DIR = path.join(ROOT, "packs/_source");

const PACK_TYPES = {
  "action-cards": "Item", "reaction-cards": "Item", conditions: "Item", equipment: "Item",
  species: "Item", heritages: "Item", distinctions: "Item",
  "combat-styles": "JournalEntry", guide: "JournalEntry",
  manifestations: "Actor", enemies: "Actor"
};

const ONLY = process.argv.slice(2).find((a) => a.startsWith("--only="))?.slice("--only=".length).split(",") ?? null;
const wants = (name) => !ONLY || ONLY.includes(name);

for (const [packName, type] of Object.entries(PACK_TYPES)) {
  if (!wants(packName)) continue;
  const srcDir = path.join(SOURCE_DIR, packName);
  const outDir = path.join(ROOT, "packs", packName);
  if (!fs.existsSync(srcDir)) continue;
  fs.rmSync(outDir, { recursive: true, force: true });
  await compilePack(srcDir, outDir, { type });
  console.log(`Packed: ${packName} -> ${outDir}`);
}
