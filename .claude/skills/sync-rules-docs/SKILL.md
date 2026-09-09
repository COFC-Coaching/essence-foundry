---
name: sync-rules-docs
description: After editing rules text in the essence-system repo (or noticing it changed), check whether the essence-foundry.wiki mirror and this repo's in-world Player & GM Guide compendium journal need the same edit. Use whenever a rules paragraph is added, removed, or reworded — not for gameplay code changes.
user-invocable: false
---

# Keeping the three copies of the rulebook in sync

There are **three copies of the same rules text**, and nothing keeps them in sync automatically:

1. **Source of truth**: `COFC-Coaching/essence-system` repo,
   `artifacts/essence-system/src/content/rules/part-*.md` — the canonical rulebook.
2. **GitHub Wiki mirror**: `COFC-Coaching/essence-foundry.wiki` (a separate git repo, not part of
   this repo's tree — see [Home.md](https://github.com/COFC-Coaching/essence-foundry/wiki) there),
   which exists specifically so this Foundry system's own implementation work has a rules
   reference without leaving GitHub. Its `Part-*.md` pages are prose renderings of the same
   sections, not always identical wording.
3. **The Foundry `guide` compendium journal** — `packs/_source/guide/*.json` in this repo, the
   in-world Player & GM Guide players/GMs read from inside Foundry.

This gap is not hypothetical: the 2026-09-09 Surge rule fix added a "Rolling Open" section to the
`essence-system` repo's `part-iv-combat.md` and never propagated it to the wiki mirror or the
guide journal — caught only because someone happened to check. See `build-history`'s
2026-09-09 entry.

## When to run this

- Right after editing any `part-*.md` file under `essence-system`'s
  `artifacts/essence-system/src/content/rules/`.
- When asked to "update the docs" for a rules/mechanics change and the essence-system repo is the
  one that got edited.
- Do NOT run this for gameplay *code* changes alone (e.g. a bug fix in `module/dice/`) unless the
  underlying rule text itself also changed — code and docs drifting is a different, already-known
  problem (see build-history's "Known gaps"), not this skill's job.

## Steps

1. **Identify what changed.** `git -C <essence-system-repo> diff` (or the specific commit) to see
   which `part-*.md` file(s) and which section(s) changed.

2. **Locate the sibling repos.** They're expected as siblings of this repo's parent working
   directory (e.g. if this repo is at `.../Essence System/essence-foundry`, look for
   `.../Essence System/_repo` — or wherever the user's essence-system checkout actually is — and
   `.../Essence System/essence-foundry-wiki`). If either isn't found:
   - For the wiki: it's a separate git repo, clone it with
     `git clone https://github.com/COFC-Coaching/essence-foundry.wiki.git <path>`.
   - For essence-system: ask the user where their checkout lives, or offer to
     `gh repo clone COFC-Coaching/essence-system <path>`.

3. **Find the matching section in the wiki mirror.** The wiki's `Part-<Roman>-<Title>.md` files
   correspond to the source repo's `part-<roman>-<title>.md` files (see `Home.md`'s own mapping),
   but wording is a paraphrased prose rendering, not a verbatim copy — don't diff byte-for-byte.
   Read the corresponding section and decide whether the same *information* is present. Apply the
   same substantive change, matching the wiki's existing prose style in that file rather than
   pasting the source repo's exact phrasing.

4. **Check the `guide` compendium journal** (`packs/_source/guide/game-master-s-guide_*.json` /
   `player-s-guide_*.json` in this repo) for the same topic. These are hand-authored summaries for
   in-world reference, not full rule text — most rules changes won't need a journal update, but
   check whether the changed section is one of the topics the guide actually covers (e.g. Surges,
   Wounds, the Role Budget System already have dedicated guide pages per build-history).
   If it does need an update, edit the JSON's HTML content directly (see existing entries for the
   markup pattern), and remember packs must be recompiled (`node scripts/build-packs.mjs
   --only=guide`) — subject to the same Foundry LevelDB lock caution as any other pack rebuild
   (confirm no live Foundry process is holding the lock first).

5. **Report what you found and changed** — including if a mirror was already in sync and needed
   no change, so the user isn't left wondering whether you checked. Don't commit/push the wiki or
   essence-system repo changes without the same confirmation any other repo's commit would need.
