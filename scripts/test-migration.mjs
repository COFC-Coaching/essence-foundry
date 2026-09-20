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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
