# Essence System — Build History

This is the narrative build history of the `essence-foundry` Foundry VTT system, from the initial
scaffold through the current build. It exists alongside [CHANGELOG.md](CHANGELOG.md) but serves a
different purpose:

- **CHANGELOG.md** is the per-version reference — what shipped in each release, for anyone
  installing updates.
- **This document** is the *why* — the architectural decisions, recurring bug patterns, near-misses,
  and open technical debt that don't belong in a changelog but matter for anyone (human or AI)
  picking the project back up. It's meant to be read once for context, then referenced again
  whenever a new session needs to know "how did we get here" or "has this kind of bug happened
  before."

Update this document at the end of any work session that changes architecture, fixes a
non-obvious bug, or makes a judgment call future sessions should know about — not for routine
version bumps (those belong in CHANGELOG.md only).

---

## Project overview

`essence-foundry` is a Foundry VTT (v14, Build 367) game system for **The Essence System**, a d10
dice-pool tabletop RPG with tactical card-driven combat. It ports the ruleset and data model from
the [Essence System web app](https://essencesystem.com) 1:1, so rolls, derived stats, and the
combat-dice lifecycle behave identically in Foundry.

**Repo:** `COFC-Coaching/essence-foundry` (GitHub)
**Local dev copy:** `C:\Users\shane\AppData\Local\FoundryVTT\Data\systems\essence-system`
**Architecture:** ApplicationV2 / HandlebarsApplicationMixin / ActorSheetV2 (Foundry's current
sheet framework, not the legacy FormApplication API).
**Content pipeline:** `scripts/build-packs.mjs` pulls Action Cards, Reaction Cards, Conditions,
and (partially) Equipment from a Neon Postgres database that also backs the web app, so the
Foundry compendiums and the web app draw from the same source of truth. Species, Heritages, and
Distinctions are hand-authored from the canonical rules. A hand-authored JSON file
(`scripts/extra-equipment-data.json`) fills in Equipment the database doesn't have yet.
**Release pipeline:** `.github/workflows/release.yml` — push a `v*.*.*` tag matching
`system.json`'s version, and it zips and publishes a GitHub Release automatically.

---

## Timeline

### Phase 0 — Scaffold (2026-09-06, v0.1.0)

Initial commit through `81518f9`/`c8f161a`: the character actor sheet, the four core Item types
(Action Card, Reaction Card, Condition, Equipment), the dice engine ported from the web app's
`engine.ts`, and the first compendium packs. Early fixes in this window: ApplicationV2's
single-root-element requirement, a compendium `_key` bug, missing actor/item context, and card
rolls using the wrong Defense.

### Phase 1 — Core mechanics build-out (2026-09-06 → 09-07, pre-0.5.0)

The bulk of the system's actual game logic landed here, largely in one continuous push:

- **Species / Heritage / Distinction** promoted from flavor text to real Item types with
  mechanical effect, feeding a "General Features & Benefits" table on the sheet rather than
  duplicating trait text in multiple places.
- **Expertises** went through three redesigns in quick succession (`3f9c55a` → `18a76ac` →
  `0f82865`) before landing on the final shape: Skill → Expertise → Sub-Type as a nested,
  per-Combat-Skill expandable list. This churn is worth knowing about if you ever wonder why the
  Expertise data model looks more nested than it "needs" to — two earlier flatter shapes were
  tried and rejected.
- **Combat lifecycle moved onto Foundry's native Combat Tracker** (`1042f9d`) instead of bespoke
  Start/End Combat buttons — a deliberate "use Foundry's own thing" call that shows up repeatedly
  through the project (see [Recurring bug patterns](#recurring-bug-patterns-and-lessons-learned)
  below).
- **Dice-commit flow**: initiative, skill checks, and card rolls all commit N dice out of a shared
  pool rather than rolling a fixed dice count — this is the rules' actual resolution mechanic, not
  a simplification, and it's the reason the resource-deduction work in 0.6.22 had to combine two
  updates (dice-pool spend + resource cost) into one atomic `actor.update()` call.
- **Damage/Wounds workflow** (Phase 2 per commit messages): Resilience/accumulated-Damage
  tracking, Temporary and Core Wounds in severity order, generated Wound Condition labels, Wound
  State, and the Death Track, plus Apply Damage and reverse-order Recovery.
- **Combat Style Specialty trackers** (Phase 3): one resource-tracking mechanic per Specialty
  (Combo, Lock, Adaptation, Contingency, Threads, Strain, Authority, Rites, Full
  Manifestation/Broken).
- **10-step Character Creation Wizard** and a **Create Content wizard** (scene-control button,
  gated by Foundry's "Create Items" permission) for authoring new Cards/Equipment/Conditions
  straight into the shared compendium.

### v0.5.0 — First automated release (2026-09-07)

The first release cut through the GitHub Actions pipeline, consolidating everything above into a
single versioned baseline. See the CHANGELOG's 0.5.0 entry for the full feature inventory — it's
effectively phases 0–1's manifest.

### Phase 2 — Stabilization (v0.5.1 – v0.5.12)

A run of live-testing-driven fixes, each found by actually playing the system rather than by
inspection:

- **v0.5.1**: NPC/Adversary creation was completely broken — a blank-default Role field failed
  Foundry's own schema validation, so `Actor.create` silently failed for every NPC. This is the
  kind of bug that only surfaces when someone actually clicks "Create NPC."
- **v0.5.2**: Foundry's native Combat Tracker (the per-combatant dice icon, Roll All, Roll NPCs)
  was bypassing the real Essence dice-commit flow and doing a flat formula roll instead — only the
  sheet's own Roll Initiative button used the real mechanic. Centralized in
  `EssenceCombat#rollInitiative` so every entry point behaves identically.
- **v0.5.3**: Conditions wired into the Token HUD's status-icon toggles.
- **v0.5.5**: The starting Reaction Pool at Round 1 was hard-coded to 0 instead of `5 + Tier`,
  silently contradicting the rules document — caught by a 10-combatant live encounter test with
  mixed character/NPC actors.
- **v0.5.7**: A system-wide bug where *every* rich-text Edit button did nothing. Root cause:
  Foundry core's `{{editor button=true}}` helper only becomes interactive through
  `FormApplication#_activateEditor`, a legacy V1-sheet API that ApplicationV2/DocumentSheetV2
  sheets never had. Fixed by writing a custom `essenceEditor` Handlebars helper that emits the
  real `<prose-mirror>` custom element directly — a preview of the "check Foundry-native first"
  lesson that recurs throughout this project.
- **v0.5.11 / v0.5.12**: Card sheets were burying their own content below oversized 150px-tall
  `<prose-mirror>` boxes meant for full-page Biography fields, not short Body/Surge lines. Also
  found and fixed 10 Combat Cards with genuinely wrong source data (stray duplicate "Effect"
  entries, unrelated Ballistics text on Hide/Disengage/Dash) — corrected at the Neon database
  level, the first instance of a pattern that recurs in 0.6.20.

### Phase 3 — GM tooling (v0.6.0, v0.6.8)

- **v0.6.0 — Bulk Import**: CSV template download/upload for Combat Cards, Equipment, and
  Conditions, matched by name (existing name updates in place, new name creates). The first
  GM-facing content-authoring tool beyond the one-at-a-time Create Content wizard.
- **v0.6.8 — Monster Creator**: a Character-Wizard-style step-by-step NPC builder, trimmed to what
  the NPC sheet exposes. Notably, this is where the Role tag (Minion/Standard/Elite/Nemesis) went
  from a purely cosmetic label to something with real mechanical weight: a homebrew, tunable
  budget table (`module/data/monster-budgets.mjs`) was authored from scratch since nothing
  canonical existed to match, covering Attribute/Skill point pools, Resilience-by-Tier scaling,
  Temporary Wounds, and Card/Equipment counts per Role. An "Auto-Generate Stat Block" button rolls
  a full NPC from that budget in one click, weighted toward a chosen Domain Emphasis, with
  per-step reroll buttons and full hand-editability afterward. This is flagged as **homebrew, not
  canon** — worth remembering if the actual rules ever publish real Role budget numbers.

### Phase 4 — Accessibility pass (v0.6.6, v0.6.7)

A dedicated pass after noticing the system had zero keyboard/screen-reader support anywhere:
WCAG contrast fixes on pass/fail status colors, converting the Wound/Death Track/Combo/Influence
pip trackers from unlabeled `<span>`s to real `<button>`s with `aria-pressed`/`aria-label`, real
tab semantics on the sheet's tab bar, a global `:focus-visible` outline (there wasn't one, system-
wide), and converting ~40 icon-only edit/delete/remove/add controls across 6 templates from
`<a>` tags with no `href` (invisible to both keyboard and screen readers) to real labeled
`<button>`s.

### Phase 5 — Card & content polish (v0.6.9 – v0.6.22, the most recent work)

This is the phase covered in the most depth by this session's own memory, since most of it happened
within recent conversations:

- **v0.6.9 – v0.6.12**: Wizard/Monster Creator UX fixes (a disabled Next-on-Finalize that read as
  broken, replaced with an explicit "Accept" button since every choice already autosaves), NPC
  header overlap fix, an in-sheet Token Image picker (documenting a genuine Foundry-native quirk:
  Portrait and canvas Token Image are separate fields that only auto-sync once, on first Portrait
  set — not a bug, but reads like one), and a Role Budget System page added to the in-world GM
  Guide so the 0.6.8 budget table isn't only readable from source.
- **v0.6.13**: Lowercase data keys (attribute/skill names) were being shown directly as their own
  UI labels in several places. Fixed with a `capitalize()` helper, now the standard pattern for
  any raw enum/key value that needs to be user-facing text (see `module/utils.mjs`).
- **v0.6.14**: 13 hand-authored Equipment items imported from the design team's spreadsheet,
  diffed by name against the existing compendium. **This import had a near-miss**: a stale/empty
  Neon cache file (`scripts/.cache/raw-equipment-cards.json`, holding `[{"rows":[]}]`) meant a
  full pipeline rebuild would have silently wiped the 23 pre-existing DB-sourced Equipment items,
  leaving only the 13 new ones. Caught via `git status` before committing, recovered by exporting
  the live 23 documents from the running world console and hand-merging with the new 13 in a
  one-off script. The cache-staleness risk itself is **not yet fixed** — see
  [Known gaps](#known-gaps--technical-debt-as-of-v0622).
- **v0.6.15**: Universal no-Skill cards (Hide, Disengage, Shove, Basic Shot, Dash, Strike, Brace)
  split out of the main Action/Reaction Card lists into their own "Basic Actions"/"Basic
  Reactions" quick-roll row — these don't need the skill-gated browsing the rest of the list uses.
- **v0.6.17 — the edit-lock feature**: an Owner/GM-only lock toggle added to both sheets, with
  every raw input disabled by default *even for the Owner/GM* — a deliberate safety rail against
  accidental mid-session edits, a first for this project (previously only non-owners were ever
  locked out of anything). Action buttons (Roll, Apply Damage, End Turn, Burn Dice, pip toggles)
  are explicitly exempt from this lock by design — this exemption is *why* the 0.6.22 resource
  steppers (also plain buttons) work regardless of lock state without any special-casing.
- **v0.6.18 — the Expertise ArrayField bug**: picking a name from an Expertise's dropdown silently
  wiped that same Expertise's own `skill` field back to blank, making it vanish from its skill's
  list even though the Item still existed. Root cause: Foundry's `submitOnChange` form handling,
  given a dotted path like `system.expertises.0.name`, replaces the *entire* array element instead
  of merging just that one field. Fixed with a full read-modify-write of the whole array in JS
  instead of relying on form auto-submission for array sub-fields. **This exact bug class recurs**
  — see [Recurring bug patterns](#recurring-bug-patterns-and-lessons-learned).
- **v0.6.19**: Repositioned the lock toggle (was overlapping the portrait awkwardly), shrunk an
  oversized name field, and added the "eye" View button next to Edit/Delete on every card row —
  the first UI element in the project built specifically so a *player*, not just a GM, could
  casually inspect a card's full text without risking an accidental edit.
- **v0.6.20 — card data + card view overhaul**: two unrelated fixes landed together. First, 10
  cards' cheapest Surge (always cost-1) was miscategorized as a plain Body line instead of a real
  Surge entry — the same *class* of source-data bug as 0.5.12's stray-Effect cards, but this time
  fixed at the pipeline level (`extractMisplacedSurges()` in `build-packs.mjs`) so a future Neon
  re-sync can't reintroduce it, rather than hand-patching the database rows directly. Second, the
  card read-view was redesigned against the rules' own printed card-anatomy reference (bordered
  card box, Style|Subtype line, Expertises line, a labeled Rank/Commitment/Attribute/Defense grid,
  a real "Surges" section heading) instead of an ad-hoc stack of fields.
- **v0.6.21**: The Commitment line was showing "Cost 3" with no indication of *which* resource
  pool that cost draws from. Fixed by deriving it from the card's `domain` field
  (physical→Stamina, mental→Focus, spiritual→Mana) via a new `domainResource()` helper — the same
  domain→resource mapping already used elsewhere for Attributes/Resources/Defenses grouping, now
  reused for this too. Also added reactive font-sizing on the card title (`fitTitleSize()`) so long
  names shrink instead of overlapping the Edit/View buttons.
- **v0.6.22 — automatic resource deduction + manual steppers**: using a Card with a Cost now
  deducts that amount from the correct resource pool (via `domainResource()`) in the *same*
  `actor.update()` call as the dice-pool spend, so both changes land atomically instead of racing.
  Also added +/- stepper buttons next to Stamina/Focus/Mana so players can nudge their current
  value without unlocking the whole sheet — deliberately just plain `<button>`s so the 0.6.17 lock
  exemption covers them for free. Along the way, found and fixed a **field-name casing bug** on
  the NPC sheet specifically: its resource number input was named
  `system.playState.current{{d.resourceLabel}}` where `resourceLabel` is lowercase (`"stamina"`),
  producing the invalid field `currentstamina` instead of the schema's `currentStamina` — meaning
  the NPC sheet's manual resource edits had been silently discarded ever since the resource system
  was introduced. The Character sheet had the correct pattern (a proper `resourceField` computed
  in `_prepareContext`) that the NPC sheet just never picked up; now both match. Verified live: the
  stepper buttons persist correctly on both sheets under lock, and a Cost-3 card roll correctly
  dropped Focus 6→3 and Action Dice 6→3 in one combined update.

---

## Recurring bug patterns and lessons learned

These aren't one-off bugs — they're shapes of bug that have shown up more than once, worth
checking for whenever touching related code:

1. **Foundry's ArrayField dotted-path update bug.** A `<select>`/`<input>` with
   `name="system.someArray.{{i}}.field"` relying on `submitOnChange` form auto-processing
   replaces the *whole array element* at that index instead of merging just the one field,
   silently wiping every sibling field back to its schema default. Hit in v0.6.18 (Expertises).
   **Fix pattern**: never let array sub-fields submit through the form directly — remove the
   `name` attribute, add a `data-index`, and wire an explicit `change` listener that does a full
   read-modify-write of the entire array in JS.

2. **Bare data keys shown directly as UI labels.** Enum/key values (`"stamina"`, `"notStarted"`,
   attribute/skill keys) leaking into the UI unformatted instead of through a display-label
   mapping. Hit in v0.6.13 (attribute/skill labels) and again as the "Turn: notStarted" text on
   the Combat tab. **Fix pattern**: `capitalize()` / dedicated label-lookup helpers in
   `module/utils.mjs`, registered as Handlebars helpers in `essence.mjs`'s init hook — this is now
   the established pattern for any raw value that needs to read as prose.

3. **Field-name casing/typo mismatches between template and schema.** The NPC sheet's resource
   input used `current{{d.resourceLabel}}` (lowercase) instead of the schema's `currentStamina`/
   `currentFocus`/`currentMana` (capitalized) — a silent no-op bug, since Foundry doesn't error on
   an update to a field that isn't in the schema, it just discards it. Found in v0.6.22 while
   building the sibling stepper feature and comparing the two sheets side by side. **Worth an
   audit**: any other actor-sheet/npc-sheet field-name pair that was hand-copied rather than
   shared could carry the same class of typo undetected.

4. **Source-data quality issues in the Neon-backed compendiums.** Found and fixed twice
   independently: 10 cards with stray duplicate Effect entries and leftover unrelated Surge/Rider
   text (v0.5.12), and 10 different cards with a miscategorized cost-1 Surge (v0.6.20). Both times
   the fix was made at the pipeline/source level, not just patched in the shipped compendium, so a
   future re-sync from Neon won't reintroduce the bug — but this means **any future full
   `build-packs.mjs` run should be treated as a fresh opportunity to hit a not-yet-discovered
   version of this same bug class**, since the underlying spreadsheet/database hasn't been
   independently audited end-to-end, only patched where symptoms were noticed.

5. **Foundry-native-first, bespoke-second.** Nearly every "add feature X" task this project has
   done has a version where the first instinct was bespoke logic and the shipped version instead
   hooks into something Foundry already provides: Combat Tracker instead of custom combat buttons,
   Token HUD instead of a custom Conditions UI, `<prose-mirror>` instead of a custom rich-text
   widget, Active Effects instead of custom stat-modification code where the rule is a flat
   unconditional change. This is now an explicit standing preference (see the `feedback_check_foundry_native_first`
   memory) — when in doubt, check whether Foundry's own lifecycle/hooks/document types already
   solve the problem before writing new code.

---

## Architectural conventions established

- **`module/utils.mjs`** is the home for small, pure, reusable display/formatting helpers
  (`capitalize`, `stripHtml`, `cardSummary`, `domainResource`, `fitTitleSize`), each also
  registered as a Handlebars helper in `essence.mjs`'s `Hooks.once("init", ...)` block. New
  cross-cutting display logic should follow this pattern rather than being duplicated inline in
  templates or sheet classes.
- **The `DOMAINS`/domain→resource mapping** (physical↔Stamina, mental↔Focus, spiritual↔Mana) is
  the one piece of domain logic reused across Attributes/Resources/Defenses grouping, the
  Commitment-pool display (v0.6.21), and the resource-deduction feature (v0.6.22). Any new
  domain-aware feature should reuse `domainResource()` rather than re-deriving the mapping.
- **`system.playState` vs `system.resources`**: `playState` holds live, mutable play-state
  (`currentStamina`, `currentFocus`, `currentMana`, `actionDice`, `reactionDice`, combat-turn
  state, etc.) as raw DataModel fields. `system.resources.{stamina,focus,mana}` is *derived* data
  computed in `prepareDerivedData()`, shaped `{value, max}`, where `value` falls back to `max`
  until the matching `playState.currentX` has been explicitly set at least once. Always write to
  `playState`, never try to write directly to `system.resources`.
- **The edit-lock exemption boundary**: `#applyEditable()` (in both `EssenceActorSheet` and
  `EssenceNpcSheet`) disables `input, select, textarea, prose-mirror` elements when locked, but
  never touches `<button data-action=...>` elements. This is a load-bearing design decision, not
  an oversight — every "should this work while locked?" feature (Roll, Apply Damage, pip toggles,
  the 0.6.22 resource steppers) is answered by "is it a plain button?"
- **`EssenceCardSheet#renderAsView(options)`**: a public method for forcing a card's sheet open in
  its read view regardless of what edit/view state a previous session left that sheet instance in
  (the class's own `#viewMode` otherwise persists per sheet instance for the rest of the session).
  Used by the actor sheet's "eye" View button.
- **LevelDB pack locking**: the running Foundry server holds a LOCK file on each `packs/<name>/`
  directory. Any script-driven compendium pack rebuild requires `game.shutDown()` first (the
  established, documented pattern), then relaunching Foundry. **Caution**: this shuts down
  whatever world/session was active at the time — don't call it casually mid-session without
  warning whoever's connected, since it was the direct cause of user-visible disruption during the
  v0.6.22 work session.

---

## Known gaps / technical debt (as of v0.6.22)

These are open items, not yet built, flagged during the v0.6.22 session's requested review:

1. **No data migration system.** `grep -rln "migrat" module/` returns nothing. When a card's
   compendium source data is fixed (as in v0.6.20's Surge bug), any Item copy a player already
   dragged onto their own actor keeps the old, broken data forever — there's no mechanism to
   re-sync owned Items against a corrected source. Foundry's own system-development guidance
   explicitly calls out data migration as a known hard problem worth planning for early. This is a
   real, hit-in-practice gap, not a hypothetical: a player's already-owned copy of "Collapsing
   Weight" did not get the Surge fix, and the user's explicit direction was that fixing existing
   owned copies would be handled manually going forward, not that a migration system shouldn't
   eventually exist — see the review discussion in this session.
2. **`actor-sheet.mjs` / `npc-sheet.mjs` duplication.** Because JS private static methods aren't
   inherited, large chunks of interactive logic (the dice-commit dialog, card sort/filter wiring,
   resource-adjust, the v0.6.22 cost-deduction logic) are hand-copied between the two sheet
   classes rather than shared. This is the direct root cause of the v0.6.22 NPC field-casing bug —
   duplication that a shared-function extraction (e.g. a `module/sheets/shared.mjs`) would have
   prevented by construction.
3. **Neon cache staleness risk.** The v0.6.14 near-miss (an empty cached equipment-cards fetch
   would have silently wiped the compendium on a full rebuild) was caught and recovered by hand,
   but the underlying risk — a stale/empty `scripts/.cache/raw-*.json` file silently producing a
   destructive rebuild — has not been fixed at the tooling level. A future full `build-packs.mjs`
   run should sanity-check cache row counts before treating a rebuild as authoritative.
4. **No compendium folders.** The Action/Reaction Card compendiums are flat lists of 194 and 67
   items respectively with no grouping, making them harder to browse than necessary when a GM is
   hand-building an NPC. Foundry supports Compendium Folders natively.
5. **No Adventure document.** No bundled "drop this in and get a ready-to-play example" (a sample
   scene plus a couple of pre-built NPCs and a journal entry), which Foundry supports as a native
   document type and which would pair naturally with the existing Player & GM Guide journal.
6. **No automated tests/CI beyond the release workflow itself**, and no branding/icon for the
   system (shows as a generic puzzle-piece in Foundry's system list).
7. **Hardcoded strings outside `lang/en.json`** in places, which blocks eventual localization.

---

## For future sessions

If you're picking this project back up: read this document once for the architectural "why," then
check [CHANGELOG.md](CHANGELOG.md) for exactly what's in the current version, then `git log` for
anything since this document was last updated. When you finish a work session that changes
architecture, fixes a non-obvious bug, or makes a judgment call worth remembering, add a new
dated entry under a "Recent sessions" heading (create one if it doesn't exist yet) rather than
editing the phase history above — keep the phase history as the stable historical record and let
new work accumulate in an appendable log instead.
