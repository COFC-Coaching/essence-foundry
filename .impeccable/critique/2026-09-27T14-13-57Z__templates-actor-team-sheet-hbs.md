---
target: Phase 1 (0.8.0) UI changes
total_score: 22
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:C:\\Users\\shane\\Downloads\\Essence System\\essence-foundry\\.claude\\worktrees\\elastic-lamarr-32f578\\templates\\actor\\team-sheet.hbs"
target_fingerprint: "sha256:f188be1fee767ca728ad711c7a98b53f81dc0ae80c97f3f81e544e4699b7153d"
target_path: "C:\\Users\\shane\\Downloads\\Essence System\\essence-foundry\\.claude\\worktrees\\elastic-lamarr-32f578\\templates\\actor\\team-sheet.hbs"
timestamp: 2026-09-27T14-13-57Z
slug: templates-actor-team-sheet-hbs
---
# Critique: Phase 1 (0.8.0) UI (Team sheet, Bio Team & Advancement, header, Inventory Tier column, NPC Pool bonus, wizard Team line)
Method: dual-agent (A: design review · B: detector + browser)

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Overspent AP shows "0 ⚠", hides −2; deleted members vanish silently |
| 2 | Match System / Real World | 3 | Rulebook vocabulary; "AP Available" vs "Unspent AP" |
| 3 | User Control and Freedom | 1 | Team Tier raise is an unconfirmed spinner, irreversible |
| 4 | Consistency and Standards | 2 | Team sheet lacks lock/tabs; label casing mixed |
| 5 | Error Prevention | 1 | Same Tier hazard; AP spent accepts > Level |
| 6 | Recognition Rather Than Recall | 2 | Overspent/over-Tier explained only in tooltips |
| 7 | Flexibility and Efficiency | 2 | No join-from-character; record at bottom |
| 8 | Aesthetic and Minimalist Design | 2 | Six empty 150px editors; Movement orphaned in header |
| 9 | Error Recovery | 2 | Tier refusal good; overspent tooltip-only |
| 10 | Help and Documentation | 3 | Good rules-grounded hints |
| Total | | 22/40 | Acceptable |

Detector: CLI 0 findings on 5 templates. Browser: bio-cell-label 10.5px x7 (in scope, essence.css .bio-cell-label); Team sheet p.muted hints line-height 1.25 x4; shared th 9.8px (pre-existing .item-table); Foundry window clipping (false positive).

## Priority Issues
1. [P0] Team Tier raise is an unconfirmed spinner and irreversible. Fix: read-only Tier + GM "Raise Team Tier" button with DialogV2 confirm naming affected members; optional GM correction path. (/impeccable harden)
2. [P1] Team sheet IA built for setup not play: six editors bury the record; Notes single-line and truncating; Identity too narrow; Tier label wraps; no team-sheet CSS. Fix: tabs (Team/Record/Charter) or collapsed editors, textarea Notes, .team-sheet styles. (/impeccable layout)
3. [P1] Overspent AP shows 0 ⚠, tooltip-only. Fix: signed value, visible explanation line, flag AP spent input. (/impeccable clarify)
4. [P2] Accessibility: unlabelled record inputs, non-focusable warning icon, 10.5px bio labels, remove-member no title. (/impeccable audit)
5. [P2] Inconsistent names/states: casing, "No Team" dead end, wizard vs Bio wording, orphaned Movement row. (/impeccable clarify)

## Minor
"Round null — Not Started" on combat tab outside combat (pre-existing; character/npc/monster). No members empty state; new record row focus; Team hint line-height 1.25; "Level - spent" hyphen; over-Tier icon not verified live.
