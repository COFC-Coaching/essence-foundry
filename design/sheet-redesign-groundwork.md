# Sheet redesign: groundwork and mapping

Concept canvas: https://claude.ai/artifact/X1kPYCFHPp64nymJE4giST (nine artboards: Combat, Core,
Equipment, Non-Combat and Biography tabs; Add Condition dialog; card anatomy; chat log; compact
window). Status: awaiting Ryan's review. Nothing in this document changes what the current sheet
looks like. It records what 0.8.1 put in place and what each concept region becomes in code, so the
switch is a bounded change once the concept is approved or amended.

## Built in 0.8.1

- Every actor sheet window is resizable (`DEFAULT_OPTIONS.window.resizable`). Foundry remembers
  the size per user.
- Each actor template wraps everything after the header (and tab strip, where there is one) in
  `.sheet-scroll`. Header and tabs are fixed; only that region scrolls.
- Each sheet's `PARTS.body.scrollable` lists `.sheet-scroll`, so scroll position survives the
  re-render that `submitOnChange` causes on every edit.
- `.application.essence.actor` has a CSS minimum of 560 × 420.
- Design tokens as CSS custom properties on `.application.essence` and `.essence.roll-card`
  (`--essence-ground`, `--essence-ink`, `--essence-accent`, the three domain colors, the four
  card-type colors, the two font stacks, radii). No rule reads them yet.

## Concept region to code

| Concept region | Template | CSS / JS | Depends on Ryan |
|---|---|---|---|
| Header banner with art, name, origin chips, Team and Level cards | `character-sheet.hbs` `<header class="sheet-header">` gains a `.hero` class; Team/Level cards move up from the Bio tab (`bio-standing-grid`) | `.hero` background from a world or system setting for the art; tokens for chips | Art asset; whether Team and Level belong in the header |
| Vitals sidebar (pools, Resources, Defenses, Wounds, Conditions, Reach/Influence readout) | New `<aside class="sheet-side sheet-scroll">` between the header and the tab strip; content is the existing Core-tab blocks (`domains`, `wounds-row`, `resistances-row`, death-track partial) and the Combat-tab pool block, moved, not rewritten | `.essence-sheet-root` becomes `grid-template-columns: 300px 1fr` with `grid-template-rows: auto 1fr`; the sidebar is a second `scrollable` entry; container queries at 1100/860px for the widths in the concept's sticky note | Which vitals live in the sidebar |
| Tab strip | Unchanged markup; `position: sticky` inside the main scroll region | Token colors | No |
| Combat tab: Styles by domain, basic-action row, card grid | Existing `skill-box` grid and card lists; card rows gain a type rail and inline commit/cost (`system.min`, `system.cost` + `domainResource`) | `.card-row` rail uses `--essence-card-*`; the sort/search controls stay | Card text conventions (Cost as "—" when blank, confirmed) |
| Core tab: Attributes, Combat traits, Passive Features, Languages | Existing Attribute and combat-trait blocks in Ryan's 02 to 03 order; Wounds live only in the sidebar (Shane, 2026-09-27). The Passive Features table (`originFeatures` plus `passiveFeatures` rows) and the Languages field move here from the Non-Combat tab. L L S S C squares replace the pip buttons for Core Wounds (sidebar) and Core Influence | `.sq` square style; the pip buttons keep their `data-action`s; the moved blocks keep their `name=` bindings and `addArrayRow`/`deleteArrayRow` actions | Size, Senses, Movement Modes (Phase 2 schema) |
| Sheet background | The root `.essence-sheet-root` carries the cover art at low visibility (a dark veil at about 90%); panels and card rows are translucent (about 86%) so the art reads through faintly (Shane, 2026-09-27). Inputs stay opaque for legibility | Tokens `--essence-panel` and `--essence-panel-raised` become rgba values; a `--essence-veil` token for the overlay; the art URL comes from the same setting as the header | Art asset |
| Equipment tab: capacity strip, Inventory, Temporary, Armory with Prepared column | Existing three `item-table`s; the per-row icon cluster folds into view, reconfigure, used-flag, and a "more" menu | A `ContextMenu` for the folded actions | Whether Prepared is a checkbox on the Armory or the current move buttons |
| Non-Combat tab | Career and Skills, then Influence and Reach (Ryan's 07 and 08); Passive Features and Languages leave for the Core tab; Temporary Influence as a stepper (no maximum) instead of pips | Tokens | Presence grant removal (Phase 2) |
| Biography tab | Team and Advancement row, then Concept, Appearance/Personality side by side, Backstory, Notes | Tokens | No |
| Add Condition dialog | New `DialogV2` listing the Conditions compendium with Ordinary/Specialty filter and search; "On sheet" for owned ones | Reads `packs/conditions`; the custom-condition link opens the existing item editor | No |
| Card anatomy (item view) | `card-sheet.hbs` view mode: type band, Requires, Commit/Cost/Roll/Against stats, body lines, Surges, Rider with `rider.meta` | `.card-view` rules move to tokens and `--essence-card-*` | No |
| Chat card | `roll-card.hbs`: type band, commit and cost line, dice with Success Die and Surge styling (exists), Reaction-window strip, Effect and Rider lines with apply buttons | The Effect/Rider lines need the card's `body` and `rider` passed into the chat context | Which apply buttons the roll card should offer |

## Design tokens (the sheet's style reference, 0.18.4)

Declared on `.application.essence`, `.essence.roll-card` and `.essence-whats-new` at the top of
`styles/essence.css`. Every color rule in the stylesheet reads one of these (0.14.0); a new rule
must too. The sheet is a self-themed dark surface: the values hold in both Foundry themes, and only
the two font tokens read Foundry's own variables. Change a value here, not in a rule.

| Role | Tokens |
|---|---|
| Surfaces | `--essence-ground`, `--essence-veil` (the overlay on the cover art), `--essence-sheet-art` (`none` unless the cover-art setting supplies a URL), `--essence-panel`, `--essence-panel-raised` (both rgba so the art reads through on the Character sheet; the other sheets override them opaque), `--essence-well` (inputs, wells), `--essence-editor-bg`, `--essence-editor-menu`, `--essence-editor-content` |
| Lines | `--essence-line-soft`, `--essence-line`, `--essence-line-strong`, `--essence-line-dashed`, `--essence-line-bright` |
| Ink | `--essence-ink`, `--essence-ink-bright`, `--essence-muted`, `--essence-muted-soft` |
| Accent (amber) | `--essence-accent`, `--essence-accent-rgb`, `--essence-accent-bright`, `--essence-accent-ink` (text on an accent fill) |
| States | `--essence-warn`, `--essence-danger`, `--essence-danger-rgb`, `--essence-success`, `--essence-success-rgb`, `--essence-success-ink` |
| Item types (read views, content wizard, chips) | Condition: `--essence-condition`, `-rgb`, `-ink`, `-border`, `-soft-rgb`. Equipment: `--essence-equipment`, `-rgb`, `-ink`. Chassis: `--essence-chassis`, `-rgb`, `-ink`, `-soft`. Fitting: `--essence-fitting`, `-ink`. Augment: `--essence-augment`, `-rgb`, `-ink` |
| Domains | `--essence-domain-physical`, `-mental`, `-spiritual`, each with an `-ink` twin for text and chip borders |
| Card types (rails, bands) | `--essence-card-action` (green), `--essence-card-reaction` (red), `--essence-card-equipment` (gold), `--essence-card-basic` (neutral) |
| Type and shape | `--essence-font-display` (reads `--font-h1`), `--essence-font-body` (reads `--font-body`), `--essence-radius`, `--essence-radius-sm` |

The `-rgb` twins exist for the rules that need an alpha (`rgba(var(--essence-accent-rgb), .15)`).
Tooltips are Foundry's `data-tooltip-text` everywhere (0.18.4), so tooltip styling is core's, not ours.

## Order of work once approved

1. Tokens: switch existing color rules to `var(--essence-*)`. No visual change if the token values
   are set to today's colors first, then retuned in one commit.
2. Frame: sidebar region and the grid, with the second `scrollable` entry.
3. Move blocks into the sidebar. Every `data-action` keeps its name, so the sheet class needs no
   changes for this step.
4. Per-tab reorders.
5. Card item view and chat card.
6. Add Condition dialog.

Steps 1 and 2 can ship before Ryan's review without changing the look. Steps 3 to 6 wait.
