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
| Core tab: Attributes, Combat traits, Wounds detail | Existing blocks, reordered to Ryan's paper sections 02 to 04; L L S S C squares replace the pip buttons for Core Wounds and Core Influence | `.sq` square style; the pip buttons keep their `data-action`s | Size, Senses, Movement Modes (Phase 2 schema) |
| Equipment tab: capacity strip, Inventory, Temporary, Armory with Prepared column | Existing three `item-table`s; the per-row icon cluster folds into view, reconfigure, used-flag, and a "more" menu | A `ContextMenu` for the folded actions | Whether Prepared is a checkbox on the Armory or the current move buttons |
| Non-Combat tab | Existing sections in Ryan's 07 to 09 order; Temporary Influence as a stepper (no maximum) instead of pips | Tokens | Presence grant removal (Phase 2) |
| Biography tab | Team and Advancement row, then Concept, Appearance/Personality side by side, Backstory, Notes | Tokens | No |
| Add Condition dialog | New `DialogV2` listing the Conditions compendium with Ordinary/Specialty filter and search; "On sheet" for owned ones | Reads `packs/conditions`; the custom-condition link opens the existing item editor | No |
| Card anatomy (item view) | `card-sheet.hbs` view mode: type band, Requires, Commit/Cost/Roll/Against stats, body lines, Surges, Rider with `rider.meta` | `.card-view` rules move to tokens and `--essence-card-*` | No |
| Chat card | `roll-card.hbs`: type band, commit and cost line, dice with Success Die and Surge styling (exists), Reaction-window strip, Effect and Rider lines with apply buttons | The Effect/Rider lines need the card's `body` and `rider` passed into the chat context | Which apply buttons the roll card should offer |

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
