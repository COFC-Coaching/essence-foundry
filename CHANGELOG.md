# Changelog

All notable changes to the essence-foundry system are recorded here.

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
