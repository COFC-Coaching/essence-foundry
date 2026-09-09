# Design: Chassis / Fitting / Augment Modular Equipment (Phase 3)

Status: design only, not yet implemented. Written 2026-09-08 as part of the V5 rulebook sync
(see `build-history`'s "Recent sessions" entries for Phases 1-2, already shipped).

Source of truth for the rules: `part-viii-equipment-and-items.md` in the `essence-system` repo's
rules content (§ Modular Equipment through § Reconfiguring Equipment). Read that in full before
implementing — this document summarizes the mechanical shape, not the complete rules text.

## Why this is the big one

Current `EssenceEquipmentData` (`module/data/item-card.mjs`) is a flat schema: one Item, one
`slotCost`, an unused `isModular` boolean, no Chassis/Fitting/Augment concept, no Armory/Signature
capacity enforcement anywhere (the limits exist on the actor but nothing sums usage against them).
Phases 1-2 finished partially-built systems; this one doesn't exist yet.

## The existing pattern to reuse: origin items

This codebase already solves a structurally identical problem for Species/Heritage/Distinction:

- Each is its own Item sub-type, browsable from its own compendium, dragged onto an actor.
- `module/data/origin-select.mjs`'s `setOriginItem()` copies the dropped Item onto the actor via
  `createEmbeddedDocuments`, enforcing one-per-type.
- `module/data/origin-features.mjs`'s `deriveOriginFeatures()` is a pure function that reads the
  embedded Species/Heritage/Distinction Items' `system` data and produces the flat feature-row list
  the sheet renders under "General Features & Benefits."

Chassis/Fitting/Augment should follow the same shape: **real, separate embedded Item sub-types**,
not fields nested inside one equipment Item. This is what lets a spare Fitting sit in the Armory on
its own, get compendium-browsed, get dragged onto a different weapon later, and get valued as
treasure independently — all things the rules text explicitly wants ("A Fitting you no longer use
on your primary weapon may become useful on another item").

## Data model

### Three new Item sub-types

Add to `system.json`'s `documentTypes.Item`: `chassis`, `fitting`, `augment`. New DataModel file
`module/data/item-component.mjs`:

```js
// Shared by Chassis and Fitting — both are "Components" per the rules' own term.
class EssenceComponentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      category: new fields.StringField({ choices: ["weapon", "ranged", "armor", "guard", "implement"] }),
      tier: new fields.NumberField({ integer: true, initial: 1, min: 1, max: 5 }),
      // Inherent bonuses this Component contributes when assembled — same shape as EssenceEquipmentData's
      // existing fortitude/resilience/movement/reachBonus fields, reused so derivation code (below)
      // can sum them uniformly regardless of source.
      fortitude: new fields.StringField({ initial: "" }),
      resilience: new fields.StringField({ initial: "" }),
      movement: new fields.StringField({ initial: "" }),
      effect: new fields.HTMLField({ initial: "" }),
      passive: new fields.HTMLField({ initial: "" }),
      special: new fields.HTMLField({ initial: "" }),
      grantsEquipmentCard: new fields.BooleanField({ initial: false }), // Fitting only, rarely true
      flavor: new fields.HTMLField({ initial: "" })
    };
  }
}

export class EssenceChassisData extends EssenceComponentData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      // One entry per Mount. `linkedWith` is the index of the paired Mount for a Linked pair,
      // or null for an independent Mount (see Augment Mounts / Linked Mounts).
      mounts: new fields.ArrayField(new fields.SchemaField({
        linkedWith: new fields.NumberField({ integer: true, nullable: true, initial: null })
      }), { initial: [{ linkedWith: null }] }), // every Chassis has >=1 Mount
      compatibleFittingCategory: new fields.StringField({ initial: "" }) // e.g. "Handling", "Payload"
    };
  }
}

export class EssenceFittingData extends EssenceComponentData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      handedness: new fields.StringField({ initial: "", choices: ["", "one-handed", "two-handed"] }),
      rangeModifier: new fields.StringField({ initial: "" })
    };
  }
}

export class EssenceAugmentData extends foundry.abstract.TypeDataModel {
  static defineSchema() {
    return {
      kind: new fields.StringField({ initial: "function", choices: ["function", "support"] }),
      compatibility: new fields.StringField({ initial: "Any" }), // free text, printed requirement
      // Function only — Uses refresh at end of Adventure, same convention as Consumable Kits.
      uses: new fields.NumberField({ integer: true, nullable: true, initial: null }),
      usesRemaining: new fields.NumberField({ integer: true, nullable: true, initial: null }),
      effect: new fields.HTMLField({ initial: "" }), // Function's granted Action/Reaction, or Support's modifier text
      flavor: new fields.HTMLField({ initial: "" })
    };
  }
}
```

### `equipment` extended, not replaced

Toolkits and Consumable Kits stay exactly as they are today (`EssenceEquipmentData`, non-modular,
category `tool`/`gear`) — the rules explicitly say these are **not** modular. Add reference fields
so a weapon/armor/guard/implement `equipment` Item becomes the *assembled result*:

```js
// added to EssenceEquipmentData
isModular: new fields.BooleanField({ initial: false }), // already exists — now actually load-bearing
chassisItemId: new fields.StringField({ initial: "" }), // embedded Item id, same actor
fittingItemId: new fields.StringField({ initial: "" }),
mounts: new fields.ArrayField(new fields.SchemaField({
  augmentItemId: new fields.StringField({ initial: "" }),
  linkOn: new fields.BooleanField({ initial: true }) // meaningless unless this Mount is Linked
}))
```

An assembled item's own `slotCost` stays 1 (a complete item), regardless of its Chassis/Fitting's
individual Tiers — matching "there is no need to determine an overall Tier for the finished weapon."

### Derivation: `module/data/equipment-features.mjs` (new, mirrors `origin-features.mjs`)

```js
export function deriveEquipmentStats(actor, equipmentItem) {
  const chassis = actor.items.get(equipmentItem.system.chassisItemId);
  const fitting = actor.items.get(equipmentItem.system.fittingItemId);
  // sum fortitude/resilience/movement from chassis + fitting (parse "+2"/"-1" strings like the
  // existing equipment fields already do elsewhere in the sheet)
  // resolve each Mount's augmentItemId to its Augment Item, apply Link On/Off semantics from
  // § Linked Mounts (Support modifies the Function instead of the Chassis when Link is On)
  // return { fortitude, resilience, movement, grantedCards: [...], mountDisplay: [...] }
}
```

Called from the actor sheet's `_prepareContext` the same way `deriveOriginFeatures` already is —
**not** baked into `EssenceEquipmentData#prepareDerivedData()`, because a TypeDataModel can't reach
across to sibling embedded Items on the same Actor during its own data preparation; this has to
happen at the sheet/actor level, same constraint `origin-features.mjs` already works around.

### Slot-capacity accounting (currently missing entirely — fix as part of this work)

New pure function, e.g. in `utils.mjs`:

```js
export function computeSlotUsage(items, slotKey) {
  // complete `equipment` items in this slot: 1 each
  // loose (unreferenced) `chassis`/`fitting` items in this slot: 0.5 each
  // `augment` items: 0, always
}
```

Display `used / limit` next to the Armory/Signature headers on both sheets (currently
`armoryLimit`/`signatureEquipmentLimit` exist on the actor but nothing reads them against actual
usage — a real, separate gap from the modular system itself, worth fixing at the same time since
the UI real estate and the underlying capacity math are the same piece of work).

## Foundry-native fit — what to use instead of hand-rolled logic

Per the project's own "check Foundry-native first" convention:

- **Numeric passive bonuses** (Chassis/Fitting Fortitude/Resilience/Movement, a Support Augment's
  modifier) are good **Active Effect** candidates (`Add` change mode, dot-notation key into
  `system.fortitude` etc., `transfer: true` while the Augment/Component Item is embedded) instead
  of the derive-and-sum function above — this is the single clearest "use Foundry's own mechanism"
  opportunity in the whole Phase 3 build, and was flagged generally in the original audit's QoL
  section. Recommend Active Effects for the numeric deltas; keep the plain-function derivation
  (`equipment-features.mjs`) for the non-numeric stuff Active Effects can't express well — granted
  Equipment Cards, Mount display, Link semantics.
- **Drag-and-drop** installing an Augment into a Mount, or a Fitting onto a Chassis, should use
  `ActorSheetV2`'s built-in drag-drop handling (already the base class per `actor-sheet.mjs`) rather
  than a custom picker dialog — drop target = a Mount's UI slot, drop payload = the dragged Item's
  UUID, exactly how origin items already work via `_onDropItem`.
- **Reconfiguration action costs** (1 Action die per Augment swap, 1 or 3 for Fitting changes) reuse
  the existing `#onBurnDice`-adjacent dice-spend pattern already in both sheets — no new pattern
  needed here.

## Compendium packs

Add `chassis`, `fittings`, `augments` to `system.json`'s `packs` array (type `Item`), matching the
existing one-pack-per-Item-subtype convention (`species`, `heritages`, `distinctions` already do
this). Existing `equipment` pack keeps pre-built complete items plus Toolkits/Consumable Kits.

## Migration / backward compatibility

No data migration system exists in this repo yet (a known, already-documented gap — see the phase
history in `build-history`). Do **not** attempt to auto-decompose existing `equipment` compendium
entries into Chassis+Fitting pairs. Instead:

- Existing equipment entries keep working exactly as they do today (flat, non-modular, `isModular:
  false`) — they're grandfathered, not broken.
- New Chassis/Fitting/Augment compendium content is additive. Authoring a first wave (Striker/
  Launcher/Shell/Guard/Focus Chassis × their Fittings, Tier 1 examples at minimum) is a content
  task, not a code task, and can happen incrementally — the system should work with zero Chassis/
  Fitting entries in the compendium and still be internally consistent (an actor with no modular
  equipment behaves exactly as today).
- If/when a real migration system gets built (also flagged as existing tech debt), decomposing old
  equipment into the new model becomes an option then, not a prerequisite for shipping this.

## Suggested build order within Phase 3

1. Schema: `item-component.mjs` (Chassis/Fitting/Augment DataModels) + `equipment` extension fields.
   Register the 3 new sub-types in `system.json`, add minimal item sheets (can start as one shared
   `component-sheet.mjs`/`.hbs` branching by `item.type`, matching `EssenceItemSheetBase`'s existing
   pattern).
2. `equipment-features.mjs` derivation + slot-usage accounting + Armory/Signature capacity display.
   This alone makes the schema visible and useful even before drag-drop/reconfiguration exist.
3. Drag-drop assembly (drop a Chassis onto an equipment Item to set `chassisItemId`, same for
   Fitting; drop an Augment onto a Mount).
4. Reconfiguration actions (swap Augment, change Fitting, toggle Link) with their dice costs.
5. Active Effects migration for the numeric bonuses (can happen anytime after step 1-2; not
   blocking, but cleaner to do before a lot of UI is built around the manual-sum version).
6. Compendium content authoring (new packs, Tier 1 starter Chassis/Fittings/Augments) — ongoing,
   not a hard gate on the code being done.
