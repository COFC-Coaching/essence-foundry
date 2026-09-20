/**
 * Schema-driven repair for world data saved by an older version of this system.
 *
 * Foundry validates a Document's source against its DataModel schema while CONSTRUCTING the
 * document. A value the schema rejects doesn't get quietly dropped — it throws, the Document is
 * never instantiated, and it lands on its collection's `invalidDocumentIds`. An invalid document
 * renders nowhere: not in the sidebar, not on a sheet, not in a compendium search. Nothing has
 * been deleted and the data is still on disk, but to a GM the world looks wiped.
 *
 * That is exactly what 0.7.1's V5 -> V6 sync did: it renamed two `choices`-validated values
 * (`slot: "signature"` -> `"inventory"` and `battlefieldRole: "Artillery"` -> `"Blaster"`) with no
 * matching migration, so every pre-0.7.1 character, NPC, monster, and piece of gear failed to load.
 *
 * `static migrateData()` is the fix, because Foundry runs it on the RAW stored source before
 * cleaning and before validation — the only hook early enough to rewrite a stale value before the
 * schema can reject it. But hand-writing one rename at a time only ever fixes the breakages we
 * already know about, and this system's own tag history has gaps (0.6.70-0.6.108 exist in
 * CHANGELOG.md but were never tagged), so there is no reliable way to enumerate every value some
 * live world might still be holding.
 *
 * So this module does not try to enumerate them. It walks the model's OWN schema and repairs
 * anything that schema would reject, whatever it is and whatever version wrote it:
 *
 *   - a `choices` value that is no longer valid  -> its alias if we know one, else the field's own
 *     initial value
 *   - a number outside a field's `min`/`max`     -> clamped into range
 *   - a non-integer in an `integer: true` field  -> rounded
 *   - a renamed field                            -> carried over to its new key, old key removed
 *
 * The guarantee is deliberately modest and deliberately absolute: a document may come back with
 * one field reset to a default, but it always comes back. Losing one dropdown value is something a
 * GM can fix in seconds; a character that will not load is not something they can fix at all.
 *
 * Everything here is defensive by design — it runs during document construction for every document
 * in the world, so a throw in this file would itself become the outage it exists to prevent. Every
 * entry point swallows its own errors and returns the source unchanged.
 */

/**
 * Old field name -> new field name, applied ONLY when the model being migrated actually declares
 * the new key in its own schema. That scoping is what makes a generic name like `role` safe to
 * list here: an Item model that never had a `grade` field leaves its own `role` alone.
 */
export const LEGACY_FIELD_RENAMES = {
  speciesAdaptations: "speciesTraits",       // V6 sync (0.7.1)
  signatureEquipmentLimit: "inventoryLimit", // V6 sync (0.7.1)
  role: "grade"                              // NPC Minion/Standard/Elite/Nemesis -> Mook/Normal/Elite
};

/**
 * Field name -> { stale value: current value }. Consulted before falling back to a field's initial
 * value, so a known rename keeps the GM's intent ("Artillery" really did become "Blaster") instead
 * of resetting to a default. Anything not listed still gets repaired — just to the default.
 */
export const LEGACY_VALUE_ALIASES = {
  slot: { signature: "inventory" },
  battlefieldRole: { Artillery: "Blaster" },
  grade: { Minion: "Mook", Standard: "Normal", Nemesis: "Elite" }
};

/** Every repair made this session, for the console record and the GM-facing summary. */
const repairLog = [];

/**
 * The `system` source objects that were actually changed. Foundry mutates a document's source in
 * place through migrateData -> cleanData, so the object identity recorded here is the same one
 * that ends up as `doc._source.system` — which is how world-repair.mjs knows which specific
 * documents to write back without re-running detection against data it has already fixed. If that
 * identity ever fails to hold, the miss is silent and harmless: the document still loads correctly
 * every time through migrateData, it just doesn't get its repair persisted to disk.
 */
const repairedSources = new WeakSet();

/** @returns {Array} every repair made this session, clearing the log. */
export function takeRepairLog() {
  return repairLog.splice(0, repairLog.length);
}

/** @returns {boolean} whether this exact source object was changed on the way in. */
export function wasRepaired(source) {
  try {
    return repairedSources.has(source);
  } catch {
    return false;
  }
}

/** A field's valid values as a plain array, whether it declares them as an array, a label map, or
 *  a function. Returns null for a field that doesn't constrain its values at all. */
function choiceList(field) {
  let choices = field?.choices;
  if (typeof choices === "function") {
    try { choices = choices(); } catch { return null; }
  }
  if (!choices) return null;
  if (Array.isArray(choices)) return choices;
  if (typeof choices === "object") return Object.keys(choices);
  return null;
}

/** The value to fall back to when a stale value has no known alias: the field's own declared
 *  initial where that is itself valid, then blank where the field permits it, then the first
 *  listed choice — so the result is always something the schema will accept. */
function fallbackChoice(field, choices) {
  let initial = field?.initial;
  if (typeof initial === "function") {
    try { initial = initial(); } catch { initial = undefined; }
  }
  if (choices.includes(initial)) return initial;
  if (field?.blank && choices.includes("")) return "";
  return choices[0];
}

/**
 * Repairs one value in place, recursing through nested schemas and arrays. Fields are identified
 * by duck-typing rather than `instanceof` (`.fields` = SchemaField, `.element` = ArrayField) so
 * this keeps working across Foundry versions that reorganize the field class hierarchy.
 *
 * @param {object} field            the schema field describing this value
 * @param {object|Array} container  the object or array holding it
 * @param {string|number} key       its key or index within that container
 * @param {string} path             dotted path, for the log only
 */
function repairValue(field, container, key, path) {
  const value = container[key];
  if (value === undefined || value === null) return;

  if (field?.fields) { // SchemaField — recurse into its declared subfields
    if (typeof value !== "object" || Array.isArray(value)) return;
    for (const [subKey, subField] of Object.entries(field.fields)) {
      repairValue(subField, value, subKey, `${path}.${subKey}`);
    }
    return;
  }

  if (field?.element) { // ArrayField — repair every entry against the element schema
    if (!Array.isArray(value)) return;
    for (let i = 0; i < value.length; i++) repairValue(field.element, value, i, `${path}[${i}]`);
    return;
  }

  const choices = choiceList(field);
  if (choices) {
    if (choices.includes(value)) return;
    if (value === "" && field.blank) return;
    const alias = LEGACY_VALUE_ALIASES[key]?.[value];
    const replacement = choices.includes(alias) ? alias : fallbackChoice(field, choices);
    if (replacement === undefined || replacement === value) return;
    container[key] = replacement;
    repairLog.push({ path, from: value, to: replacement, kind: alias !== undefined ? "renamed" : "reset" });
    return;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    let next = value;
    if (field?.integer && !Number.isInteger(next)) next = Math.round(next);
    if (typeof field?.min === "number" && next < field.min) next = field.min;
    if (typeof field?.max === "number" && next > field.max) next = field.max;
    if (next !== value) {
      container[key] = next;
      repairLog.push({ path, from: value, to: next, kind: "clamped" });
    }
  }
}

/** Carries any renamed field's value across to its new key, then removes the old key so cleanData
 *  doesn't leave a stray behind. Scoped to renames the model's own schema actually declares. */
function applyRenames(schemaFields, source) {
  for (const [oldKey, newKey] of Object.entries(LEGACY_FIELD_RENAMES)) {
    if (source[oldKey] === undefined) continue;
    if (!schemaFields[newKey]) continue; // this model never had the new field — not our rename
    if (source[newKey] === undefined) {
      source[newKey] = source[oldKey];
      repairLog.push({ path: newKey, from: oldKey, to: newKey, kind: "renamed-field" });
    }
    delete source[oldKey];
  }
}

/**
 * The single entry point every data model's `static migrateData` delegates to. Call it as
 * `migrateSource(this, source)` so `this.schema` resolves to the concrete subclass's own schema —
 * one implementation on a base class therefore covers all of its subtypes correctly.
 *
 * @param {typeof foundry.abstract.TypeDataModel} ModelClass
 * @param {object} source  the raw stored source, mutated in place
 * @returns {object} that same source
 */
export function migrateSource(ModelClass, source) {
  if (!source || typeof source !== "object") return source;
  try {
    const before = repairLog.length;
    const schemaFields = ModelClass.schema?.fields ?? {};
    applyRenames(schemaFields, source);
    for (const [key, field] of Object.entries(schemaFields)) {
      repairValue(field, source, key, key);
    }
    if (repairLog.length > before) repairedSources.add(source);
  } catch (err) {
    // Never let a repair attempt become the outage it exists to prevent — a document that loads
    // with a stale value still loads, and the schema's own cleaning gets the next say.
    console.error("Essence System | Source migration failed, leaving data untouched", err);
  }
  return source;
}
