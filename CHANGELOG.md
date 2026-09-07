# Changelog

All notable changes to the essence-foundry system are recorded here.

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
