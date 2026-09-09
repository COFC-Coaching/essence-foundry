---
name: cut-release
description: Cut a new essence-foundry release by bumping system.json, confirming CHANGELOG.md, and pushing the version tag that triggers the GitHub Actions release workflow. Invoke with /cut-release.
disable-model-invocation: true
---

# Cutting an essence-foundry release

This automates the release process documented in [README.md](../../../README.md)'s "Cutting a
release" section: bump `system.json`, commit, tag, push. The tag push triggers
[.github/workflows/release.yml](../../../.github/workflows/release.yml), which verifies the tag
matches `system.json`, zips the system, and publishes a GitHub Release.

**This skill pushes a git tag, which is a public, hard-to-reverse action** (it publishes a
GitHub Release automatically). Always show the user the exact plan and get explicit confirmation
before the final `git push origin <tag>` — never run it unprompted.

## Steps

1. **Check working tree state.** Run `git status`. If there are uncommitted changes unrelated to
   the release, stop and ask the user how to handle them — don't bundle unrelated work into a
   release commit.

2. **Determine the version.**
   - Read the current `version` in `system.json`.
   - Run `git tag --list "v*" --sort=-v:refname | head -5` and/or
     `gh release list --limit 5` to see the latest published release.
   - If `system.json`'s version is already ahead of the latest published tag (e.g. work already
     landed on `main` with a bumped, unreleased version — check `CHANGELOG.md` for a matching
     entry), the release can proceed with the current version — no further bump needed.
   - Otherwise, ask the user whether this is a patch/minor/major bump (this project's own history
     bumps the patch version per notable change — see `CHANGELOG.md` for the pattern) and compute
     the next version.

3. **Verify `CHANGELOG.md` has an entry for the target version.** This project's convention
   (see `CHANGELOG.md`) is one entry per version explaining *why* the change happened, not just
   what changed. If there's no entry yet, draft one from the commits since the last tag
   (`git log <last-tag>..HEAD --oneline`) and confirm it with the user before proceeding — don't
   invent detail that isn't backed by an actual commit.

4. **Bump `system.json` if needed** and stage `system.json` + `CHANGELOG.md` together in one
   commit: `Release v<version>` (or fold into the existing commit if the version was already
   bumped as part of other work this session — don't create a redundant empty commit).

5. **Show the user the exact plan** before touching git: the version, the CHANGELOG entry, and
   the commands about to run (`git tag v<version>`, `git push origin main --tags` or equivalent).
   Get explicit confirmation.

6. **Tag and push.**
   ```
   git tag v<version>
   git push origin main
   git push origin v<version>
   ```

7. **Confirm the release published.** Poll `gh run list --workflow=release.yml --limit=1` or
   `gh release view v<version>` after a short wait, and report the release URL back to the user.
   If the workflow fails (e.g. tag/version mismatch — see the workflow's own verification step),
   diagnose from the run logs (`gh run view --log-failed`) rather than re-tagging blindly.
