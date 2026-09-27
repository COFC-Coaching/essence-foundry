# CSS migration plan: current sheet to the new concept

Companion to `sheet-redesign-groundwork.md` (what each concept region becomes) and the concept
canvas (https://claude.ai/artifact/X1kPYCFHPp64nymJE4giST). This file is the order of work for the
stylesheet and the sheet frame, and the rule that governs every step:

**Use what Foundry already ships before writing anything of our own.** Foundry v13 and v14 carry
a theme system, tab manager, tooltip manager, search filter, drag-and-drop, context menus, form
layout classes, custom form elements, dice-roll chat markup and header controls. Every one of those
replaces something this system currently hand-rolls. The redesign adopts them; it does not build
parallel versions.

## Status (2026-09-27)

Steps 0 to 3 shipped in 0.14.0, step 4 and the Core / Non-Combat part of step 5 in 0.15.0, the
Combat card grid, `SearchFilter` and severity squares in 0.16.0 (see the CHANGELOG entries). One decision made while doing step 1:
the sheet is a self-themed dark surface, not a consumer of Foundry's `--color-*` theme variables.
Foundry's light theme puts dark text on parchment; over cover art and translucent panels that is
unreadable, and the concept was drawn dark. So the tokens hold our own palette in both themes and
read only Foundry's fonts (`--font-h1`, `--font-body`). Shane (2026-09-27): the enemy sheets (NPC,
Monster) stay basic: no art, no veil, opaque panels, plain card rows. Everything in this plan about
art, translucency and the card grid is Character sheet only (0.16.1). Step 7 shipped in 0.17.0. Next: steps 6
and 8, and the step 5 items that wait on a decision (listed under step 5).

## Where the stylesheet stood before 0.14.0

- `styles/essence.css`, 810 lines. 161 hard-coded hex colors (51 distinct) across 133 rules. The
  amber `#f9a825` alone appears 45 times.
- Design tokens exist on `.application.essence` (0.8.1) but no rule reads them yet.
- No Foundry CSS variable (`--color-*`, `--font-*`) is used anywhere, so the sheet ignores the
  user's light or dark theme.
- Tabs are custom: a private `#activeTab` field, a `changeTab` action, and our own
  `.sheet-tabs` / `section.tab.active` rules. Foundry has had a native tab manager since v13.
- Tooltips are `title=` attributes. Foundry has `data-tooltip` and a tooltip manager.
- The card search box is wired by hand in `#wireCardControls`. Foundry has `SearchFilter`.
- The chat roll card uses its own markup and colors rather than Foundry's `.dice-roll` structure.
- Scroll regions and window resizing already use Foundry's own mechanisms
  (`PARTS.scrollable`, `window.resizable`). Keep them.

## Foundry pieces to adopt, and what each replaces

| Foundry provides | We currently have | Where |
| --- | --- | --- |
| Theme variables on `.application` (`--color-text-primary`, `--color-text-secondary`, `--color-border-*`, `--color-cool-*`, `--color-warm-*`, `--font-body`, `--font-h1`) and the `.theme-dark` / `.theme-light` classes | 161 hex literals; no light theme | `styles/essence.css` |
| `static TABS = { primary: { tabs: [...], initial: "core" } }`, `tabGroups`, the built-in `tab` action, `tab.cssClass` in context, `.tabs` and `.tab` classes | `#activeTab`, `#onChangeTab`, `#applyActiveTab`, custom tab CSS | `actor-sheet.mjs`, `npc-sheet.mjs`, `character-sheet.hbs`, `npc-sheet.hbs` |
| `data-tooltip` plus `game.tooltip` (rich HTML, direction, delay) | `title=` on labels and buttons | every template |
| `foundry.applications.ux.SearchFilter` | `#wireCardControls` input handler | `actor-sheet.mjs`, `npc-sheet.mjs` |
| `foundry.applications.ux.ContextMenu` | A row of five icon buttons per equipment row | Equipment tab |
| `foundry.applications.ux.DragDrop` through `ActorSheetV2._onDropItem` | Already used; keep | Equipment slots |
| `.standard-form`, `.form-group`, `.form-fields`, `<fieldset><legend>`, `hint` | Ad hoc `header-fields` / `array-row` flex rules | Item sheets, wizard steps, Bio tab |
| `<prose-mirror>`, `<file-picker>`, `<range-picker>`, `<multi-select>`, `<document-tags>` custom elements | Mostly adopted; Species sub-choice pickers and the Resistances tags are hand-built | Item sheets, Core tab |
| `DialogV2` (`prompt`, `confirm`, `wait`) | Already used everywhere; keep | Card play, Add Condition |
| `_getHeaderControls()` | Already used (Wizard, Full Manifestation, Return); keep | Actor sheets |
| `CONFIG.statusEffects` + `Actor#toggleStatusEffect` | Already used; the Add Condition dialog lists the same source | Conditions row |
| `.dice-roll` / `.dice-result` / `.dice-formula` / `.dice-tooltip` / `.dice-total` chat markup | Custom `.roll-card` markup | `templates/chat/roll-card.hbs` |
| Font Awesome 6 (bundled) | Already used | Icons |
| Bundled fonts (Signika body, Modesto Condensed headings) and `CONFIG.fontDefinitions` for any extra face | Token stacks name Cormorant Garamond and Source Sans 3, which Foundry does not ship | Tokens |

### Not to build

A custom tab manager, tooltip layer, search box, drag-and-drop handler, scroll-position keeper,
theme switch, font loader, dialog framework or chat-card framework. If a step below seems to need
one, the step is wrong.

## Steps

Each step ships on its own, in order. Steps 0 to 3 change nothing Ryan needs to approve and can
go out now. Steps 4 to 8 wait for his review of the concept.

### 0. Prerequisite: Foundry 13 minimum

Done in 0.14.0. `system.json` `compatibility.minimum` is 12. Native tabs, theme variables and the tooltip
manager's current form arrived in v13, and every release since 0.7.10 has only been run against
v14. Raise the minimum to 13. One line, plus a CHANGELOG note. Size: small.

### 1. Tokens over hex

Done in 0.14.0, in two commits as described (mechanical pass at today's values, then the retune),
with the self-themed exception noted under Status. Point the existing tokens at Foundry's theme variables where a match exists, keep hard values only
for what is ours (the three domain colors, the four card-type colors, the gold accent), then
replace every hex literal in `essence.css` with the matching `var(--essence-*)`.

- Set each token's value to today's color first, so the diff renders identically. Retune colors
  in a separate commit so the two changes can be reviewed apart.
- Fonts: drop the Cormorant and Source Sans stacks. `--essence-font-display` becomes
  `var(--font-h1)` and `--essence-font-body` becomes `var(--font-body)`. If Ryan wants a distinct
  face later, it is registered through `CONFIG.fontDefinitions` with files under `styles/fonts/`,
  never a Google Fonts link (worlds run offline).
- The chat card shares the token block (`.essence.roll-card`), so it converts in the same pass.
- Translucency (Shane, 2026-09-27): the concept shows the cover art behind the whole sheet at low
  visibility, with panels about 86% opaque. In tokens that is `--essence-panel` and
  `--essence-panel-raised` as rgba values plus a `--essence-veil` overlay on
  `.essence-sheet-root::before`. The art itself is a world or system setting read by the sheet
  class (same source as the header), never a hard-coded URL. Inputs, selects and the tab strip
  stay opaque enough to read; check both Foundry themes.
- Verification: screenshot the five character tabs, an NPC sheet, an item card and a chat card
  before and after with Playwright against the local Foundry; the images must match pixel for
  pixel except where a token was retuned on purpose.

Size: medium. Mostly mechanical; a scripted replacement from a hex-to-token map, then a read.

### 2. Native tabs

Done in 0.14.0 for the Character and Team sheets (the NPC sheet has a single column and no tab
strip, so nothing to convert). Replace the custom tab code with `static TABS` on the character and
NPC sheets. Foundry renders
the strip from `context.tabs`, toggles `.active`, remembers the group per sheet instance, and
handles keyboard focus. Delete `#activeTab`, `#onChangeTab`, `#applyActiveTab`, the `changeTab`
action and the `.sheet-tabs` / `section.tab` rules; style Foundry's `.tabs` with tokens instead.
The `#applyEditable` lock exempts the tab action by name, so update that selector.

Size: small to medium. Behaviour is identical for the user.

### 3. Frame: sidebar grid and second scroll region

Done in 0.14.0. As built: the header and tab strip span both columns (not sticky inside the scroll
region), the sidebar is the right-hand column at 300px, and `.sheet-side:empty` hides it so the
grid reads as one column until step 4. The root also carries the cover-art background and the
`::before` veil from the translucency note above. `.essence-sheet-root` becomes a two-column grid (`300px 1fr`, rows `auto 1fr`) with the tab strip
`position: sticky` inside the main scroll region and a second `.sheet-side.sheet-scroll` column
listed in `PARTS.body.scrollable`. Container queries at 1100px and 860px collapse the sidebar
above the tabs, matching the concept's compact artboard. The sidebar is empty at this step, so the
sheet looks the same; the grid is only live once step 4 fills it. Size: small.

### 4. Move the vitals into the sidebar

Done in 0.15.0, on Shane's go-ahead (2026-09-27, "we need to now put this in place"). Contents in
the concept's order: pools, Resources, Defenses, Wounds (with the Death Track partial and the
equipment bonus note), Conditions, Reach / Influence / Standing readout. Tooltips are still
`title=`; the `data-tooltip` conversion is folded into step 8. The default window width is 1080.
Pools, Resources, Defenses, Wounds and Death Track, Conditions, and the Reach and Influence readout
move from the Core and Combat tabs into the sidebar. Blocks move as whole partials
(`wounds-header.hbs`, `death-track.hbs`) with their `data-action` names unchanged, so the sheet
class needs no edits. Tooltips convert from `title=` to `data-tooltip` as each block moves.
Depends on Ryan: which vitals belong in the sidebar. Size: medium.

### 5. Per-tab reorders and the card row

Core and Non-Combat done in 0.15.0: Core is Attributes, Resistances and Vulnerabilities, General
Features & Benefits, Languages; Non-Combat lost the last two. Done in 0.16.0: the Combat card grid
with the type rail, the Style chip and inline Rank / Min / Cost; `SearchFilter` for the card
search; L L S S C squares on Core Wounds and Core Influence. Still open, each waiting on a
decision: the Equipment `ContextMenu` and Prepared column (Shane: checkbox or move buttons),
Temporary Influence as a stepper with no maximum (Ryan: the data model caps it today), the
Biography order (Team and Advancement are already first; nothing else to move). Core in Ryan's 02
to 03 order (Attributes, combat traits) followed by Passive Features and
Languages moved in from Non-Combat, since Wounds now live only in the sidebar; L L S S C squares
(`.sq`, same buttons and actions as the pips) for Core Wounds in the sidebar and Core Influence;
Combat's card rows gain the type rail (`--essence-card-*`) and inline Commit and Cost; Equipment's
per-row icons fold into a `ContextMenu`; Non-Combat in the 07 to 09 order with Temporary Influence
as a stepper; Biography with Team and Advancement first. The card filter box moves to
`SearchFilter`. Depends on Ryan: the tab orders and the Prepared column. Size: large; ship as one
release per tab.

### 6. Card item view and chat card

`card-sheet.hbs` view mode adopts the type band and stat strip (Commit, Cost with "—" when blank,
Roll, Against). `roll-card.hbs` is rebuilt on Foundry's `.dice-roll` markup so inline roll
tooltips, Dice So Nice and chat-log styling work unchanged, with the Essence additions (Success Die
and Surge highlighting, the Reaction-window strip, Effect and Rider lines) layered on top. Depends
on Ryan: which apply buttons the chat card offers. Size: medium.

### 7. Add Condition dialog

Done in 0.17.0 (`module/apps/condition-picker.mjs`, opened from the sidebar's Conditions panel).
Wound, Consequence and Cover Conditions are left out on purpose. A `DialogV2` listing the Conditions compendium index with an Ordinary/Specialty filter and a
`SearchFilter`, marking owned Conditions, adding through the same path as the Token HUD
(`toggleStatusEffect`). The custom-condition link opens the existing item editor. Size: small.

### 8. Cleanup

Remove rules no template references (grep each class name), remove the comment blocks that
explain workarounds the native pieces made unnecessary, and record the token list in the
groundwork doc as the sheet's style reference. Size: small.

## Verification for every step

- `npm test`, `node --check` on changed modules, template block balance, lang keys (as today).
- Playwright screenshots of the same eight views before and after, compared as images. Steps 1
  to 3 must show no difference; later steps show only the intended one.
- Open the sheet in both Foundry themes once step 1 lands. Nothing may become unreadable in light
  mode.
- One pass with the window at its 560 × 420 minimum and one at 1400 wide.

## What Ryan's review can still change

The token values, the sidebar's contents, the per-tab orders, the card rail colors, the chat
card's buttons. None of those change the steps above, only their content. Steps 0 to 3 are safe
to ship before he answers.
