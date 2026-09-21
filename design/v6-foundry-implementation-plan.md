# The Essence System — Foundry V6 Implementation Plan

Target: `essence-foundry` @ **v0.6.69** → V6 rulebook (self-identified **v0.6**).
Sources: `design/rulebook-v5-to-v6-changelog.md` (§§1–6 only; §7 targets the web app, not this repo), `design/rulebook-v5-v6-gap-regressions.md`, `build-history`, V6 book text.

A convenient coincidence worth noting up front: the Foundry system's own version series (`0.6.x`) already matches the rulebook's `v0.6`. Treat `0.6.70 → 0.6.99` as the V6 sync window and reserve `0.7.0` for the compendium re-authoring release.

**Update — no live games.** There are currently no live campaigns running on this module. §2's migration framework, transitional enums, and dry-run tooling were written to protect live campaign data from being orphaned by schema/enum renames — with no live worlds, that risk doesn't exist right now. §2 is kept below as reference (build it before the module is ever used at a real table, since "no live games" won't stay true forever), but it is **no longer a prerequisite** for any other section, and renames in §3 can be applied directly to the schema with no transitional period, no dual-enum window, and no migration step. This also collapses Phase 0 and simplifies Phase 1 in the build order (§8) — see the note there.

---

## 1. Executive summary — what actually matters for running V6 at the table

Ranked by "a GM cannot run a V6 session correctly without this," not by effort.

| # | Change | Why it's top | Class |
|---|---|---|---|
| 1 | **Wound State by highest occupied severity** | `module/data/actor-combatant.mjs:293-297` computes it by *count*. V6 §1650-1652 uses highest severity. This value is displayed on all three actor sheets **and** gates the Death Track in `module/documents/combat.mjs:168`, so it is wrong twice. | logic |
| 2 | **Death Track redefinition** (all-five-filled / 0-5 / three states / persistence / Recovery −1) | Current impl is a 5-step counter + a `deathTrackFrozen` boolean triggered by "possesses a Critical Wound." V6 §1665-1685 replaces every one of those assumptions. This is the single most consequential moment in play and it is currently modelled on V5. | logic |
| 3 | **Reach as an absorber of ordinary Influence pressure** | V6 §1265-1280 inserts a whole new layer before Temporary Influence. The module has no pressure field at all (`reach` is a flat number, `actor-combatant.mjs:113`). Every Influence spend in play is currently one layer wrong. | new subsystem |
| 4 | **Signature → Inventory rename** (incl. the `slot` enum value) | Pure vocabulary at the table, touching 20 files including a schema enum value on every equipment/chassis/fitting Item — but with no live data to protect, this is now a straight find-and-rename, no transitional period needed. | rename |
| 5 | **Combat Skill → Combat Style** | Same table-facing weight, even lower risk: the nine style *keys* (`prowess`, `ballistics`, …) are unchanged in V6, so this is overwhelmingly label work. | rename |
| 6 | **Minimum 2-die Pool commitment + Rank 0 floor of 2** | V6 §721/§1496 is a new universal rule. The dice-commit dialog (`combat.mjs#promptDiceCount`, `actor-sheet.mjs` card-roll path) enforces `min: 0`. Every card use in Foundry is currently legal at 1 die. | logic |
| 7 | **Recovery = 25% of max, rounded up, + Death Track −1, + clear Strain, + −1 Manifestation Wound** | `#onGrantRecovery` (`actor-sheet.mjs:1110`) already defaults to 25% but uses `Math.round` (V6 §957 says round **up**) and does none of the three secondary effects (V6 §965, Appendix D Strain, §1806 Calling). | logic |
| 8 | **Four Distinction Primary Attribute swaps** | One-line data fix each, verified wrong today (see §4.1). Zero risk, immediate correctness. | data |
| 9 | **Enemy simplified Wounds (Mook 2 / Normal 4 / Elite 5, no Wound State, no Death Track)** | V6 §2415 explicitly excludes *all* enemy grades from the Wound-space/Wound-Card/Death-Track machinery. NPC and Monster sheets currently inherit the full PC track from `EssenceCombatantData`. | logic + data |

Everything else is either lower-stakes, or blocked (§9).

---

## 2. Migration strategy

**No longer a prerequisite (see the note under the title).** There are no live games on this module right now, so none of the "what breaks in a live world" scenarios below apply today — renames in §3 can go straight into the schema. This section is kept as a reference design for the migration framework, to be built **before the module is next used at a real table** (whenever that is), not before the V6 sync work below.

### 2.1 The problem, stated precisely

`build-history` "Known gaps / technical debt" #1: *"No data migration system. `grep -rln "migrat" module/` returns nothing."* Foundry `TypeDataModel` does **not** rename fields for you. The specific failure modes this plan would cause without a migration:

| Change | What breaks in a live world |
|---|---|
| `system.signatureEquipmentLimit` → `system.inventoryLimit` | Every existing PC silently reverts to the new field's `initial` (4). A character advanced to Limit 6 loses it with no error. |
| `system.slot` enum `"signature"` → `"inventory"` | **Worst case in the plan.** `StringField` with `choices` *rejects* an out-of-choices value on the next write. Every prepared item on every actor becomes a validation failure. `equipment-effects.mjs:72` gates the transferred Active Effect on `slot !== "signature"` — all worn gear silently stops granting Fortitude/Resilience/Movement/Reach. |
| `system.speciesAdaptations` → `system.speciesTraits` | Chosen Species Traits vanish from `deriveOriginFeatures()` (`origin-features.mjs:30`) and from `deriveActiveGrants()` (`item-grants.mjs:82`), so "Internal Compartment"/"Inherited Tools" grants stop being recognised and the granted item's Reach exception stops applying. |
| `battlefieldRole` `"Artillery"` → `"Blaster"` | Same `choices` rejection as above, on every existing NPC/Monster. |
| `playState.deathTrackFrozen` (bool) → `deathTrackState` (enum) | A currently-stabilized dying PC loses their stabilization mid-campaign. |
| `monsterType` `"Colossus"` → `"Titan"` | `choices` rejection on any Monster using it. |

### 2.2 The design

Add **`module/migration.mjs`**, invoked from `module/essence.mjs`'s `ready` hook, GM-only.

```
module/migration.mjs
  MIGRATIONS = [ { version: "0.6.71", apply: ... }, { version: "0.6.74", apply: ... }, ... ]
  migrateWorld()      // idempotent, versioned, resumable
  migrateActorData(src) / migrateItemData(src)   // pure functions, unit-testable
```

Register a **world** setting `systemMigrationVersion` (String, `config: false`, default `""`). On `ready`:

1. GM only (`game.user.isGM`); bail otherwise.
2. Read `systemMigrationVersion`. If `>= system.json version`, no-op.
3. If it is `""` **and** `game.actors.size > 0`, this is a pre-migration world — treat as `"0.6.69"`.
4. Run every migration step whose `version` is newer, in order.
5. Write the new version **only after every step resolves**. A crash mid-run leaves the old version, so the next load retries from the same point — which is why every step must be individually idempotent (`if (src.system.slot === "signature") …`, never a blind swap).

### 2.3 What the migration must walk — the four surfaces, in this order

This is the part that is easy to get wrong. All four are required:

1. **`game.actors`** and, for each, its **embedded Items** (`actor.items`). Use `actor.updateEmbeddedDocuments("Item", updates)` in one batched call per actor.
2. **`game.items`** — world-level Items not owned by anyone.
3. **`game.scenes` → unlinked token actors.** `EssenceActor#_preCreate` (`documents/actor.mjs:12`) only forces `actorLink: true` for `type === "character"`. **NPCs, Monsters and Manifestations are unlinked by default**, so every placed enemy token carries its own `token.delta` (v12+) copy of the actor data. Skipping this leaves every enemy on every map broken. Iterate `scene.tokens` and migrate `token.delta.system` / `token.actorData.system` per compatibility target.
4. **Unlocked world compendium packs** (`game.packs.filter(p => p.metadata.packageType === "world" && !p.locked)`). System-shipped packs are rebuilt from source by `scripts/build-packs.mjs` and must **not** be migrated in place.

### 2.4 Hard rules for writing the migration steps

- **Never write a dotted array path.** build-history recurring bug #1: `system.someArray.0.field` replaces the whole array element. Every step that touches `coreWounds`, `coreInfluence`, `expertises`, `reachTriggers`, `abilities`, `mounts`, `equipmentCards`, `speciesAdaptations`, `nonCombatSkills` must read the full array, map it, and write the full array back.
- **Use `-=oldField` to delete**, and set the new field in the same update object: `{ "system.inventoryLimit": old, "system.-=signatureEquipmentLimit": null }`.
- **Widen enums before narrowing them.** For `slot`, `battlefieldRole`, `monsterType`, ship the schema in a *transitional* state for one version: `choices: ["inventory", "signature", "temporary", "armory"]` with `"signature"` accepted-but-deprecated. Migrate. Then drop the old value in the following version. This makes a failed or partial migration non-fatal instead of world-breaking.
- **Read-only dry run first.** Ship `migrateWorld({ dryRun: true })` behind a `/essence-migrate --dry-run` chat command in the same version that introduces the framework (0.6.70), *before* any rename lands. It reports counts per surface ("47 actors, 312 embedded items, 88 token deltas across 9 scenes") and writes nothing. This also validates the token-delta walk — the part most likely to be wrong — against a real world with zero risk.
- **Tell the GM to back up.** A blocking `DialogV2` on first migration run: "The Essence System is updating world data from V5 to V6 rules. Back up your world folder before continuing." Foundry has no transaction; this dialog is the only rollback mechanism that exists.

### 2.5 Content that cannot be migrated, only re-synced

Owned copies of compendium Items (Cards, Equipment, Species, Heritages, Distinctions) that a player already dragged onto their sheet keep their V5 text forever. This is the *exact* problem build-history records from v0.6.20 ("a player's already-owned copy of 'Collapsing Weight' did not get the Surge fix"), and the user's recorded direction was that owned copies are fixed manually.

For V6 that call should be revisited, because the volume is far higher (see §7). Recommendation: add a **"Re-sync from Compendium"** GM tool (small) that matches an owned Item to its pack source by name and offers to replace its `system` block while preserving per-copy state (`slot`, `quantity`, `usesRemaining`, `mounts`, `reachExceptionSource`). Ship it in 0.6.70 alongside the migration framework — it is the only realistic way to push V6 card/species/heritage text into live campaigns, and it is useful independently of V6.

---

## 3. Renames

Nine of the nine Combat Style *keys* are unchanged in V6, which makes the largest-looking rename the cheapest one.

### 3.1 Rename table

| V5 → V6 | Kind | Field/enum change? | Files |
|---|---|---|---|
| Combat Skill → **Combat Style** | label-only, mostly | `item-card.mjs:59` `skill` → `style` is *optional*; a `style` field already exists at line 56 and is separately used | `lang/en.json` (10 keys: 31, 131, 312, 509, 512, 513, 519, 548, 551, 558); `module/apps/character-wizard.mjs` (STEPS l.45, l.458, l.462); `module/apps/monster-wizard.mjs:18`; doc comments in `actor-combatant.mjs:19,47`, `actor-manifestation.mjs:11`, `item-origin.mjs:79-88`; `module/sheets/item-sheet.mjs` `COMBAT_SKILLS`; templates `wizard.hbs`, `character-sheet.hbs`, `npc-sheet.hbs`, `monster-sheet.hbs` |
| Non-Combat Skills → **Non-Combat Capabilities** | label-only | leave `system.nonCombatSkills` alone — renaming it buys nothing and costs a migration | `lang/en.json:263, 558`; `character-wizard.mjs` STEPS |
| Signature Loadout / Signature Item Limit → **Inventory / Inventory Limit** | **schema** | `signatureEquipmentLimit` → `inventoryLimit`; `slot` enum `"signature"` → `"inventory"` | `actor-combatant.mjs:149`; `item-card.mjs:115`; `item-component.mjs:24`; `utils.mjs:59-69,114-143,214-223`; `equipment-effects.mjs:72`; `item-grants.mjs:23` (`countsAgainstLimit` doc); `actor-sheet.mjs:478-479,494,500,1394-1414,1737,1751,1820`; `npc-sheet.mjs:129,287-291,1204,1261`; `monster-sheet.mjs:36`; `character-wizard.mjs:406-409,449,463,712-732,779`; `monster-wizard.mjs:521`; `bulk-import.mjs:99,147,299`; `lang/en.json` (10 keys: 46, 47, 180, 183, 185, 186, 369, 451, 453, 454, 562, 616); `character-sheet.hbs:389-390`, `npc-sheet.hbs`, `monster-sheet.hbs`, `equipment-sheet.hbs`, `component-sheet.hbs`, `wizard.hbs:331`, `content-wizard.hbs`; `styles/essence.css` (`.signature-overlimit-note`) |
| Species Adaptations → **Species Traits** | **schema** | actor `speciesAdaptations` → `speciesTraits`; item `adaptationLabel`/`adaptationCount`/`adaptations` → `traitLabel`/`traitCount`/`traits` | `actor-combatant.mjs:36`; `item-origin.mjs:48-55`; `origin-features.mjs:30`; `item-grants.mjs:1-10,82`; `character-wizard.mjs`; `species-sheet.hbs`; `lang/en.json` (398, 401, 403, 405, 406, 407, 128, 611); **note:** Gestalt's *Adaptation* Specialty keeps the word — do **not** touch `specialties.adaptation` (`actor-combatant.mjs:158`) or `lang/en.json:222-224` |
| Construct Module → **Construct Species Trait** | content | `scripts/origin-data.json` only |
| Scene → **Encounter** (mechanical unit) | label-only | `lang/en.json:161` `EndScene`→`EndEncounter`; `actor-sheet.mjs:1481,1506,1514-1515`; `npc-sheet.mjs:1027,1061`; `character-sheet.hbs:555`; `npc-sheet.hbs:268`; `item-grants.mjs:5`; `actor-combatant.mjs:284`. Leave `essence.mjs:304 getSceneControlButtons` and `manifestation.mjs:48,108` alone — those are Foundry's Scene document, not the rules term. |
| Temporary Item → **Temporary Equipment** | label-only | `lang/en.json`; equipment templates |
| Artillery → **Blaster** | **schema enum** | `actor-adversary.mjs:56`; `monster-budgets.mjs:91` doc comment; `utils.mjs:13-20` `buildEnemyHeaderLabel` (no code change, but the doc example) |
| Monster Type Colossus → **Titan** | **schema enum** | `monster-types.mjs:17` |
| Boss → **Solo** / Grade → **enemy class** | already correct | `actor-adversary.mjs:20-27` already uses Champion/Leader/Solo and explicitly notes "'Boss' never appears as a value here." No change. |

### 3.2 Sheet/template implications

- The Equipment tab's three drop zones (`data-drop-slot`, `utils.mjs:221`) are keyed on the `slot` string. Rename the *value* and the `data-drop-slot` attribute together or drag-and-drop silently stops routing.
- `lang/en.json` keys expand as a nested dictionary (build-history l.1580) — rename keys, don't just edit values, or you leave a dead `Signature*` namespace.
- `character-wizard.mjs`'s `STEPS` array is positionally indexed by `#prepareStep`'s `switch` (`case 4: #prepareCombatSkills`). Rename step *labels* freely; do not reorder.

---

## 4. Data changes

### 4.1 Distinction Primary Attributes — verified wrong today

Confirmed by reading `packs/_source/distinctions/*.json`:

| Distinction | Current (V5) | V6 target | File |
|---|---|---|---|
| Athlete | `Vigor` | **`Might`** | `scripts/origin-data.json` + `packs/_source/distinctions/athlete_e44b3f075eb7d7e4.json` |
| Gifted | `Might` | **`Vigor`** | `…/gifted_169172178fbfe575.json` |
| Strategist | `Resolve` | **`Intellect`** | `…/strategist_67d9b6f9e466d352.json` |
| Psyker | `Intellect` | **`Resolve`** | `…/psyker_77c99a14b6c0e8e8.json` |

Marksman/Grace, Arcanist/Acuity, Orator/Presence, Invoker/Adaptability, Summoner/Anima all verified correct.

Edit `scripts/origin-data.json` (the authoritative source) and re-run `node scripts/build-packs.mjs --only=distinctions`. Do **not** hand-edit `packs/_source` — build-packs regenerates it.

### 4.2 Psionics Strain penalty table

`module/data/actor-combatant.mjs:8-12` currently:

```js
const STRAIN_PENALTY_THRESHOLDS = [
  { min: 2, composure: 1 }, { min: 4, harmony: 1 }, { min: 6, fortitude: 1 }
];
```

V6 (Appendix D, "Strain"): `0-2` no penalty; `3-4` −1 Composure; `5-6` −1 Composure **and Psionics cards require 1 additional burned die**. Harmony and Fortitude are not touched at any level.

Target:
```js
const STRAIN_PENALTY_THRESHOLDS = [{ min: 3, composure: 1 }];
const STRAIN_EXTRA_BURNED_DIE_AT = 5;
```
The extra-burned-die clause has no current home — surface it as a derived flag (`this.psionicsBurnSurcharge`) shown on the Combat tab. Also new in V6 and unmodelled: *"you may voluntarily gain 1 Strain to gain 1 free Surge"*, *"burn 2 Action dice to remove 2 Strain"*, and forced Strain past 6 → 1 Psychic Breach Damage per excess point. The `max: 6` cap at `actor-combatant.mjs:167` is correct and stays.

### 4.3 Subtype families

`module/data/expertise-database.mjs:22-31`'s `SUBTYPE_DATABASE`. **Careful:** its own doc comment (l.16-21) records that a 2026-09-08 "fix" against V5 Appendix A was *reverted* because the spreadsheet was authoritative. V6 §269 now resolves that contradiction in the book itself, so this time the change is correct — but reference V6 Appendix J explicitly in the commit so a future session doesn't revert it again.

Per the changelog's §7 audit (same table, and it applies here verbatim since this file is a copy of `essence-options.ts`): prowess has a spurious `Stance`; gestalt has `Mimic`; cunning has `Diversion`; magecraft is missing `Light`/`Shadow`/`Chaos`; psionics has `Resonance`; leadership has `Signal`; ritualism has `Circle`; calling lists only Rank 0-2 families (8 of 17). Re-derive all nine from V6 Appendix J. `EXPERTISE_DATABASE` (l.4-14) is unchanged in V6 — leave it.

Note the knock-on: `SUBTYPE_DATABASE.prowess` includes `"Stance"`, and `packs/_source/conditions/stance_*.json` is the Prowess **Specialty Condition**, which V6 retains. Removing the subtype must not remove the condition.

### 4.4 Influence recovery schedule — delete

`module/utils.mjs:111`:
```js
export const INFLUENCE_RECOVERY_TIME = { Light: "1 day", Serious: "1 week", Critical: "1 month" };
```
V6: *"Essence does not use a universal day, week, or month schedule."* Delete the constant and its two call sites (`actor-sheet.mjs:1263, 1351`, plus the npc-sheet copies). Replace the chat-log text with the Influence Consequence Card's own repair requirement once §6.6 lands; until then, omit the parenthetical entirely rather than print a deleted rule.

### 4.5 Temporary Influence / Temporary Wounds caps

- `actor-combatant.mjs:94` `temporaryInfluence: initial: 5` — V6: no universal maximum. Keep the field as a *display capacity* but drop the semantic cap: `#onSpendInfluenceForSlot` (`actor-sheet.mjs:1403-1408`) currently refuses when `current >= max`. Remove that guard.
- `actor-combatant.mjs:72-75` `temporaryWoundsAvailable` — the doc comment claims "up to the hard ceiling of 5"; V6 removed it. The field itself has no `max`, so this is comment-only plus any sheet that renders exactly 5 boxes.

### 4.6 Heritage Legacy text

`scripts/origin-data.json`, heritage entries:

| Legacy | Change |
|---|---|
| Sacred Trust (Temple Raised) | "reduce that Damage to 0" → **"reduce that pressure by 1"** (significant nerf) |
| Letters of Standing (Noble Household) | extra uses cost **1 ordinary Influence pressure**, not 1 Influence Breach |
| Prepared Cache (Frontier Household) | same Breach → ordinary pressure; banned-item list becomes "Weapon, Armor, Guard, Implement, Consumable Kit, or other significant Combat equipment" |
| Quartermaster's Due (Warcamp Raised) | now **one Chassis + one compatible Fitting**, each ≤1 Tier above Reach; replaceability clause dropped |
| Family Ledger (Merchant Family) | drop "up to your normal maximum" |
| Inherited Tools (Artisan Household) | Signature capacity → Inventory capacity |

**Code knock-on:** Quartermaster's Due is a registry entry in `module/data/item-grants.mjs:29-34` matching `[{category:"weapon"},{armor},{shield},{implement}]` with `reachMargin: 1`. V6 changes it from one complete item to a Chassis **and** a Fitting — the registry's `matchers` field only understands `equipment.category`, not `chassis`/`fitting` item types. This needs a registry-shape extension (a `types` matcher alongside `category`), not just a text edit. Classify as **logic change**, small.

Letters of Standing / Prepared Cache map onto `reachTriggers` (`actor-combatant.mjs:126-132`), whose `usedThisAdventure` flag exists specifically to gate "free first use, then Breach." The cost model changes to ordinary pressure — see §5.3.

### 4.7 Species traits

`scripts/origin-data.json`:

- **Per-Scene → per-Encounter** on 10 traits: Dreamtouched, Wild Escape, Lineage Scales, Bioluminescence, Regrowth, Unyielding Remains, Redundant Systems, True Breath, Ink Cloud, Spore Cloud.
- **Four traits become Species Combat Cards** with "Burn 2 Action dice": Shaper, True Breath, Ink Cloud, Spore Cloud. These need a *delivery mechanism* — see §6.7.
- **Natural Armament / Draconic Armament**: replace "leave one hand free" with V6's anatomy-specific requirement. Note this interacts with the existing `subChoiceField` (`item-origin.mjs:28`) whose `options` already carry "Claws, Horns, Fangs" — the sub-choice now determines the requirement, so the trait text should reference the selection.
- **Hardy / Shell or Hide**: add "does not apply to Damage with Breach."
- **Blooming**: "Temporary Item" → "Temporary Equipment."
- **Stitched Form** (`origin-data.json:135`) says "counts against your Signature Equipment Limit" — sweep all such phrases to "Inventory Limit."
- **Deathless Nature** (`origin-data.json:126`): **RESOLVED (§9.1) and BUILT, 0.6.99.** V6's revision delivered the new rule: "your Death Track ends at 7 instead of 5" (design/v6-revision-delta.md §2.3). `origin-data.json` now carries that text; `deriveDeathTrackMax()` (origin-features.mjs) derives the actor's effective cap (5, or 7 for Deathless) once, and every Death Track call site reads `system.deathTrackMax` instead of a hardcoded `5`.

### 4.8 Enemy Wound capacity

V6 §2410/§2467: Mook **2**, Normal **4**, Elite **5**, and a Solo *"keep[s] the standard Elite Wound capacity of five."* `module/data/monster-budgets.mjs` has no wound-capacity field at all — `resilienceBase`/`resiliencePerTier` are Resilience, a different axis, and every adversary inherits a fixed 5-space `coreWounds` array from `actor-combatant.mjs:79-87`.

Add `woundCapacity: 2 | 4 | 5` to `GRADE_BUDGETS` and make the adversary's `coreWounds` array length grade-driven. `EssenceManifestationData` already proves variable-length works (`actor-manifestation.mjs:40-48`: *"any length here 'just works' unmodified"*) because Apply Damage indexes by slot position. Also note that `monster-budgets.mjs` is GM-tunable via the `gradeBudgets` world setting (`grade-budgets-settings.mjs`) — add the new field to that settings form too, or stored overrides from 0.6.69 will mask the new default (`getGradeBudget` spreads `{...defaults, ...stored}`).

### 4.9 Fitting reconfiguration costs

`module/data/item-component.mjs:92-97` encodes V5's tiering:
```js
reconfigureCategory: choices ["simple", "structural"],   // "~1 die" vs "~3 dice"
reconfigureCostOverride: NumberField
```
V6 replaces this with one **Reconfigure** Basic Action: burn **3** Action dice for everything, structural Fittings out of combat only, Chassis change outside Combat with no Recovery/Downtime requirement, Augment swap **1 → 3** dice. Keep `reconfigureCategory` (it now means "combat-replaceable vs out-of-combat-only" rather than a cost tier) and update its doc comment; keep `reconfigureCostOverride` for per-item exceptions; retire the implicit 1-die default wherever it is read.

### 4.10 Manifestation rank ceiling

`module/data/actor-manifestation.mjs:21` `rank: { min: 0, max: 2 }` and `packs/_source/manifestations/` has 8 profiles (Familiar…Fey, Ranks 0-2). V6's entry-cost table covers Ranks 0-5 and Appendix H names **17** families. Widen `max` to 5 now (harmless, unblocks authoring); the 17 profiles themselves are **deprioritized, see §9.4/§6.10** — not scheduled for this pass.

---

## 5. Logic changes

### 5.1 Wounds & Death Track

**5.1.1 Wound State — `module/data/actor-combatant.mjs:291-297`**

Current:
```js
const filledCoreWounds = this.coreWounds.filter((w) => w.filled).length;
this.woundState = filledCoreWounds === 0 ? "Unharmed" : filledCoreWounds <= 2 ? "Lightly Wounded" : …
```
V6 §1650-1652: highest occupied severity → None / Light / Serious / Critical. Rewrite to scan `coreWounds` for the highest `severity` among `filled` entries, using a severity rank map. V6 §1657 adds that *occupancy still matters for remaining capacity* — expose both (`this.woundState` and `this.coreWoundsFilled`) since the Death Track now needs the second one.

**Consumers to update:** `character-sheet.hbs:69,106`, `npc-sheet.hbs:175,207`, `monster-sheet.hbs:183,215` (all three do `{{#if (eq system.woundState "Critically Wounded")}}` to show the Death Track — that condition is now *wrong*, see 5.1.3), and `documents/combat.mjs:168`.

**5.1.2 Wound placement and healing order**

- **Fill the earliest *available* empty space, skipping occupied ones.** `actor-sheet.mjs:1031` already does `coreWounds.findIndex((w) => !w.filled)` — **already V6-correct.** Gaps from recovery already absorb future Wounds.
- **"The Wound keeps the severity of the space it entered."** Already correct — `SEVERITY_BY_INDEX` (`utils.mjs:106`) is positional and recovery clears in place (`actor-sheet.mjs:1081`). No change.
- **Natural recovery is order-free; active healing is lowest-severity-first.** `#onRecoverWound` (`actor-sheet.mjs:1069-1098`) and `#onGrantRecovery`'s wound loop (`1155-1167`) both scan **backwards** (`for (let i = length-1; i >= 0; i--)`) — i.e. V5's *most severe first*. This is now **inverted** for active healing. Change to a forward scan, and add a separate GM-facing "natural recovery" action that lets the GM clear any chosen set of Wounds (the pip toggle at `actor-sheet.mjs:941` already provides this — document it as the order-free path and relabel the button pair accordingly).

**5.1.3 Death Track — the largest single logic rewrite**

Current model (`actor-combatant.mjs:229-230`): `deathTrackStep: 0-5`, `deathTrackFrozen: Boolean`; activated by "possesses a Critical Wound"; reset to 0 whenever slot 4 is recovered.

V6 §1665-1685 requires:

| V6 rule | Change |
|---|---|
| Governed by **all five spaces filled**, not by having a Critical Wound | `combat.mjs:168` `woundState === "Critically Wounded"` → `coreWoundsFilled === coreWounds.length`. Same for the three templates' `{{#if}}`. |
| Three states: **neither / Dying / Stabilized** | Replace `deathTrackFrozen: Boolean` with `deathTrackState: StringField, choices ["none","dying","stabilized"]`. Migration: `frozen:true` → `"stabilized"`; `frozen:false` + full track → `"dying"`; else `"none"`. |
| Activates at **0/5**; filling the last space does **not** advance it | `actor-sheet.mjs:1032-1034` currently only advances when the track is *already* full, which is coincidentally right — but the state transition to `"dying"` must be set at the moment the fifth space fills. |
| First automatic advance at the **start of the next Turn** | `combat.mjs:_onStartTurn` already advances at turn start. Correct as-is once the gate condition is fixed. |
| An extra Wound while **Stabilized** advances the track **and ends Stabilization** | New branch in `#onApplyDamage`'s full-track path. |
| Removing **any** Core Wound immediately stops automatic advancement; **recorded progress persists** | `#onRecoverWound:1088-1090` currently zeroes `deathTrackStep` whenever slot 4 is recovered. V6: only removing the **Critical** Wound resets to 0; removing any *other* Wound sets state to `"none"` but **keeps the step value**. Note the subtlety: with gap-filling, slot 4 is the Critical space, so `slot === 4` is still the right test for "removed the Critical Wound" — but the *other* four slots now need the new persist-progress branch, which does not exist. |
| A non-Dying character reduces the track by 1 per Recovery; a Stabilized full-track character qualifies | New effect in `#onGrantRecovery` (§5.4). |
| Deathless modifier | **Resolved and built, 0.6.99 — Death Track ends at 7 instead of 5, via derived `deathTrackMax`. See §9.1.** |

**5.1.4 Enemies do not use any of this**

V6 §2415: enemies do not assign Light/Serious/Critical spaces, receive Wound Cards, determine Wound State from their track, or use the Death Track — *"Mooks, Normals, and Elites, including Champions, Leaders, and Solos, normally use this simplified rule."* Today `EssenceAdversaryData extends EssenceCombatantData` and inherits all of it, and `npc-sheet.hbs`/`monster-sheet.hbs` render the full severity track plus a Death Track block.

Implement by overriding in `EssenceAdversaryData#prepareDerivedData` (which already overrides `defenses` for Mook/Normal, `actor-adversary.mjs:104-112`): set `this.woundState = filled >= capacity ? "Defeated" : ""` and a `usesSimplifiedWounds = true` flag the templates branch on. Remove `COMBATANT_TYPES`' npc/monster from the Death Track branch in `combat.mjs:168`.

**Resolved (§9.5): Ryan confirmed all enemy grades should roll dice, full V6 approach.** The Reduced Engine's `fixedAttack`/`fixedDefenses`/no-dice-pool design (`actor-adversary.mjs:33-48`, `monster-budgets.mjs` `REDUCED_ENGINE_DEFAULTS`) is **deprecated as the resolution model for Mooks and Normals** — move them onto the same Roll Limit / Attribute+Style-driven roll as Elites. This is separate from the Wound-capacity simplification above, which still applies to every grade regardless (Mook 2 / Normal 4 / Elite 5, no Wound State/Cards/Death Track for any of them). Net effect: enemies keep simplified *Wounds* but lose the simplified *combat resolution* — the opposite pairing from what `actor-adversary.mjs`'s current doc comment describes, so that comment needs rewriting alongside the code. Treat `REDUCED_ENGINE_DEFAULTS`'s fixed-number fields as removable once the roll-based replacement lands; don't maintain both paths.

### 5.2 Combat resolution — `module/dice/essence-roll.mjs`

**5.2.1 Minimum 2-die Pool commitment (V6 §721, §1496)**

`promptDiceCount` (`combat.mjs:30-51`) is called with `min: 0` for Initiative (correct — 0 = Pass) and the card-roll dialogs in `actor-sheet.mjs`/`npc-sheet.mjs` use the same shared shape. Add a `min` of 2 on every **card** commitment path, keep 0 for Initiative, and keep 1 legal for **non-combat** rolls — V6 explicitly calls the 1-die non-combat roll out as the exception to the floor. `rollEssencePool`'s `const n = Math.max(1, …)` (`essence-roll.mjs:63`) is a floor of 1 and must not become 2, because it serves non-combat too; enforce at the dialog, not the roller.

**5.2.2 Rank 0 floor of 2 maximum rolled dice (V6 §1512)**

No maximum-rolled-dice enforcement exists anywhere today — the dialog caps at the *Pool*, not at `Attribute + Style Rank`. Adding the max is a prerequisite for the Rank 0 floor being meaningful. Scope: compute `maxRolled = attr + styleRank` (floor 2 at Rank 0) from the card's `attr`/`skill` fields (`item-card.mjs:58-59`), and show it as advisory text in the commit dialog rather than a hard block — consistent with this project's standing "warn, never block" convention (`actor-sheet.mjs:1396-1399`).

**Resolved (§9.6): Equipment Cards use the same rules as Combat Cards** — Ryan confirmed no separate formula is needed. Equipment Cards get the identical minimum-commitment (§5.2.1), maximum-rolled-dice (this section), Action-die-and-resource cost handling as Combat Cards; drop the earlier "Equipment Cards have no Style Rank" framing — they resolve through whatever Style/Attribute pairing the card specifies, same as any other card. This also resolves the "prompts for Domain and dice count directly" special-case path added in v0.6.68 — fold it into the shared Combat Card commitment flow rather than keeping it as a separate code path.

**5.2.3 Unopposed cards (V6 §192 of the changelog)**

*"Unopposed cards auto-succeed; no die is reserved as the Success Die, so every rolled 6+ generates a Surge."* `resolveCombatRoll` (`essence-roll.mjs:28-40`) always reserves the highest die. Add an `unopposed` flag: when set, `succeeded = true`, `successDieIndex = -1`, and Surges count **every** face ≥6. The card schema needs a matching `unopposed: BooleanField` (or derive it from an empty `system.defense`, which is already how "no opposing defense" is encoded — cheaper, and the `openRoll` path at l.72 already distinguishes "no defense declared" for a different reason, so be careful not to conflate the two).

**5.2.4 Tied-high dice remain Surge-eligible**

V6: the non-chosen tied dice still generate Surges. `essence-roll.mjs:38` excludes only `i !== successDieIndex`, which is **already correct** — a tied die at a different index still counts. No change; verify with a test.

**5.2.5 "A natural 10 is not an automatic success"**

`succeeded = successDie >= defense` (l.37) already produces this correctly for Defense > 10. No change. Worth a comment so nobody "helpfully" adds a nat-10 rule later.

**5.2.6 Free Dice (V6 §721)**

New named concept: rolled without leaving the Pool, **may exceed the normal maximum**, can become the Success Die or generate Surges, but never satisfy a minimum commitment. Add `freeDice` as a separate parameter to `rollEssencePool` so the chat card can distinguish them visually and so the 2-die minimum check ignores them. Required by Leadership's Rallied condition (Appendix D: *"1 free die… can exceed the normal maximum but does not satisfy the card's minimum"*) and by non-combat Cooperation (§5.5).

**5.2.7 Reactions: one response per chain (V6 nerf)**

`playState.lastReactionRound` / `lastReactionCombatantId` (`actor-combatant.mjs:221-222`) implement V5's "one Reaction per Action" as a soft per-Turn proxy, and the schema comment honestly documents it as approximate. V6 tightens to **one response per chain** — strictly narrower, and a *chain* is even less representable than an Action instance in a system with no card-resolution runtime. Recommendation: keep the proxy, update its warning text to name the chain rule, and log the gap. Do **not** build a chain tracker; that is a combat-runtime project (see §6.8).

**5.2.8 Unaware Reaction tax**

V6 converts V5's absolute block into "burn 1 additional Reaction die." Purely additive: a checkbox on the Reaction commit dialog that adds 1 to the deduction without adding a die to the roll. Small, and a real quality-of-life win. Depends on nothing.

### 5.3 Influence & Reach

**5.3.1 Reach pressure (the new first layer)**

Add `system.reachPressure: NumberField{integer, initial: 0, min: 0}` to `EssenceCombatantData` (NPCs use Reach too — the schema comment at `actor-combatant.mjs:104-113` explains why Reach lives in the shared base).

Rewrite `#onApplyInfluenceInjury` (`actor-sheet.mjs:1219-1280`) — and its copy in `npc-sheet.mjs` — from the current 2-layer loop to V6's 3-layer sequence:

```
ordinary pressure → Reach (up to effectiveReach − reachPressure) → Temporary Influence → Core Influence
Influence Breach  →                    (skips Reach)              → Temporary Influence → Core Influence
```

The dialog's current "Voluntary (skip Temporary Influence)" checkbox is a V5-shaped concept; replace it with a **pressure type** selector: *Ordinary pressure* / *Influence Breach*. Note V6 §1274: *"Reach does not decrease as pressure accumulates. Record the accumulated pressure instead"* — so `effectiveReach` (`actor-combatant.mjs:287-289`) stays a pure function of base + equipment + triggers, and `reachPressure` is tracked separately. This matters because Reach Triggers temporarily raise Reach without rewriting earlier expenditures.

**5.3.2 Reach pressure reset**

V6 §"Reach Pressure Resets Slowly": resets at a story beat, normally end of Adventure; spent Temporary Influence stays spent. `utils.mjs#resetAdventureUses` (l.184-196) is exactly the right home — add `"system.reachPressure": 0` to its update. (It is already the manual Adventure-boundary button both sheets share.)

**5.3.3 Delete `standing`**

`actor-combatant.mjs:299-306` derives `this.standing` from the count of filled Core Influence, citing *"part-v-social-encounters.md § Standing by Injury State."* V6 **deleted that table outright**. Replace with a highest-severity label mirroring the new `woundState` (for the sheet headers at `character-sheet.hbs:504` and `npc-sheet.hbs:223`), or drop the display entirely in favour of the Influence Consequence Card name once §6.6 lands.

**5.3.4 Delete `#onContributeToGoal`'s framing**

`actor-sheet.mjs:1295-1368` implements *"§ Collaborative Influence Pooling"* — a section V6 **cut and explicitly replaced** with "Essence does not use a pooled Team Influence track… characters do not add their Reach together." The good news: the implementation's own doc comment already argues for a per-character, non-pooled model, so the *behaviour* survives V6 intact. Change is limited to the doc comment, the button label, and routing its spend through the new 3-layer sequence. Low risk, and a nice example of a prior design call aging well.

**5.3.5 Inventory over-limit → ordinary pressure, rounded up on the total**

`actor-sheet.mjs:500`:
```js
context.signatureOverLimit = Math.max(0, Math.floor(context.signatureUsed) - system.signatureEquipmentLimit);
```
V6 §275 of the changelog: excess capacity is rounded **up on the total** (4.5 supported capacity = 1 pressure; 5.5 = 2), and generates **ordinary Influence pressure**, not a flat 1 Temporary Influence. Two changes:
- `Math.floor` → `Math.ceil`.
- `#onSpendInfluenceForSlot` (`actor-sheet.mjs:1401-1414`), which today does `currentTemporaryInfluence + 1` and nothing else, must route through §5.3.1's sequence instead. Rename to `#onPayInventorySupport`.
- V6 also adds *"another character can pay the support cost"* using their own Reach/Influence. Model as an optional actor picker on that dialog; capacity still belongs to the owner. Small.

### 5.4 Recovery — `#onGrantRecovery` (`actor-sheet.mjs:1110-1187`)

The existing implementation is a GM-judgement dialog built deliberately *because* V5 had no number (see its doc comment, l.1100-1108). V6 supplies the number, so this becomes a real automation:

| V6 rule | Current | Change |
|---|---|---|
| Restore 25% of max Stamina/Focus/Mana, **rounded up** | default 25%, `Math.round` (l.1143) | `Math.ceil`; keep the % field as a GM override but default it authoritatively |
| Reduce Death Track by 1 (non-Dying, incl. Stabilized full-track) | absent | new |
| Clears Psionic Strain | absent | `"system.specialties.strain": 0` |
| Removes 1 Manifestation Wound | absent | walk `specialties.manifestationRecords` / the linked manifestation Actor |
| Restores **no** Temporary Wounds, **no** Temporary Influence, does not clear Core Influence, does not reset Reach pressure, does not refill Consumable Kits | correctly absent | keep absent; add a note in the dialog so a GM doesn't hand-do it |
| One fictional opportunity = one Recovery; cannot subdivide | n/a | dialog copy |

Active Core Wound healing stays a *separate* GM action (V6 keeps Light = "appropriate Recovery with care," Serious = post-Adventure Downtime, Critical = TBD). The existing "Recover Core Wounds" checkbox should stay but switch to lowest-severity-first (§5.1.2).

### 5.5 Non-combat rolls

V6 is the first edition with any non-combat formula, and the module already half-implements it:

- `#onRollNonCombatSkill` (`actor-sheet.mjs:641`) computes `attribute + rating` — **already V6-correct** (V6: `relevant Attribute + relevant Non-Combat Skill Rank`).
- No relevant Skill → Attribute alone; **1-die roll explicitly legal**. `rollEssencePool`'s `Math.max(1, …)` already permits this. Correct.
- **Key Aspects = relevant Attribute + 5, replacing (not stacking with) a Skill Rank.** `keyAspects` is `ArrayField(StringField)` with no roll support (`actor-character.mjs:22`). Add a roll button per Key Aspect. This is the *single largest non-combat buff in V6* and is currently unmodelled. Small, high value.
- **Career has no Rank and is never rolled.** `career` is a plain string (`actor-character.mjs:21`) — already correct by accident. Add a tooltip.
- **Cooperation: each meaningfully helping character grants 1 free die to the lead roll.** Needs §5.2.6's Free Dice parameter. Small.
- **No Non-Combat Surges** unless stated. `rollEssencePool` always computes a Surge count and `countD10Successes` returns a legacy pool-successes value. For non-combat labels, suppress both in `roll-card.hbs`.

### 5.6 Damage — `#onApplyDamage` (`actor-sheet.mjs:966-1060`)

| V6 rule | Change |
|---|---|
| **Resistance −2 / Vulnerability +2, applied before Resilience or Breach** | New. See §6.2. Insert between the dialog result and the accumulation math at l.1004. |
| **Breach bypasses Resilience, not Resistance** | Current `if (result.breach) wounds = result.amount` (l.1004-1005) skips *everything*. Must still apply Resistance/Vulnerability. |
| **Breach does not add to accumulated ordinary Damage** (V6 §1626) | Already correct — the breach branch doesn't touch `newAccumulated`. |
| **Resilience "remaining protection" = current Resilience − accumulated ordinary Damage, min 0**; a mid-interval Resilience change never retroactively creates/removes Wounds | The current prev/new-wounds delta (l.1008-1010) computes the right answer *when Resilience is constant*, but recomputes `prevWounds` with the **new** Resilience, so a mid-interval Resilience change does retroactively rewrite history. Store the already-converted wound count in `playState` instead of re-deriving it. Genuine bug fix that V6 makes explicit. |
| **Mixed-Domain Damage cycle** `Spiritual → Mental → Physical → repeat`, skipping absent domains | New. The dialog takes a single domain today. Medium; defer to a later phase. |
| **Cover: Low +1 / High +2 Fortitude** | §6.3. |

### 5.7 Equipment

- **~~Armory 8 is inclusive of the 4 prepared items.~~ REVERSED 2026-09-20 — do not re-apply.** The system's author confirms Inventory, Temporary and Armory are three separate containers you move items between: each counts only what is in it, and an item in your Loadout does not also consume an Armory slot. `computeSlotUsage` counting each `slot` bucket independently was correct all along. The original (wrong) instruction follows for the record. **Armory 8 is inclusive of the 4 prepared items.** `computeSlotUsage` (`utils.mjs:128-143`) counts each `slot` bucket independently, so a character can hold 4 Inventory + 8 Armory = 12. V6: *"It is not eight reserve items plus four carried items."* Change the Armory figure shown on the sheet to `inventoryUsed + armoryUsed` against `armoryLimit`. Note the changelog's §7 recommendation that Armory over-limit become an error rather than a warning — **don't**, on this codebase. `actor-sheet.mjs:1396-1399` records an explicit standing decision to warn rather than block, matching the rules' own "normal operating limit, not an absolute prohibition."
- **Used vs unused preparation commitment** (the central new equipment rule). Prepared-but-*unused* allocation transfers to an equal-capacity replacement on Armory access; **used** allocation stays committed for the rest of the Adventure. Needs a per-item `usedThisAdventure: BooleanField`, set on any roll/Use spend, cleared by `resetAdventureUses`. Medium; genuinely new bookkeeping with no existing analogue. High table value — its stated purpose is stopping consumable cycling, which is exactly the thing a VTT makes trivially easy.
- **Augments are 0 capacity everywhere** — `utils.mjs:140` already returns 0 unconditionally. Correct.
- **Lending / item state travels with the physical item** — no model; low priority.
- **"Exceptional Loot Does Not Charge Rent"** — earned/found equipment above Reach carries no surcharge. `computeReachGate` (`utils.mjs:160-170`) warns on any `cost > allowance`. Add a per-item `foundLoot: BooleanField` that suppresses the warning, reusing the existing `reachExceptionSource` machinery rather than a parallel concept.
- **Function Augment / Consumable Kit Adventure-end refresh removed.** `resetAdventureUses` (`utils.mjs:184-196`) refreshes both. V6 deletes the universal rule and supplies no replacement. **Resolved (§9.2): low priority.** Ryan doesn't need this solved now — keep `resetAdventureUses` refreshing both exactly as it does today (the V5 blanket rule) and don't spend build time writing the 12 per-item recovery rules the V6 catalog would otherwise need. Revisit if/when it actually comes up in play.

---

## 6. New subsystems

Each entry: scope estimate, dependencies, and blocked status.

### 6.1 Reach pressure accumulation — **small**, not blocked
Covered mechanically in §5.3. Listed here because the *field* and the *reset semantics* are net-new. One schema field, one derived value, one reset hook, two sheet rows. **Do this early** — it's the highest table-value-per-line item in the whole plan.

### 6.2 Resistance / Vulnerability — **small**, not blocked
V6 §1612-1616 gives hard numbers (±2, before Resilience/Breach, min 0). Needs: an actor-level list field (`resistances`/`vulnerabilities`, each `{damageType, source}`), a lookup in `#onApplyDamage`, and sheet UI. Note V6 §418 — a Distinction Origin Benefit already grants *"one narrow Resistance associated with your Origin"* — so `item-origin.mjs`'s Distinction schema may want a structured `grantsResistance` field alongside the prose `origin.text`. Also note `actor-manifestation.mjs` and equipment can both supply Resistances (V6 §1868).

### 6.3 Cover — **small**, not blocked
Low +1 / High +2 **Fortitude only**; creatures do not provide Cover by default; the attack's source (magical vs mundane) is irrelevant. Cleanest implementation: two Condition Items in `packs/_source/conditions/` with transferred Active Effects on `system.fortitudeBonus` — this reuses the existing Token HUD → Condition Item pipeline (`documents/actor.mjs:25-53`) with **zero new code**, and Cover is inherently transient, which matches how that pipeline already works. Strong "Foundry-native first" fit (build-history lesson #5).

### 6.4 Wound Cards — **medium**, not blocked
V6 replaces the generic "Wound Condition" with a **Wound Card** (severity + domain), and Appendix E prints nine authoritative fallbacks. `actor-combatant.mjs:77-79` currently generates a display-only label string and its own comment says *"the game's own named Wound Condition reference doesn't exist in canon yet."* **It does now.** Author the nine as Condition Items (Physical/Mental/Spiritual × Light/Serious/Critical) with real Active Effects — Physical Light = Movement −1, Physical Serious = Movement −2, Physical Critical = halve Movement; Mental = −1/−1/−2 Composure; Spiritual = −1/−1/−2 Harmony. The burned-die escalation on Serious/Critical has no Active Effect representation and stays reminder text, consistent with build-packs.mjs's documented rule that only flat unconditional changes become Active Effects.

Then wire `#onApplyDamage` to attach the matching Wound Card Item when it fills a space, and remove it on recovery. This turns a cosmetic string into a real mechanic and is probably the most *satisfying* single deliverable in the plan.

### 6.5 Ordinary Condition catalog — **small-medium**, content, not blocked
V6 Appendix C prints 8 with numbers: Blinded, Burning, Dazed, Immobilized, Prone, Restrained, Silenced, Weakened. The existing `packs/_source/conditions/` holds 21, of which only **Burning** and **Dazed** overlap by name. The other 12 ordinary ones (Bleeding, Chilled, Concussed, Corroded, Displaced, Distorted, Punctured, Revealed, Shocked, Withered) are not in V6's catalog — but V6 says the list is *"deliberately restrictive rather than exhaustive"* and permits card/enemy design to add more, so they should be **kept and reclassified**, not deleted. The 9 Specialty Conditions (Stance, Lock, Unstable, Exposed, Concentration, Strain, Rallied, Possessed, Broken) are all present and V6 retains them all — but V6 Appendix D now prints *full rules* for each where V5 deferred them, so all nine need their text replaced with V6's. Add the 6 missing ordinary ones. Also add V6's stacking rule to the pack's guide text: different named effects stack; same-named ordinary refreshes duration rather than increasing magnitude.

### 6.6 Influence Consequence Cards — **medium**, partially blocked
Appendix F prints three fallbacks (Light: Reach −1 in one sphere; Serious: Reach −1 generally + one blocked relationship; Critical: Reach cannot absorb pressure in the collapsed sphere at all + major access loss). Authorable as Items today; the Light and Serious ones even map onto `reachBonus` as Active Effects. **Partially blocked:** V6 itself admits *"The complete Influence Consequence catalog still needs an explicit full-track procedure"* — so the "all five Core Influence spaces filled" case has no rule (the Core Wound asymmetry noted in gap-regressions §2.8). `actor-sheet.mjs:1257` currently prints "the GM adjudicates any further consequence," which remains the correct behaviour. Ship the three cards; leave the full-track path as GM adjudication.

### 6.7 Species Combat Cards — **small**, not blocked
V6: a Species Trait may grant a unique unranked Combat Card that does **not** consume the 10 learned-card selections. Four exist (Shaper, True Breath, Ink Cloud, Spore Cloud, each "Burn 2 Action dice"). The wizard's card budget (`character-wizard.mjs:303-318`, `cardLimit = CARD_LIMIT + bonus.actionCards`) must exclude them. Cleanest: mark them with a flag (`system.speciesGranted: true`) and filter in `context.cardCount`. `isBasicCard()` (`character-wizard.mjs:17`) already establishes the "identified by an empty `system.style`" pattern for the other non-counting category — follow it, but use an explicit flag rather than overloading `style`, since Species cards *do* have thematic Style ties.

### 6.8 Cooldowns / once-per-Encounter tracking — **medium**, not blocked
V6: cards are available unless printed otherwise; a cooldown starts when the card is *played*, even if it fails or is interrupted, and belongs to the **technique** (a second printed copy doesn't bypass it). Also: "Combat beginning inside an existing Encounter does not restart the Encounter — once-per-Encounter abilities stay spent." The adversary `abilities` array already has exactly this shape (`actor-adversary.mjs:86-93`: `frequency: atWill|perRound|perCombat`, `usesRemaining`, `usedThisRound`, reset in `combat.mjs:_onStartRound`/`_onStartTurn`). Extend that proven pattern to player Combat Cards rather than inventing a second mechanism. Note the Encounter-vs-Combat distinction: `_onStartRound(round === 1)` currently means "combat start," which V6 says is *not* an Encounter boundary — needs an explicit GM "New Encounter" button, matching this project's manual-lifecycle convention throughout.

### 6.9 Advancement Points & Skill Tree — **large**, **PARTIALLY UNBLOCKED** (§9.3)
**Resolved: point economy is 49, not 80.** Ryan confirmed the older 80-point design document (`The Skill Tree System.md`) is superseded and no longer relevant — build only against V6's formula, `AP = (Tier − 1) × 10 + (Level − 1)`, max 49. Ship the `advancementPoints` derived field from that formula now, read-only, plus "Level 1 grants no AP" (V6 §279) — small, unblocked, do it in Phase 7 as planned.

**Still blocked: the tree itself.** V6 never defines the actual nodes (what a point buys, how nodes connect, node costs). Ryan confirmed a fresh node design is in progress separately, not the old 80-point document's node list. Do not build the tree UI, node data, or spend/allocate logic until that design lands — the point *total* is settled, but there's nothing to spend it on yet. Treat the derived-field work above as the full scope of what's buildable in this pass.

### 6.10 Calling Full Manifestation V6 rewrite — **large**, **DEPRIORITIZED** (§9.4)
V6 turns ~20 lines into a full subsystem: entry-cost table by Rank (burned dice 3/3/3/4/4/5, Mana 0/1/2/3/4/5), native minimum-dice tables, printed **Roll Limit** replacing `Attribute + Style Rank`, the Absent Caller pause rule, per-Turn maintenance (burn 1 Action die), **one shared 5-space Manifestation Wound track across all of a character's manifestations**, and a brutal defeat rule (caller suffers 1 Spiritual Core Wound bypassing Resilience/Resistance/Temporary Wounds/any prevention).

**Resolved: not a priority for this pass** — Ryan indicated Summoner/Calling content is likely to be deprioritized rather than expanded right now, so don't schedule the 17 manifestation profiles or this rewrite into the near-term build order; move it out of Phase 7 and treat it as backlog. **When it is eventually built: default to V6's model** — Ryan confirmed the shared 5-space Manifestation Wound track (not the already-shipped per-subtype `manifestationRecords` model) is the target, wherever V6 has an actual answer. The maintenance-burn, Absent Caller pause, and defeat-consequence pieces that don't depend on the missing profile data can still land opportunistically since they're small and unblocked — just don't treat the subsystem as a near-term deliverable.

Several of these are implementable against the current `module/apps/manifestation.mjs` + `actor-manifestation.mjs` today — notably the maintenance burn, the Absent Caller pause, and the defeat consequence (`applyManifestationDefeat` already exists and already transfers overflow). But the **shared** wound track contradicts the current per-subtype `manifestationRecords` model (`actor-combatant.mjs:182-186`, citing `CALLING_PROFILES.md`'s "one persistent Wound record per subtype"), and the 17 profile stat blocks V6 needs do not exist in either book. Ship the mechanical rules that don't need profile data; block the rest.

### 6.11 Mixed-Domain Damage cycle — **small**, not blocked
`Spiritual → Mental → Physical → repeat`, skipping absent domains. Extends `#onApplyDamage`'s single-domain dialog to accept per-domain amounts. Low priority, clean scope.

### 6.12 Magecraft Thread effects — **small**, not blocked
V6 Appendix G prints all ten for the first time (Fire +1 Damage; Water move 2 units; Earth +1 Fortitude; Air +2 Range; Time extend one effect one Turn; Space +1 unit radius/length; Light +1 to the Success Die, can exceed 10; Shadow −1 to an enemy's next Success Die; Aether −1 Focus cost min 0; Chaos reroll one rolled die). Today `specialties.threads` is `ArrayField(StringField)` — bare family names with no effect data (`actor-combatant.mjs:163`). Add a `THREAD_EFFECTS` lookup in `expertise-database.mjs` and render the effect text beside each stored Thread. Also new: a Thread cannot strengthen the Action that created it; duplicates allowed; effects stack; consumed Threads are spent even if the card fails. All display/reminder text.

---

## 7. Content re-authoring

Distinct from code, and with a pipeline quirk that determines who can do it.

### 7.1 Where content actually lives

| Pack | Entries | Source of truth | Editable in this repo? |
|---|---|---|---|
| `action-cards` | **313** | Neon Postgres ("Essence" project) via `scripts/fetch-from-neon.mjs` | ❌ upstream |
| `reaction-cards` | **110** | Neon | ❌ upstream |
| `equipment` | **105** | `scripts/component-catalog-data.json` + `extra-equipment-data.json` (+ Neon for equipment cards) | ✅ mostly |
| `species` / `heritages` / `distinctions` | 9 / 9 / 10 | `scripts/origin-data.json` | ✅ |
| `conditions` | 21 | hand-authored in build-packs | ✅ |
| `manifestations` | 8 | `scripts/calling-profiles-data.json` | ✅ |
| `combat-styles` | 9 | `scripts/combat-styles-data.json` | ✅ |
| `guide` | 3 journals | `scripts/guide-data.json` | ✅ |

**The 423 Combat Cards are not editable here.** Any terminology or rules change in card text (Combat Skill → Style, per-Scene → per-Encounter, Thread effects, the 2-die floor's effect on Psyker's Sacrificial Power and Summoner's Greater Manifestation) has to happen in Neon first, then `fetch-from-neon.mjs`, then `build-packs.mjs`. Budget that as a separate upstream workstream, and heed build-history known-gap #3: **sanity-check `scripts/.cache/raw-*.json` row counts before treating any rebuild as authoritative** — a stale/empty cache silently wipes the compendium, which was a near-miss in v0.6.14.

### 7.2 Work items, by scale

| Item | Scale | Notes |
|---|---|---|
| Distinction `primaryAttr` ×4 | 4 fields | §4.1. Trivial, do first. |
| Heritage Legacy texts ×6 | 6 entries | §4.6 |
| Species per-Scene → per-Encounter | 10 traits across 9 species | §4.7 |
| Species Traits → Combat Cards ×4 | 4 new card entries + 4 trait rewrites | §6.7 |
| Species misc (Armament, Hardy, Blooming, Stitched Form) | ~5 entries | Deathless's own Nature text is out of scope here — already built separately in 0.6.99, see §4.7/§9.1 |
| Ordinary Conditions | +6 new, ~14 reclassified | §6.5 |
| Specialty Conditions | 9 rewrites (V6 prints full rules for the first time) | §6.5 |
| Wound Cards | 9 new | §6.4 |
| Influence Consequence Cards | 3 new | §6.6 |
| Basic Combat Cards | 6 (Basic Melee, Basic Ranged, Defend, Dash, **Reconfigure**, **Stabilize**) | Reconfigure and Stabilize carry real costs (burn 3) and are load-bearing for §4.9 and §5.1.3 |
| Equipment catalog re-sync | **60 Components** (Swap column) + **17 Equipment Cards** (roll cap — resolved, no separate work needed, §9.6) | Swap column is mechanical, do it. Function Augment recovery text (§9.2) is deprioritized — skip it, keep the blanket refresh. |
| Combat Card text sweep | **423 cards**, upstream in Neon | Terminology + the retroactive 2-die constraint |
| Guide journals & wiki mirror | 3 journals + wiki | See §7.3 — expanded scope per Ryan's request to also cover Handouts/Compendium |
| Calling profiles | 8 → 17 | **Deprioritized** (§9.4) — not scheduled for this pass |
| Manifestation Rank ceiling | 1 schema field | §4.10 |

### 7.3 Handouts & Guide Journals — expanded scope

Ryan flagged this as its own requirement: the in-world Handouts and Compendium reference material need to be brought in line with the V6 knowledge base too, not just the underlying data/code.

**What this covers:**
- The `guide` Journal compendium's three entries — **Player's Guide**, **Game Master's Guide**, **Full Manifestation Guide** (`scripts/guide-data.json`) — are still written against V5 terminology and rules. Every rename in §3 and every rule change in §4-§6 that this plan implements needs the matching sentence rewritten in whichever of these three journals references it.
- The `essence-foundry.wiki` mirror repo (referenced by this project's own `sync-rules-docs` skill) needs the same edits. That skill's stated trigger is exactly this scenario: *"whenever a rules paragraph is added, removed, or reworded... check whether the wiki mirror and the in-world Player & GM Guide compendium journal need the same edit."*
- Any other player-facing reference content shipped as Compendium entries beyond the core rules data — Species/Heritage/Distinction/Condition/Card descriptive text is already covered per-item in the table above; this section is specifically about the **summary/reference journals**, which restate rules in prose rather than as structured data, so they don't get fixed automatically when the underlying data changes.

**How to sequence it:** don't treat this as one big end-of-project sweep — the `sync-rules-docs` skill exists precisely so it doesn't become that. As each phase in §8 lands a rule change, check the three guide journals and the wiki for the same fact and update it in the same session or the next one, the way the skill describes. Reserve a final pass at **0.7.0** (alongside the Combat Card text sweep) to catch anything that slipped through phase-by-phase — treat that as a safety net, not the primary mechanism.

---

## 8. Suggested build order

Respecting this project's one-topic-per-version, changelog-per-session convention (`CHANGELOG.md` + `whats-new.mjs` reads it back automatically, so each entry is player-facing copy — write it that way). Renames land before the logic changes that touch the same fields, to avoid rebasing.

**Revised against Ryan's priorities (§9).** Two changes from the original draft: the enemy resolution-engine rewrite (§9.5) is a firm, confirmed decision, not a maybe — it's pulled into Phase 3 alongside the Wound/Death core instead of sitting unscheduled. The Skill Tree node build and the Calling/Summoner rewrite (§9.3, §9.4) are confirmed **deprioritized** — they're cut entirely from this update's phases below, including the small "unblocked pieces" of Calling that were previously scheduled at 0.6.94. Per §7.3, guide-journal and wiki updates now happen alongside each phase that changes a rule, not just at the end — noted per-phase below.

**Phase 0 dropped — no live games.** §2's migration framework is deferred until the module is next used at a real table (build it then, ahead of whatever V6 sync work is still outstanding at that point — don't launch a live game on an unmigrated schema). That collapses the old Phase 0/1 split: renames go straight in, no transitional enum window, no migration step per rename.

**Phase 1 — renames**

- **0.6.70** Combat Skill → Combat Style. Label-only. Lowest risk, highest visibility — good first V6 signal.
- **0.6.71** Species Adaptations → Species Traits (actor + item schema + grants registry). Straight rename, no transitional period needed.
- **0.6.72** Signature → Inventory, including the `slot` enum value outright (`"signature"` → `"inventory"`, no dual-choices window). Biggest blast radius of the renames; still worth its own version for review clarity.
- **0.6.73** Artillery → Blaster, Colossus → Titan, Scene → Encounter labels.

**Phase 2 — pure data (no logic, no migration)**

- **0.6.74** Distinction `primaryAttr` ×4; `SUBTYPE_DATABASE` re-derived from Appendix J; Strain penalty table; delete `INFLUENCE_RECOVERY_TIME`; Temp Influence/Wound cap comments; Manifestation rank ceiling.

**Phase 3 — the Wound/Death core (the reason to do this at all)**

- **0.6.75** Wound State by highest severity + active-healing lowest-first + the `combat.mjs` gate fix.
- **0.6.76** Death Track rewrite: `deathTrackState` enum, 0/5 activation, persistence, stabilization-break-on-extra-wound.
- **0.6.77** Wound Cards (9 Condition Items + attach/detach wiring).
- **0.6.78** Enemy simplified Wounds: grade-driven capacity 2/4/5, no Wound State / Wound Cards / Death Track for adversaries.
- **0.6.79** Enemy resolution engine (§5.1.4, §9.5, confirmed): retire the Reduced Engine's fixed-attack/fixed-defense model for Mooks and Normals, move all enemy grades onto V6's roll-based resolution alongside Elites. Update `actor-adversary.mjs`'s doc comment to match the new pairing (simplified Wounds, full rolling) instead of the old one.

**Phase 4 — Influence**

- **0.6.80** Reach pressure field + 3-layer resolution + Influence Breach + reset in `resetAdventureUses`; delete `standing`; re-frame `#onContributeToGoal`.
- **0.6.81** Influence Consequence Cards (3) + Inventory-over-limit → ordinary pressure (`Math.ceil`, third-party payer).

**Phase 5 — combat resolution**

- **0.6.82** Recovery: 25% rounded up, Death Track −1, clear Strain, −1 Manifestation Wound.
- **0.6.83** 2-die minimum enforcement + Rank 0 floor + max-rolled-dice advisory + Free Dice parameter. Equipment Cards ride along automatically here per §9.6 (same rules as Combat Cards) — no separate step needed.
- **0.6.84** Unopposed cards; unaware Reaction tax; one-response-per-chain warning text.
- **0.6.85** Damage: Resistance/Vulnerability ±2, Breach-vs-Resistance fix, the Resilience mid-interval bug fix.
- **0.6.86** Cover (two Condition Items + Active Effects).

**Phase 6 — equipment & conditions**

- **0.6.87** Reconfigure = burn 3 (schema + catalog Swap column re-sync, 60 rows); Chassis change no longer requires Recovery. Skip Function Augment per-item recovery text (§9.2, deprioritized) — leave the blanket refresh as-is.
- **0.6.88** Used-vs-unused preparation commitment; Armory-inclusive-of-Inventory; "Exceptional Loot Does Not Charge Rent."
- **0.6.89** Ordinary Condition catalog (+6, reclassify 14) + 9 Specialty Condition rewrites + stacking rules.

**Phase 7 — remaining mechanics**

- **0.6.90** Non-combat: Key Aspect = Attribute + 5 roll buttons; Cooperation free dice; suppress non-combat Surges.
- **0.6.91** Magecraft Thread effects table; Basic Combat Cards (6) incl. Reconfigure/Stabilize.
- **0.6.92** Cooldowns / once-per-Encounter for player cards; explicit "New Encounter" GM button.
- **0.6.93** Species Combat Cards (4) + wizard card-budget exclusion.
- **0.6.94** Creation rules: Expertise limit = Style Rank (+1 for Distinction Style), replacing the flat `EXPERTISE_COUNT = 4` cap at `character-wizard.mjs:20`; `advancementPoints` derived read-only field at the confirmed 49-point formula (§9.3); "Level 1 grants no AP." Skill Tree node build and Calling/Summoner rewrite (§9.3, §9.4) are cut from this phase entirely — deprioritized, not scheduled.
- **0.6.95** Mixed-Domain Damage cycle.
- **0.6.96** `module/migration.mjs` framework (§2) — build this before the module is next used at a real table, not before it, so it's ready whenever a live game starts.

**Phase 8 — content release**

- **0.7.0** Neon-side Combat Card text sweep (423 cards) + full `build-packs.mjs` rebuild. Version-minor bump because this is the point where the shipped *content* becomes V6 rather than V5-with-V6-code. Guide journals and the wiki mirror (§7.3) should already be mostly current by this point from the per-phase updates — this version is a final consistency pass over them, not their first pass.

All nine open questions are now resolved (§9). Two changed the schedule directly: the enemy resolution engine (§9.5, §5.1.4) is now in scope for Phase 3 rather than waiting; the Skill Tree's node design and the Calling/Summoner rewrite (§9.3, §9.4, §6.9, §6.10) remain out of the near-term sequence, but because they're deprioritized, not blocked — pull them back in whenever Ryan wants Summoner content or the tree topology prioritized.

---

## 9. Design decisions from Ryan

All nine questions are answered. Kept here as a decisions log — what was asked, what Ryan said, and what it means for the build. Downstream sections (§4.7, §5.1.4, §5.2.2, §5.7, §6.9, §6.10) have been updated to reflect these; this section is the record of *why*.

**9.1 Deathless species — survival trait. ANSWERED, built in 0.6.99.** V5 had a working rule (+1 to Death Track starting buffer); V6 initially dropped it to a placeholder, then a later revision of the V6 draft delivered the actual replacement rule: "Deathless Nature - Playtest: your Death Track ends at 7 instead of 5" (design/v6-revision-delta.md §2.3/§4.1) — a threshold change, not V5's starting-buffer change. `origin-data.json`'s Deathless Nature text now states this; `deriveDeathTrackMax()` (origin-features.mjs) computes the actor's effective cap once, and every one of the five Death Track call sites that used to hardcode a literal `5` now reads the derived `system.deathTrackMax` instead (see §4.7).

**9.2 Augments — how they recharge.** V5 refreshed all Augments automatically between Adventures; V6 asks for per-item recovery rules that don't exist yet for any of the 12 catalog Augments. **Decision: not important right now.** Keep the V5 blanket refresh as the default; don't spend time writing 12 individual recovery rules (see §5.7).

**9.3 Skill Tree — point total.** V6's formula gives 49 points; an older design doc specified 80. **Decision: the old 80-point document is out of touch, no longer relevant.** Build only against V6's 49-point formula. The tree's actual nodes are a separate, **in-progress** design — not the old document's node list — so the point total is settled but there's still nothing to spend it on yet (see §6.9).

**9.4 Summoner — the 17 manifestation forms.** Only 8 of 17 forms have any stats, and those are rough/early. **Decision: likely to be deprioritized, not a near-term priority.** Don't schedule the full profile-writing effort. Separately: **default to V6's shared Manifestation Wound track** (not the already-shipped per-subtype model) for whatever pieces of this do get built later (see §6.10).

**9.5 How weak enemies fight.** The module already shipped a design where mooks use fixed numbers instead of rolling; V6 has every enemy grade roll dice like a player. **Decision: moved away from fixed numbers — mooks and all enemies should roll.** Deprecate the Reduced Engine's fixed-attack/fixed-defense resolution model; adopt V6's roll-based approach for every enemy grade. (The separate Wound-capacity simplification — Mook 2/Normal 4/Elite 5, no Wound State/Cards/Death Track — still applies to all grades regardless; that part was never in question.) See §5.1.4.

**9.6 Equipment Card dice cap.** No rule existed capping dice rolled with gear-granted cards. **Decision: Equipment Cards use the same rules as Combat Cards** — same minimum commitment, same maximum-rolled-dice formula, same Action-die-and-resource cost handling. No separate formula needed. See §5.2.2.

**9.7 What Tier grants (Reach/Inventory/Armory).** Never numerically defined in V5 or V6. **Decision: keep manual for now**, GM-set as today. Matches the existing documented reading — no change needed.

**9.8 Critical Wound recovery duration.** V6 leaves it as "TBD." **Decision: warn only — Critical Wounds are GM/DM fiat**, duration depends on the specific wound and adventure. Matches the sheet's existing warn-don't-block convention.

**9.9 Adventure sizing.** An old simulation recommends 7-9 scenes; V6's new pacing guidance suggests something shorter. **Decision: not relevant right now.** No action — just note it if it becomes relevant later (e.g. if `monster-budgets.mjs`'s encounter-difficulty defaults ever need recalibrating against it).

---

### Appendix: changes that are already V6-correct (don't "fix" them)

Worth recording so a later session doesn't burn time or, worse, regress them:

- Core Wound **gap-filling** (`actor-sheet.mjs:1031`) — already "earliest available empty space."
- Wound **severity stays with the space** (`utils.mjs:106` positional `SEVERITY_BY_INDEX`).
- **Natural 10 is not an automatic success** (`essence-roll.mjs:37`).
- **Tied-high dice still generate Surges** (`essence-roll.mjs:38`).
- **Breach does not add to accumulated ordinary Damage** (`actor-sheet.mjs:1004-1005`).
- **Augments cost 0 capacity everywhere** (`utils.mjs:140`).
- **Starting Reaction Pool of `5 + Tier` before anyone's first Turn** (`combat.mjs:116-126`) — V6 states this as a derived value for the first time; the module already had it.
- **End-of-Turn Reaction Pool = `5 + Tier + unused Action Dice`** — unchanged in V6.
- **Non-combat roll = Attribute + Skill Rank** (`actor-sheet.mjs:641`).
- **Career is never rolled** (plain string, `actor-character.mjs:21`).
- **Second Distinction gating** — `item-origin.mjs` has no auto-grant-on-Tier logic to remove.
- **"Boss" is not an enum value** (`actor-adversary.mjs:20-27`) — already matches V6's Leader/Solo framing.
- **Per-character (non-pooled) Influence contribution** (`actor-sheet.mjs:1283-1294`) — the doc comment argued for exactly what V6 later codified.

---

## 10. Follow-ups flagged during implementation

Items raised by the build itself (not in the original plan) that need a decision once the V6 sync is otherwise done — not urgent enough to interrupt the build order in §8, but tracked here so they don't get lost.

**10.1 Multi-actor Influence-support payer UI (raised during Phase 4, 0.6.81).** V6 added a rule that "another character can pay the support cost" when equipment exceeds its owner's Inventory Limit — using the payer's own Reach/Influence, while the capacity still belongs to the equipment's owner. This shipped in 0.6.81 as a simple actor-picker dropdown on the existing dialog, because **no multi-actor-picker pattern exists anywhere else in this codebase to extend or match** — every other actor-affecting action in the sheets targets `this.actor` only. It's a working first implementation, not a fit to an established convention. Question for Ryan once the rest of V6 sync is done: is a one-off dropdown good enough long-term, or does this warrant a proper shared "pick another actor in the scene/party" component — especially since other V6 mechanics already scheduled later (favors, shared support costs, cooperative rolls) may need the same capability and would otherwise each reinvent it independently. **Update, Phase 6 (0.6.100):** the same dropdown pattern was reused for Reconfigure's "hand over an item to an adjacent willing creature" option — now two call sites on the same ad hoc pattern, strengthening the case for building the shared component sooner rather than later.

**10.2 Adversary `perCombat` abilities still reset on Combat start, not Encounter start (raised during Phase 7, 0.6.105).** 0.6.105 built proper cooldown/once-per-Encounter tracking for player Combat Cards, fixing exactly this conflation: per V6, starting a new Foundry Combat inside an ongoing Encounter should NOT refresh once-per-Encounter abilities — only an explicit GM "New Encounter" action should. That fix was scoped to player cards only. NPC/Monster adversaries' existing `abilities` array (with its `frequency: atWill|perRound|perCombat` field, built in an earlier phase before the Encounter/Combat distinction existed in this codebase) still resets `perCombat` abilities on every new Combat via `combat.mjs`'s `_onStartRound`/`_onStartTurn`, the same bug that was just fixed for players. Left unfixed to keep 0.6.105 scoped to its stated task rather than scope-creeping into adversary logic. Follow-up: extend the same "New Encounter" reset boundary to adversary `perCombat` abilities, likely by having the new GM "New Encounter" button (0.6.105) also reset adversary ability usage rather than leaving that to Combat start.
