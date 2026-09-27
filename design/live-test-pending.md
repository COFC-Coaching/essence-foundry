# Live test: 0.8.1 through 0.10.1

Branch `claude/elastic-lamarr-32f578-lza4a9`, commits `cac234e` (0.8.1), `0b5e315` (0.9.0),
`6243178` (0.10.0) and the 0.10.1 release commit after it. None was live-tested when built (cloud session, no Foundry). Run this in a world on Foundry
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

## 0.10.0: dice and Turns

29. Roll Initiative. The prompt's minimum is 1; there is no pass. Two combatants tied on
    Initiative, one a character and one an NPC: the character is listed first in the tracker.
30. With Combat running and it being the character's Turn, click Dash on the Combat tab. No
    commit prompt: 2 Action dice are burned and the card text posts to chat. Reconfigure burns 3.
31. Prepare Action: burn 2, choose an Action (say Basic Melee Attack), type a trigger, reserve 2.
    The Action Pool drops by 4. The Combat tab shows the preparation with Fire and Cancel. End the
    Turn: the Reaction Pool is base + unused unreserved dice (the 2 reserved are not in it).
32. Before the character's next Turn, click Fire: the commit prompt offers only the reserved dice;
    the roll posts as "(prepared)"; the preparation clears. Prepare again, then advance the tracker
    to the character's Turn: chat says the preparation expired and the reserved dice are gone.
33. Put Dazed on the character's token (Token HUD), then advance the tracker to their Turn: chat
    reports the burn of 3, the Action Pool is base minus 3, Dazed is gone from the sheet.
34. Play a Reaction with "Target is unaware" ticked while holding exactly the card's minimum in
    Reaction dice: refused with the "needs N dice" notice. With one more die it plays and the extra
    die is spent.
35. Play an Action with "Target is helpless" ticked: the chat card reserves no Success Die and
    every 6+ counts as a Surge.

## 0.10.0: Wounds, death, Stabilize

36. Fill all five Core Wound spaces on a character. State reads Dying, step 0. Advance the tracker
    through their Turn five times: step 5, the token gets Foundry's defeated overlay, chat says the
    character has died, the Death Track line reads "Dead". Recover Wound and the pip toggles no
    longer change the state. Cards refuse to play with the "is dead" notice.
37. On another character at Dying, target their token and play Stabilize from a third character
    (burn 3, confirm treatment): the target's state reads Stabilized. Untargeted, Stabilize on a
    Dying character stabilizes them.
38. Fill an NPC's Wound capacity: the token gets Foundry's unconscious status and the header reads
    Defeated. Target it and play Stabilize: header reads "Defeated (stable)". Recover one Wound:
    the status clears and the header reads normally.
39. Toggle off the Critical (fifth) space on a character whose step was 3 and whose state was
    "none" after an earlier recovery: the step resets to 0.

## 0.10.0: Encounter, Recovery, Conditions

40. Give the character Combo 3, a Lock, a Thread and a Stance Condition; click New Encounter: all
    four clear and chat lists them. End the Combat instead (delete it): Threads stay.
41. Put Fatigued on the character (it is in the Conditions compendium) with Stamina max 9 at 5/9.
    Grant Recovery at 25%: Stamina gains 2, not 3; the dialog then asks whether to remove Fatigued.
42. Fill three Core Influence spaces, click Recover Influence: a prompt asks which space clears.
43. Open Dazed, Prone, Weakened, Exposed and Concentration from the Conditions compendium: the
    text matches the rulebook (Dazed is the start-of-Turn burn, Exposed is −1 all Defenses).
44. Play an Equipment Card whose text says "Burn 2" (Aegis): no commit prompt, 2 dice burned.

## 0.10.1: Damage components, Recovery, Concentration

45. Character with Resilience 2, no accumulated Damage, empty track. Apply Damage: row 1 = 3 Fire,
    row 2 = 2 Psychic. Chat lists one Physical Wound then two Mental Wounds, accumulated 5 (Doc
    L3914). Core spaces 1 to 3 are filled and the Wound Cards attached read Physical, Mental,
    Mental.
46. Same setup plus Fire Resistance; Apply 3 Fire + 2 Psychic with flat reduction 1: chat shows
    2 Fire + 2 Psychic after the reduction, Fire to 0 by Resistance, two Mental Wounds (L3918).
47. Tick "Attacker is Weakened" with 1 Slashing: nothing gets through (reduced to 0).
48. Fill four spaces, then apply 3 Bludgeoning with Breach and Nonlethal ticked: fifth space fills,
    the state reads Stabilized (not Dying), the token gets unconscious, the Death Track step stays 0.
49. On a Dying character, apply 1 Breach Wound with Nonlethal: state stays Dying (nonlethal doesn't
    stabilize someone already Dying).
50. NPC with capacity 3: apply 5 Fire in one component: capacity fills, Defeated, unconscious
    status. Same with Nonlethal ticked: header reads "Defeated (stable)".
51. Put the Concentration Condition on a character with Action dice 2, Reaction dice 0. Apply a
    Breach Wound: a prompt offers "Burn 1 Action die (2 left)" or "End Concentration". Burn: Action
    dice read 1, Concentration stays. Repeat with both pools at 0: Concentration is removed and chat
    says why.
52. Fill spaces 1, 2 and 3. Grant Recovery: the dialog lists three Wounds with checkboxes. Tick
    only space 2: it clears, spaces 1 and 3 stay, the state and step are unchanged.
53. Full Manifestation profile: Apply Damage with a full track adds to overflow Wounds by the
    surplus, as before.
