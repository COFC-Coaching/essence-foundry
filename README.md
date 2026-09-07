# essence-foundry

A Foundry VTT game system for **The Essence System** — a d10 dice-pool tabletop RPG with
tactical card-driven combat. Ports the ruleset and data model from the [Essence System web
app](https://essencesystem.com) 1:1, so rolls, derived stats, and combat-dice lifecycle behave
identically in Foundry.

## Status: v0.5.0

See [CHANGELOG.md](CHANGELOG.md) for the full history. Currently working:

- Full character sheet: Attributes, derived Resources/Defenses, Combat Skills (with Distinction
  gating), Expertises, Non-Combat Skills, Career, Biography.
- Species / Heritage / Distinction Items whose traits populate the sheet automatically.
- The complete Wound system: Resilience, Temporary/Core Wounds, Wound Conditions, Wound State,
  the Death Track, Apply Damage, and reverse-order Recovery.
- Combat driven by Foundry's own Combat Tracker, with a dice-commit flow matching the rules
  exactly and multi-target roll resolution via Foundry's native targeting.
- Combat Style Specialty trackers (Combo, Lock, Adaptation, Contingency, Threads, Strain,
  Authority, Rites, Full Manifestation).
- Conditions/Distinctions with real mechanical effect via Foundry's Active Effects where the
  rules define a flat stat change, and reminder text everywhere else.
- Compendiums: Action Cards, Reaction Cards, Conditions, Equipment (from the live Essence
  database), Species/Heritages/Distinctions (hand-authored), and a Combat Styles Reference
  journal.
- A 10-step **Character Creation Wizard** (button on the sheet header).
- A **Create Content wizard** (scene-control button, gated by Foundry's "Create Items"
  permission) for authoring new Cards/Equipment/Conditions straight into the compendium.

Known gaps (see the project's own audit notes for the full list):
- No NPC/Adversary Actor type yet — only player characters.
- Recovery/Downtime timing and Full Manifestation's actual profile-swap aren't implemented,
  since the canonical rules for both aren't finalized yet.
- Foundry's own Combat Tracker "Roll Initiative" die icon doesn't use the real Essence flow —
  use the character sheet's own **Roll Initiative** button instead.
- Conditions aren't yet wired into the Token HUD's status-icon toggles (drag the Condition Item
  onto the actor sheet instead).

## Installing in Foundry

Paste this manifest URL into Foundry's **Install System** dialog:

```
https://raw.githubusercontent.com/COFC-Coaching/essence-foundry/main/system.json
```

This always resolves to the latest release. Releases are cut automatically by
`.github/workflows/release.yml` whenever a `v*.*.*` tag is pushed — see **Cutting a release**
below.

## Cutting a release

1. Bump `version` in `system.json` (must match the tag, without the `v` prefix).
2. Commit that change.
3. Tag and push: `git tag v0.X.0 && git push origin v0.X.0`.

The workflow verifies the tag matches `system.json`, zips everything Foundry needs (with
`system.json` at the zip root, as Foundry's installer requires), and publishes a GitHub Release
with that zip attached at the stable `releases/latest/download/essence-system.zip` URL the
manifest's `download` field points at.

## Refreshing compendium content from the database

The card/equipment compendiums are generated from the live "Essence" Neon Postgres project,
not hand-maintained. To pull the latest content and rebuild the packs:

```bash
npm install
node scripts/fetch-from-neon.mjs   # pulls combat_cards / condition_cards / equipment_cards
node scripts/build-packs.mjs       # regenerates packs/_source and packs/*
```

`fetch-from-neon.mjs` reads `DATABASE_URL` from the environment, or falls back to the web
app's local `_repo/.env.api` file. Note: that `.env.api` connection currently points at a
Neon branch where `equipment_cards` is empty even though the main branch has 23 rows — if
`fetch-from-neon.mjs` reports 0 equipment rows, don't run `build-packs.mjs` over it; regenerate
that one table from the correct branch/connection string first.

Foundry holds an exclusive lock on the LevelDB pack files while a world using this system is
running, which blocks both `build-packs.mjs` and `git add`. Don't kill the Foundry process to
free them — from the world, use **Return to Setup** (or `await game.shutDown()` in the console),
which releases the lock without dropping the session or requiring you to log back in.

## Development

- `system.json` — manifest (id, compatibility, document types, compendium packs, grid/token
  defaults)
- `module/essence.mjs` — entry point; registers data models, sheets, hooks, and the
  Create Content scene-control button
- `module/data/` — Actor/Item `DataModel` classes (the schema)
- `module/documents/` — `Actor`/`Combat` subclasses (lifecycle hooks: linked-token default,
  combat turn/round Action Dice management)
- `module/sheets/` — ApplicationV2 sheet classes for the actor and each Item type
- `module/apps/` — the Character Creation and Create Content wizards
- `module/dice/` — the dice engine, ported exactly from the web app's `engine.ts`
- `templates/` — Handlebars templates for sheets, chat cards, and the wizards
- `scripts/` — content pipeline (Neon → compendium packs) — dev tooling only, not shipped in
  releases
- `.github/workflows/release.yml` — the release pipeline described above
