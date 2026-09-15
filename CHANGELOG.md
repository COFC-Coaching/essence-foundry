# Changelog

All notable changes to the essence-foundry system are recorded here.

## 0.6.63

**"Grant Recovery" on the character sheet** — a GM-adjudicated Adventure Recovery action, added
next to Apply Damage/Recover Wound. Part III: Playing the Game deliberately gives Recovery no fixed
formula ("Recovery occurs when circumstances provide enough safety, time, treatment, supplies, or
support" — narrative, not a session boundary or a percentage), and Part VII (where the numeric
Stamina/Focus/Mana restoration and Wound-treatment timing were meant to live) is still an unfinished
placeholder in the source rules. Rather than invent a canon-less formula, this hands the GM a lever
instead: a dialog where they set what percentage of Stamina/Focus/Mana this particular Recovery
restores, plus an optional checkbox to also recover a chosen number of Core Wounds (reusing Recover
Wound's existing reverse-order rule — most severe filled Wound first). Posts a chat summary so the
Recovery is visible to the table, matching Part III's framing that Recovery is something that
happens in the game world, not a mechanical tick.

## 0.6.62

**The Reduced Enemy Engine, for Mook and Normal Grade** — the piece the original design doc
flagged as unfinished. A Mook or Normal no longer needs an Attribute grid or Combat Cards to fight:
`fixedAttack` (a printed dice-pool size per Domain) and `fixedDefenses` (flat Fortitude/Composure/
Harmony) replace the build-fresh-every-time formulas, while a frequency-tagged Abilities list (At
Will / 1 per Round / X per Combat) replaces Action/Reaction Cards and MP tracking. None of this
skips rolling — the sheet's Fixed Attack button still rolls real dice through the same resolver a
PC's Combat Card uses; only the *pool size* is precalculated instead of rebuilt. Calibrated so a
Tier 1 Mook/Normal's pool lands at 2 (an ordinary 2d10 PC Action's effectiveness) and its Resilience
lands at 2, matching the Encounter & Adventure Building Primer's own Tier 1 Enemy Chassis numbers
exactly — both use the same base+(perTier×Tier) formula shape the Grade budget table already used
for Resilience, and both are GM-tunable from the same Grade Budgets settings menu. The Monster
Creator's Auto-Generate now fills Fixed Attack/Defenses for Mook/Normal instead of running the
point-buy path; Elite is unaffected.

**Elite Type's third value is "Solo," not "Boss"** — confirmed directly: encounters come in three
classes (Minor/Severe/Critical), and Critical has a subdivision called a "Boss" encounter, built
from *either* a Leader-type Elite or a Solo-type Elite. Boss was never itself an Elite Type. Renamed
throughout — schema, the sheet's Elite Type dropdown and ability list (`soloAbilities`), the wizard,
and every lang key — so "Boss" now means only the encounter class, matching the source design docs.

## 0.6.61

**New Monster Actor type, for creature-shaped adversaries** — People (the existing NPC/Adversary
type) are built from a Species/Heritage/Distinction Origin, same as a player character; that's the
wrong shape for a beast, a spirit, or an elemental. The new Monster type shares every identity and
budget concept a Person has (Tier/Grade/Role/Elite Type, the Grade budget table, Tactics and
Leader/Boss Abilities) via a new shared `EssenceAdversaryData` base class, but swaps Species/
Heritage/Distinction for a single Monster Type tag (Familiar/Sprite/Beast/Phantom/Golem/Elemental/
Ancestor/Fey at Mook-Normal Grade; Dragon/Fiend/Celestial/Abomination/Leviathan/Avatar/Outsider/
Colossus/Primordial once Grade is Elite) and gets its own compact sheet with the Species/Heritage/
Influence/full-Reach sections dropped — keeping just a small Distinction picker so a spellcasting
creature can still unlock a gated Combat Skill. The Monster Creator wizard is the same tool used
for People, branching only at the Origin step, so building either kind of adversary feels like one
cohesive workflow rather than two separate tools. Also fixed two spots that keyed off
`actor.type === "npc"` specifically (the Combat Tracker's Action Dice lifecycle, and the
end-of-combat reset) that would have silently left every Monster combatant out of initiative and
turn dice entirely.

## 0.6.60

**NPC "Role" (Minion/Standard/Elite/Nemesis) is now "Grade" (Mook/Normal/Elite), plus two new
identity tags: battlefield Role and Elite Type** — the old field was doing two unrelated jobs at
once (how tough an enemy is, and how much bookkeeping it costs the GM to run) and had no basis in
the rules text. Grade now covers the second job alone; a separate battlefield Role field
(Defender/Striker/Controller/Artillery/Skirmisher/Support) is purely descriptive; and an Elite
gets an Elite Type (Champion/Leader/Boss) shown alongside it. The NPC sheet header and the Monster
Creator now both show a shared "Tier 3 Elite — Controller (Leader)"-style label built from one
function, so the two can't drift out of sync. The Monster Creator's Grade budget table collapsed
from 4 rows to 3 (Mook keeps the old Minion numbers, Normal keeps Standard, Elite takes over the
old Nemesis numbers) and moved to a "Grade Budgets" settings menu, replacing "Role Budgets". A
Mook additionally gets an ordered, plain-text Tactics list; a Leader or Boss Elite gets a matching
Command/Boss Abilities list. Existing worlds migrate the old Role value and any customized Role
Budgets setting automatically on first load.

**Fixed two display bugs surfaced while building the above** — a long-standing one where the NPC
sheet's "(open Species — e.g. to choose Adaptations)" Origin button was squashed into a 1.7em icon
square by a CSS rule meant for pencil-icon buttons, overflowing its text into the row above once a
Species was actually selected; and a new one where the Leader/Boss Ability rows' rich-text editor
collapsed to an unusable 14px sliver in a flex list, fixed by moving those rows to the same table
layout Passive Features already uses successfully.

## 0.6.59

**Equipment can now move between Signature, Temporary, and Armory** — Move buttons on every
Equipment row (character and NPC sheets) reassign an item's slot without dragging; native
drag-and-drop between the three zones is still available as well. Temporary Items and Armory can
now also be added to directly from the sheet (a "+ Add Item" button per table, matching Signature),
and the Character Creation Wizard's Equipment step can now stock the Armory, not just Signature.
Equipment rows also got a View button so a card can be read in full without entering edit mode.

**Cleaned up the Equipment tables and their icon buttons, then carried the same pass across the
rest of both sheets** — reported live as "why are you using different icons? It's ugly... it's not
just this one table, it's the overall sheet." Root cause: several action buttons (View, Post-to-
Chat, Move) had been added to the templates without ever being added to the CSS rule that strips
Foundry's default boxed-button chrome, so they rendered inconsistently next to the plain-icon
Edit/Delete buttons in the same row. Fixed the allowlist, then found and fixed the same class of
gap wherever else it existed: skill roll buttons (Combat and Non-Combat tabs) had no styling of
their own and fell back to the same boxed look; every "add a new row" button (Add Skill, Add
Expertise, Add Reach Trigger, Add Body Line, ...) now shares one consistent amber-outlined
treatment instead of only Equipment's "+ Add Item" having it; a long Equipment Effect cell (an
entire assembled card's text inline in a table row) now clamps to a short preview with a fade,
deferring full detail to the View button instead of dumping a wall of text into the table; every
item sheet's title (Equipment, Chassis/Fitting, Augment, Condition, Species, Heritage, Distinction)
now scales down for a long name the way Action/Reaction Cards already did, instead of rendering at
the browser's raw oversized default; and the NPC sheet's window was 120px too narrow for its own
3-column attribute layout, clipping the Spiritual column under a horizontal scrollbar.

## 0.6.58

**Fixed the Chassis/Fitting pickers showing every category mixed together** — building a Weapon
showed Armor Shells, Shield Guards, and Implement Focuses alongside the Strikers/Grips that
actually apply, since the picker wasn't scoped to the equipment item's own category. Ranged Weapon
now gets its own assembled category instead of folding into Weapon, matching the split that
already existed one layer down (Striker vs Launcher), which is what makes the category filter
exact instead of approximate.

**Melee/Ranged Weapon, Armor, Shield, and Implement can no longer be un-modular'd** — always
assembled from a Chassis + Fitting now, with the now-pointless Type/Range/Reach Bonus fields and
Modular checkbox removed from their equipment sheet.

**Fixed blank Effect columns and missing stat bonuses on existing equipment** — several owned
items had their Chassis/Fitting reference set to a compendium document with no matching copy
actually embedded on the actor, so resolution silently found nothing (no Effect text, and no
Fortitude/Resilience/Movement bonus reaching the character in play, not just on the sheet). Odds
are decent this affects your own characters too — a one-time migration re-syncs every existing
modular item's Active Effect on next load. Also fixed a Chassis/Fitting's Combined Effect text
showing up twice when that Component's own effect field was already the full granted-card text.

**Equipment tables get real actions instead of a useless row-index column** — the Signature/
Armory/Temporary Equipment tables (both character and NPC sheets) now have View and Post-to-Chat
buttons per row. Equipment-granted cards (from a Signature item's Function Augments or Consumable
Kit) now also show in the actor's own card list, tagged as not counting against Card Count.

## 0.6.57

**Replaced the flat combat-equipment catalog with a full Chassis/Fitting/Augment system** —
imported a new playtest catalog (30 Chassis, 30 Fittings, 24 Augments) into the equipment
compendium, retiring the old 26 flat weapon/armor/shield/implement items in favor of the modular
system the schema already supported but had no content for. "Handling" is renamed to "Grip"
throughout. Flat authoring of weapon/armor/shield/implement equipment (Bulk Import, Item Creation
Wizard) is retired in favor of assembling a Chassis + Fitting (+ Augments) instead — Toolkits,
Consumable Kits, and Gear are unaffected.

**Assembled items now show a combined Effect** built from their Chassis, Fitting, and any
installed always-active Support Augment, instead of requiring each piece to be opened separately
to see what the finished item actually does.

**Compendium-authored (unowned) equipment items can now pick real Chassis/Fitting/Augments** —
previously only an item already owned by a character could use the real pickers; authoring one
straight in the compendium (e.g. via the Item Creation Wizard) fell back to a free-text
placeholder. Both cases now resolve from the same shared equipment library.

## 0.6.56

**Fixed the Combat tab's Action/Reaction Card Sort control undoing itself** — reported live as
sorting "just breaking." The Sort/filter controls have no `name` attribute (nothing there is actor
data to save), but their change/input events still bubbled up to the sheet's own
form-level auto-save listener, which triggered a full re-render on every selection — silently
rebuilding the card list from scratch and undoing whatever sort was just applied. Also freed the
Sort/filter controls from the sheet's edit-lock: nothing about picking a sort order needs the same
protection as editing a build value, so there was no reason it required unlocking the sheet first.

**Added a Character Name field to the Character Wizard's first step** — only Player Name was there
before, so naming the actual character had to happen somewhere else first.

## 0.6.55

**Fixed equipment Fortitude/Resilience/Movement/Reach bonuses silently compounding forever** —
reported live: a single Fortress Armor item with a -4 Movement modifier drove one character's
Movement from 10 down to 2, and a separate +2 Resilience item drove another character's Resilience
up to 8. The bonus was applied as a transferred Active Effect targeting the exact same raw field
that's also a directly-editable sheet input — every unrelated form save wrote the already-adjusted
displayed number back as the new "base," which then got the effect re-applied on top of *that*,
compounding a little more on every save. Resilience/Movement/Reach now accumulate into their own
indirect bonus fields instead (matching how Fortitude already worked), and a one-time migration
rebuilds every already-affected item's effect and stops touching the raw field going forward.
Already-corrupted characters' raw Movement/Resilience values from before this fix still need a
manual correction, since exactly how many times they compounded isn't recoverable.

**Added an "Active Equipment Bonuses" line to the sheet** listing exactly which equipped item is
granting which Fortitude/Resilience/Movement/Reach bonus, instead of leaving the final number a
mystery.

**Fixed Expertises silently over-counting after respeccing a Combat Skill** — lowering a Combat
Skill's rank back to 0 in the Wizard left any Expertise already picked under it in place; it
disappeared from the by-skill list (which only shows skills at rank 1+) but still counted toward
the Expertises total, sometimes blocking a legitimate later pick. Lowering a skill to 0 now clears
its Expertises, and a one-time migration cleans up any already-orphaned ones.

**Players can now create their own Equipment/Action Card items by default** — Foundry's "Create
Items" permission defaults to Gamemaster-only, which also blocked Players from building their own
homebrew gear. Granted once per world on first load after this update; a GM who deliberately turns
it back off afterward won't have it silently re-enabled.

## 0.6.54

**Fixed the "What's New" chat card silently not appearing for existing users** — reported live: a
GM updating an established world to v0.6.53 never saw the card, while a player who'd separately
already triggered a stored value did. The card's per-client "have I seen this version" setting had
never been set for *anyone* before v0.6.53 introduced it, and the code read "no stored value yet"
as "brand-new user, don't show it" — meaning it reliably skipped the card for every existing user's
first login on the very release that introduced it. Removed that special case entirely: the card
now shows on any version mismatch, including a client's very first visit (a brand-new player seeing
one orientation card is a fine trade-off for the feature actually being reliable). Also added a
manual `/whatsnew` chat command so anyone can pull up the current version's card on demand, without
waiting on the automatic trigger.

## 0.6.53

**Added a "What's New" chat card** (`module/apps/whats-new.mjs`) — not a native Foundry feature,
but a common pattern other systems build for themselves. Each player and the GM now see a
one-time, per-client styled card summarizing what changed the first time they load a session after
an update, parsed live from `CHANGELOG.md` (now shipped in the release zip) rather than a second,
separately-maintained summary that could drift out of sync with it. Silent on a brand-new login —
no false "what's new" the first time a client ever connects.

**Fixed a systemic double-escaped-HTML-entity bug**: 7 localization strings (`Career & Key
Aspects`, `Attributes, Resources & Defenses`, and 5 others) stored a literal `&amp;`/`&middot;`/
`&gt;` entity, which `{{localize}}`'s own HTML-escaping then escaped a second time, rendering as
literal `&AMP;`-style text in section headers instead of the intended character.

**Combat Skills now roll from a dedicated die-icon button** instead of clicking the skill name
directly, matching the same die-icon pattern already used for Non-Combat Skills (added last
release) — the name is now a plain label, and the icon button is the click target, on both the
character and NPC sheets.

**Distinction creation-time bonuses now actually apply in the Character Creation Wizard.**
Athlete, Marksman, Strategist, and Orator each grant "+1 Expertise and +2 Action Cards" in their
key skill immediately at creation per their printed benefit text, but the wizard's Expertise/Combat
Card budgets were flat hardcoded constants (4 and 10) that never read this. Added structured
`creationExpertiseBonus`/`creationActionCardBonus` fields to the Distinction schema — populated
only for these four, since the other five gated Distinctions (Gifted/Psyker/Arcanist/Invoker/
Summoner) only grant their bonus "if acquired later," not at creation — and wired the wizard's
budget display and enforcement to read them. Verified live: Orator now correctly shows 5/5
Expertises and 10/12 Combat Cards instead of 4/4 and 10/10.

## 0.6.52

**Full Manifestation profiles now have their own dedicated Actor type and sheet instead of
borrowing the generic NPC one.** The NPC sheet carries a lot of monster-building machinery — a
Role dropdown, the Monster Creator button, Species/Heritage/Distinction Origin pickers, Non-Combat
Skills, Influence — none of which applies to a profile whose stats are fixed by the printed rules
table, not hand-built. `EssenceManifestationData` (`module/data/actor-manifestation.mjs`) is a lean
schema with just what a profile needs — Fortitude/Composure/Harmony/Resilience/Movement as plain
numbers, a Wound track sized to its own capacity, Purpose/Trait text, and (for Elemental) its
Declared Aspect — and `EssenceManifestationSheet` renders only that. The 8 compendium profiles and
`module/apps/manifestation.mjs`'s swap logic were both updated for the new schema, including
renaming the defeat-overflow counter from a repurposed Death Track field to a clear
`overflowWounds` one. Verified live: entering, dealing damage past a Wound Track's capacity,
resolving a defeat (correct overflow + feedback Wounds, correct severities, Broken flag set), and
returning to the caller all behave correctly end-to-end.

**Rewrote all three in-world guide journals** (Player's Guide, Game Master's Guide, and the Full
Manifestation Guide) after checking essencesystem.com's own Quick Guide for voice and structure.
The Full Manifestation Guide in particular had gone stale the moment the automation above shipped —
it still described manually dragging profiles from the compendium and called out "not yet
automated" in places that had since become one-click. Every guide was also restructured from one
dense page into several focused, single-topic pages (Player's Guide: 1 → 7; GM's Guide: 2 → 4; Full
Manifestation Guide: 4 → 6), matching how the actual website's guide is organized, and raw
math/dev-process notes were replaced with plain-language explanations and one worked example.

## 0.6.51

**Replaced the entire 9-Style Action/Reaction Card catalogue with a new Rank 0-2 playtest set,
and built out Calling's Full Manifestation as a real subsystem instead of two checkboxes.** Both
changes come from the same mechanics rework packet (`PLAYTEST_RULES.md`/`CALLING_PROFILES.md`).

**Card catalogue:** every Action/Reaction Card belonging to one of the 9 Combat Styles is now
hand-authored as CSV in `scripts/combat-cards/` (one file per domain per type), replacing the old
Neon-sourced set — 396 cards total (33 actions + 11 reactions per Style), matching the playtest
packet's catalogue budget exactly. The 7 skill-less "Basic" universal cards (Hide, Strike, Brace,
etc.) are unaffected and still come from the live database. Folder placement is unchanged — a
card's `skill` column still routes it into that Style's compendium folder automatically.

**Full Manifestation:** the 8 profiles (Familiar, Sprite, Beast, Phantom, Golem, Elemental,
Ancestor, Fey) now live in a new "Calling Full Manifestations" compendium as NPC Actors, each with
its own Fortitude/Composure/Harmony/Resilience/Movement, a Wound track sized to its actual
capacity (3-5, not the usual fixed 5), and its 2-3 built-in maneuvers as real Action/Reaction Card
items. A new "Full Manifestation Guide" journal (4 pages) documents the shared entry/dismissal/
defeat procedure and the accumulated-Damage-across-forms formula. Entering/dismissing/resolving a
defeat is driven from each sheet's own header dropdown menu, using Foundry's own token-reassignment
mechanism (the same approach systems like dnd5e use for Wild Shape) rather than a bespoke
transformation layer — a character's token swaps to point at their persistent profile Actor for
the rest of the Encounter, then swaps back.

- Fixed Leadership's Authority capacity formula: `max(1, half Rank rounded up)` — the old plain
  half-Rank formula gave 0 storage slots at Leadership Rank 0, an unusable result the playtest
  packet explicitly calls out and patches.
- Psionics Strain now automatically applies its provisional Composure/Harmony/Fortitude penalty
  table (capped at 6) instead of being a bare, uncapped number the GM had to remember to act on.

**Not verified against a live Foundry client this session** — checked via `node --check`,
Handlebars brace-balance counts, and direct inspection of the compiled compendium JSON, per this
project's established practice for changes that can't be exercised outside a real client.

## 0.6.50

**Bulk Import now routes rows into the same compendium folders the pre-built content and the
single-item Content Wizard use, instead of dropping every imported item unfoldered at the pack
root.** Action/Reaction Cards are routed by their `skill` column into that Combat Style's folder
(falling back to "Basic" for skill-less cards or unrecognized values); Equipment is routed by
`category` into its category folder (Weapon, Armor, Consumable Kit, etc.); Chassis/Fitting/Augment
rows go into their fixed "Chassis"/"Fitting"/"Augment" folders. Conditions are unaffected — they
were never foldered. Folder matching is case-insensitive and applies on both create and update, so
re-importing a row whose category/skill changed also moves it to the correct folder.

- New `resolveFolderId()` in `module/apps/bulk-import.mjs`, mirroring the folder-naming rules
  `scripts/build-packs.mjs` uses to seed those folders and `content-wizard.mjs` uses for
  single-item creation.

**Not verified against a live Foundry client this session** — checked by reading through the
folder-seeding and single-item-wizard code paths for consistency; no live Bulk Import run was
performed.

## 0.6.49

**Movement moved to the sheet header; Action/Reaction Dice now have +/- controls; Burn Dice
removed.** Movement previously only appeared inside the Combat tab, so switching to Core/
Equipment/Non-Combat/Biography hid it entirely — it's now in the header next to Tier and Level,
visible from every tab, on both the Character and NPC sheets.

The Action Dice / Reaction Dice pool display in the Combat tab was read-only text; a player who
gained bonus dice from an effect, or needed to spend some without rolling (the old Burn Dice
button's job), had no way to do it without unlocking the sheet. Both pools now have the same
plain +/- stepper buttons already used for Stamina/Focus/Mana, always usable regardless of the
sheet's edit lock. Since that covers spending dice without rolling, the separate Burn Dice button,
its dialog, and `EssenceActorSheet`/`EssenceNpcSheet#onBurnDice` were removed as redundant.

- New `adjustPoolDice` sheet action (mirrors the existing `adjustResource` pattern) on both actor
  sheets; clamps at 0, no upper bound (a pool can be grown past its normal base by an effect).
- Removed `ESSENCE.Sheet.BurnDice` and `ESSENCE.Notify.NoDiceToBurn` from `lang/en.json` — dead
  strings once the button using them was gone.

**Not verified against a live Foundry client this session** — checked with `node --check` on the
edited `.mjs` files and a `{{#`/`{{/` brace-balance count on the edited `.hbs` templates, per this
project's established practice for changes that can't be exercised outside a real client.

## 0.6.48

**Drag-and-drop for the Equipment tab's Signature/Temporary/Armory sections.** Previously the only
way to add equipment from a compendium or the world Items directory was via the Content Wizard/
Bulk Import, and the only way to move an owned item between slots was opening its own sheet and
changing the Slot dropdown by hand. Foundry already provides the drag/drop plumbing (embedded-item
creation on drop, drag payload via `Document#toDragData()`) — what was missing was telling Foundry
*which* of the three slot sections a drop landed in, since Signature/Temporary/Armory is this
system's own schema field (`system.slot`), not something Foundry has a native concept of.

- Dragging an equipment Item from a compendium, the Items directory, or another actor onto one of
  the three sections now creates it with that section's slot already set.
- Dragging an equipment Item this actor already owns from one section to another (e.g. a Sidearm
  from Signature into Armory) reassigns its slot directly — a real move, not a duplicate copy.
  Foundry's default drop handling treats a drop of an already-owned item as a same-list reorder,
  which isn't meaningful across three separate slot categories, so this case is handled explicitly
  instead of falling through to the default.
- Applies to both the Character and NPC sheets.

**Not verified against a live Foundry client this session** (no dev server available in this
environment) — every `.mjs` file was checked with `node --check` and every touched `.hbs` template
with a `{{#`/`{{/` brace-balance count, matching this project's own established practice for
Foundry-dependent behavior that can't be exercised outside a real client (see the Phase 3 design
doc implementation entry in build-history for precedent). Worth a live pass — dragging between
zones, dragging in from a compendium, and confirming `.draggable-row`'s dragstart payload actually
resolves correctly — before treating this as fully confirmed working.

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
