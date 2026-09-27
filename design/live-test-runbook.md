# Live-test runbook for a local Claude Code session

Read this first, then `design/live-test-pending.md` (the checks). This file says how to run them
from Shane's machine; that file says what to look for. Together they are the whole job.

## Where things stand

Checks 1 to 95 were run on 2026-09-27 against 0.13.5 (build-history, "Live test of 0.8.1 through
0.13.5"). Everything passed after the 0.13.1 to 0.13.5 fixes, except 89 (Species sub-choices did not feed
Resistances; 0.17.1 built that, so rerun 89 in this run), 17's second half and 53 (blocked,
recorded, no rerun).

This run covers releases 0.14.0 through 0.17.0, the sheet redesign: checks 96 to 120, plus 89. The
redesign releases were
built in a cloud session with no Foundry. Each passed `npm test` (175 tests), `node --check`,
template block balance and lang-key checks, but no sheet has rendered in a real world. Expect
layout bugs and a few wiring bugs.

## What the redesign changed

Read `CHANGELOG.md` entries 0.14.0 to 0.17.0 and the matching build-history entries (dated
2026-09-27) before starting. In short:

- **0.14.0.** Foundry 13 minimum. Every color in `styles/essence.css` reads a `--essence-*` token;
  the palette is retuned (warm near-black ground, muted gold accent, parchment ink). The sheet is
  self-themed dark in both Foundry themes. Character and Team sheets use ApplicationV2's own tab
  manager (`static TABS`, `data-action="tab"`). New world setting "Character sheet artwork" paints
  an image under a veil with translucent panels. The Character root is a grid with a sidebar slot.
- **0.15.0.** The vitals sidebar on the Character sheet: dice pools, Resources, Defenses, Wounds
  with the Death Track, Conditions, Reach / Influence / Standing readout. Every block moved whole
  from the Core and Combat tabs; every `data-action` and `name=` binding is unchanged. Core tab is
  Attributes, Resistances, General Features & Benefits, Languages. Sheet opens at 1080px wide.
- **0.16.0.** Combat tab card grid with type rails, Style chip, inline Rank / Min / Cost, Play
  button. Card search is Foundry's `SearchFilter`. L L S S C squares for Core Wounds and Core
  Influence.
- **0.16.1.** Enemy sheets (NPC, Monster) and the Manifestation and Team sheets stay basic: no
  art, opaque panels, plain card rows. Art, veil, translucency and the grid are Character only.
- **0.17.0.** Add Condition dialog from the sidebar's Conditions panel
  (`module/apps/condition-picker.mjs`).

The most likely bugs, in order:

- A CSS layout problem: overlap, clipping, a sidebar that does not scroll, a grid that does not
  collapse at narrow widths, text unreadable over a panel. Fix in `styles/essence.css`.
- The native tab strip not switching or not styled (`context.tabs`, `_prepareTabs`, the `tab`
  action). Check the console for anything naming `tabGroups` or `changeTab`.
- `SearchFilter` or `DialogV2` behaving differently from what the code assumes (a callback
  argument, `bind()` timing). `module/sheets/actor-sheet.mjs` `#cardSearch` and
  `module/apps/condition-picker.mjs`.
- The artwork setting: `FilePathField` in the settings form, the CSS variable on the root, the
  `::before` veil sitting above or below the wrong layer.

## Setup

1. Branch. In the Foundry system folder (`Data/systems/essence-system`, normally
   `C:\Users\shane\AppData\Local\FoundryVTT\Data\systems\essence-system`, or the mirror the last
   run used with robocopy): `git fetch origin && git checkout claude/elastic-lamarr-32f578-lza4a9
   && git pull`. Confirm `system.json` reads `0.17.1` or later and `compatibility.minimum` is
   `13`. (0.17.1 is Ryan's second batch of rulings, built and verified locally; it is not part of
   this run except check 89.)
2. Back the folder up first, as the last run did.
3. Reload. Foundry must be closed and relaunched, or `game.shutDown()` run from the console and
   the world relaunched, so the packs reopen. A hot reload is not enough (pack locks). If a
   force-killed Electron leaves `Config/options.json.lock`, remove it.
4. Use the `essence-test` world, not the campaign world.
5. Console open (F12) the whole time. Any error whose stack names `systems/essence-system` fails
   the check it happened in and is a bug to fix.
6. Run with one client logged in as the GM. Two clients on the same GM user double the Combat
   turn events (recorded last run as an environment artifact, not a bug).

## How to run the checks

Two ways, pick whichever the machine allows:

- **Driven.** Foundry is at `http://localhost:30000`. Page scripts against `game`, the real sheet
  buttons and DialogV2 prompts worked last run through the desktop app's built-in browser; no
  Playwright install was needed. Record every console error verbatim.
- **Guided.** Otherwise walk Shane through the checks one at a time: say what to click, what
  should appear, and ask what actually appeared. Never mark a check passed on assumption.

Work in order, 96 to 120, then 89. Skip nothing; a check you cannot run is recorded as blocked with the
reason. Layout checks need eyes: for each one take a screenshot at 1080px wide and one at about
800px wide and look at it, or ask Shane to.

## What each block is testing for

| Checks | Release | What must hold |
| --- | --- | --- |
| 96 to 103 | 0.14.0 | Minimum 13 accepted; the retuned palette reads in both Foundry themes; native tabs switch, hold across re-renders, keyboard-navigable, independent per sheet, work while locked; Team sheet tabs too; the artwork setting shows a file picker and the art shows through the whole Character sheet; the frame collapses under 860px; every other sheet and the chat card still styled. |
| 104 to 111 | 0.15.0 | Sidebar contents and order; every stepper, input, pip and button in the sidebar still does what it did on the tab; the sidebar scrolls on its own and both scroll positions survive an edit; Core tab order; Combat header without pools or Conditions; Non-Combat without Languages and Features; a dragged Condition lands in the sidebar; the stacked layout at 800px. |
| 112 to 116 | 0.16.0 / 0.16.1 | Card grid, rails, Style chip colors, Rank / Min / Cost, Play; search filters and survives an edit; sort still works; NPC and Monster sheets stay plain with no rails and no art; squares on Core Wounds and Core Influence. |
| 117 to 120 | 0.17.0 | Add Condition dialog: groups, no Wound / Consequence / Cover rows, search hides empty groups, click adds and lights the Token HUD icon, "On sheet" marks and disables, several picks per visit, Custom Condition opens an editor. |

## When a check fails

1. Reproduce it once more and capture the console error and the exact steps.
2. Find the cause in `module/`, `templates/` or `styles/essence.css`. The build-history entry for
   that release names the files it touched.
3. Fix it on this branch. Keep fixes minimal. Run `npm test` and `node --check` on every changed
   `.mjs` before trying again. For CSS, keep every color as a `var(--essence-*)` token; do not
   add hex literals. Do not touch the enemy sheets' look (0.16.1).
4. Reload Foundry the same way as in Setup and rerun the failed check and any that depend on it.
5. Commit each fix or small group of fixes as `0.17.x` (bump `system.json`, add a CHANGELOG
   entry) with a message that names the check number. Push to the same branch. Commit messages
   end with the two footer lines the earlier commits on this branch carry; no model identifiers
   anywhere in the repo.

Do not paper over a failure by changing the check. If a check disagrees with the design, say so
in the results and leave the check as written for Shane to decide.

## Recording results

Add a dated heading to `build-history` (`### 2026-MM-DD -- Live test of 0.14.0 through 0.17.x`)
with: which checks passed, which failed and how each was fixed (commit hashes), which were blocked
and why, screenshots' observations for the layout checks, and any console warnings that were not
errors. When every check has passed, including 89, delete `design/live-test-pending.md` and this file in
the same commit and say so. Otherwise leave both and note what passed under "Where this stands" at
the top of that file.

## Out of scope for this run

- The chat card rebuild on Foundry's `.dice-roll` markup and the card item view (plan step 6):
  waits for this run to pass and for Ryan's answer on which apply buttons the card offers.
- Cleanup (plan step 8): after this run.
- Equipment row menu and the Prepared column, Temporary Influence as a stepper: decisions
  pending (plan step 5 notes).
- The Doc gap questions (Ryan's spreadsheet); the rulings already built (0.13.6, 0.17.1) were
  verified locally when they shipped.
