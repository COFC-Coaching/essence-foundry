# Changelog

All notable changes to the essence-foundry system are recorded here.

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
