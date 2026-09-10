# Changelog

All notable changes to the essence-foundry system are recorded here.

## 0.6.47

**Fixed a critical bug introduced in 0.6.46: every localized string on every sheet rendered as its
raw key instead of real text** (e.g. "ESSENCE.Common.Tier" instead of "Tier"), including the window
title's document-type label — confirmed by a user on a genuinely fresh Foundry instance/world, not
a caching artifact. Root cause: Foundry expands `lang/en.json`'s flat dotted keys into a nested
object tree, so a key cannot be both a leaf string value AND a namespace prefix for other keys.
Five keys were both: `"ESSENCE.Item.Species": "Species"` alongside `"ESSENCE.Item.Species.Nature"`,
`.NatureNamePlaceholder`, etc. (and the same shape for `Item.Heritage`, `Item.Distinction`,
`Item.Equipment`, and `Settings.RoleBudgets.Field`) — the tree-expansion step throws on that
collision, which aborted loading the *entire* language file, so even pre-existing keys untouched by
0.6.46 (like `TYPES.Actor.character`) broke too. Renamed the 5 colliding leaf keys to a
non-colliding `*Label` form (e.g. `ESSENCE.Item.SpeciesLabel`) and updated their 12 call sites.
Script-verified zero remaining structural collisions across all 532 keys, zero missing/stale
references, and re-ran the full key-coverage + brace-balance validation from 0.6.46's pass.

## 0.6.46

**Full localization pass — every hardcoded UI string routed through `lang/en.json`.** Following a
Foundry-native-first audit that flagged localization as a large, systemic gap (zero `game.i18n`
usage anywhere, hardcoded English across all 15 templates and 49 `ui.notifications` calls), all
user-facing text — button labels, headers, tooltips, placeholders, aria-labels, and notification
messages — now goes through `{{localize}}` (templates) or `game.i18n.localize()`/`format()`
(`.mjs` files) against ~530 keys in `lang/en.json`, instead of literal strings baked into markup
and code. This doesn't change anything a player sees today — it's the difference between the text
being hardcoded versus being swappable via a `lang/<code>.json` file, which is what actually makes
a future translation (or a community one) possible without touching source. Every key was
cross-validated (script-checked, not just eyeballed) against every `{{localize}}`/`game.i18n` call
site — zero missing, zero unused duplicates.

**Added a GM-configurable Settings menu for the homebrew Monster Role Budget table**
(`module/apps/role-budgets-settings.mjs`, registered via `game.settings.registerMenu`, `restricted:
true` so only a GM can open it). `monster-budgets.mjs`'s own doc comment already said this table —
used by the Monster Creator to auto-fill Minion/Standard/Elite/Nemesis stat blocks — has "nothing
canonical to match, so tune this table freely if actual play calls for it"; previously that meant
editing source. `getRoleBudget()` now reads a `roleBudgets` world setting first, merging it over
the hardcoded defaults so a stale/partial setting from an older version can't leave a Role missing
a field.

**Removed the redundant "Origin" box from the Character sheet's Core tab** — it duplicated the
Species/Heritage/Distinction fields already shown in the sheet header, and the Distinction's Key
Skill/Primary Attribute trait line it also showed already surfaces in Non-Combat's "General
Features & Benefits" table. Flagged by the user directly from a live screenshot.

**Known follow-up, not done this pass**: `ChatMessage.create()` content strings (the HTML posted
to chat for Apply Damage, Recover Wound, Influence Injury, etc.) are still hardcoded template
literals — a similarly-shaped gap to the notification strings just fixed, but scoped out of this
pass since it's a materially larger surface (chat-card HTML generation, not single-line messages).

## 0.6.45

**Fixed the Sheet Portrait not being clickable/editable anywhere in the system** — every sheet's
portrait `<img>` (both Actor sheets and all 8 Item sheets) carried `data-action="editImage"` but
was missing Foundry's own required `data-edit="img"` attribute, which Foundry's core `editImage`
handler needs to know which document field to update. This wasn't a custom permission restriction
on Owners — it was a piece of Foundry's own convention missing from the markup, present since the
initial scaffold. Fixed by adding `data-edit="img"` to all 10 sheet templates
(`character-sheet.hbs`, `npc-sheet.hbs`, and the 8 Item sheets under `templates/item/`). No JS
changes needed — `editImage` is a core-provided action (see the existing comment on
`#onEditTokenImage` in `actor-sheet.mjs`, which explains why the separate Token Image button exists
precisely *because* core's `editImage` only ever targets a document's own `img` field).

## 0.6.44

**Restored 23 equipment items that a prior sync had silently wiped from the compendium**, and
fixed 4 more that were miscategorized as a result of the same incident. The 2026-09-08 "bulk
catch-up" commit (`200d261`) that pushed a long stretch of local-only work to GitHub ran
`fetch-from-neon.mjs` against the Neon Postgres project's `staging` branch — which has 0 rows in
`equipment_cards` — instead of `production` (23 rows), exactly the cache-staleness risk flagged
as a known gap after the v0.6.14 near-miss. The empty fetch silently dropped every DB-sourced
equipment item on the next `build-packs.mjs` run, leaving only the 13 hand-authored items (all 23
missing items — weapons, armor, shields, packs — simply weren't there to browse or Bulk Import
from). Re-fetched from the correct `production` branch and rebuilt the `equipment` pack
(`node scripts/build-packs.mjs --only=equipment`); all 23 items came back under their original
stable IDs. While rebuilding, 4 hand-authored items (Heavy Shield, Armored Gauntlet, Ward Talisman,
Ritual Censer) that had been showing as `gear` turned out to already be correctly tagged `shield`
in their source (`scripts/extra-equipment-data.json`) — the stale `gear` value in the shipped
compendium was a leftover from the same incident, not a source-data bug, and is now corrected too.

**Fixed the Character Creation Wizard's Equipment "Group" filter doing nothing.** Its dropdown
options were being built as a bare array of category strings
(`["weapon","armor",...]`) instead of `{value, label}` objects, so every `<option>` below "All"
rendered with an empty value and no visible label — selecting one silently matched nothing.
`character-wizard.mjs` now builds `equipmentCategoryOptions` from `EQUIPMENT_CATEGORY_LABELS`
(`Object.entries(...).map(([value, label]) => ({value, label}))`), the same pattern
`content-wizard.mjs` and `item-sheet.mjs` already used — this was in fact the exact pattern
`item-card.mjs`'s own doc comment on `EQUIPMENT_CATEGORY_LABELS` says the Wizard's Group filter
should use, just never applied there.

## 0.6.43

**Surge rule reverted/clarified: Surges are counted AFTER the Defense check, from the Success
Die's leftovers.** This reverses the 2026-09-08 change (which had every 6+ die, including the
Success Die, earn a Surge). The correct ordering, per the user: the highest die (the Success Die)
is spent meeting Defense; only the OTHER dice showing 6+ grant a Surge. Example: rolling 8, 6, 6
against Defense 5 — the 8 succeeds against Defense and earns no Surge of its own, but both 6s do
(2 Surges), not 3. `resolveCombatRoll()` in `module/dice/essence-roll.mjs` excludes
`successDieIndex` from the Surge sum again; the chat card's dice-face styling and its
`.success-die.surge-die` combined CSS rule (now dead, since the two states can't co-occur) were
updated to match.

Also addressed a related gap the user flagged in the same request: **rolling "open"** (the
dice-commit dialog's own "leave blank to roll open" option, when a target's Defense isn't known or
hasn't been declared) now shows the dice-derived Surge count as a candidate for the GM to confirm
rather than as an automatic, spendable total — `rollEssencePool()` computes an `openRoll` flag
(`!multi && defense == null`) and the roll card swaps the normal Surge/spend UI for a plain note
when it's set.

## 0.6.42

A full pass on live feedback that the Equipment sheet, Item Creation Wizard, and Bulk Import were
cluttered, inconsistent, and in places genuinely broken.

- **Equipment's Category and Kind merged into one field.** Having two overlapping dropdowns
  ("Category: weapon/armor/tool/gear" and "Kind: standard/toolkit/consumable-kit") to describe
  what one item fundamentally is was exactly the kind of unnecessary complexity flagged — `kind`
  is gone; `category` now has 7 direct choices: Weapon, Armor, Shield, Implement, Toolkit,
  Consumable Kit, Gear. Everywhere the old 4-category scheme was hardcoded (folders, the Wizard's
  Group filter, `mapCategory()` in build-packs.mjs, the Bulk Import CSV, Item Grants' matchers)
  updated to match. A shared `EQUIPMENT_CATEGORY_LABELS` map (item-card.mjs) and a new
  `equipmentCategoryLabel` Handlebars helper give every dropdown and every display value the same
  properly-capitalized label ("Consumable Kit," not "Consumable-kit" or "consumable-kit") instead
  of each template inventing its own casing.
- **The Equipment sheet now only shows fields relevant to what's being made** — Type/Range/
  Fortitude/Resilience/Movement/Reach Bonus/Modular only for the four worn/wielded categories;
  Uses only for Gear; Quantity only for Gear/Consumable Kit; a Toolkit shows nothing beyond the
  basics. The Slot field (Signature/Temporary/Armory) only appears once the item is owned by an
  Actor — a compendium template has no Slot to set. Reach Exception (normally set automatically by
  the Item Grants system) moved behind a collapsed "Advanced" disclosure instead of always-expanded
  paragraph text in front of every item.
- **Modular Assembly on an unowned item** (a compendium template being authored, not yet on a
  character) no longer dead-ends with "save this onto an Actor first" — it shows a plain free-text
  field for Chassis/Fitting/Augments instead, until real compendium-level Component linking exists.
- **Fixed rich-text (Effect/Passive/Special/Flavor, etc.) fields being unusable** — the toolbar and
  the actual typing area were the same flat color with no visual boundary, AND (found while fixing
  the color issue) the fixed height budget those fields were given left only ~8px for the actual
  typable area once the toolbar rendered, making them both look broken and functionally almost
  impossible to click into. Both fixed in essence.css: toolbar and content now have distinct
  backgrounds, and the height budget is large enough for both.
- **The Item Creation Wizard and Bulk Import's type/template pickers** were a row of plain small
  buttons with no visual identity — replaced with an icon grid, each card colored to match that
  type's own card-view border color elsewhere in the system (gold for Cards, blue for Equipment,
  red for Conditions, brown/teal/purple for Chassis/Fitting/Augment). (A first pass at this
  overlapped the icon and label text because Foundry core's blanket `button` CSS forces a small
  fixed height meant for a single line of text — fixed by giving these cards an explicit height.)
- **Bulk Import now has a separate CSV template per content type** instead of one combined
  "Combat Cards" template covering both Action and Reaction Cards via a `kind` column a GM had to
  know to fill in correctly — Action Cards and Reaction Cards are now separate downloads. Chassis,
  Fittings, and Augments — fully supported one-at-a-time in the Item Creation Wizard — previously
  had no Bulk Import template at all; all three now do. The near-duplicated create-or-update loop
  that used to exist once per type is now one generic loop driven by each template's own
  `pack`/`type`/`img`/`toSystem` config.
- Fixed Chassis/Fitting/Augment items showing a raw, undefined-looking `TYPES.Item.augment`-style
  string as their sheet title — `lang/en.json` never had label entries for these three item types
  (added when they were originally built), so Foundry fell back to displaying the raw
  localization key. Added the missing entries.
- **Slot and Quantity are no longer part of authoring an Equipment/Chassis/Fitting template** —
  both are properties of an owned COPY of an item (which Signature/Temporary/Armory slot it's
  carried in; how many you happen to have), assigned once a player actually acquires it, not
  properties of the template itself. Removed from the Equipment sheet's edit form and Bulk
  Import's CSV templates entirely for unowned/compendium items; both still appear (and only
  appear) once the item is actually owned by an Actor.

- **Fixed Quartermaster's Due (and every Item Grant) matching almost nothing.** The grant matcher
  required an exact `system.type` of "Main-Hand" or "Off-Hand," but that's not a real value this
  system's Equipment ever stores — `type` is free descriptive text ("Ranged, 1h", "Foci, 2h",
  "Off-Hand," "Medium," "Passive" for Toolkits/Kits), so the matcher almost never matched real
  gear. Reworked `item-grants.mjs`'s matcher to key off `category` (weapon/armor, or tool-but-not-
  "Passive" to include held Implements/Off-Hand items while excluding actual Toolkits) instead of
  a `type` string that doesn't exist as a controlled vocabulary anywhere in this system's content.
  Since the picker in `actor-sheet.mjs`/`npc-sheet.mjs`/`character-wizard.mjs` all call the same
  shared `equipmentMatchesGrant()`, this one fix corrects all three.

## 0.6.40

Fixes from a design-doc review of the Chassis/Fitting/Augment modular equipment system against
the printed rules' actual terminology and the Toolkit/Consumable Kit split.

- Renamed the Chassis/Fitting `category` value `"guard"` to `"shield"` (`item-component.mjs`) —
  the printed rules call this category "Shield," not "Guard."
- Added `CHASSIS_LABELS`/`FITTING_LABELS` (`item-component.mjs`) — the printed rules use a
  different in-fiction term for "Chassis" and "Fitting" per category (Striker/Handling for Melee,
  Launcher/Payload for Ranged, Shell/Rigging for Armor, Shield/Handling for Shields, Focus/
  Interface for Magical Implements). Every sheet that shows a Chassis/Fitting now uses the correct
  term instead of the generic word: the Chassis/Fitting item's own header and category dropdown
  (`component-sheet.hbs`), the Equipment sheet's Modular Assembly section (`equipment-sheet.hbs`),
  and the Item Creation Wizard's Chassis/Fitting steps (`content-wizard.hbs`, previously also still
  showing the stale "Cost" label instead of "Reach" — missed in the earlier Reach/Tier correction).
- Added the Toolkit / Consumable Kit distinction the rules actually describe (previously both were
  just generic `equipment` with one flat, editable-nowhere `uses` field): `EssenceEquipmentData`
  gets a `kind` field (`"standard" | "toolkit" | "consumable-kit"`, independent of `category`) and
  an `equipmentCards` array (name/effect/Uses per card) for Consumable Kits. The equipment sheet,
  Item Creation Wizard, and bulk-import CSV template all respect `kind`: a Toolkit shows no Uses
  field at all; a Consumable Kit shows an Equipment Cards list editor instead of the single flat
  Uses field; "standard" behaves as before (including a newly-added editable Uses field, which the
  sheet was previously missing entirely — display-only in view mode, no way to set it in edit mode).
- `resetAdventureUses()` (new shared function in `utils.mjs`, replacing the Reach-Trigger-only
  `#onResetReachTriggersAdventure` in both actor sheets): the "Reset All for New Adventure" button
  now also refreshes every owned Function Augment's `usesRemaining` and every Consumable Kit's
  Equipment Card `usesRemaining` back to their `uses` max — previously nothing reset either of
  those at all, a silent gap since Function Augments already had Uses tracking with no way to
  refill it short of manually editing the field.
- `#onDeleteMount` (`item-sheet.mjs`) now refuses to remove a Chassis's last Mount — "a Chassis
  must have at least one Augment Mount" was previously unenforced.
- Fixed a stale doc comment on `EssenceEquipmentData.reachExceptionSource` (`item-card.mjs`) still
  describing the pre-0.6.37 "Reach-vs-Tier(Availability)" model.

- Equipment compendium now groups into Folders instead of one flat list: Weapon/Armor/Tool/Gear by
  `category` (same `writeCategoryFolders()` approach 0.6.x's Action/Reaction Card folders already
  use, just keyed differently), plus Chassis/Fitting/Augment folders. Those three used to be their
  own separate, always-empty compendium packs (there's no pre-authored content for them — players
  build their own via the modular equipment system) — folded into "equipment" as folders instead,
  so a GM authoring one via the Item Creation Wizard has one shared library, not four mostly-empty
  compendium tabs. The Item Creation Wizard (content-wizard.mjs) now creates all of Equipment/
  Chassis/Fitting/Augment into that one pack, auto-assigning the right folder (fixed for Chassis/
  Fitting/Augment, tracking the Category field live for Equipment).
- Added a generic "Item Grant" mechanic (`module/data/item-grants.mjs`) for the family of Heritage
  Legacies and Species Adaptations that let a character designate a specific Equipment item they
  already own as a standing benefit — Warcamp Raised's "Quartermaster's Due" (Main-Hand/Off-Hand/
  Armor, Reach+1, counts against Signature Limit), Constructs' "Internal Compartment" (any cost-1
  item, doesn't count) and "Integrated Tool" (any toolkit, doesn't count), Craftfolk's "Inherited
  Tools" (any toolkit, doesn't count). One data-driven registry entry per named feature rather than
  bespoke code per feature, and auto-detected from the actor's actual Heritage Legacy name / chosen
  Species Adaptation names (no separate "this actor has this grant" flag to keep in sync) — the
  fulfilling item, if chosen, is identified by the same `reachExceptionSource` field the
  Reach-gating exception already uses, so there's no new persisted actor state at all. A "Choose
  Item"/"Replace" button (Character sheet, NPC sheet, and Character Wizard's Equipment step) opens
  a DialogV2 listing only the character's own owned Equipment that satisfies that grant's type/
  Reach rule — deliberately the character's Inventory, not the shared compendium (an early version
  browsed the compendium instead and it surfaced a random grab-bag of every setting's equipment
  with no relevance to the character being played) — and tags the pick with the Reach exception +
  slot cost automatically instead of requiring the player to type them onto the item by hand.
- `computeSlotUsage()` (utils.mjs) now reads an equipment item's own `system.slotCost` instead of
  hardcoding 1 per Signature/Armory item — needed so an Item Grant that "doesn't count against your
  Signature Equipment Limit" actually doesn't. `character-wizard.mjs`'s own slot-usage math already
  did this; `actor-sheet.mjs`/`npc-sheet.mjs` did not, which was an existing inconsistency this
  fixes as a side effect.

## 0.6.37

- **Correction to 0.6.36's Reach-gating work**: that release wrongly read Equipment's
  `system.tier` field as the Reach gate ("Tier (Availability)"). Per the owner's authoritative
  reference (now saved verbatim at `design/reach-and-economy.md`), Reach is not a price or a
  spend value — it's a character's tier of economic *access*, and the field that actually carries
  an item's Reach requirement is the pre-existing `system.cost` (a StringField, documented in
  `bulk-import.mjs`'s own CSV docs as the item's Reach cost to acquire/use). `system.tier` is an
  unrelated field — the Chassis/Fitting/Component sophistication rating for the modular assembly
  system — and was never the right thing to check.
  - Reverted every "Tier (Availability)" label back to plain "Tier" (Equipment sheet's edit form
    and card-view).
  - Relabeled `system.cost`'s field/column as "Reach" everywhere it's shown or edited (Equipment
    sheet, Character/NPC Signature Equipment tables, Wizard's Signature Loadout and Equipment
    Library browser).
  - Added `computeReachGate()` to `module/utils.mjs` — parses `system.cost` (empty string = no
    stated Reach requirement, not 0) and applies any `reachExceptionSource`/`reachExceptionMargin`
    — and switched `actor-sheet.mjs`, `npc-sheet.mjs`, and `character-wizard.mjs`'s over-Reach
    warning logic to use it instead of reading `system.tier`.
  - The Components & Augments table's use of `system.tier` (Chassis/Fitting/Component
    sophistication) was correct in 0.6.36 and is unchanged.

## 0.6.36

- Reach was displayed on the Combat tab next to Movement, styled as a combat stat — but
  part-ii-character-creation.md defines it as an economic/social stat ("the scale across which
  wealth, reputation, and connections remain meaningful"), recorded alongside the Influence tracks.
  Moved the Reach display/input to the Non-Combat tab's Influence section on both the Character and
  NPC sheets (the Wizard already had it correctly placed in its Influence step). Schema field
  (`system.reach`) is unchanged — this was a display-location fix only.
- Equipment's `system.tier` field is now also labeled "Tier (Availability)" on the Equipment
  sheet's edit form and card-view, and the Character/NPC sheet's Signature Equipment header now
  shows the actor's current Reach and soft-flags (a non-blocking warning icon, never a hard block)
  any Signature item whose Tier exceeds it — matching part-ii-character-creation.md's repeated
  "availability does not exceed your Reach" rule, read against `system.tier` rather than a new
  field (part-viii-equipment-and-items.md never uses the word "Availability" and defines Tier as
  the same underlying concept). Same flag added to the Character Wizard's Equipment step.
- Added `reachExceptionSource`/`reachExceptionMargin` to Equipment (`item-card.mjs`) so a player can
  manually flag one specific item as permanently exempt from the Reach warning up to a stated
  margin (Warcamp Raised's "Quartermaster's Due" allows Tier up to Reach+1; Constructs' "Internal
  Compartment" allows exactly Reach). Edit-form only, not shown in card-view.
- Added a generic "Adventure-Limited Reach Trigger" mechanic (`reachTriggers` on the actor,
  `system.effectiveReach` derived field) covering Noble Household's "Letters of Standing" and
  Frontier Household's "Prepared Cache" — a temporary per-Scene Reach boost, manually
  activated/deactivated (no automated Scene boundary), with the first use each Adventure free and
  each additional use applying 1 Influence Breach through the same Temp→Core Influence mechanic
  Influence Injuries already use. A manual "Reset All for New Adventure" action clears every
  trigger's used flag, matching how Wound/Influence recovery are all manual here too. Underworld
  Raised's "Fence's Cache" was checked against this brief's assumption that it shared the pattern —
  it doesn't (see build-history): the current rules text gates it only by narrative access to a
  black market, with no Adventure limit or Breach cost, so it's a different (item-swap) mechanic
  not built this session.

## 0.6.35

- Character Wizard's Identity step gets a real inline Species Adaptation picker, replacing the
  "(open — choose Adaptations here)" link that sent players out to the Species Item's own
  GM-authoring sheet. Nature and each Adaptation now render directly in the wizard with a capped
  "X / N chosen" checkbox picker, mirroring the Combat Skills/Non-Combat steps' point-pool headers.
- Added a nested "sub-choice" schema to Species Nature and Adaptations (`item-origin.mjs`) for
  traits that bury a second choice in their own rules text — e.g. Mortal-Kin's Keen ("choose two
  Senses") or Dragonkin's Nature ("choose a Draconic Lineage"). Fixed-list sub-choices render as
  capped checkboxes; free-text ones (rules using "such as"/open wording) render as a plain text
  input. Encoded every sub-choice found in a full audit of part-ii-character-creation.md's Species
  section into `scripts/origin-data.json`; `build-packs.mjs`'s `speciesToItem()` now passes the new
  field through. The Species authoring sheet (`species-sheet.hbs`) gained matching fields so a GM
  can define a sub-choice when authoring a new Species.
- `deriveOriginFeatures()` now appends a chosen sub-choice's selected value(s) to the feature's text
  (e.g. " (Senses: Keen Hearing, Low-Light Vision)") so the Character sheet's General Features table
  shows which Senses/Lineage/etc. were actually picked, not just that the trait was chosen.

## 0.6.34

- Character Wizard's Equipment step: the "Equipment Library" browser now has a Group filter
  (weapon/armor/tool/gear — Equipment's `system.category`), alongside its existing Search, matching
  the filter pattern already used on the Combat Skills step's Qualifying Cards browser.

## 0.6.33

- Fix the Character Wizard "jerking to the top" every time a Card or piece of Equipment was picked
  (or a filter changed): adding/removing an item re-renders the whole wizard, which always resets
  scroll position to 0 — now both the step's own scroll area and the inner Qualifying
  Cards/Equipment Library list remember and restore their scroll position across every re-render,
  the same way search-box focus was already preserved.
- Species Items were unreachable from both the Character sheet and the Character Wizard — there
  was no way to actually open a chosen Species to pick its Adaptations (e.g. Mortal-Kin's "choose
  2" Hardy/Keen/etc.), only to select which Species to use. "Species: X" (and Heritage/Distinction)
  on the Character sheet's Origin section, and "Species — X" in the Wizard's Identity step, are now
  clickable and open that Item's own sheet. Also added the same link to the NPC sheet, which had
  the same gap.

## 0.6.32

- Character Wizard's Combat Skills step: the "Qualifying Cards" browser now has a Subtype filter
  alongside the existing Type/Skill/Sort ones, nested under Skill the same way Combat Card sheets'
  own Subtype dropdown is (choosing a Skill resets Subtype back to "All" since each Skill has its
  own fixed 7). With no Skill chosen, Subtype offers the full union across all Skills instead of
  being empty, so browsing "every Opener" or "every Space card" regardless of Skill still works.
  Each card row in the list now also shows its Subtype, not just Rank/Skill.

## 0.6.31

- Action Cards and Reaction Cards now browse grouped into Folders by Combat Skill (Prowess,
  Ballistics, Gestalt, Cunning, Magecraft, Psionics, Leadership, Ritualism, Calling, plus a
  "Basic" folder for skill-less universal cards) instead of one flat 194/67-item list per pack.
  `scripts/build-packs.mjs` now writes real Folder documents (`writeCombatSkillFolders()`) into
  each of the two packs separately (Foundry Folders belong to exactly one pack, so the 10 folders
  are duplicated once per pack) and assigns each card's `folder` field by its `system.skill`.
  Also added a reusable `--only=pack-a,pack-b` flag to the build script so a change scoped to a
  couple of packs doesn't force-recompile every other pack in the system.
- Condition, Equipment (including Toolkits/Consumable Kits), Chassis, Fitting, and Augment sheets
  now default to the same read-first "card" view Action/Reaction Cards already had, with a toggle
  into the existing edit form. The read/edit toggle mechanism itself (`_viewMode` field,
  `toggleCardView` action, the `_toggleDisabled` override, `renderAsView()`) moved from
  `EssenceCardSheet` up into the shared `EssenceItemSheetBase` so every Item sheet gets it for
  free. Each type gets its own accent color so they stay visually distinct: Condition `#c62828`
  (this system's existing danger/fail red), Equipment `#42a5f5` (steel blue), Chassis `#8d6e63`
  (bronze), Fitting `#26a69a` (teal), Augment `#ab47bc` (violet).
- The Item Creation Wizard (`content-wizard.mjs`) can now create Chassis, Fitting, and Augment
  Items — added in the same Phase 3 session as everything else but never wired into the wizard's
  `TYPE_CONFIG`, so a GM previously had no step-by-step way to author one outside a compendium's
  own bare "Create Item" button. Also fixed the wizard's generic array-row field handler to
  coerce number-typed inputs (needed for Chassis Mounts' nullable `linkedWith` field) instead of
  writing raw strings, which would have silently turned a blank "unlink" into Mount 0.

## 0.6.30

- **Rule change**: Surges are now earned independently of the Success Die/Defense check — every
  die in the pool showing 6+ grants 1 Surge, INCLUDING the Success Die itself if it qualifies.
  Previously the Success Die never earned its own Surge even at 6+, only the other dice did.
  (`resolveCombatRoll` in `essence-roll.mjs`; the chat card's dice display now shows a die as both
  green (Success) and gold-ringed (Surge) at once when it's both, instead of the old either/or.)
- Fix a live bug found while verifying Phase 1 in-app: Combat Card sheets' new Skill/Subtype
  dropdowns (added in 0.6.26) assumed `system.skill` was stored lowercase, but every existing card
  actually stores it capitalized ("Magecraft"). This made the Skill dropdown show as unset and
  Subtype's real option list come up empty on every card that already had a Skill set. Fixed by
  normalizing the SUBTYPE_DATABASE lookup instead of the stored data — `COMBAT_SKILLS` values are
  now capitalized to match, and a new `subtypesForSkill()` helper lowercases before indexing.

## 0.6.29

- Plain (non-modular) `equipment` Items' Fortitude/Resilience/Movement/Reach Bonus fields now
  actually apply to the actor — previously nothing in the codebase read them at all, so equipping
  "+2 Fortitude" armor did nothing mechanically. Delivered via a real, transferred ActiveEffect
  (`module/data/equipment-effects.mjs`) kept in sync on item create/update, enabled only while the
  item's Slot is Signature — Armory/Temporary gear you own but aren't carrying doesn't affect your
  stats. Chassis/Fitting bonuses on assembled modular items are unaffected by this and remain
  display-only (see equipment-features.mjs) since they have no standalone existence as an
  actor-owned Item for Foundry's transfer mechanism to attach to.
- Add an approximate "one Reaction per Action" soft warning (part-iv-combat.md § One Reaction per
  Action): using a Reaction Card now warns (never blocks) if the same actor already used a Reaction
  during the currently-active combatant's Turn this round. This is explicitly NOT real
  trigger-tracking — the system has no concept of a specific "Action instance" a Reaction responds
  to, so this is a same-Turn proxy, not a same-Action check, and says so in its own warning text.

## 0.6.28

- Add "Contribute to Shared Goal" (part-v-social-encounters.md § Collaborative Influence Pooling)
  on both the Character and NPC sheets: prompts for a shared-goal label, an optional
  narrative-only/no-cost toggle, and how many Temporary Influence slots to spend, then runs the
  same Temp→Core Influence overextension logic as Apply Influence Injury, posting a chat message
  tagged with the goal name. Deliberately per-actor rather than a cross-actor "pooling" window —
  the rules explicitly reject tracking a single pooled number ("the combined effort... is what the
  GM weighs..., not a single pooled number"), so a per-character contribution button matches the
  rule better than inventing new multi-actor UI would.

## 0.6.27

- Connect Influence to the Signature Limit overage rule (part-viii-equipment-and-items.md §
  Bringing More Than Your Signature Limit): both the Character and NPC sheets now show a note and
  a "Spend Influence for Extra Slot" button whenever prepared Signature Equipment exceeds
  `signatureEquipmentLimit` by at least one full slot, spending 1 Temporary Influence per click.
  Manual and trust-based like every other Apply/Spend action on this sheet — going over the limit
  was never blocked and still isn't; this only gives the overage a resolution path instead of no
  path at all.

## 0.6.26

- **Revert** the 0.6.23 `SUBTYPE_DATABASE` "fix." That change corrected the table against the V5
  rulebook's Part X Appendix A, but the user has since confirmed the web app's `essence-options.ts`
  (the actual Expertise & Subtype spreadsheet) is the canonical source, not the rulebook appendix —
  and it matches the pre-0.6.23 values exactly. Appendix A itself appears to be stale/draft content
  and still needs a follow-up correction in the wiki; that wasn't done here.
- Card sheets: Skill and Subtype are now `<select>` dropdowns instead of free text, and Subtype is
  nested under the selected Skill — each Combat Skill has its own fixed set of 7 (e.g. Cunning:
  Ambush, Diversion, Evasion, Gambit, Reversal, Trap, plus one more; see `SUBTYPE_DATABASE`).
  Changing Skill clears Subtype if the stored value isn't valid for the new Skill, in the same
  update (both fields have to change atomically, or Subtype's re-rendered options wouldn't even
  include the stale value). This was `SUBTYPE_DATABASE`'s first real consumer — previously nothing
  in the codebase read it at all.

- Add the Chassis/Fitting/Augment modular equipment system (part-viii-equipment-and-items.md §
  Modular Equipment through § Reconfiguring Equipment). Three new Item sub-types — `chassis`,
  `fitting`, `augment` — with their own compendium packs, sheets, and (for Chassis) an Augment
  Mounts editor including Linked Mount pairing. `equipment` gained `chassisItemId`/`fittingItemId`/
  `mounts` fields so a weapon/ranged/armor/guard/implement Item can become the assembled result of
  a Chassis + Fitting + installed Augments; Toolkits and Consumable Kits are unaffected and stay
  non-modular, and no existing Equipment compendium entry was changed.
- Add `deriveEquipmentStats()` (`module/data/equipment-features.mjs`, mirrors
  `origin-features.mjs`'s pattern): resolves an assembled item's Chassis/Fitting to sum their
  Fortitude/Resilience/Movement bonuses, resolves each Mount's installed Augment, and applies Link
  On/Off semantics (a linked-and-on Support modifies its paired Function instead of the Chassis).
  Display-only, same as every other derived-feature list on this sheet — nothing here is written
  back into the actor's own combat stats.
- Add Armory/Signature capacity accounting, previously entirely unenforced despite
  `armoryLimit`/`signatureEquipmentLimit` existing on the actor schema: `computeSlotUsage()`
  (`module/utils.mjs`) counts a complete `equipment` item at 1 slot, a loose (unassembled)
  `chassis`/`fitting` at ½ slot, and an `augment` at 0 slots always. Both the Character and NPC
  sheets now show "used / limit" next to the Signature and Armory headers, and the NPC sheet's
  previously-flat Equipment list is now split into Signature/Temporary/Armory sections to match the
  Character sheet.
- Add Chassis/Fitting assignment and Augment/Mount management directly on the equipment Item's own
  sheet (assigning a Component is free, matching "if you have the Components... you do it"), plus
  two dice-cost reconfiguration actions — "Pay Fitting Reconfigure Cost" (1 Action die Simple / 3
  Structural, or the specific Fitting's own override) and "Pay Augment Swap Cost" (1 Action die) —
  and a free Link On/Off toggle for Linked Mounts. Chose to put this UI on the equipment sheet
  itself rather than duplicate it into both `actor-sheet.mjs` and `npc-sheet.mjs`, since it's a
  property of the Item, not of which actor sheet has it open.
- Register `chassis`/`fittings`/`augments` in `scripts/build-packs.mjs`'s `packTypes` map (it
  listed every other pack but not these three, so the new empty `packs/_source/*` directories
  would have silently never compiled) and compile the three new packs — empty for now, ready for
  content authoring later.

## 0.6.24

- Add the Core Influence flow: `coreInfluence` entries now carry `severity`/`condition` like
  `coreWounds` does, filled in the same fixed 5-slot Light/Light/Serious/Serious/Critical order.
  New "Apply Influence Injury" / "Recover Influence" buttons on both the Character and NPC sheets
  mirror "Apply Damage" / "Recover Wound" — an Injury spends an open Temporary Influence slot first
  (or skips straight to Core Influence if "Voluntary" is checked), and a reference note shows each
  severity's recovery time (Light 1 day / Serious 1 week / Critical 1 month) — manual/GM-triggered,
  same as Wound recovery, not an automated clock.
- Add a Standing display (`system.standing`: Undamaged / Light Injury / Serious Injury / Critical
  Injury), derived from how many Core Influence spaces are filled — same count-based thresholds as
  Wound State reads off Core Wounds.
- NPCs previously had no Influence UI at all despite the schema supporting it (only Character
  sheets did) — added the full Temporary/Core Influence section to the NPC sheet too, matching how
  Wounds already work identically on both sheet types.

## 0.6.23

- Add Mastery: using a Card grants 1 free Surge (flat, non-stacking) when the rolling character
  possesses more of the card's listed Expertises than it requires. Applies on both the Character
  and NPC sheets' card-roll flow; shown as a note on the roll's chat card.
- Fix `SUBTYPE_DATABASE` in `expertise-database.mjs`: several skills' Action Subtypes didn't match
  the rulebook's Appendix A reference (wrong names and/or missing entries — e.g. Prowess was
  missing "Chain" and "Maneuver" and listed a nonexistent "Guard"). Corrected all 9 skills against
  the V5 rulebook. This data isn't wired into any UI yet, so this is a data-accuracy fix, not a
  behavior change.

## 0.6.22

- Using a Card with a Cost now automatically deducts that amount from the matching resource pool
  (Stamina/Focus/Mana) in the same update as the Action/Reaction Dice spend, instead of requiring
  a manual adjustment.
- Add +/- stepper buttons next to Stamina, Focus, and Mana on the Character and NPC sheets so
  players can adjust their current value without unlocking the sheet.
- Fix the NPC sheet's current-resource number input using the wrong field name
  (`currentstamina` instead of `currentStamina`), which silently discarded manual edits.

## 0.6.21

- Card view: the Commitment line now shows which resource pool a Cost draws from (e.g. "Cost 2
  Focus"), derived from the card's Domain, matching the rules' own card-anatomy reference.
- Card view: the name shrinks its font size as it gets longer instead of overflowing onto the
  Edit/View button next to it.

## 0.6.20

- Fix 10 Action/Reaction Cards whose cheapest Surge was miscategorized as a plain Body line
  instead of a real Surge, making it render unlabeled and inconsistently styled next to its
  cost-2/3 siblings. Normalized in the build pipeline so a future database re-sync won't
  reintroduce it.
- Redesign the Card read view closer to the rules' own card-anatomy reference: framed in a
  bordered card box, Style | Subtype and Expertises lines, a labeled Rank/Commitment/Attribute/
  Defense grid, and a proper "Surges" section heading.
- Sort Basic Actions/Basic Reactions alphabetically on the Character and NPC sheets.

## 0.6.19

- Move the edit-lock toggle from the portrait's corner to a labeled Locked/Unlocked button
  stacked under the Wizard/Monster Creator button, and shrink the oversized full-width name field
  down to a sane size.
- Add an "eye" View button next to Edit/Delete on every Action/Reaction Card row (Character and
  NPC sheets) that always opens the card's formatted read view, regardless of what edit/view state
  a previous session left that card's sheet in.

## 0.6.18

- Fix Expertise selection silently wiping its own skill association and vanishing from the sheet.
  Picking a name from a newly-added Expertise's dropdown reset its skill to blank (a Foundry
  ArrayField sub-field update quirk), which made it disappear from that skill's list even though
  it still existed on the actor. Expertises are now added and edited through a safe read-modify-
  write of the whole array, matching the pattern used everywhere else on the sheet.

## 0.6.17

- Add an Owner/GM-only edit-lock toggle (small lock icon, top-left of the portrait) to both the
  Character and NPC sheets. Every raw field is now locked by default, even for the Owner/GM, as a
  safety rail against accidental mid-session edits; Roll/Apply Damage/End Turn/Burn Dice and the
  Wound/Death Track/Combo/Influence pip toggles always keep working regardless of the lock.

## 0.6.16

- Remove the Player name field from the character sheet header — Foundry's own player/owner
  assignment already covers this, so it was redundant.

## 0.6.15

- Split universal no-Skill cards (Hide, Disengage, Shove, Basic Shot, Dash, Strike, Brace) into
  their own "Basic Actions"/"Basic Reactions" row of horizontal quick-roll buttons above the
  skill-gated Action/Reaction Card lists, on both the Character and NPC sheets.
- Action/Reaction Card rows now show a one-line summary of their Effect text, a Sort control
  (Name/Skill/Cost/Rank), and the search box now matches summary text too, not just the name.

## 0.6.14

- Add 13 Equipment items that were in the design spreadsheet but missing from the compendium:
  Balanced Armor, Stable/Shaping/Reservoir Focus, Heavy Shield, Armored Gauntlet, Ward Talisman,
  Ritual Censer, and Infiltration/Disguise/Survival/Investigation/Engineering Kit.

## 0.6.13

- Capitalize Attribute/Skill labels everywhere a lowercase data key was being shown directly as
  its own display label — domain boxes, the Roll dialog's title and Attribute dropdown, the
  "Might + Prowess" chat roll label, and both wizards' Attribute/Skill steps.
- Clean up the Combat tab's status line: dropped an internal-sounding dev note and replaced the
  raw "Turn: notStarted" enum value with a real label ("Not Started" / "First Turn" / etc.).

## 0.6.12

- Add a "Role Budget System" page to the Game Master's Guide compendium journal, documenting the
  Monster Creator's Minion/Standard/Elite/Nemesis budget table introduced in 0.6.8: the full
  per-Role Attribute/Skill/Resilience/Wounds/Card/Equipment numbers, the Resilience-by-Tier
  formula, and exactly what order Auto-Generate rolls things up in. Same content also published
  as a standalone reference doc on the project wiki.

## 0.6.11

- Add an in-sheet way to set an Actor's canvas Token Image, on both the Character and NPC sheets:
  a small pawn-icon button on the corner of the Portrait opens Foundry's own file picker targeting
  `prototypeToken.texture.src` directly, instead of requiring a GM to already know Foundry's own
  Prototype Token configuration exists. This was prompted by a report that a Monster's artwork
  "wasn't working" as a token — the real mechanism is a Foundry-native quirk, not a bug: an Actor's
  sheet Portrait and canvas Token Image are two separate fields, and Foundry only ever auto-copies
  Portrait → Token Image once, the very first time a fresh Actor's Portrait is set. After that,
  the two are edited completely independently, which reads as "broken" if you don't know it's by
  design and there was previously no way to fix a diverged Token Image without leaving the sheet.
- Document this in the Game Master's Guide compendium journal ("Portrait Art vs. Token Art") —
  the two-image split, the one-time auto-copy, the new button, and why an NPC's already-placed
  (unlinked) Tokens don't retroactively pick up a later Token Image change.

## 0.6.10

- Fix the NPC sheet's name field overlapping the "Monster Creator" button: the shared header CSS
  reserved 90px of margin for the Character sheet's "Wizard" button, but "Monster Creator" is
  wider than that and hung over the name input's right edge. Widened the reserve to 160px for the
  NPC sheet specifically.

## 0.6.9

- Fix the Character Wizard's and Monster Creator's last step: "Next" showed disabled on Finalize
  with no other way to close the wizard, reading as broken rather than done. The last step now
  shows an "Accept" button instead — every choice already saves straight to the actor as you make
  it, so Accept isn't a commit, just the explicit "I'm done" that closes back to the main sheet.

## 0.6.8

- Add a Monster Creator for NPCs — a "Monster Creator" button on the NPC sheet header (next to
  Role/Tier/Level) opens a Character-Wizard-style step-by-step flow (Concept, Origin, Attributes,
  Combat Skills, Wounds, Combat Cards, Equipment, Finalize), trimmed to what the NPC sheet
  actually exposes (no Non-Combat Skills, Influence, Expertises, or Passive Features).
- The Role tag (Minion/Standard/Elite/Nemesis) had no mechanical effect anywhere in the system —
  it was purely a GM-facing label. Added a homebrew, tunable budget table per Role
  (`module/data/monster-budgets.mjs`: Attribute/Skill point pools and caps, Resilience scaling by
  Tier, Temporary Wounds, and Action/Reaction Card and Equipment counts) since nothing canonical
  exists to match. Every manual +/- and card/equipment pick in the wizard is capped to that Role's
  budget.
- Added a one-button "Auto-Generate Stat Block" that rolls a full NPC from the Role budget:
  weighted-random Attribute and Skill point-buy (leaning toward a chosen Physical/Mental/Spiritual
  Domain Emphasis without excluding the others), Resilience/Temporary Wounds/Equipment Limit set
  directly from the budget, then Combat Cards and Equipment picked at random — weighted toward
  whichever Skills the roll landed on, so a Nemesis that rolled high Ritualism tends to get
  Ritualism cards. Reroll buttons on each step (Attributes/Skills/Cards/Equipment) redo just that
  part; every result stays hand-editable afterward exactly like the rest of the wizard.

## 0.6.7

- Make every icon-only edit/delete/remove/add control keyboard-reachable and screen-reader
  labeled: the `itemEdit`/`itemDelete`/`deleteArrayRow`/`clearOrigin`/`toggleCard`/`toggleEquipment`
  links across the character sheet, NPC sheet, Wizard, Content Wizard, and the Card/Condition/
  Species item sheets were plain `<a>` tags with no `href` — unlabeled to screen readers and
  unreachable by keyboard, same class of bug as the pip toggles fixed in 0.6.6, just ~40 call
  sites across 6 templates. Converted to real `<button>`s with descriptive `aria-label`s (e.g.
  "Delete The Hanged Offering", "Delete expertise 2", "Remove Iron Shortsword") and reset their
  styling in CSS so they still read as plain inline icons rather than boxed buttons.

## 0.6.6

- Fix WCAG contrast failures on the system's pass/fail status colors: `#2e7d32`/`#c62828` as text
  on the sheet's dark background measured ~2.8:1 and ~1.7:1 (both well under the 4.5:1 floor) in
  the chat roll-card's Pass/Fail text and the Wizard's validation checklist — the one place a
  single color *is* the signal. Lifted to `#66bb6a`/`#ef5350` for text; the darker tones are
  unchanged everywhere they're a background under white text (success-die, spent Surge badge),
  which already passed.
- Make the Wound/Death Track/Combo/Influence pip tracks keyboard-reachable: they were unlabeled
  `<span>`s with no role, state, or focus support — the most-used interaction in combat was
  mouse-only. Converted to real `<button>`s with `aria-pressed` and a descriptive `aria-label`
  (e.g. "Core Wound 2: Serious Physical Wound"), across the character sheet, NPC sheet, and Wizard.
- Give the character sheet's tabs `role="tab"`, `aria-selected`, and keyboard focus (`tabindex="0"`)
  — previously plain links with no tab semantics and no way to reach them without a mouse.
- Add a single global `:focus-visible` outline — no such rule existed anywhere in the system, so
  every custom-painted control was invisible to keyboard focus even where it was reachable.

## 0.6.5

- Fix the Biography tab's Concept field clipping its own content: it was a plain 2-row `<textarea>`
  while its siblings (Appearance/Personality/Backstory) are full rich-text boxes, and the
  Character Wizard already treats this same `system.concept` field as rich text with its own
  "Concept / Background" editor — the sheet was the odd one out. Switched Concept to the same
  editor its Wizard counterpart and its Biography-tab siblings already use. Also raised General
  Notes' minimum height (3em → 6em) since it had the identical unset-`rows` shape of bug.

## 0.6.4

- Add rank/skill/cost/tags metadata and a search box to the Combat tab's Action/Reaction Card
  lists on both character and NPC sheets — previously showed name only, so choosing a card
  mid-turn meant opening it just to check its cost. The Character Wizard already had this; now
  the sheet you actually play from does too. Also added an empty state ("No Action Cards — drag
  one from the compendium.") where the lists previously just rendered nothing under the header.

## 0.6.3

- Give the Action/Reaction Card sheet a read view: opening a card now shows it as an actual card
  (stat chips, labeled Target/Effect lines, amber Surge badges reusing the chat roll-card's own
  styling, a bordered Rider callout) instead of dropping straight into a form of bare inputs.
  A View/Edit toggle in the header switches into the existing edit form. Also added the missing
  Add Body Line / Add Surge controls to the edit form, and Add Section / delete-row controls to
  the Condition sheet, which previously had no way to add rows at all.

## 0.6.2

- Add a confirmation dialog before deleting an owned Item (Action/Reaction Cards, Conditions,
  Equipment) from a character or NPC sheet — deletion was previously immediate with no undo,
  and the trash icon sat 6px from the roll button every card row uses every turn. Also gave
  the delete icon a distinct danger color so it reads as destructive before the click.

## 0.6.1

- Fix oversized headers and excess dead space on every item sheet (Combat Cards, Equipment,
  Conditions, Species, Heritage, Distinction). Their "Body"/"Effect"/"Sections"/"Description"-type
  `<h3>` headers were plain, unstyled tags rendering at core's default 28px with 32px/16px margins
  — every other header in the system already used the `.section-head` class (compact, uppercase,
  underlined) except these; now they all match. Also shrunk item sheets' rich-text field boxes
  from the 150px default (sized for a full Biography page) to a more honest 4em for these
  single-purpose fields, so an empty or short Effect/Passive/Special no longer eats most of the
  window. A card/item's full content is now visible together instead of buried under whitespace.

## 0.6.0

- Add **Bulk Import**: a second "Essence System" scene-control button (next to Create Content)
  that lets a GM (or anyone with Foundry's "Create Items" permission) download a CSV template for
  Combat Cards, Equipment, or Conditions, fill it out in any spreadsheet app, and upload it back
  in. Rows are matched by name — an existing name updates that item in place, a new name creates
  one. Verified live end-to-end for all three content types (create and update-by-name).

## 0.5.12

- Fix 10 Combat Cards carrying stray, incorrect content: Hide, Disengage, Dash, Shove, Basic Shot,
  Strike, Brace, Fox Finds the Gap, Swallow Tests the Rain, and Wolf Runs the Line each had a
  leftover duplicate "Effect" entry ahead of their real one, so their card sheet showed the wrong
  effect text. Hide, Disengage, and Dash also carried an entirely unrelated Surge/Rider block
  (Ballistics-flavored "TARGETING"/"SUPPRESSION" text) that doesn't belong on them. Corrected at
  the source (the Neon database powering these packs) and verified every field now matches
  `essence_card_playtest_250.xlsm` exactly. Equipment was deliberately left untouched — its
  backing Neon table (`equipment_cards`) was found to be empty, a separate pre-existing issue that
  needs its own resolution before any equipment resync.

## 0.5.11

- Fix Action/Reaction Card sheets burying their own content: core's `<prose-mirror>` element
  defaults to a 150px min-height meant for a full Biography-style field, but a card's Body/Surges
  are several short one-line entries stacked in a list — each one ate 150px of empty space, so a
  card with 2+ Body lines pushed its "Effect" line (and everything after it: Surges, Rider) far
  below the fold. Shrunk those specifically to a compact 2.5em. The card *data* was always correct
  underneath — this was purely a display bug hiding it.
- Remove the Domain field from the Action/Reaction Card sheet — not a field GMs/players edit or
  reference per-card; it's already established this isn't a meaningful axis for browsing cards
  either (see 0.5.9's dropped Domain filter).

## 0.5.10

- Make Combat Card and Equipment names clickable throughout the Character Wizard (Selected,
  Qualifying Cards, Signature Loadout, and Equipment Library) — clicking a name now opens its real
  Item sheet so players can read the full card/equipment text before deciding to add it, instead
  of judging it off a bare name + rank/skill tag. Styled as an actual link (accent color, pointer
  cursor, underline on hover) so it reads as clickable at a glance.

## 0.5.9

- Add filters and a sort control to the Character Wizard's Combat Cards browser: Type (Action/
  Reaction/All), Skill, and Sort (Rank/Name/Skill). Action and Reaction Cards now list together in
  one combined, filterable list instead of two separate unfilterable ones.

## 0.5.8

- Give rich-text (`<prose-mirror>`) fields — Concept/Background, Biography, GM Notes, Passive
  Features, and every item sheet's HTML fields — a visible bordered box matching the sheet's other
  inputs. Core's own ProseMirror styling is transparent by default, which on this system's dark
  sheet backgrounds meant a writable field looked identical to empty page background until you
  happened to hover over it.

## 0.5.7

- Fix every rich-text field's Edit button being completely inert system-wide: the Character
  Wizard's Concept/Background, the actor sheet's Biography tab (Appearance/Personality/Backstory)
  and Passive Feature text, the NPC sheet's GM Notes, and every Combat Card/Condition/Equipment/
  Species/Heritage/Distinction item sheet's HTML fields. Core's `{{editor button=true}}` Handlebars
  helper outputs a plain `<a class="editor-edit">` that only becomes clickable through
  `FormApplication#_activateEditor`, a legacy V1-sheet API our ApplicationV2/DocumentSheetV2 sheets
  never had — so every one of those buttons did nothing. Replaced it system-wide with a new
  `essenceEditor` helper that emits Foundry's real `<prose-mirror>` custom element instead (a
  self-activating, form-associated element core already registers — no bespoke JS needed, and it
  saves through the same `submitOnChange` form handling every other field already uses). Verified
  live: typed and saved actual content through the Wizard's Concept field and the actor sheet's
  Biography tab.

## 0.5.6

- Fix the Character Wizard's Concept step: Player Name, Tier, and Level (and Pronouns/Age) fell
  out of alignment because `.wizard-row label` never got the same `display: flex` treatment the
  actor sheet header already uses for its own Player/Tier/Level row — a wide, unstyled label
  wrapped its input onto a second line while narrow ones happened to fit, making the row look
  staggered. Matches the sheet header's `.header-fields label` rule now.

## 0.5.5

- Fix the starting Reaction Pool at the beginning of Round 1: `EssenceCombat#_onStartRound` was
  hard-setting every combatant's Reaction Dice to `0` instead of `5 + Tier`, so nobody could use a
  Reaction Card before their own first Turn arrived — contradicting part-iv-combat.md's "Starting
  Reaction Pools" rule, which exists specifically so combatants acting later in the first Round
  can still defend themselves. Verified live across a 10-combatant encounter with mixed
  character/NPC actors, varied Initiative commits, and cascading Action/Reaction Card plays.

## 0.5.4

- Add an in-world **Player & GM Guide** journal compendium (two entries: Player's Guide and
  Game Master's Guide) covering the sheet, dice-commit rolls, wounds, combat, NPCs, Conditions,
  and content authoring — the first in-world onboarding material for new players and GMs.

## 0.5.3

- Wire Conditions into the Token HUD's status-icon toggles. Clicking a Condition icon there now
  adds/removes a real owned Condition Item on the actor (with its actual mechanical Active
  Effect where the rules define one, e.g. Chilled's Movement -2) instead of doing nothing. GMs no
  longer have to drag the Condition Item onto the sheet by hand.

## 0.5.2

- Foundry's native Combat Tracker (per-combatant dice icon, Roll All, Roll NPCs) now routes
  through the real Essence Initiative dice-commit flow instead of a flat formula roll. Previously
  only the character/NPC sheet's own Roll Initiative button used the real mechanic; clicking the
  tracker's own dice icon silently bypassed it. Centralized in `EssenceCombat#rollInitiative` so
  every entry point behaves identically. Verified live against the Combat Tracker UI.

## 0.5.1

- Fix NPC/Adversary actors failing to create at all — the new Role tag field rejected its own
  blank default value ("role: may not be a blank string"), so `Actor.create` silently failed for
  every NPC. Verified live: NPC actors now create, their sheet renders end-to-end (attributes,
  skills, wounds, combat controls, item lists, GM notes), and Roll Skill / Roll Initiative work
  through the same dice-commit flow as player characters.

## 0.5.0

First release cut through the automated release pipeline. Summarizes everything shipped since
the initial scaffold:

**Core character sheet**
- Attributes, derived Resources/Defenses, Combat Skills with skill-gating by Distinction,
  Expertises nested per skill, Non-Combat Skills, Career & Key Aspects, Biography.
- Species / Heritage / Distinction as full Item types; their traits populate automatically into
  a "General Features & Benefits" table rather than being duplicated across the sheet.
- Full Wound system: Resilience/accumulated-Damage tracking, Temporary and Core Wounds in
  correct severity order, generated Wound Condition labels, Wound State, and the Death Track —
  including an Apply Damage workflow and reverse-order Recovery.
- Combat lifecycle wired into Foundry's native Combat Tracker (Start/End Combat, round/turn
  advancement) rather than bespoke buttons; the sheet keeps only Roll Initiative and End Turn.
- Dice-commit flow for cards/skills/initiative matching the rules exactly (commit N dice up to
  what's left in the pool; that commitment is both the roll and the pool spend), plus a
  standalone Burn Dice action for unrolled-dice costs.
- Multi-target roll resolution using Foundry's own targeting system.
- One resource-tracking mechanic per Combat Style Specialty (Combo, Lock, Adaptation,
  Contingency, Threads, Strain, Authority, Rites, Full Manifestation/Broken).
- Conditions and Distinctions with real mechanical effect: flat, unconditional stat changes use
  Foundry's native Active Effects; everything trigger-based renders as reminder text on the
  sheet instead.

**Compendium content**
- Action Cards, Reaction Cards, Conditions, and Equipment generated from the live Essence
  Neon database.
- Species, Heritages, and Distinctions hand-authored from the canonical rules.
- A "Combat Styles Reference" journal compendium (one entry per Combat Style) generated from
  the same source data driving the Specialty trackers.

**Wizards**
- A 10-step Character Creation Wizard (Concept → Identity → Attributes → Wounds → Combat
  Skills → Influence → Non-Combat → Passive Features → Equipment → Finalize), editing an
  existing Actor live and finishing with a requirement checklist.
- A Create Content wizard (scene-control button, gated by Foundry's assignable "Create Items"
  permission) for authoring new Action/Reaction Cards, Equipment, and Conditions directly into
  the shared compendium.

**Fixes along the way**
- Several real Foundry-specific bugs found only by testing live against actual multi-row data:
  array-field updates silently replacing sibling data on a standalone dotted-path update, a
  Handlebars block-parameter scoping bug, a race condition between two in-flight document
  updates, a CSS Cascade Layers issue clamping chat card dice, a same-element compound-class
  selector that silently matched nothing, and read-only sheets whose Close button was
  accidentally disabled along with the rest of the sheet's controls.

## 0.1.0

Initial scaffold: character actor sheet, Action/Reaction Card/Condition/Equipment item types,
the dice engine ported from the web app's `engine.ts`, and the first compendium packs.
