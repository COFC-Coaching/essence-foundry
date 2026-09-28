/**
 * Regression tests for module/data/migration.mjs, run against the system's REAL schemas.
 *
 * Run with `npm test`. This exists because the failure it guards against is silent: renaming a
 * `choices` value or a field does not break the build, does not break a fresh world, and does not
 * throw anywhere a developer will see it. It breaks somebody else's saved campaign, weeks later,
 * by making their characters fail to load — which looks exactly like the data having been deleted.
 * 0.7.1 shipped exactly that. These tests are the thing that catches the next one.
 *
 * Only the narrow slice of the Foundry field API the schemas actually touch is stubbed: six field
 * classes, all of which are pure option holders as far as the migrator is concerned, since it
 * duck-types `.fields`, `.element`, `.choices`, `.initial`, `.min`, `.max`, `.integer`, `.blank`.
 * Stubbing rather than mocking is deliberate — the schemas under test are the real ones, so a new
 * `choices` list or a new nesting level is covered here the moment it is written.
 */

class DataField {
  constructor(options = {}) { Object.assign(this, options); }
}
class StringField extends DataField {}
class NumberField extends DataField {}
class BooleanField extends DataField {}
class HTMLField extends StringField {}
class ArrayField extends DataField {
  constructor(element, options = {}) { super(options); this.element = element; }
}
class SchemaField extends DataField {
  constructor(fields, options = {}) { super(options); this.fields = fields; }
}

class TypeDataModel {
  // hasOwnProperty, not a plain truthiness check — otherwise every subclass would inherit and
  // reuse its parent's cached schema, which is one of the things these tests rule out.
  static get schema() {
    if (!Object.prototype.hasOwnProperty.call(this, "_schema")) {
      this._schema = new SchemaField(this.defineSchema());
    }
    return this._schema;
  }
  static migrateData(source) { return source; }
}

globalThis.foundry = {
  data: { fields: { StringField, NumberField, BooleanField, HTMLField, ArrayField, SchemaField } },
  abstract: { TypeDataModel }
};

const { default: EssenceCharacterData } = await import("../module/data/actor-character.mjs");
const { default: EssenceNpcData } = await import("../module/data/actor-npc.mjs");
const { default: EssenceMonsterData } = await import("../module/data/actor-monster.mjs");
const { EssenceEquipmentData, EssenceConditionData } = await import("../module/data/item-card.mjs");
const { EssenceChassisData } = await import("../module/data/item-component.mjs");

let pass = 0, fail = 0;
const check = (name, actual, expected) => {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n          expected ${e}\n          actual   ${a}`); }
};

const migrate = (Model, source) => Model.migrateData(source);

console.log("\n--- the two renames that broke 0.7.1 ---");
check("equipment slot signature -> inventory",
  migrate(EssenceEquipmentData, { slot: "signature" }).slot, "inventory");
check("chassis slot signature -> inventory",
  migrate(EssenceChassisData, { slot: "signature" }).slot, "inventory");
check("npc battlefieldRole Artillery -> Blaster",
  migrate(EssenceNpcData, { battlefieldRole: "Artillery" }).battlefieldRole, "Blaster");
check("monster battlefieldRole Artillery -> Blaster (subclass inherits)",
  migrate(EssenceMonsterData, { battlefieldRole: "Artillery" }).battlefieldRole, "Blaster");

console.log("\n--- field renames carry their value, old key removed ---");
check("speciesAdaptations -> speciesTraits",
  migrate(EssenceCharacterData, { speciesAdaptations: ["Nightsight"] }),
  { speciesTraits: ["Nightsight"] });
check("signatureEquipmentLimit -> inventoryLimit",
  migrate(EssenceCharacterData, { signatureEquipmentLimit: 6 }),
  { inventoryLimit: 6 });
check("npc role Nemesis -> grade Elite",
  migrate(EssenceNpcData, { role: "Nemesis" }), { grade: "Elite" });
check("npc role Minion -> grade Mook",
  migrate(EssenceNpcData, { role: "Minion" }), { grade: "Mook" });
check("monster role Standard -> grade Normal (the old ready hook only ever covered npc)",
  migrate(EssenceMonsterData, { role: "Standard" }), { grade: "Normal" });
check("role left alone on a model that has no grade field",
  migrate(EssenceEquipmentData, { role: "Minion" }), { role: "Minion" });

console.log("\n--- the 'no matter what' guarantee: values we have never seen ---");
check("unknown future slot falls back to the field initial",
  migrate(EssenceEquipmentData, { slot: "quantum-pocket" }).slot, "armory");
check("unknown battlefieldRole falls back to blank",
  migrate(EssenceNpcData, { battlefieldRole: "Vanguard" }).battlefieldRole, "");
check("unknown category falls back to the field initial",
  migrate(EssenceEquipmentData, { category: "relic" }).category, "gear");
check("unknown nested array choice is repaired per entry",
  migrate(EssenceNpcData, { abilities: [{ frequency: "daily" }, { frequency: "perRound" }] }).abilities,
  [{ frequency: "atWill" }, { frequency: "perRound" }]);

console.log("\n--- numeric range violations ---");
check("strain above its max is clamped",
  migrate(EssenceCharacterData, { specialties: { strain: 99 } }).specialties.strain, 6);
check("combo below its min is clamped",
  migrate(EssenceCharacterData, { specialties: { combo: -4 } }).specialties.combo, 0);
check("non-integer in an integer field is rounded",
  migrate(EssenceCharacterData, { tier: 2.7 }).tier, 3);

console.log("\n--- current data must pass through untouched ---");
const modernEquipment = { slot: "inventory", category: "weapon", tier: 3, quantity: 2 };
check("valid equipment unchanged", migrate(EssenceEquipmentData, { ...modernEquipment }), modernEquipment);
const modernNpc = { battlefieldRole: "Blaster", grade: "Elite", eliteType: "Solo", tier: 4 };
check("valid npc unchanged", migrate(EssenceNpcData, { ...modernNpc }), modernNpc);
check("blank value allowed where the field permits it",
  migrate(EssenceNpcData, { grade: "" }).grade, "");
check("condition with no classification stays absent", migrate(EssenceConditionData, {}), {});

console.log("\n--- a listed choice the field would still reject ---");
// Foundry's StringField rejects "" whenever `choices` is set unless the field also declares
// `blank: true`, so `choices: ["", "intellect"]` without it rejects its own `initial: ""` and
// invalidates every document holding the default. This shipped once, on the Character model's
// nonCombatSkills[].source, and was fixed in 0.7.5 by adding blank: true. These tests cover the
// migrator's side of it: membership in `choices` is not the same as being accepted, so the next
// field written with this trap is repaired rather than passed straight through to be rejected.
const { migrateSource } = await import("../module/data/migration.mjs");
class BlankTrapModel extends TypeDataModel {
  static defineSchema() {
    return {
      trap: new StringField({ initial: "", choices: ["", "intellect"] }),              // no blank
      fine: new StringField({ initial: "", blank: true, choices: ["", "intellect"] })  // blank ok
    };
  }
  static migrateData(source) { return migrateSource(this, super.migrateData(source)); }
}
check("blank rejected by the field is repaired, not passed through",
  migrate(BlankTrapModel, { trap: "" }).trap, "intellect");
check("blank the field explicitly permits is left alone",
  migrate(BlankTrapModel, { fine: "" }).fine, "");
check("fallback never returns a value the field would reject",
  migrate(BlankTrapModel, { trap: "nonsense" }).trap, "intellect");
check("the real character model accepts its own default now that blank:true is set",
  migrate(EssenceCharacterData, { nonCombatSkills: [{ source: "" }] }).nonCombatSkills,
  [{ source: "" }]);

console.log("\n--- no schema may reject its own default (the nonCombatSkills.source trap) ---");
// The migrator repairs this if it ships, but repairing it means resetting a GM's value to a
// default. Far better to never ship it. This walks EVERY registered model's real schema and fails
// the build on any StringField whose `choices` list includes "" without `blank: true` — the exact
// shape that invalidated every character holding the default in 0.7.1 through 0.7.4.
const ALL_MODELS = {
  character: EssenceCharacterData, npc: EssenceNpcData, monster: EssenceMonsterData,
  manifestation: (await import("../module/data/actor-manifestation.mjs")).default,
  team: (await import("../module/data/actor-team.mjs")).default,
  equipment: EssenceEquipmentData, condition: EssenceConditionData, chassis: EssenceChassisData,
  ...(await import("../module/data/item-card.mjs")),
  ...(await import("../module/data/item-component.mjs")),
  ...(await import("../module/data/item-origin.mjs"))
};

function findBlankTraps(field, path, found) {
  if (field?.fields) {
    for (const [k, sub] of Object.entries(field.fields)) findBlankTraps(sub, `${path}.${k}`, found);
    return found;
  }
  if (field?.element) return findBlankTraps(field.element, `${path}[]`, found);
  const c = Array.isArray(field?.choices) ? field.choices : null;
  if (c?.includes("") && !field.blank) found.push(path);
  return found;
}

const traps = [];
for (const [name, Model] of Object.entries(ALL_MODELS)) {
  if (typeof Model?.defineSchema !== "function") continue;
  findBlankTraps(Model.schema, name, traps);
}
check("every model accepts its own blank default", traps, []);

console.log("\n--- must never throw ---");
check("null source", migrate(EssenceCharacterData, null), null);
check("undefined source", migrate(EssenceCharacterData, undefined), undefined);
check("array where an object belongs", migrate(EssenceCharacterData, { specialties: [] }).specialties, []);
check("string where a number belongs is left for cleanData",
  migrate(EssenceCharacterData, { tier: "three" }).tier, "three");

console.log("\n--- Team actor (0.8.0) ---");
const { default: EssenceTeamData } = await import("../module/data/actor-team.mjs");
check("Team Tier above 5 is clamped, not rejected", migrate(EssenceTeamData, { tier: 7 }).tier, 5);
check("Team Tier below 1 is clamped, not rejected", migrate(EssenceTeamData, { tier: 0 }).tier, 1);
check("record rows keep their fields",
  migrate(EssenceTeamData, { things: [{ name: "Van", tags: "Asset, Obligation", notes: "" }] }).things,
  [{ name: "Van", tags: "Asset, Obligation", notes: "" }]);
check("a character's legacy personal Tier still loads", migrate(EssenceCharacterData, { tier: 3 }).tier, 3);

console.log("\n--- 0.12.0 (Phase 5) Specialty shape changes ---");
const oldSp = migrate(EssenceCharacterData, { specialties: { lock: "Ogre", contingency: "door opens -> move 2", authority: [8, 5] } }).specialties;
check("lock string becomes the locks list", [oldSp.locks, oldSp.lock], [["Ogre"], ""]);
check("contingency string becomes the contingencies list", [oldSp.contingencies, oldSp.contingency], [["door opens -> move 2"], ""]);
check("flat authority results become one unnamed card each", oldSp.authorityCards, [{ card: "", results: [8] }, { card: "", results: [5] }]);
check("old authority list is emptied", oldSp.authority, []);
const newSp = migrate(EssenceCharacterData, { specialties: { lock: "", locks: ["Kel"], authority: [], authorityCards: [{ card: "Rally", results: [9] }] } }).specialties;
check("already-migrated data is left alone", [newSp.locks, newSp.authorityCards], [["Kel"], [{ card: "Rally", results: [9] }]]);
check("manifestationWounds above 5 is clamped", migrate(EssenceCharacterData, { specialties: { manifestationWounds: 9 } }).specialties.manifestationWounds, 5);
check("a Rite row with the new fields loads",
  migrate(EssenceCharacterData, { specialties: { rites: [{ name: "Ward", trigger: "t", echo: "e", echoLimit: 2, subject: "Kel" }] } }).specialties.rites,
  [{ name: "Ward", trigger: "t", echo: "e", echoLimit: 2, subject: "Kel" }]);
check("an npc with old specialties migrates too (subclass inherits)", migrate(EssenceNpcData, { specialties: { lock: "Ysolde" } }).specialties.locks, ["Ysolde"]);

console.log("\n--- 0.9.0 (Phase 2) fields ---");
const { EssenceDistinctionData } = await import("../module/data/item-origin.mjs");
check("Size above 5 is clamped", migrate(EssenceCharacterData, { size: 9 }).size, 5);
check("Size below 0 is clamped", migrate(EssenceCharacterData, { size: -1 }).size, 0);
check("Languages and skillPointBonus load", migrate(EssenceCharacterData, { languages: "Common, Old Tongue", skillPointBonus: 1 }).languages, "Common, Old Tongue");
check("Connection rows keep their fields",
  migrate(EssenceCharacterData, { connections: [{ name: "Bren", area: "docks", relationship: "cousin", tier: 2 }] }).connections,
  [{ name: "Bren", area: "docks", relationship: "cousin", tier: 2 }]);
check("a stored Intellect-sourced Skill still loads", migrate(EssenceCharacterData, { nonCombatSkills: [{ name: "History", rating: 1, source: "intellect" }] }).nonCombatSkills[0].source, "intellect");
check("a Distinction saved before acquiredLater loads", migrate(EssenceDistinctionData, { keyCombatSkill: "Cunning" }).keyCombatSkill, "Cunning");

console.log("\n--- 0.10.0 (Phase 3a) fields ---");
const { EssenceActionCardData } = await import("../module/data/item-card.mjs");
check("dead is an accepted Death Track state", migrate(EssenceCharacterData, { playState: { deathTrackState: "dead" } }).playState.deathTrackState, "dead");
check("an unknown Death Track state falls back to none", migrate(EssenceCharacterData, { playState: { deathTrackState: "gone" } }).playState.deathTrackState, "none");
check("a stored prepared Action keeps its reserved dice", migrate(EssenceCharacterData, { playState: { preparedAction: { cardId: "x", cardName: "Dash", trigger: "t", reserved: 3 } } }).playState.preparedAction.reserved, 3);
check("a card saved before burnDice loads", migrate(EssenceActionCardData, { min: "2" }).min, "2");
check("a negative burnDice is clamped", migrate(EssenceActionCardData, { burnDice: -1 }).burnDice, 0);

console.log("\n--- 0.11.0 (Phase 4) enemy fields ---");
check("ability frequency perCombat -> betweenRecoveries", migrate(EssenceNpcData, { abilities: [{ name: "Brace", frequency: "perCombat" }] }).abilities[0].frequency, "betweenRecoveries");
check("monster ability frequency alias (subclass inherits)", migrate(EssenceMonsterData, { abilities: [{ name: "Burst", frequency: "perCombat" }] }).abilities[0].frequency, "betweenRecoveries");
check("an unknown ability kind falls back to action", migrate(EssenceNpcData, { abilities: [{ name: "X", kind: "spell" }] }).abilities[0].kind, "action");
check("printed Defenses load", migrate(EssenceNpcData, { printedDefenses: { fortitude: 7, composure: null, harmony: 5 } }).printedDefenses.fortitude, 7);
check("a negative Task Dice value is clamped", migrate(EssenceNpcData, { taskDice: -2 }).taskDice, 0);
check("an enemy saved before 0.11.0 still loads", migrate(EssenceNpcData, { ...modernNpc }).grade, modernNpc.grade);

console.log("\n--- a character's Core tracks always have five spaces (0.18.7) ---");
const wound = (filled) => ({ filled, domain: filled ? "Physical" : "", severity: filled ? "Light" : "", condition: filled ? "Light Physical Wound" : "" });
const shortTrack = migrate(EssenceCharacterData, { coreWounds: [wound(true), wound(false)] }).coreWounds;
check("a two-space Core Wound track is padded to five", shortTrack.length, 5);
check("a marked Wound keeps its place when padding", shortTrack[0].filled, true);
check("padded spaces are empty", shortTrack.slice(1).every((w) => !w.filled && w.severity === ""), true);
check("a full five-space track is left alone",
  migrate(EssenceCharacterData, { coreWounds: [wound(true), wound(true), wound(false), wound(false), wound(false)] }).coreWounds.length, 5);
check("a short Core Influence track is padded to five",
  migrate(EssenceCharacterData, { coreInfluence: [{ filled: false, severity: "", condition: "" }] }).coreInfluence.length, 5);
check("an enemy's track is sized by Grade, never padded here",
  migrate(EssenceNpcData, { coreWounds: [wound(false), wound(false)] }).coreWounds.length, 2);

console.log("\n--- a Connection's Scope became a 1-5 Tier (0.18.9) ---");
const conn = (scope, extra = {}) => migrate(EssenceCharacterData, { connections: [{ name: "Ilsa", area: "fencing goods", relationship: "old friend", scope, ...extra }] }).connections[0];
check("a numeric Scope becomes the Tier", conn("3").tier, 3);
check("\"Tier 2\" becomes Tier 2", conn("Tier 2").tier, 2);
check("a Scope above 5 is clamped", conn("9").tier, 5);
check("a word-only Scope defaults to Tier 1", conn("what help is reasonable").tier, 1);
check("a word-only Scope is kept in the Area", conn("local favours").area, "fencing goods (local favours)");
check("words after a Tier number are kept", conn("T2 - city watch only").area, "fencing goods (city watch only)");
check("an empty Scope leaves the Area alone", conn("").area, "fencing goods");
check("the old scope key is gone", "scope" in conn("2"), false);
check("an existing Tier is not overwritten", conn("4", { tier: 2 }).tier, 2);
check("Scope text fills an empty Area", migrate(EssenceCharacterData, { connections: [{ name: "Ilsa", area: "", scope: "docks" }] }).connections[0].area, "docks");

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
