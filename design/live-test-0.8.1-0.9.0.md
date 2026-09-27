# Live test: 0.8.1 and 0.9.0

Branch `claude/elastic-lamarr-32f578-lza4a9`, commits `cac234e` (0.8.1) and `0b5e315` (0.9.0).
Neither was live-tested when built (cloud session, no Foundry). Run this in a world on Foundry
v14 with the branch checked out into `Data/systems/essence-system`. Record results in
build-history under a new dated heading; delete this file once everything below has passed.

## Before starting

- The world must reload the system after the file copy. `game.shutDown()` from the console, then
  relaunch the world (see build-history 2026-09-27, 0.8.0, for why: pack locks).
- Console open. Any error whose stack names `systems/essence-system` fails the run.

## 0.8.1: resize and scroll

1. Open a Character sheet. A resize handle shows in the bottom-right corner. Drag it: the window
   resizes, the header (portrait, name, tabs) stays put, only the content scrolls.
2. Try to drag it below about 560 × 420. It stops at the CSS minimum.
3. Scroll the Combat tab down, then change any field (say, Reach on the Non-Combat tab after
   scrolling there). After the re-render the scroll position is where you left it.
4. Repeat 1 on an NPC, a Monster, a Full Manifestation and a Team sheet. The Team sheet's tab strip
   also stays fixed.
5. Close and reopen the Character sheet. It reopens at the size you left it.

## 0.9.0: Non-Combat rolls

6. Non-Combat tab, roll a Non-Combat Skill. The prompt shows Attribute, Difficulty (GM) and
   Cooperation free dice. Enter Difficulty 6. The chat card reads "Highest die N — Success" or
   "Failure", with the "no Surges, non-combat roll" line and no Surge options.
7. Roll it again with Difficulty blank. The card says the GM decides from the highest die.
8. Roll a Key Aspect. Pool is Attribute + 5.
9. Core tab: each Attribute row has a d10 button. Click one. The prompt has no Attribute select;
   pool equals the Attribute alone.
10. Outside Combat, click a Combat Style's roll button. A notice says Styles are rolled through
    their cards; no roll happens. Inside Combat (Combat Tracker running) the dice-commit prompt
    still appears as before.
11. Combat tab, Basic actions, Perform Task with Combat running. The basis list ends with
    "Attribute only (no Skill applies)". Choose it: pool equals the Attribute.

## 0.9.0: sheet fields

12. Header shows a Size field, default 1, clamped to 0 to 5.
13. Non-Combat tab: Languages row with "N known (1 + Acuity A)" beside it. Change Acuity on the
    Core tab; the count updates.
14. Connections table: Add Connection, fill all four fields, change another field on the sheet.
    The row keeps all four values. Add more rows than Presence: the over-limit note appears; rows
    are not blocked.
15. The Presence Grant block is gone from the Influence section. Hover Acuity on the Core tab:
    the tooltip is about languages. Hover Presence: Connections.
16. Apply an Influence Injury, Recover, Contribute to Shared Goal still work as before.

## 0.9.0: Distinctions

17. Open the Distinctions compendium. Nine entries, no Dilettante. A character who already owned
    Dilettante still shows it on their sheet with its +5 Resources.
18. Drag a second Distinction (a different one) from the compendium onto a character who has one.
    Both remain. The header shows "+ Name" beside the Distinction field. Non-Combat tab, General
    Features: the second one's row is "Name (later acquisition)" with the "If acquired later" text,
    and its Origin Benefit does not appear.
19. Combat tab: the second Distinction's Style now allows one more Expertise (Add Expertise past
    the Rank).
20. Drag the same Distinction again: refused with a notice. Drag a third, different one: it
    replaces the later-acquired one, not the starting one.
21. If the second Distinction is a gated one (Arcanist, Invoker, Summoner, Gifted, Psyker), its
    restricted Style is no longer locked on the Combat tab.

## 0.9.0: wizard

22. Open the wizard on a fresh character. Step order: Concept, Identity, Attributes, Non-Combat,
    Combat Styles, Passive Features, Equipment, Finalize. Footer reads "of 8".
23. Non-Combat step: no "Skills from Intellect" section. Header shows the pool as 5 + Intellect +
    grants. Set Intellect 3 on the previous step: pool is 8. Type 1 in the grants field: pool is 9.
24. Add a Skill and raise it: stops at Rank 2. Total spend stops at the pool.
25. Languages and Connections appear on this step and save.
26. Combat Styles step: with a Distinction chosen and its Style at Rank 0, that Style still lists
    Expertises to pick.
27. Finalize: "Starting Advancement Point" fields (Level, AP spent, unspent). Checklist rows for
    Skill Points (n / pool), Connections, Inventory and Armory limits. No Intellect row.

## Existing world

28. Open every pre-existing actor in the world. All load; the console shows no schema errors. A
    character that had Presence-grant values shows nothing about them.
