// Pulls the live Essence content tables (combat_cards, condition_cards, equipment_cards)
// out of the Neon "Essence" Postgres project and caches them locally for build-packs.mjs.
//
// Connection string resolution order:
//   1. DATABASE_URL env var
//   2. ../../ /_repo/.env.api next to this repo (the web app's own local dev credentials)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.dirname(fileURLToPath(import.meta.url)) + "/..";
const CACHE_DIR = path.join(ROOT, "scripts", ".cache");

const WEB_APP_ENV_FILE = "C:/Users/shane/Downloads/Essence System/_repo/.env.api";

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  if (fs.existsSync(WEB_APP_ENV_FILE)) {
    const line = fs.readFileSync(WEB_APP_ENV_FILE, "utf8").split("\n").find((l) => l.startsWith("DATABASE_URL="));
    if (line) return line.slice("DATABASE_URL=".length).trim();
  }
  throw new Error(`No DATABASE_URL found. Set it as an env var, or make sure ${WEB_APP_ENV_FILE} exists.`);
}

async function main() {
  const client = new pg.Client({ connectionString: resolveDatabaseUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const queries = {
    "raw-combat-cards.json": "select id, kind, name, skill, rank, data from combat_cards order by name",
    "raw-condition-cards.json": "select id, name, data from condition_cards order by name",
    "raw-equipment-cards.json": "select id, category, name, data from equipment_cards order by name"
  };

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  for (const [file, sql] of Object.entries(queries)) {
    const { rows } = await client.query(sql);
    fs.writeFileSync(path.join(CACHE_DIR, file), JSON.stringify([{ rows }], null, 2));
    console.log(`Fetched ${rows.length} rows -> scripts/.cache/${file}`);
  }

  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
