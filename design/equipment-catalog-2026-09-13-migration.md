# Equipment: Playtest Catalog Import (2026-09-13)

Source: `Essence_Equipment_Catalog` (.docx/.xlsx/.pdf), playtest draft 0.1, dated 2026-09-13 — a
full Chassis/Fitting/Augment content pass for the modular equipment system that
`module/data/item-component.mjs` already implemented (Phase 3, 2026-09-08) but that had **zero**
pre-authored content until this import. The doc's own front matter says these are "design-data
tables, not certified drop-in imports... map the fields deliberately before importing" — this
file records the mapping decisions made doing that, and the rules deltas the catalog introduces.

## What changed in the compendium

- **30 Chassis + 30 Fittings + 24 Augments** (12 Support, 12 Function) added to the `equipment`
  pack's Chassis/Fitting/Augment folders. Source data: `scripts/component-catalog-data.json`,
  consumed by `scripts/build-packs.mjs` (`chassisToItem`/`fittingToItem`/`augmentToItem`).
- **The old 26 flat combat-equipment items are retired.** Every weapon/armor/shield/implement row
  that used to come from `scripts/.cache/raw-equipment-cards.json` (Neon DB) or
  `scripts/extra-equipment-data.json` (hand-authored) is now filtered out of the build
  (`MIGRATED_CATEGORIES` in `build-packs.mjs`'s `wants("equipment")` block) — the new catalog's own
  migration ledger traces each one to its Chassis/Fitting destination 1:1 (e.g. "Light Weapon" →
  MF01 Light Grip, "Fortress Armor" → AC03 Fortress Shell). Toolkit/Consumable Kit/Gear rows from
  both sources are untouched — the catalog explicitly stays out of that content (its own "D8").
- **"Handling" renamed to "Grip"** everywhere (item names, `FITTING_LABELS.weapon`/`.shield` in
  `item-component.mjs`, the bulk-import CSV template, the Item Creation Wizard) — a naming
  decision made this session, not something the source catalog itself called for (it still says
  "Handling" throughout).

## Mapping decisions (the catalog → the existing schema)

The catalog's spreadsheet has no separate Fortitude/Resilience/Movement columns — those are prose
inside each component's `Effect` text. Only genuinely **unconditional, always-on** bonuses were
pulled into the schema's numeric fields (`system.fortitude`/`resilience`/`movement`, which
`equipment-features.mjs` sums for display and `equipment-effects.mjs` would turn into a real
Active Effect if the item were ever non-modular): the 6 Shells (AC01–AC06) and Scout/Articulated
Rigging (AF01/AF04). Everything conditional — Siege Shell's "if you didn't move," Skirmisher
Rigging's "after moving 4 units," every Handling/Grip's once-per-turn triggers — stays text-only
in `effect`, same as the pre-existing legacy items already did. Composure/Harmony bonuses
(Cognitive/Resonant Shell) have no numeric field at all in this schema, so they're text-only too.

**Function Augments' `effect` field carries the complete EC06–EC17 card** (Resolution, Range/
Targeting, Trigger, Effect, Surge options, Uses/Refresh) rather than the one-line stub the
Augments sheet itself has ("Gain the Repulse Equipment Action") — the stub isn't playable at the
table on its own.

**The 5 "Ordinary Equipment Cards" (EC01–EC05) have no standalone compendium entry.** Each of the
11 Fittings that grants one (5 Shield Grips → EC01, `AF05` → EC04, `IF01`/`IF03`/`IF04` → EC02,
`IF02` → EC03, `IF05` → EC05) has its own printed variant text merged with that base card's full
stat block directly in its own `effect` field — this matches how `equipment-features.mjs`'s
`deriveEquipmentStats()` already surfaces `grantsEquipmentCard` items (it reads the granting item's
`effect` field straight through with no lookup into a separate card compendium), and means a player
reading one Fitting's card never has to cross-reference a separate "EC01" entry to know what it
does.

**No Linked Mounts.** The catalog explicitly excludes them ("R1: No Linked Mounts or linked
effects are included"); every Chassis mount here is independent (`linkedWith: null`). The system's
existing Linked Mount support (the `equipment-features.mjs` branch that folds a linked-and-on
Support into its paired Function's card entry) simply has nothing to exercise it yet from this
content.

**`EssenceAugmentData` has no `special` field** (unlike `EssenceComponentData`, which has both
`special` and `flavor`) — an Augment's "Design note" text is folded into the end of its `effect`
field instead of dropped.

## Mechanical conventions the catalog introduces (D1–D8)

These are **table conventions for players/GMs, not new code** — this system has no rules engine;
sheets display text and let a human apply it. None of the below are enforced anywhere in code
today, and nothing here required a code change beyond what's listed above:

- **D1 — Equipment roll cap:** max rolled dice on one of the new Equipment Cards = printed
  Attribute + Character Tier (capped by the available pool). New for this content only; the
  existing action/reaction-card system has its own unrelated dice-pool rules untouched by this.
- **D2 — Function isolation:** a Function Augment's Action/Reaction uses only its own printed
  Range/targets/Damage/Surges — it does **not** inherit the host's weapon type, extra targets, free
  Source Surges, or other ordinary Source-attack modifiers. A Support that modifies "Source
  Actions" (e.g. Selective, Sympathetic) explicitly does not reach a Function.
- **D3 — Active equipment / duplicates / hand-switching:** one active armor assembly at a time;
  readying/stowing a different held item costs 1 burned Action die (empty-hand adjustment is
  free); duplicate named passive/temporary bonuses don't stack (use the strongest, refresh
  duration); a once-per-turn benefit is tracked per character per named property, not reset by
  swapping copies.
- **D4 — Targeting/timing:** target expansion is declared before rolling; one roll/one Action even
  with multiple targets (a Rider fires once, not per target); forced movement obeys normal
  obstacles/Reaction triggers; secondary Damage never recursively re-triggers itself.
- **D5 — Rerolls/Surges:** a die can be rerolled at most once per resolution even if several
  effects could reroll it; each Surge option on this content is usable once per activation; a
  Burn-only card never rolls or spends Surges.
- **D6 — Resilience/Wounds:** Resilience changes are never retroactive — they change protection
  against *future* Damage only, never heal/inflict Wounds already resolved or reset accumulated
  Damage.
- **D7 — Armor pairing is a real addition:** a Shell + Rigging can be mechanically stronger than
  either the original single-item source effect was on its own (e.g. Reinforced + Skirmisher,
  Fortress + Articulated) — flagged as intentional composition to playtest, not an oversight.
- **D8 — explicitly not added:** no healing-kit economy, no social/persuasion mechanic, no
  material-rarity/price table, no new Combat Style Condition. Toolkits and Consumable Kits are
  untouched by this pass.

## Second pass (same day): flat authoring retired, combined-effect display added

- **Flat weapon/armor/shield/implement authoring removed wholesale.** The Bulk Import "equipment"
  CSV template and the Item Creation Wizard's "Equipment" type now only accept `category`
  toolkit/consumable-kit/gear (`FLAT_EQUIPMENT_CATEGORIES` in `item-card.mjs`) — a row/draft
  submitting weapon/armor/shield/implement falls back to `gear`. This does **not** remove those
  four from `EssenceEquipmentData.category`'s own choices: an actual assembled `equipment` Item
  (`isModular: true`, `chassisItemId`/`fittingItemId`) still needs to BE a weapon/armor/shield/
  implement — only the "author one flat pre-fab item with its own hardcoded stats" path is gone,
  replaced by authoring/picking a Chassis + Fitting (+ Augments) instead.
- **Combined effect display.** `deriveEquipmentStats()` (`equipment-features.mjs`) now also
  returns `combinedEffect`: an ordered list of {source, html} entries built from the Chassis's own
  `effect` text, the Fitting's, and any installed **unlinked** Support Augment's (a Function
  Augment's text is deliberately excluded — it's already shown via `grantedCards` with its own
  Uses tracking, so including it again would just duplicate it). This is what a flat item's single
  `system.effect` field used to show in one place, now assembled live from the pieces. Rendered on
  both the equipment sheet's view-mode card and its edit-mode modular-assembly section
  (`equipment-sheet.hbs`, new `ESSENCE.Item.Equipment.CombinedEffect` string).
  A Linked-and-on Support's own text still isn't folded into its paired Function's card display —
  a pre-existing gap, not addressed here.

## Open follow-ups (not done in this pass)

- No in-app enforcement of D1 (roll cap), D3 (duplicate/once-per-turn tracking), D5
  (reroll-once), or D6 (non-retroactive Resilience) — same as every other card-text rule in this
  system, these stay GM/player-applied reminders rather than code.
