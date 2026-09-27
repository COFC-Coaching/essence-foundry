# Live test: 0.8.1 through 0.14.0

Branch `claude/elastic-lamarr-32f578-lza4a9`, commits `cac234e` (0.8.1), `0b5e315` (0.9.0),
`6243178` (0.10.0), `cfc5147` (0.10.1), `52dcba9` (0.11.0), `9d7fe32` (0.12.0), `3082ceb`
(0.13.0) and the 0.14.0 release commit after it. Each was built in a cloud session without Foundry.
Run this in a world on Foundry v14 with the branch checked out into `Data/systems/essence-system`.
Record results in build-history under a new dated heading; delete this file once everything below
has passed.

**Where this stands (2026-09-27, evening).** Checks 96 to 120 and 89 were run on the local machine against 0.17.1 (build-history, "Live test of 0.14.0 through 0.18.0"). All passed after the 0.17.2 fixes except two clauses left for Shane: 98's arrow-key tab navigation (Foundry core has no such handler; the tab strip is native and keyboard focus works, but arrows do nothing) and 102's "empty aside is display: none" (0.15.0 filled the sidebar, so it is never empty). 103's chat card passes with 0.18.0. Earlier status:

**Where this stood (2026-09-27, morning).** Checks 1 to 95 were run on the local machine against 0.13.5
(build-history, "Live test of 0.8.1 through 0.13.5"): all passed after the 0.13.1 to 0.13.5 fixes
except 89 (Species Trait sub-choices do not feed Resistances; waiting on a decision), 17's second
half (no legacy Dilettante in the test world) and 53 (superseded by 84). The wiki patch was pushed
and `design/wiki/` removed. What is left to run: 89 once decided, and the 0.14.0 checks 96 to 103
at the end of this file.

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

## 0.11.0: Enemies (Part XIV)

54. The "Starting Enemy Examples" compendium lists ten actors. Import Mook Skirmisher: the sheet is
    the compact record (Grade, Role, Wounds 2, Defenses 5/5/5, Resilience 0, Movement 12, Senses,
    Abilities). No Attributes, Styles, card sections or Pools show. Tick "Show Attributes, Styles,
    cards and Pools": they appear; untick: they hide. No console error either way.
55. Same actor: the header shows Initiative dice, Actions per Turn, Reactions per Round and Task
    Dice inputs, all blank, and the read-back reads 2 / 1 / 1 / 4 (Doc L7962). Import Normal
    Defender: 2 / 2 / 1 / 5. Import Elite Champion: the header shows Roll Limit 6 instead of Task
    Dice, plus the normal Pools.
56. Mook Skirmisher's Defenses read 5 / 5 / 5 although its Attributes are all 0. Clear a Printed
    Defense: that Defense falls back to the Attribute-derived value. Type it back: it overrides
    again. Strain does not change a printed value.
57. Abilities table: Harrier Strike shows kind Action, At Will, 2 dice, vs Fortitude; Slip Away
    shows Reaction, 2 dice, unopposed. Add an ability: the new row defaults to Action, At Will,
    blank dice, no Defense.
58. Open a pre-0.11.0 enemy whose ability was saved as "per Combat": it now reads "Between
    Recoveries" and the uses count is unchanged.
59. Combat with Mook Skirmisher and a character. Roll initiative for the Mook: no prompt; chat
    shows a 2d10 roll flavored "Initiative (printed dice)"; the tracker gets its total; the Mook's
    Pools stay blank.
60. Start combat. The Mook's combat header reads "This Turn: 0 / 1 Actions | Reactions this Round:
    0 / 1". Use Harrier Strike with a target selected: chat says "uses Harrier Strike (printed
    2d10)", the roll is 2d10 vs the target's Fortitude, and the header reads 1 / 1. Use it again:
    a warning says the Mook has used its 1 Action, and the roll still goes through (warn, not
    block).
61. Use Slip Away: 2d10 unopposed, Reactions read 1 / 1. Advance to the next Round: Reactions read
    0 / 1 again. On the Mook's next Turn: Actions read 0 / 1.
62. Drop Stabilize on the Mook (Elite-style hand-build, via the full-stats toggle) and play it:
    chat says it is this Turn's utility Action with no dice cost, Actions read 1 / 1. Play it
    again the same Turn: a warning says the utility Action is used. Play Basic Melee Attack,
    Defend or Prepare Action on a Mook: a warning asks for GM permission, nothing rolls.
63. Click "Roll Task Dice" on Normal Defender with Difficulty 6: a 5d10 roll against Difficulty 6,
    no Surges. Blank Difficulty: the roll posts with the highest-die reading.
64. End the Mook's Turn: no Reaction Pool forms, and no console error. A character in the same
    combat still forms its Reaction Pool normally.
65. Mook Striker's Exploit the Opening reads "Between Recoveries", 1 use. Use it: 0 uses. Use again:
    the "no uses remaining" warning. Advance to Round 2 and again to a new combat (end and start):
    still 0. Click Recovery: 1 use, chat says the uses were refreshed.
66. Elite Champion in combat with Action dice 6: use Champion Strike: the dice prompt opens with
    min 3, max 6 and an advisory line "Roll Limit is 6 dice"; commit 3: Action dice read 3 and a
    3d10 roll vs Fortitude posts. Use Challenge with only 1 Action die left: the "requires at
    least 2 dice" warning, no roll.
67. Elite Solo: Reactions per Round reads 2 (a printed value), Pressure Wave reads Triggered, Once
    per Round; use it twice in one Round: the second is blocked. Its dice-less abilities post text
    only.
68. Enemy wizard: build a Mook and a Normal several times. No Basic Melee Attack, Basic Ranged
    Attack, Defend or Prepare Action appears among the picked cards. Default Resilience is 0 for a
    Mook, 1 for a Normal, 2 for an Elite; Temporary Wounds default to 0.
69. Monster (not NPC) sheet: repeat checks 54, 57 and 60 on a `monster` actor set to Mook: same
    compact record, same allowance line, no console error.

## 0.12.0: Combat Styles (Part X)

70. Open a pre-0.12.0 character who had a Lock name, a Contingency and two Authority results
    saved: the Lock shows as a chip, the Contingency as a list row, and Authority as two
    "(card not recorded)" rows with one result each. No console error, no invalid document.
71. Magecraft 1+: click Fire twice, then Air: chips read "Fire ×2" and "Air", the list below shows
    three entries with the Doc's full effect text. Click Water: warning "Already holding 3
    Threads". Click the "Fire ✕" chip: one Fire is consumed, chat posts its effect, "Fire ×2"
    becomes "Fire".
72. Leadership 3 (capacity 2): Store Authority with card "Rally" and result 8; then card "Hold"
    and 5; then card "Charge" and 9: the third is refused ("Every Authority slot is occupied").
    Store again on "Rally" with 9 and "Discard existing" unticked: Rally shows 9 (newest wins,
    one result per card). Click the 5: the Hold row disappears (slot freed).
73. Give the character the Orator Distinction (creation, not later): the Store dialog offers a
    second result. Store 8 and 6 on Rally; click the 8: the 6 remains. Store 9 on Rally: 6 and 9.
    Make the Orator the later-acquired Distinction instead: no second result field.
74. Ritualism, three Rites present: Add Rite asks which to remove; pick one: it is replaced by a
    blank row. With the Invoker Distinction: a fourth blank row is added directly; a fifth asks
    which to remove with a ticked "Final Echo" option; confirming posts the removed Rite's Echo to
    chat and the Invoker note reads "(Final Echo used this Round)". Next Round, the note clears.
75. Rite with Echo Limit 2: click Echo: chat posts the Echo, limit reads 1. Click again: the Rite
    is removed and chat says it was the final Echo.
76. Ballistics: Establish Lock with Action dice 4: prompt for the name, then Action dice read 3
    and a chip shows the name. Establish another: the first chip is replaced (chat says the old
    Lock ends). With the Marksman Distinction: two chips coexist, the third replaces the oldest.
77. Cunning: Establish Contingency, then a second: refused ("Already holding 1"). Click Trigger:
    the row is removed, chat posts it, and the note "A Contingency has triggered this Round"
    appears. Establish another and Trigger it in the same Round: a warning, but it still fires.
    Advance to the character's next Turn: any unused Contingency is gone. Next Round: the
    triggered note clears. With the Strategist Distinction two can be established.
78. Gestalt: Adaptation "Hide" with upkeep 2, Stamina 5. End Turn: Stamina 3, chat "upkeep paid:
    2 Stamina". Set Stamina 1 and End Turn again: the Adaptation ends, chat says why. With the
    Gifted Distinction the label reads "(due at End Turn: 1 Stamina)"; add the Unstable
    Condition: 2. Tick "assumed outside my Turn" and End Turn: nothing is charged, the tick
    clears, chat says the first upkeep is due next Turn.
79. Prowess: Combo 3, "dealt Damage" unticked, End Turn: Combo 2 and a chat line. Tick it and End
    Turn: Combo stays, tick clears. Apply 1 Breach Wound: Combo drops by 1.
80. Psionics, Strain 4, Action dice 6: play a Psionics Action card (min 2). The dice prompt shows
    "Gain 1 Strain (to 5) for 1 free Surge". Tick it, commit 2: Strain reads 5, Action dice read 3
    (2 rolled + 1 burned surcharge), chat notes both, and the roll reports one extra Surge. At
    Strain 6 the checkbox is absent.
81. Click Vent with Action dice 3: dice 1, Strain 3, note "Strain vented: no Psionics Actions
    this Turn". Play a Psionics Action: refused with a warning; a Psionics Reaction still opens the
    prompt. Next Turn the note clears. Forced Strain 3 at Strain 5: Strain 6 and Apply Damage runs
    2 Psychic Breach through the normal engine (two Mental Wounds on an empty track).
82. Calling 1, Action dice 6, Mana 3, token on the scene: header menu → Full Manifestation. Options
    read "Beast (Rank 1: +3 burned dice, +1 Mana)". Enter: Action dice on the Beast sheet read 3,
    the caller's Mana reads 2, chat states the cost. With the Summoner Distinction: "+2 burned
    dice". With Action dice 2: refused ("burns 3 additional Action dice; has 2").
83. The Beast sheet's Wounds section is titled "Manifestation Wounds (shared track)" with five
    pips. Return (burn 1): Action dice 2 on the caller, token swaps back, chat posts the return.
    Return with 0 Action dice: refused.
84. Set the caller's Manifestation Wound track to 4 (pips on the character sheet), enter Beast:
    four pips are filled on the form. Apply Damage 3 Fire + 2 Psychic to the form (Resilience 0):
    one Fire Wound fills the fifth space, chat says 2 surplus Wounds are discarded, the form
    collapses, the caller's token returns, the caller's first open Core space fills with a
    Spiritual Wound Card ("Unmoored Essence" on an empty track), the character sheet shows five
    Manifestation pips, "Broken", and chat lists "2 Psychic" as still to resolve by hand.
85. Broken caller: Full Manifestation is refused with the Broken warning. Grant Recovery: chat
    says "1 Manifestation Wound removed", pips read 4, Broken clears, entering works again.
86. New Encounter with an active form: the caller returns with no die burned (chat says "as the
    Encounter ends"); Combo, Locks, Threads, Authority and Contingencies clear.
87. Import Familiar from the compendium: five Wound pips (was three). Play a native Action card
    with min 2 on a Rank 2 form: the prompt's minimum reads 3 (native minimum); a Reaction's
    reads 2. Type Roll Limit 5 in the header: the advisory line names it.

## 0.13.0: Content, guide, docs

88. Species compendium: Planarborn lists seven Traits including Native Motion, Planar Sense and
    Resonant Step; Aegis of Origin's sub-choice offers the twelve Damage types; Native Motion's
    offers Climb 10 / Swim 10 / Controlled gliding. Mortal-Kin's Tireless mentions twenty-four
    hours and six-hour blocks. No "scene" appears in any Trait text.
89. Character Creation Wizard: pick Planarborn, then Aegis of Origin: the Damage-type picker
    appears and the chosen type lands in the character's Resistances. Pick Keen (Mortal-Kin):
    the two-sense picker still works.
90. Distinctions compendium: Gifted's Origin Benefit reads "minimum of 0" and mentions Unstable;
    Orator's reads two results per occupied card; Summoner's reads "additional burned-die cost
    ... minimum of 0"; Athlete's reads "double your normal Movement allowance" on the first Turn.
    Athlete still carries the Resilience +1 effect.
91. Heritages compendium: Temple Raised's Sacred Trust reads "reduce that pressure by 1";
    Underworld Raised's Fence's Cache has two paragraphs about the Cached Item.
92. Conditions compendium: Catastrophic Injury, Fractured Consciousness and Severed Essence's
    Natural Recovery mention four weeks / twenty-eight qualifying days. Action Cards: Perform
    Task shows a Help section.
93. Equipment compendium: the category folders read Guard (not Shield) at the top level and under
    Chassis and Fitting. Open a melee Chassis: its fitting-category placeholder says Handling; an
    assembled melee item's parts read "Striker" and "Handling". Create a Chassis with category
    Guard from the Create Content wizard: it files into the Guard folder.
94. Player & GM Guide journal: three entries with 9, 6 and 6 pages. "Attribute Benefits",
    "Adventures & Downtime", "Enemy Construction" and "Team Tier & Economic Scale" exist; "Grade
    Budgets" replaces "Role Budget System"; the Full Manifestation Guide's cost table shows six
    Ranks and the profile table has no Wound Capacity column. Every table renders (no raw HTML).
95. Wiki (after the push in "Before starting"):
    https://github.com/COFC-Coaching/essence-foundry/wiki/V0.6-Update-Notes opens; Home carries
    the V5 notice with a link to it; the sidebar lists it first under "Essence System Rules"; the
    page's five sections render (Team Tier, Attribute benefits, Recovery, Adventure end, enemy
    construction). `design/wiki/` has been deleted from the repo afterwards.

## 0.14.0: Foundry 13 minimum, tokens, native tabs, frame

96. Setup, Systems tab: The Essence System shows compatibility minimum 13, verified 14, and the
    world launches with no compatibility warning on v14.
97. Open a Character sheet. The palette is the concept's: warm near-black ground, muted gold
    accent on the active tab underline and buttons (not bright amber), parchment-colored text,
    soft dark lines. Every tab reads clearly. Switch Foundry to the light theme (Settings,
    Configure Settings, Core, Theme): the sheet keeps the same dark look and stays readable.
    Switch back.
98. Tabs: click each of the five tabs on the Character sheet. Only that section shows and the
    tab gets the gold underline. Edit any field (submitOnChange re-renders): the same tab stays
    active and the scroll position holds. Tab onto the strip and use the arrow keys: focus and
    the active tab move. Open a second Character sheet: its tab is independent of the first.
    Lock the sheet (padlock): tabs still switch while inputs are disabled.
99. Team sheet: the same three checks for Team, Record and Charter.
100. Console: no error mentions `changeTab`, `tabGroups` or `_prepareTabs`.
101. Settings, Configure Settings, Essence System: "Character sheet artwork" shows a file picker.
    Pick any image, save. Every open Character sheet re-renders with the image showing faintly
    through the whole sheet: visible between panels, just peeking through the attribute domains,
    skill boxes, cards and tables, never competing with text. Clear the field and save: the plain
    background returns.
102. Resize the Character sheet to under about 860px wide: the layout stays one column with no
    horizontal scrollbar and no clipped content. Widen it past 1100px: still one column (the
    sidebar has no content until 0.15.0). Inspect the root in the element picker: an empty
    `aside.sheet-side.sheet-scroll` sits after `div.sheet-scroll` and is `display: none`.
103. NPC, Monster and Full Manifestation sheets and every Item sheet: open one of each. Colors match
    the Character sheet's palette; nothing is unstyled, invisible or clipped. Play a card: the chat
    card uses the same gold accent.

## 0.15.0: vitals sidebar, Core tab reorder

104. Open a Character sheet. It opens about 1080px wide. A sidebar on the right shows, top to
    bottom: Action Dice and Reaction Dice with − / + and big numbers; Resources (Stamina, Focus,
    Mana) each with − / +, an input and "/ max", labels in the domain colors; Defenses as three
    tiles (Fortitude, Composure, Harmony); Wounds with the Wound state, Resilience, Temporary
    Wounds pips and Available, Core Wounds pips, Apply Damage / Recover Wound / Grant Recovery,
    the Adaptability reroll tick; Conditions ("None" when there are none); a readout of Reach with
    Pressure, Influence (Temporary and Core) and Standing. Switch tabs: the sidebar stays.
105. Sidebar controls: − and + on Action Dice change the number; − and + on Stamina change the
    input and the chat log shows nothing unexpected; type a value into Focus and blur: it saves.
    Click a Temporary Wound pip and a Core Wound pip: they toggle and the Wound state label
    updates. Apply Damage opens the same dialog as before. Fill all five Core Wounds: the Death
    Track appears inside the Wounds panel; clear one and it goes away. Lock the sheet: the
    steppers and pips still work, the inputs are disabled.
106. Sidebar scrolls on its own: shrink the window height until the sidebar overflows; a
    scrollbar appears on the sidebar and the tab body keeps its own. Edit a field in the sidebar
    (re-render): both scroll positions hold.
107. Core tab: Attributes only in the three domain boxes (no Resource or Defense rows), then
    Resistances and Vulnerabilities, then General Features & Benefits (origin rows highlighted,
    Add Feature works, the rich-text Description field types), then Languages with its allowance
    note. No Wounds section on the tab.
108. Combat tab: the header shows only Roll Initiative, End Turn and the Turn state (and the
    prepared Action when one is held); no dice pool row; no Conditions section at the bottom.
    Non-Combat tab: Career and Key Aspects, Non-Combat Skills, Connections, Influence, Reach; no
    Languages field, no General Features table.
109. Drag a Condition from the Conditions compendium onto the sheet: it appears in the sidebar's
    Conditions panel with its sections; the pen opens it and the trash removes it.
110. Narrow the window to about 800px: the sidebar drops under the tab body, capped at 40% of the
    height with its own scrollbar; nothing overlaps. Widen past 860px: it returns to the right.
111. Console: no error whose stack names `systems/essence-system` while doing 104 to 110.

## 0.16.0: card grid, SearchFilter, severity squares

112. Combat tab: Action Cards render as a grid of small panels (two or more columns at 1080px
    wide), each with a colored rail on the left (green for Action Cards, red for Reaction Cards,
    gold for Equipment Cards), the name, a Combat Style chip colored by domain (Prowess red-orange,
    Cunning blue, Leadership purple), and "R{rank} · Min {n} · Cost {n}" on the right. The Effect
    summary sits under the name with the tags after it. A row of View, Edit, Delete and a gold
    Play button is at the bottom. Play and clicking the name both open the card play dialog.
113. Card search: type part of a card name: other cards disappear. Type a word from a card's
    Effect text: it stays. Now edit any field on the sheet (re-render): the search text is still
    in the box and the list is still filtered. Clear the box: all cards return. Sort by Skill and
    by Cost still reorders the list.
114. NPC and Monster sheets (0.16.1): plain as before. No cover art even with the Character sheet
    artwork setting filled, opaque panels, card lists as single rows without rails or a Play
    button. The Full Manifestation and Team sheets likewise.
115. Core Wounds in the sidebar show five squares lettered L L S S C (not round dots); filled ones
    are gold. Core Influence on the Non-Combat tab shows the same squares. Clicking still toggles.
116. Console: no error whose stack names `systems/essence-system` (in particular nothing about
    SearchFilter) while doing 112 to 115.

## 0.17.0: Add Condition dialog

117. Character sheet sidebar, Conditions panel: an "+ Add" button sits in the panel heading. Click
    it: a dialog "Add Condition" opens with a search box, an "Ordinary" group and a "Specialty"
    group (nine Specialty rows: Stance, Lock, Unstable, Exposed, Concentration, Strain, Rallied,
    Possessed, Broken). No Wound Card, Consequence Card or Cover Condition is listed.
118. Type "pro" in the search: only Prone (and any other match) stays; the Specialty group hides
    when it has no match. Clear the box: everything returns.
119. Click Prone: the row disables and shows "On sheet"; the sheet's Conditions panel lists Prone
    behind the dialog; the token's HUD shows the Prone icon lit. Click Dazed too without closing.
    Close: both are on the sheet. Reopen: both rows read "On sheet" and are disabled. Remove Prone
    with the trash on the sheet, reopen: Prone is pickable again.
120. Custom Condition: a "New Condition" appears in the Conditions panel and its editor opens with
    one EFFECT section. Console: no error whose stack names `systems/essence-system` during 117
    to 120.
