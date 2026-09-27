# Live-test runbook for a local Claude Code session

Read this first, then `design/live-test-pending.md` (the 95 checks). This file says how to run
them from Shane's machine; that file says what to look for. Together they are the whole job.

## Why this exists

Releases 0.8.1 through 0.13.0 were built in a cloud session with no Foundry. Every one passed
unit tests (`npm test`), template balance and lang-key checks, but none has rendered a sheet in a
real world. Expect bugs. The most likely kinds, from the build history:

- A template that references a helper, field or context key that does not exist (renders blank
  or throws on open).
- A DialogV2 prompt that never resolves or returns the wrong shape (a button that does nothing).
- A stored actor that fails to load after a schema change (it vanishes from the sidebar; check
  the console for `invalidDocumentIds`).
- A pack that opens empty or with the old text because the LevelDB was not recompiled.

## Setup

1. Branch. In the Foundry system folder (`Data/systems/essence-system`, normally
   `C:\Users\shane\AppData\Local\FoundryVTT\Data\systems\essence-system`):
   `git fetch origin && git checkout claude/elastic-lamarr-32f578-lza4a9 && git pull`.
   Confirm `system.json` reads `0.13.0`.
2. Wiki. Push the prepared wiki commit (commands in `design/live-test-pending.md`, Before
   starting). Delete `design/wiki/` afterwards and commit that.
3. Reload. Foundry must be closed and relaunched, or `game.shutDown()` run from the console and
   the world relaunched, so the packs reopen. A hot reload is not enough (pack locks).
4. Use a throwaway test world, not the campaign world. Import from the compendiums as you go.
5. Console open (F12) the whole time. Any error whose stack names `systems/essence-system`
   fails the check it happened in and is a bug to fix.

## How to run the checks

Two ways, pick whichever the machine allows:

- **Driven.** Foundry is at `http://localhost:30000`. If a GM user with no password exists on
  the test world, Playwright against a local Chromium can log in, open sheets, click buttons and
  read the console. Record every console error verbatim.
- **Guided.** Otherwise walk Shane through the checks one at a time: say what to click, what
  should appear, and ask what actually appeared. Never mark a check passed on assumption.

Work in order. The checks build on each other within a release (a combat set up in check 59 is
reused through 64). Skip nothing; a check you cannot run is recorded as blocked with the reason.

## What each block is testing for

| Checks | Release | What must hold |
| --- | --- | --- |
| 1 to 11 | 0.8.1 | Sheets resize, headers stay fixed, scroll regions scroll, the design tokens render. |
| 12 to 24 | 0.9.0 | Attributes and creation follow Part III: pools of 6, AP as Level, the Non-Combat tab (Difficulty rolls, Key Aspects, Languages, Connections), Team Tier access flags on equipment. |
| 25 to 44 | 0.10.0 | Initiative commits 1+ dice, Turn order and Pool formation, Prepare Action, Stabilize, death is final, Dazed burn, Conditions text, burn-only cards. |
| 45 to 53 | 0.10.1 | Apply Damage by component (Resistance, Resilience, Temporary, Core), nonlethal, Grant Recovery wound picker, Concentration prompt. |
| 54 to 69 | 0.11.0 | Mooks and Normals: compact sheet, printed Defenses, 2d10 Initiative with no prompt, Actions per Turn and Reactions per Round counters, printed-dice abilities, utility Basic, Task Dice, Recovery refreshing uses; Elites keep Pools; wizard never picks Basic attacks, Defend or Prepare Action. |
| 70 to 87 | 0.12.0 | Specialty migration of old data; Threads with duplicates; Authority per card and Orator; Rites, Invoker and Echo; Locks and Marksman; Contingencies and Strategist; Gestalt upkeep at End Turn; Combo tick; Psionics Strain for Surge, Vent, forced Strain; Calling entry cost, shared track, Return, collapse, Broken, Recovery. |
| 88 to 95 | 0.13.0 | Compendium text (Species, Distinctions, Heritages, Wound Cards, Perform Task), Guard and Handling labels and folders, the rebuilt Player & GM Guide, the wiki page. |

## When a check fails

1. Reproduce it once more and capture the console error and the exact steps.
2. Find the cause in `module/` or `templates/`. The build-history entry for that release names
   the files it touched.
3. Fix it on this branch. Keep fixes minimal. Run `npm test` and `node --check` on every changed
   `.mjs` before trying again. If a pack's `_source` changed, recompile with
   `node scripts/compile-packs.mjs --only=<pack>` (Neon is not needed for that).
4. Reload Foundry the same way as in Setup and rerun the failed check and any that depend on it.
5. Commit each fix or small group of fixes as `0.13.x` (bump `system.json`, add a CHANGELOG
   line) with a message that names the check number. Push to the same branch.

Do not paper over a failure by changing the check. If a check disagrees with the rulebook, say
so in the results and leave the check as written for Shane to decide.

## Recording results

Add a dated heading to `build-history` (`### 2026-MM-DD -- Live test of 0.8.1 through 0.13.x`)
with: which checks passed, which failed and how each was fixed (commit hashes), which were
blocked and why, and any console warnings that were not errors. When every check has passed,
delete `design/live-test-pending.md` and this file in the same commit, and say so.

## Out of scope for this run

- The sheet redesign concept (waits on Ryan).
- The 28 Doc gap questions (a separate document for Ryan).
- Converting flat equipment items to modular (needs a decision first).
- Anything on the plan's Not building list.
