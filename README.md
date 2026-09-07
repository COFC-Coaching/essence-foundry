# essence-foundry

A Foundry VTT game system for **The Essence System** — a d10 dice-pool tabletop RPG with
tactical card-driven combat. Ports the ruleset and data model from the [Essence System web
app](https://essencesystem.com) 1:1, so rolls, derived stats, and combat-dice lifecycle behave
identically in Foundry.

## Status: v0.1.0 — early scaffold

Working:
- Character actor sheet (attributes, skills, derived Stamina/Focus/Mana/Fortitude/Composure/Harmony, wound track, Action/Reaction Dice, combat lifecycle buttons)
- Item types: Action Card, Reaction Card, Condition, Equipment, with sheets mirroring the web app's card builder fields
- Dice engine (`module/dice/essence-roll.mjs`) porting `resolveCombatRoll` and pool-successes exactly from the web app's `engine.ts`
- Compendium packs generated directly from the live Neon database: 194 Action Cards, 67 Reaction Cards, 21 Conditions, 23 Equipment

Not yet done:
- Species/Heritage/Distinction compendiums
- Active Effects for conditions (currently informational only)
- Surge-spending buttons on chat cards
- Automated GitHub release pipeline

## Installing in Foundry

This folder lives directly inside your Foundry `Data/systems/` directory, so it's already
installed locally. To install on another instance (e.g. Forge), use the manifest URL:

```
https://raw.githubusercontent.com/COFC-Coaching/essence-foundry/main/system.json
```

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

## Development

- `system.json` — manifest (id, compatibility, document types, compendium packs)
- `module/essence.mjs` — entry point; registers data models and sheets
- `module/data/` — Actor/Item `DataModel` classes (the schema)
- `module/sheets/` — ApplicationV2 sheet classes
- `templates/` — Handlebars templates for sheets and chat cards
- `scripts/` — content pipeline (Neon → compendium packs)
