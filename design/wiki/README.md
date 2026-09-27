# Wiki mirror update, prepared 2026-09-27

The build session could not push to `COFC-Coaching/essence-foundry.wiki` (the git proxy only
carries credentials for `essence-foundry` itself). The change is prepared here instead:

- `V0.6-Update-Notes.md` is the new wiki page.
- `0001-v0.6-update-notes.patch` is the full commit (the page, plus links from `Home.md` and
  `_Sidebar.md`), made against wiki commit `d04ac99`.

To publish it from a machine with wiki write access:

```
git clone https://github.com/COFC-Coaching/essence-foundry.wiki.git
cd essence-foundry.wiki
git am ../essence-foundry/design/wiki/0001-v0.6-update-notes.patch
git push
```

Delete this folder once the wiki carries the page.
