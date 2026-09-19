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

/**
 * V6 Appendix E "Baseline Fallback Wound Cards — Playtest" (plan §6.4): the nine authoritative
 * fallback Wound Cards, one per Damage domain × severity, attached to a filled Core Wound space by
 * module/utils.mjs#attachWoundCard (matched by exact `name` — keep these in sync with
 * WOUND_CARD_NAMES there). Hand-authored here rather than Neon-sourced, since Wound Cards are new
 * V6 content with no upstream database table — same "hand-authored data hardcoded in this script"
 * pattern already used for species/heritages/distinctions (scripts/origin-data.json), just inlined
 * since there are only nine entries. Only the flat, unconditional half of each effect (the
 * Movement/Composure/Harmony penalty) becomes a real Active Effect; the "1 additional burned die"
 * escalation on every Serious/Critical card, and Physical Critical's "halve Movement" (not a flat
 * additive change), stay reminder text only — this file's own CONDITION_EFFECTS convention above.
 */
const WOUND_CARDS = [
  { domain: "Physical", severity: "Light", name: "Impaired Body",
    effect: "Movement -1 unit.",
    recovery: "Relevant treatment and one appropriate Recovery opportunity.",
    activeEffects: [{ label: "Impaired Body: Movement -1", key: "system.movementBonus", mode: AE_ADD, value: -1 }] },
  { domain: "Physical", severity: "Serious", name: "Debilitated Body",
    effect: "Movement -2 units. The first Physical Action on each of your Turns and first Physical Reaction between your Turns require 1 additional burned die.",
    recovery: "Relevant physical treatment plus post-Adventure Downtime rest and healing, or qualifying active healing. Mid-Adventure Recovery alone is insufficient.",
    activeEffects: [{ label: "Debilitated Body: Movement -2", key: "system.movementBonus", mode: AE_ADD, value: -2 }] },
  { domain: "Physical", severity: "Critical", name: "Catastrophic Injury",
    effect: "Halve Movement, rounded up. Physical Actions and Reactions require 1 additional burned die.",
    recovery: "Stabilize: end ongoing harm and provide appropriate medical treatment or equivalent supernatural aid. Recovery: extended safe treatment appropriate to the injury, or qualifying Critical healing. Exact duration remains to be finalized.",
    activeEffects: [] },
  { domain: "Mental", severity: "Light", name: "Disrupted Mind",
    effect: "-1 Composure.",
    recovery: "A safe opportunity to recover from the cause plus one appropriate Recovery opportunity.",
    activeEffects: [{ label: "Disrupted Mind: Composure -1", key: "system.composureBonus", mode: AE_ADD, value: -1 }] },
  { domain: "Mental", severity: "Serious", name: "Cognitive Trauma",
    effect: "-1 Composure. The first Mental Action on each of your Turns and first Mental Reaction between your Turns require 1 additional burned die.",
    recovery: "Relevant mental care and support plus post-Adventure Downtime rest and healing, or qualifying active healing. Mid-Adventure Recovery alone is insufficient.",
    activeEffects: [{ label: "Cognitive Trauma: Composure -1", key: "system.composureBonus", mode: AE_ADD, value: -1 }] },
  { domain: "Mental", severity: "Critical", name: "Fractured Consciousness",
    effect: "-2 Composure. Mental Actions and Reactions require 1 additional burned die.",
    recovery: "Stabilize: contain the ongoing cognitive or psychic cause and provide appropriate professional, relational, technological, or supernatural support. Recovery: extended safe treatment appropriate to the injury, or qualifying Critical healing. Exact duration remains to be finalized.",
    activeEffects: [{ label: "Fractured Consciousness: Composure -2", key: "system.composureBonus", mode: AE_ADD, value: -2 }] },
  { domain: "Spiritual", severity: "Light", name: "Unmoored Essence",
    effect: "-1 Harmony.",
    recovery: "A stable spiritual environment, anchor, or equivalent support plus one appropriate Recovery opportunity.",
    activeEffects: [{ label: "Unmoored Essence: Harmony -1", key: "system.harmonyBonus", mode: AE_ADD, value: -1 }] },
  { domain: "Spiritual", severity: "Serious", name: "Spiritual Trauma",
    effect: "-1 Harmony. The first Spiritual Action on each of your Turns and first Spiritual Reaction between your Turns require 1 additional burned die.",
    recovery: "Relevant ritual, relational, spiritual, or supernatural care plus post-Adventure Downtime rest and healing, or qualifying active healing. Mid-Adventure Recovery alone is insufficient.",
    activeEffects: [{ label: "Spiritual Trauma: Harmony -1", key: "system.harmonyBonus", mode: AE_ADD, value: -1 }] },
  { domain: "Spiritual", severity: "Critical", name: "Severed Essence",
    effect: "-2 Harmony. Spiritual Actions and Reactions require 1 additional burned die.",
    recovery: "Stabilize: contain the ongoing spiritual cause and establish an appropriate anchor through a person, rite, vessel, place, or equivalent method. Recovery: extended safe treatment appropriate to the injury, or qualifying Critical healing. Exact duration remains to be finalized.",
    activeEffects: [{ label: "Severed Essence: Harmony -2", key: "system.harmonyBonus", mode: AE_ADD, value: -2 }] }
];

function woundCardToItem(wc) {
  const _id = stableId(`wound-card:${wc.domain}:${wc.severity}`).slice(0, 16);
  return {
    _id,
    name: wc.name,
    type: "condition",
    img: "icons/svg/regen.svg",
    system: {
      classification: "wound",
      sections: [
        { label: `WOUND — ${wc.domain} ${wc.severity}`, html: `Wound Condition: <b>${wc.name}</b>.` },
        { label: "EFFECT", html: wc.effect },
        { label: "NATURAL RECOVERY", html: wc.recovery }
      ]
    },
    effects: activeEffects(_id, wc.activeEffects),
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * V6 Appendix F "Baseline Fallback Consequences — Playtest" (plan §6.6): the three authoritative
 * fallback Influence Consequence Cards, one per Core Influence severity (unlike Wound Cards there
 * is no domain axis here — Core Influence is a single severity-only track), attached to a filled
 * Core Influence space by module/utils.mjs#attachConsequenceCard (matched by exact `name` — keep in
 * sync with CONSEQUENCE_CARD_NAMES there). Hand-authored here for the same reason WOUND_CARDS is:
 * this is new V6 content with no upstream Neon table. Only Compromised Standing (Serious) becomes a
 * real Active Effect — it's the one entry that's genuinely unconditional ("Reach as 1 lower
 * generally"); Strained Position (Light) and Crisis of Standing (Critical) are both explicitly
 * SCOPED to "the sphere harmed"/"the primary sphere of collapse," which this file's own
 * activeEffects()/CONDITION_EFFECTS convention reserves for reminder text only, same treatment as
 * Wound Cards' Critical tier.
 */
const CONSEQUENCE_CARDS = [
  { severity: "Light", name: "Strained Position",
    effect: "Choose the sphere harmed by this consequence. Treat Reach as 1 lower (minimum 0) only when that sphere is directly relevant.",
    recovery: "Take a concrete corrective action appropriate to the harm, then receive a suitable Downtime opportunity for the correction to take effect.",
    activeEffects: [] },
  { severity: "Serious", name: "Compromised Standing",
    effect: "Treat Reach as 1 lower generally. In addition, choose one relevant contact, supplier, institution, relationship, or access route that is unavailable until specifically repaired.",
    recovery: "Resolve the specific blocked relationship or obligation and complete a meaningful corrective process. This may require several Downtime opportunities or a focused undertaking.",
    activeEffects: [{ label: "Compromised Standing: Reach -1", key: "system.reachBonus", mode: AE_ADD, value: -1 }] },
  { severity: "Critical", name: "Crisis of Standing",
    effect: "Choose the primary sphere of collapse. Reach cannot absorb ordinary Influence pressure within that sphere; pressure there proceeds directly to Temporary Influence, then Core Influence. One major relationship, institution, or source of access is also unavailable.",
    recovery: "Critical recovery requires a major corrective undertaking appropriate to the cause: repayment, public vindication, fulfilled obligation, restored institution, reconciliation, or a comparable change. Time alone is insufficient.",
    activeEffects: [] }
];

function consequenceCardToItem(cc) {
  const _id = stableId(`consequence-card:${cc.severity}`).slice(0, 16);
  return {
    _id,
    name: cc.name,
    type: "condition",
    img: "icons/svg/degen.svg",
    system: {
      classification: "consequence",
      sections: [
        { label: `INFLUENCE CONSEQUENCE — ${cc.severity}`, html: `Influence Consequence: <b>${cc.name}</b>.` },
        { label: "EFFECT", html: cc.effect },
        { label: "RECOVERY", html: cc.recovery }
      ]
    },
    effects: activeEffects(_id, cc.activeEffects),
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * V6 §6.3 (plan): Cover — Low Cover grants +1 Fortitude, High Cover +2, against whatever attack the
 * Cover could plausibly obstruct; Cover modifies Fortitude only (never Composure/Harmony); creatures
 * don't provide Cover by default; and the attack's source (magical vs mundane) doesn't determine
 * whether Cover applies. Built exactly like WOUND_CARDS/CONSEQUENCE_CARDS above — two Condition
 * Items with a real transferred Active Effect on `system.fortitudeBonus` — per the plan's own
 * explicit recommendation, this reuses the existing Token HUD -> Condition Item pipeline (every
 * entry in this "conditions" pack is auto-registered as a Token HUD status by essence.mjs's "ready"
 * hook) with zero new code. Unlike Wound/Consequence Cards' conditional tiers, this stays a flat,
 * unconditional Active Effect while the Condition is active — Cover is inherently transient and the
 * GM/player toggles it on/off via the Token HUD only while it's actually relevant (the same
 * trust-based convention every other Condition in this system already uses, e.g. Chilled's flat
 * Movement -2 while active), not something that needs per-attack scoping logic.
 */
const COVER_CARDS = [
  { name: "Low Cover", bonus: 1,
    effect: "+1 Fortitude against an attack this Cover could plausibly obstruct. Cover modifies Fortitude only — never Composure or Harmony. Creatures do not provide Cover by default. Whether the attack's source is magical or mundane does not determine whether Cover applies." },
  { name: "High Cover", bonus: 2,
    effect: "+2 Fortitude against an attack this Cover could plausibly obstruct. Cover modifies Fortitude only — never Composure or Harmony. Creatures do not provide Cover by default. Whether the attack's source is magical or mundane does not determine whether Cover applies." }
];

function coverCardToItem(cc) {
  const _id = stableId(`cover:${cc.name}`).slice(0, 16);
  return {
    _id,
    name: cc.name,
    type: "condition",
    img: "icons/svg/shield.svg",
    system: {
      classification: "cover",
      sections: [
        { label: "COVER", html: `Cover: <b>${cc.name}</b>.` },
        { label: "EFFECT", html: cc.effect }
      ]
    },
    effects: activeEffects(_id, [{ label: `${cc.name}: Fortitude +${cc.bonus}`, key: "system.fortitudeBonus", mode: AE_ADD, value: cc.bonus }]),
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * V6's 8 printed "Ordinary Conditions — Playtest" (plan §6.5; exact text confirmed against the
 * revised book, delta report §6: "all eight effect texts are word-for-word identical" between the
 * plan's snapshot and the revision, so this is built straight from the book, no plan-vs-delta
 * reconciliation needed). The Neon-sourced `raw-condition-cards.json` already has entries named
 * BURNING and DAZED (see conditionToItem below) — but their text is V5-era and genuinely
 * contradicts V6 in both cases: Neon's Burning triggers "at the end of your turn" and auto-implies
 * itself from Fire Damage (V6 explicitly says "Fire Damage does not automatically cause Burning");
 * Neon's Dazed reduces the NEXT roll's maximum dice (a roll-limit mechanic V6 doesn't use for this
 * Condition at all) instead of taxing 1 additional burned die. Same "source-data quality" bug class
 * build-history's Recurring bug patterns #4 already documents (10 miscategorized Surges in 0.6.20,
 * stray Effect text in 0.5.12) — fixed the same way: hand-authored here (like WOUND_CARDS above) and
 * excluded from the Neon pass below (`wants("conditions")`), so a future Neon re-sync can't
 * reintroduce the wrong text. Only Restrained's "-1 Fortitude" is a genuinely flat, unconditional
 * stat change per this file's activeEffects()/CONDITION_EFFECTS convention — every other entry's
 * numeric effect is either non-additive (Immobilized's Movement=0 override, Weakened's Damage-dealt
 * reduction, which this schema has no AE target for) or explicitly scoped/conditional (Prone,
 * Blinded, Silenced, Dazed's burned-die tax, Burning's per-Turn Damage), so those stay reminder
 * text only, same treatment WOUND_CARDS' Critical tier and CONSEQUENCE_CARDS' scoped entries get.
 */
const ORDINARY_CONDITIONS = [
  { name: "Blinded",
    effect: "Ordinary sight cannot detect creatures, points, or details farther than 1 unit. Sight-dependent targeting or abilities fail unless another Sense provides the required information. Other Senses can compensate normally.",
    activeEffects: [] },
  { name: "Burning",
    effect: "At the start of your Turn, suffer 1 Physical Fire Damage. During your Turn, you may burn 2 Action dice to extinguish yourself when doing so is physically possible. Appropriate external aid or environmental circumstances can also end Burning.",
    activeEffects: [] },
  { name: "Dazed",
    effect: "The first Action you play on each of your Turns and the first Reaction you play between your Turns each require 1 additional burned die. Dazed never prevents you from acting; it increases the immediate commitment required.",
    activeEffects: [] },
  { name: "Immobilized",
    effect: "Your voluntary Movement is 0 and you cannot gain voluntary extra Movement. You may still take Actions and Reactions normally, and forced movement can still move you unless the source of Immobilized says otherwise.",
    activeEffects: [] },
  { name: "Prone",
    effect: "Standing costs 2 units of Movement. While Prone, your voluntary Movement costs double. You gain +1 Fortitude against physically obstructable attacks originating more than 1 unit away and suffer -1 Fortitude against adjacent physical attacks.",
    activeEffects: [] },
  { name: "Restrained",
    effect: "You cannot voluntarily leave your current space and suffer -1 Fortitude. You can still act, use Reactions, and attack unless the source of the restraint specifically prevents a required limb, item, or other action.",
    activeEffects: [{ label: "Restrained: Fortitude -1", key: "system.fortitudeBonus", mode: AE_ADD, value: -1 }] },
  { name: "Silenced",
    effect: "You cannot speak or intentionally produce a usable voice. Abilities requiring speech, command words, audible performance, or other explicit vocalization cannot be used. Silenced does not prevent non-vocal Actions or Reactions.",
    activeEffects: [] },
  { name: "Weakened",
    effect: "Damage you deal is reduced by 1, minimum 0. This modifies Damage after the card determines its amount but before the target applies Resistance, Vulnerability, Resilience, or Breach.",
    activeEffects: [] }
];

function ordinaryConditionToItem(oc) {
  const _id = stableId(`ordinary-condition:${oc.name}`).slice(0, 16);
  return {
    _id,
    name: oc.name,
    type: "condition",
    img: "icons/svg/skull.svg",
    system: {
      classification: "ordinary",
      sections: [
        { label: "ORDINARY CONDITION", html: `<b>${oc.name}</b>.` },
        { label: "EFFECT", html: oc.effect }
      ]
    },
    effects: activeEffects(_id, oc.activeEffects),
    folder: null,
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * The 9 Specialty Conditions (plan §6.5/Appendix D) already exist as Neon rows by name (STANCE,
 * LOCK, UNSTABLE, EXPOSED, CONCENTRATION, STRAIN, RALLIED, POSSESSED, BROKEN — confirmed against
 * scripts/.cache/raw-condition-cards.json). Used by conditionToItem below purely to tag
 * `classification` so the ~10 other kept-but-not-canonical Conditions (Bleeding, Chilled,
 * Concussed, Corroded, Displaced, Distorted, Punctured, Revealed, Shocked, Withered) read as
 * "other" instead of silently defaulting to "ordinary" — V6 explicitly permits these to exist
 * alongside its 8-item baseline ("deliberately restrictive rather than exhaustive"), so they're
 * kept, just correctly labeled as non-canonical rather than miscategorized as one of the 8.
 */
const SPECIALTY_CONDITION_NAMES = new Set(["STANCE", "LOCK", "UNSTABLE", "EXPOSED", "CONCENTRATION", "STRAIN", "RALLIED", "POSSESSED", "BROKEN"]);

function classifyCondition(name) {
  return SPECIALTY_CONDITION_NAMES.has((name || "").toUpperCase()) ? "specialty" : "other";
}

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
 * The 9 Combat Skills, same fixed set item-sheet.mjs's COMBAT_STYLES uses (capitalized, matching
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
 * The 7 universal V6 Basic Combat Cards (plan §7.2, corrected to 7 by design/v6-revision-delta.md
 * §3.3: Basic Melee Attack, Basic Ranged Attack, Defend, Dash, Reconfigure, Stabilize, and the new
 * Perform Task). `raw-combat-cards.json`'s skill-less rows (Basic Shot, Strike, Brace, Dash,
 * Disengage, Hide, Shove) were checked against this set first — a real content-quality discrepancy
 * was found, not just a naming difference: their `body` text is internally misaligned (e.g. "Basic
 * Shot"'s Effect line describes firing "your sidearm... point-blank," "Strike"'s Target/Effect read
 * as a melee attack under the wrong name, "Hide"'s Effect describes a push/pull with no relation to
 * hiding), the same "source-data quality issue in the Neon-backed compendiums" bug class
 * build-history's Recurring bug patterns #4 flags — this is a fresh, not-yet-discovered instance of
 * it, confirming that note's own prediction. Rather than hand-patch six garbled rows (risking a
 * partial, undiscovered fix) or leave two conflicting "Basic" catalogs (one canon, one broken) live
 * at once, all 7 are hand-authored here with the book's exact "Playtest" text, and the six stale
 * Neon rows are excluded from the skill-less filter below (same pattern as the Burning/Dazed
 * exclusion above) — one authoritative Basic set. Reconfigure already exists as actor-level actions
 * (`reconfigureItem`/`releaseItem`, actor-sheet.mjs, built in Phase 6's 0.6.100) — this Item entry
 * exists so it's represented in the wizard's card-budget/card-browser catalog like every other
 * Basic Card, not to duplicate its mechanic; using it from an Item row still just reads its text.
 */
const BASIC_CARDS = [
  { kind: "action", name: "Basic Melee Attack", domain: "physical", attr: "might", skill: "prowess", defense: "fortitude", min: "2",
    body: [
      { label: "Target", html: "One creature within the Range of a melee Source you can use." },
      { label: "Effect", html: "Roll against Fortitude, committing at least 2 Action dice. The maximum is Might + Prowess, or 2 if that sum is lower. If the Source explicitly permits another Physical Attribute, substitute it for Might. On success, deal 1 Physical Damage of a type appropriate to the Source. An unarmed attack uses Range 1 and can always use Bludgeoning." }
    ],
    surges: [{ n: "2", html: "Deal +1 Damage." }] },
  { kind: "action", name: "Basic Ranged Attack", domain: "physical", attr: "grace", skill: "ballistics", defense: "fortitude", min: "2",
    body: [
      { label: "Target", html: "One creature within the Range of a ranged Source you can use." },
      { label: "Effect", html: "Roll against Fortitude, committing at least 2 Action dice. The maximum is Grace + Ballistics, or 2 if that sum is lower. On success, deal 1 Physical Damage of a type appropriate to the Source." }
    ],
    surges: [{ n: "2", html: "Deal +1 Damage." }] },
  { kind: "reaction", name: "Defend", domain: "physical", attr: "", skill: "", defense: "", min: "2", unopposed: true,
    body: [
      { label: "Trigger", html: "You are targeted by an opposed Action or Reaction." },
      { label: "Effect", html: "Choose the Endurance Attribute of the targeted Defense: Vigor for Fortitude, Resolve for Composure, or Anima for Harmony. Roll at least 2 Reaction dice, up to that Attribute; if the Attribute is 1, your maximum is 2 instead. This Reaction is unopposed. Gain +1 to the targeted Defense against the triggering card." }
    ],
    surges: [{ n: "2", html: "Increase that Defense by an additional +1 against the triggering card." }] },
  { kind: "action", name: "Dash", domain: "physical", attr: "", skill: "", defense: "", min: "2",
    body: [
      { label: "Effect", html: "Burn 2 Action dice to move up to 4 additional units. This movement is voluntary and follows ordinary terrain and movement restrictions. It is in addition to normal Movement for the Turn." }
    ],
    surges: [] },
  { kind: "action", name: "Reconfigure", domain: "physical", attr: "", skill: "", defense: "", min: "3",
    body: [
      { label: "Effect", html: "Burn 3 Action dice. Choose one: ready, stow, recover, or hand over one complete physically accessible combat-ready item; swap one such item you are using for another; or exchange one installed Augment or one combat-replaceable Fitting for a compatible replacement physically available to you. No roll is required." },
      { label: "Effect", html: "This includes drawing into an empty hand, picking up an item within reach, or handing a held item to an adjacent willing creature. A recipient can immediately use it only if the required hands and other handling requirements are already satisfied; any further swap or preparation uses that recipient's own Reconfigure. Prepared items and Temporary Equipment use the same handling procedure without changing their Inventory accounting. Reconfigure cannot reach an item left elsewhere, waive compatibility, or complete major structural rebuilding." }
    ],
    surges: [] },
  { kind: "action", name: "Stabilize", domain: "physical", attr: "", skill: "", defense: "", min: "3", noSurges: true,
    body: [
      { label: "Effect", html: "Burn 3 Action dice while adjacent to a full-track Dying or Stabilized target. You must satisfy the immediate treatment requirements printed by that target's Critical Wound Card. If those requirements are met, Stabilization succeeds automatically. This Action does not heal a Wound and has no Surges." },
      { label: "Effect", html: "Treatment follows the Critical Wound Card. It may require a Medical Toolkit, ritual support, a spiritual anchor, removal of an ongoing cause, another specific tool, or a combination appropriate to the Wound." }
    ],
    surges: [] },
  { kind: "action", name: "Perform Task", domain: "physical", attr: "", skill: "", defense: "", min: "2", nonCombatTask: true, noSurges: true,
    body: [
      { label: "Effect", html: "Burn 2 Action dice. Attempt one ordinary task that can reasonably be performed in a brief action, such as operating a reachable mechanism, opening a lock with suitable tools, or making one step of a repair. You must have the necessary access, tools, and capability. A routine feasible task succeeds without a roll. For meaningful uncertainty, the GM states the Difficulty, result, and foreseeable consequences before you commit." },
      { label: "Effect", html: "If a roll is needed, roll the full relevant Attribute + Non-Combat Skill, or Attribute + 5 for a directly applicable Key Aspect, at the normal card-roll step. This task roll does not consume further Action dice or use a Combat Style maximum. Use the normal Non-Combat success rules; it generates no Surges. Resolve legal Reactions before applying the task result. The two burned Action dice remain spent even if the attempt fails or is interrupted." },
      { label: "Effect", html: "Use Perform Task for meaningful handling of ordinary objects. Ready, recover, stow, swap, or hand over combat equipment with Reconfigure instead. Perform Task cannot replace an attack, Reconfigure, Stabilize, or another defined Action to bypass its costs or requirements. Outside Combat, use the normal task procedure without an Action Pool cost." }
    ],
    surges: [] }
];

/** Neon skill-less "Basic" rows whose stored body text is misaligned/garbled (see BASIC_CARDS'
 *  own doc comment) — excluded so BASIC_CARDS is the sole source of the universal Basic set. */
const STALE_BASIC_CARD_NAMES = ["Basic Shot", "Strike", "Brace", "Dash", "Disengage", "Hide", "Shove"];

function basicCardToItem(bc, folderMap) {
  const type = bc.kind === "reaction" ? "reaction-card" : "action-card";
  const _id = stableId(`basic-card:${bc.name}`).slice(0, 16);
  return {
    _id,
    name: bc.name,
    type,
    img: "icons/svg/card-hand.svg",
    system: {
      domain: bc.domain || "physical",
      rank: 0,
      style: "",
      subtype: "",
      attr: bc.attr || "",
      skill: bc.skill || "",
      defense: bc.defense || "",
      unopposed: !!bc.unopposed,
      min: bc.min ?? "",
      cost: "",
      expertises: "",
      expertisesMode: "any",
      tags: "",
      flavor: "",
      body: bc.body,
      surges: bc.surges,
      rider: { title: "", html: "", meta: "" },
      nonCombatTask: !!bc.nonCombatTask,
      noSurges: !!bc.noSurges
    },
    folder: folderMap ? (folderMap[BASIC_FOLDER_NAME] ?? null) : null,
    flags: {},
    ownership: { default: 0 }
  };
}

/**
 * V6 §6.7 (plan, confirmed unchanged by design/v6-revision-delta.md §6): four Species Traits grant
 * a unique unranked Combat Card that does NOT count against the 10 learned-card selection budget.
 * `scripts/origin-data.json`'s Shaper/True Breath/Ink Cloud/Spore Cloud entries (checked before
 * building this — they were still V5-era free-text Trait descriptions with no Card of their own,
 * confirming this genuinely wasn't built yet) each now cross-reference "Gain the [X] Species Combat
 * Card"; these four entries ARE that Card, hand-authored with the book's exact playtest text
 * (v6_gdoc.txt), same pattern as BASIC_CARDS above. Each requires its granting Species (a soft
 * reminder in the card's own text, not a hard runtime gate — this system has no other precedent for
 * "you must own Item X to use Item Y" enforcement). Shaper is Once per Turn (cooldownFrequency:
 * "perRound"); the other three are Once per Encounter.
 */
const SPECIES_CARDS = [
  { name: "Shaper", requirement: "Planarborn with Shaper Species Trait.", cooldownFrequency: "perRound",
    body: [
      { label: "Requirement", html: "Planarborn with Shaper." },
      { label: "Range", html: "Adjacent." },
      { label: "Target", html: "One unoccupied space containing a small amount of ordinary material or energy associated with your Origin." },
      { label: "Effect", html: "Burn 2 Action dice. Once per Turn. Create or remove 1 unit of Difficult Terrain, form a simple shape, or make a comparable environmental change. Maintain only one altered space; establishing another ends the previous maintained alteration." }
    ] },
  { name: "True Breath", requirement: "Dragonkin with True Breath Species Trait.", cooldownFrequency: "perEncounter",
    body: [
      { label: "Requirement", html: "Dragonkin with True Breath." },
      { label: "Area", html: "A 2-unit cone originating from you." },
      { label: "Effect", html: "Burn 2 Action dice. Once per Encounter. Release your Draconic Lineage. Choose one: make the affected spaces Difficult Terrain until the start of your next Turn; clear ordinary smoke or loose material from them; or create an appropriate visual obstruction until the start of your next Turn. This card does not directly cause Damage." }
    ] },
  { name: "Ink Cloud", requirement: "Tideborn with Ink Cloud Species Trait; you must be submerged.", cooldownFrequency: "perEncounter",
    body: [
      { label: "Requirement", html: "Tideborn with Ink Cloud; you must be submerged." },
      { label: "Range", html: "Adjacent." },
      { label: "Effect", html: "Burn 2 Action dice. Once per Encounter. Fill one adjacent hex with opaque ink. Ordinary sight cannot pass through it. The cloud ends at the start of your next Turn or when dispersed by a strong current." }
    ] },
  { name: "Spore Cloud", requirement: "Verdant with Spore Cloud Species Trait.", cooldownFrequency: "perEncounter",
    body: [
      { label: "Requirement", html: "Verdant with Spore Cloud." },
      { label: "Range", html: "Adjacent." },
      { label: "Effect", html: "Burn 2 Action dice. Once per Encounter. Fill one adjacent hex with spores, pollen, or drifting growth. It blocks ordinary sight until the start of your next Turn." }
    ] }
];

function speciesCardToItem(sc, folderId) {
  const _id = stableId(`species-card:${sc.name}`).slice(0, 16);
  return {
    _id,
    name: sc.name,
    type: "action-card",
    img: "icons/svg/card-hand.svg",
    system: {
      domain: "physical",
      rank: 0,
      style: "",
      subtype: "",
      attr: "",
      skill: "",
      defense: "",
      min: "2",
      cost: "",
      expertises: "",
      expertisesMode: "any",
      tags: "species",
      flavor: `<p>${sc.requirement}</p>`,
      body: sc.body,
      surges: [],
      rider: { title: "", html: "", meta: "" },
      speciesGranted: true,
      cooldownFrequency: sc.cooldownFrequency
    },
    folder: folderId ?? null,
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
      classification: classifyCondition(row.name),
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
      traitLabel: s.traitLabel,
      traitCount: s.traitCount,
      // subChoice passed through verbatim when present (see item-origin.mjs's subChoiceField()) —
      // defaults to {label:"",type:"none",options:[],count:1,selected:[]} via the schema itself
      // when a trait's origin-data.json entry has no subChoice at all, so omitting it here
      // for traits without one is safe.
      traits: s.traits.map((a) => ({ name: a.name, text: a.text, chosen: false, ...(a.subChoice ? { subChoice: a.subChoice } : {}) })),
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
    const combatCards = loadRows("raw-combat-cards.json").filter((row) => !(row.data.skill || row.skill) && !STALE_BASIC_CARD_NAMES.includes(row.name));
    for (const row of combatCards) {
      const type = row.kind === "reaction" ? "reaction-card" : "action-card";
      const pack = row.kind === "reaction" ? "reaction-cards" : "action-cards";
      const folderMap = row.kind === "reaction" ? reactionCardFolders : actionCardFolders;
      writeSourceDoc(pack, cardToItem(row, type, folderMap));
      if (type === "action-card") actionCount++; else reactionCount++;
    }

    // The 7 universal V6 Basic Combat Cards — see BASIC_CARDS' own doc comment for why these
    // replace the (garbled) Neon skill-less rows wholesale rather than patching them.
    for (const bc of BASIC_CARDS) {
      const type = bc.kind === "reaction" ? "reaction-card" : "action-card";
      const pack = bc.kind === "reaction" ? "reaction-cards" : "action-cards";
      const folderMap = bc.kind === "reaction" ? reactionCardFolders : actionCardFolders;
      writeSourceDoc(pack, basicCardToItem(bc, folderMap));
      if (type === "action-card") actionCount++; else reactionCount++;
    }

    // The 4 V6 Species Combat Cards (Shaper/True Breath/Ink Cloud/Spore Cloud) — see SPECIES_CARDS'
    // own doc comment. Given their own folder rather than "Basic" since they're not part of the
    // universal Basic set (isBasicCard() would wrongly include them if left with an empty `style`
    // AND no folder distinction) — `speciesGranted: true` is what actually excludes them from the
    // wizard's 10-card budget; the folder is purely for compendium-browser organization.
    const speciesCardFolderId = stableId("folder:action-cards:Species");
    writeSourceDoc("action-cards", { _id: speciesCardFolderId, name: "Species", type: "Item", folder: null, sorting: "a", color: null, flags: {} }, "folders");
    for (const sc of SPECIES_CARDS) {
      writeSourceDoc("action-cards", speciesCardToItem(sc, speciesCardFolderId));
      actionCount++;
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
    // BURNING/DAZED excluded here — see ORDINARY_CONDITIONS' own doc comment for why their Neon
    // text is V5-era and genuinely wrong under V6; ORDINARY_CONDITIONS supplies the correct
    // replacement for both (plus the 6 other ordinary Conditions V6 prints) below.
    const conditionCards = loadRows("raw-condition-cards.json").filter((row) => !["BURNING", "DAZED"].includes((row.name || "").toUpperCase()));
    for (const row of conditionCards) writeSourceDoc("conditions", conditionToItem(row));
    for (const oc of ORDINARY_CONDITIONS) writeSourceDoc("conditions", ordinaryConditionToItem(oc));
    for (const wc of WOUND_CARDS) writeSourceDoc("conditions", woundCardToItem(wc));
    for (const cc of CONSEQUENCE_CARDS) writeSourceDoc("conditions", consequenceCardToItem(cc));
    for (const cov of COVER_CARDS) writeSourceDoc("conditions", coverCardToItem(cov));
    conditionCount = conditionCards.length + ORDINARY_CONDITIONS.length + WOUND_CARDS.length + CONSEQUENCE_CARDS.length + COVER_CARDS.length;
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
