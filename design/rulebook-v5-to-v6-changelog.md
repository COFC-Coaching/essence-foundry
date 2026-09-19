# The Essence System — Change Log, V5 → V6 (v0.6)

Compared: `The Essence System V5.docx` (baseline) vs `Essence System V6.docx`.
V6 self-identifies as **v0.6** and flags a number of values as explicit "Playtest" placeholders.

---

## 1. Executive Summary

- **"Combat Skills" are now "Combat Styles"**, and **"Signature Loadout / Signature Limit" is now "Inventory / Inventory Limit."** These are the two biggest vocabulary changes and they ripple through every chapter, the character sheet, and the web app.
- **The Rank→Skill Dice table is gone.** V5 printed a conflicting table (Rank 0 = 2 dice, Rank 1 = 2, Rank 2 = 3 … Rank 5 = 6) alongside the formula `Attribute + Combat Style Rank`. V6 keeps only the formula and adds a **floor: a Rank 0 card's maximum rolled dice can never be below 2**. Net effect: Rank 1 characters lose a die relative to the old table; Rank 0 keeps a 2-die floor.
- **New universal rule: every Combat Card must consume at least 2 dice from the relevant Pool** as its primary commitment. No reduction, free die, or alternative payment can replace those 2 Pool dice. This retroactively constrains Psyker's *Sacrificial Power* and Summoner's *Greater Manifestation*.
- **Core Wound recovery order is reversed.** V5: "Core Wounds recover in reverse order… you cannot clear a Light Wound while a Serious or Critical Wound remains." V6: natural recovery is **independent and order-free** (any number of Wounds may clear together, gaps allowed), while **active healing removes the lowest severity first**, making Critical healing deliberately hard.
- **Wound State is now read off the highest occupied severity**, not the count of filled boxes. **The Death Track is governed by "all five Core spaces filled," not by "possessing a Critical Wound,"** with three explicit states (neither / Dying / Stabilized), a defined 0/5 activation, persistent progress, and Recovery reducing it by 1.
- **Temporary Wounds and Temporary Influence lost their hard cap of 5.** Both now have "no universal maximum"; the boxes on the sheet are a tracking convenience.
- **Influence got a third layer: Reach absorbs ordinary pressure first.** New sequence `Ordinary pressure → Reach → Temporary Influence → Core Influence`, plus a new **Influence Breach** (bypasses Reach, not Temporary Influence). V5's Standing table and fixed 1 day / 1 week / 1 month recovery schedule are gone, replaced by **Influence Consequence Cards** with per-card repair requirements.
- **Key Aspects became mechanical.** V5: "They do not possess Ranks and are not added directly to rolls." V6: `Key Aspect roll = relevant Attribute + 5`, replacing (not stacking with) a Non-Combat Skill Rank. This is the single largest non-combat buff in V6.
- **Expertises are now Rank-limited per Style** (limit = Style Rank, +1 for the Style associated with a Distinction). V5 explicitly said "There is no additional limit on how many of those Expertises may belong to the same eligible Combat Skill."
- **Four Distinction Primary Attributes swapped**: Athlete Vigor→Might, Gifted Might→Vigor, Strategist Resolve→Intellect, Psyker Intellect→Resolve.
- **Recovery is now numeric**: `Restore 25% of maximum Stamina, Focus, and Mana, rounded up` per Recovery. V5 had no number at all.
- **Consumable Kits and Function Augments no longer auto-refresh at Adventure end.** V5: "Consumable Kit Uses and Function Augment Uses refresh when the Adventure ends." V6: Kits require believable physical resupply; Function Augments follow per-Augment recovery rules.
- **Three entirely new book Parts**: Part IV Adventures/Exploration (V5's Part V was an empty "Needs Editing" stub), Part V Social Encounters (V5's Part VI was legacy draft text), and Part IX Running the Game (GM tools, enemy construction, encounter categories, boss design — nothing comparable in V5). Plus a new Part VII Advancement built around Advancement Points and a Skill Tree.
- **"Scene" was deleted as a mechanical unit.** Every per-Scene ability became per-Encounter.

---

## 2. Structural Changes

### Part map

| V5 | V6 |
|---|---|
| Foreword / Who This Book Is For / What You Need / Quick Primer (top-level headings) | Foreword (all folded under it, incl. new **The Structure of Play**: Campaign Rhythm + Adventure Rhythm) |
| Part I: Foundations (domains, forms of play, team creation, campaign start) | Part I: Foundations, renumbered into 6 chapters; adds **2. The Essence Design Philosophy** |
| Part II: Character Creation | Part II: Character Creation — same 10 steps, but **Step 5 "Combat Skills"→"Combat Styles"**, **Step 7 "Non-Combat Skills"→"Non-Combat Capabilities"**, **Step 9 "Signature Loadout"→"Inventory"**. Adds a **Starting Character Baseline** table and reference chapters (Attributes Reference, Combat Style Reference, Non-Combat Capabilities Reference, Equipment at Character Creation) |
| Part III: Playing the Game (campaign + planning + adventures + encounters + downtime, all mixed) | Split into **Part III: Campaigns** (campaign, goals, cycle, planning, adventures-at-campaign-scale, downtime, **7. Recovery**, returning to planning) and **Part IV: Adventures** (exploration, rolling, fail forward, investigation, entering encounters, resolving) |
| Part IV: Combat | **Part VI: Combat Encounters**, renumbered into 21 chapters |
| Part V: Exploration — **empty stub** | Absorbed into Part IV: Adventures (fully written) |
| Part VI: Roleplay — legacy draft (social + Influence + tier/level) | **Part V: Social Encounters** (fully rewritten); Influence rebuilt; tier/level moved to Part VII |
| Part VII: Downtime — **empty stub** | Downtime is Part III ch. 6; Advancement is **Part VII** |
| Part VIII: Equipment | **Part VIII: Equipment & Armory**, reorganized into 19 chapters |
| *(none)* | **Part IX: Running the Game** — entirely new |
| Part IX: Combat Cards (design guide) | **Appendix L: Combat Card Authoring Guide** |
| Part X: Appendices (A: Combat Skill Reference; C: Example Builds) | **Part X: Reference & Appendices, A–O** |

### Appendix restructure
V5 had Appendix A (Combat Skill Reference) and Appendix C (Example Builds) — there was no Appendix B. V6 has **A–O**: Rules Glossary, Core Timing Reference, Ordinary Conditions, Specialty Conditions, Wound Card Reference, Influence Consequence Reference, Magecraft Threads, Calling Manifestations, Basic & Species Combat Cards, Style Expertises & Subtypes, Example Starting Characters, Card Authoring Guide, Worked GM Adventure, Tier 1 Enemy Examples, Quick Reference Tables.

### Heading granularity
V5: 5,860 lines / 627 headings. V6: 3,381 lines / 906 headings. V6 is materially denser — same or more rules content in ~58% of the line count, because prose was compressed into paragraphs and tables and chapters were numbered.

---

## 3. Substantive Rule Changes by Section

### 3.1 Terminology (affects everything)

| V5 | V6 | Note |
|---|---|---|
| Combat Skill / Combat Skill Point / Combat Skill Rank | **Combat Style** / Combat Style Point / Combat Style Rank | Pure rename |
| Signature Loadout / Signature Item Limit / Signature slot | **Inventory** / Inventory Limit / Inventory capacity | Rename + real rule changes (see 3.8) |
| Species **Adaptations** | Species **Traits** | Rename; Gestalt's "Adaptation" mechanic keeps the old word |
| Construct **Module** | Construct **Species Trait** | Rename |
| **Scene** (mechanical unit) | **Encounter** | V6: "Essence does not use Scene as a formal mechanical unit." Every per-Scene ability is now per-Encounter |
| Temporary Item | Temporary Equipment | Rename |
| Non-Combat Skills (Step 7) | Non-Combat Capabilities (Step 7) | Rename |

### 3.2 Character Creation

**Unchanged baselines:** 9 Attributes all at 1 + 7 points, max 3; 5 Combat Style Points, max Rank 2; 4 Expertises; 10 additional Combat Cards; 5 Non-Combat Skill Points, max Rank 2; 1 Career + 3 Key Aspects; Reach 1; Armory Limit 8; Inventory/Signature Limit 4; Base Action Pool 5 + Tier; Resource = 2 + two highest in domain; Defense = 2 + two lowest in domain; Movement 10.

Changes:

- **Base Reaction Pool is now stated as a derived value** (`5 + Tier`) in the creation baseline and Quick Reference. V5 only mentioned it inside the combat chapter.
- **Advancement Points at creation = 0.** New: "Level 1 does not provide an Advancement Point; the first is gained when the character reaches Level 2." (V5: "Each Level grants one skill point," with no explicit Level 1 exemption.)
- **Expertise limits (new constraint / nerf).** V5: "Each Expertise must belong to a Combat Skill in which you possess at least Rank 1. There is no additional limit on how many of those Expertises may belong to the same eligible Combat Skill." V6 adds an explicit table: normal limit = Style Rank; **+1 for the Style associated with the character's Distinction**; a Distinction-granted Expertise can override the Rank 1 eligibility requirement for that Style only. At Rank 0 the limit is 0 (1 if explicitly granted).
- **Rank 0 cards are learned Style cards, not Basics.** Both editions agree Rank 0 counts against the 10 selections, but V6 states it twice more emphatically and drops V5's "Rank 0 cards… may be used even when the associated Combat Skill remains at Rank 0" phrasing in favor of the 2-die maximum floor.
- **Species Combat Cards (new).** A Species Trait may grant a unique unranked Combat Card that does **not** consume the 10 learned-card selections.
- **Temporary Wounds:** V5 "A character may possess up to five Temporary Wounds." V6: **no universal maximum**. *Buff / simplification.*
- **Core Influence severity spelled out at creation:** V6 states the 2 Light / 2 Serious / 1 Critical structure and the Reach→Temporary→Core absorption order in Step 6. V5's Step 6 described it only as "a five-space structure similar to Core Wounds."
- **Key Aspects:** see 3.6. *Major buff.*
- **Equipment at creation:** V6 explicitly says "There is no separate starting cash budget" and that **Armory 8 is the total, inclusive of the 4 prepared items** ("It is not eight reserve items plus four carried items"). V5 left this ambiguous.
- **Augments now explicitly 0 capacity in both Armory and Inventory**, stored/spare/installed. V5 said "An Augment currently occupies 0 slots" (hedged with "currently").

### 3.3 Species

Nine Species, their Natures, and all Trait names are **identical**. Mechanical changes:

- **Per-Scene → per-Encounter** on: Dreamtouched, Wild Escape, Lineage Scales, Bioluminescence, Regrowth, Unyielding Remains, Redundant Systems, True Breath, Ink Cloud, Spore Cloud. (Generally a **nerf** where a Scene was shorter than an Encounter, a buff where longer; mainly a clarification.)
- **Four Traits converted into Species Combat Cards** with explicit costs — Shaper, True Breath, Ink Cloud, Spore Cloud now each read *"Burn 2 Action dice"* and live in Appendix I. In V5 they were free passive/at-will effects ("Once per turn, you may manipulate…"). **Nerf** (they now cost dice) but with clean timing.
- **Natural Armament / Draconic Armament:** V5 required "you must leave one hand or equivalent limb free while using it." V6 replaces this with anatomy-specific requirements: claws need the limb, horns/fangs need head/mouth, a tail needs the tail. *Buff for non-claw choices.*
- **Hardy / Shell or Hide:** both now explicitly say the environmental-damage negation **does not apply to Damage with Breach**. *Clarification/nerf.*
- **Deathless Nature (regression to TBD):** V5 gave a concrete benefit — "When your Critical Wound activates the Death Track, increase its starting value by 1." V6 replaces it with "your Deathless nature gives you additional time before death. The exact Deathless Death Track modifier remains a playtest placeholder." **A working rule was replaced with an open design item.**
- **Blooming:** "Temporary Item" → "Temporary Equipment" (rename only).

### 3.4 Heritage

All 9 Heritages, Legacies, and Familiarities retained. Changes:

- **Quartermaster's Due (Warcamp Raised):** V5 granted "one Weapon, Guard, or Armor item… no more than 1 Tier higher than your Reach would normally allow," replaceable at Adventure end. V6 grants **one higher-Tier Chassis *and* one compatible Fitting**, each up to 1 Tier above Reach; the replaceability clause is dropped. *Roughly a buff (two Components), minus the swap privilege.*
- **Letters of Standing (Noble Household):** additional uses beyond the first per Adventure cost **1 ordinary Influence pressure** instead of **1 Influence Breach**. *Buff* — pressure can be absorbed by Reach; Breach cannot.
- **Prepared Cache (Frontier Household):** same change, Breach → ordinary pressure. *Buff.* Also the banned-item list changed from "Weapon, Armor, Guard, Implement, relic, or Combat Consumable" to "Weapon, Armor, Guard, Implement, Consumable Kit, or other significant Combat equipment."
- **Sacred Trust (Temple Raised):** V5 "The first time each Adventure you would take Influence Damage, you may reduce that Damage to 0." V6: "reduce that pressure by **1**." **Significant nerf** — from full negation to a 1-point discount.
- **Family Ledger (Merchant Family):** "up to your normal maximum" dropped, because Temporary Influence no longer has a maximum.
- **Inherited Tools (Artisan Household):** "Signature Loadout / Signature capacity" → "Inventory / Inventory capacity" (rename).

### 3.5 Distinctions

All 10 Distinctions and their names retained. Changes:

| Distinction | V5 Primary Attribute | V6 Primary Attribute |
|---|---|---|
| Athlete | Vigor | **Might** |
| Gifted | Might | **Vigor** |
| Strategist | Resolve | **Intellect** |
| Psyker | Intellect | **Resolve** |
| Marksman / Arcanist / Orator / Invoker / Summoner | Grace / Acuity / Presence / Adaptability / Anima | unchanged |

V6 also adds a **Power / Control / Endurance** organizing frame and a catalog design guideline: *"approximately 60% of a Style's cards should use its Primary Attribute and approximately 20% each of the other two Attributes in the same domain."* New.

Origin Benefit changes:

- **Gifted — Efficient Transformation:** V5 "Reduce the Stamina cost of Adaptation upkeep by 1, to a minimum of **1**." V6: "to a minimum of **0**," explicitly only the *upkeep* (not the cost to assume), and explicitly **does not reduce the extra upkeep from Unstable**. *Buff plus a clarifying nerf.*
- **Psyker — Sacrificial Power:** V5 "spend Temporary Wounds as though they were dice." V6 constrains this heavily: each card still must consume **at least 2 dice from its Pool**; a Temporary Wound spent for a rolled die supplies one d10 subject to the normal maximum; spent for a burned die it just pays the cost. **Nerf / disambiguation.**
- **Summoner — Greater Manifestation:** V5 "Full Manifestations cost one fewer die than normal, to a minimum cost of **2 dice**." V6: "Reduce the **additional burned-die cost** of Full Manifestation by 1, to a minimum of **0**," and explicitly does not touch the underlying Calling card's ≥2-die commitment. *Reframed; a buff at the surcharge level.*
- **Dilettante — Distinction Benefit:** V5 "Whenever you gain a Rank in a Combat Skill, also gain one **Action Card**." V6: gain one **Combat Card** (Action **or Reaction**), explicitly **including each Rank gained during Character Creation**, capped at the new Rank. *Buff + clarification.* V6 also adds an anti-abuse rule: retraining cannot repeatedly harvest Dilettante cards.
- **Second Distinction:** V5 "At Tier 3, a character may acquire a second Distinction through Advancement." V6: acquired through **an eligible Skill Tree node**, assumed gated to at least Tier 3, **not automatic on reaching a Tier**. A later Distinction also **raises its Style's Expertise limit by 1**. *Nerf/gating.*
- Marksman's Split Focus, Strategist's Branching Plans, Orator's Commanding Authority, Arcanist's Elemental Versatility, Invoker's Final Echo, and Athlete's Peak Performance are textually **unchanged**.

### 3.6 Non-Combat Resolution

Entirely new mechanical content in V6 (V5 had no non-combat roll formula at all):

- `Normal Non-Combat pool = relevant Attribute + relevant Non-Combat Skill Rank`
- No relevant Skill → roll the Attribute alone; a 1-die roll is **explicitly legal** and is called out as the exception to the 2-die floor.
- **Key Aspects: `relevant Attribute + 5`**, replacing (not stacking with) a Skill Rank. Example given: "Intellect 2, Medicine 2, and a directly applicable Key Aspect still rolls 7 dice, not 9." **Major buff.** V5 explicitly said Key Aspects "do not possess Ranks and are not added directly to rolls."
- **Career has no Rank and is never rolled.** Routine professional work requires no roll.
- **Roll the full pool** — no dice management outside combat.
- **Difficulty**: GM-set from circumstances, highest die vs Difficulty. No universal difficulty table, no separate opposed-roll subsystem.
- **No Non-Combat Surges** unless a specific ability says otherwise.
- **Cooperation: each meaningfully helping character grants 1 free die to the single lead roll.** New.
- **Fail Forward** formalized as a rule with "yes, and / yes, but" outcomes, plus "Retries Require a Changed Situation."

### 3.7 Combat

#### Entering combat / initiative
- Initiative mechanics unchanged (`1` to `5 + Tier` dice, total, cost applies only to the first Action Pool, Reaction Pool unaffected, PCs win ties).
- V5's "Nemesis enemies that share an Initiative may likewise arrange their order" is **dropped** — V6 just says "The GM resolves ties among enemies."
- **New: Unaware Reaction tax.** "When an attack or hostile effect catches a character unaware, that character may still use an otherwise legal Reaction, but must **burn 1 additional Reaction die**." The burned die isn't rolled, can't Surge, and doesn't satisfy minimums. V5 said flatly "A character cannot meaningfully target, respond to, or use a Reaction against a threat they have not detected." **This converts an absolute block into a cost — a significant buff to defenders and a nerf to ambushes.**
- **New: Joining an Ongoing Combat.** Newcomer rolls Initiative, is inserted, gets a full `5 + Tier` starting Reaction Pool, pays Initiative against their first Action Pool; nobody else rerolls or resets.
- **New: Preparation Before Contact.** "There is no free pre-buff window." A side that starts using Combat effects before contact begins Combat tracking and pays real costs. Symmetrical for PCs, enemies, and third parties.
- **New: Combat beginning inside an existing Encounter** does not restart the Encounter — once-per-Encounter abilities stay spent.

#### Rounds, turns, movement
- Start-of-Turn order is now an **explicit 4-step table** (clear Reaction Pool → reset accumulated Damage to 0 → form Action Pool → resolve start-of-Turn effects), with a note that start-of-Turn Damage lands in the *new* interval.
- End-of-Turn Reaction Pool formula unchanged: `5 + Tier + unused Action Dice`.
- **New: Simultaneous Effects** — the active character orders same-timing effects, but cannot move an effect across a timing boundary.
- **Difficult Terrain is now numeric:** "costs **double** Movement. Crossing 1 unit therefore costs 2 Movement." V5 deferred to an unwritten keyword.
- **Forced movement expanded:** now explicitly triggers movement/entry effects unless the effect requires voluntary movement; stops at obstructions; **ordinary collision causes no inherent Damage** unless a Throw/Launch says so. New.
- **Units defined:** 1 unit = 1 hex, informally ~5 feet. V5 offered hex/square/**1 inch gridless**; V6 drops the inch equivalence.

#### Cover (new)
V5 had essentially no Cover rules. V6 adds:

| Cover | Benefit |
|---|---|
| Low Cover | +1 Fortitude against the relevant obstructable attack |
| High Cover | +2 Fortitude against the relevant obstructable attack |

Plus: creatures do not provide Cover by default; Cover modifies **Fortitude only**, not Composure or Harmony; the source of an attack (magical vs mundane) does not determine whether Cover applies.

#### Basic Combat Cards (new, printable)
V5 said only "The final Basic set includes ordinary capabilities such as making a basic attack, moving aggressively through a Dash…; the exact cards are authoritative once finalized." V6 names and stats them in Appendix I: **Basic Melee Attack, Basic Ranged Attack, Defend, Dash, Reconfigure, Stabilize** (all playtest). Two carry explicit costs:

- **Reconfigure — Burn 3 Action dice.** Swap one complete prepared combat item, or exchange one installed Augment or one combat-replaceable Fitting.
- **Stabilize — Burn 3 Action dice while adjacent**, satisfying the Critical Wound Card's treatment requirements; succeeds automatically; heals nothing, no Surges.

#### Dice, cards, costs
- **Minimum Card Commitment (new, universal):** every Combat Card — ranked, Basic, or Species — must consume **at least 2 dice** from the appropriate Pool. Nothing can substitute for those two. Rider costs, Surge costs, and Full Manifestation's surcharge are secondary and *may* be reduced to 0.
- **Maximum rolled dice:** `Attribute + Combat Style Rank`, unchanged — but the V5 Skill Dice table (Rank 0/1 = 2, 2 = 3, 3 = 4, 4 = 5, 5 = 6) is **removed**, and a **Rank 0 floor of 2 maximum rolled dice** replaces it. Rank/minimum-dice benchmarks (0:2+, 1:2+, 2:3+, 3:4+, 4:5+, 5:6+) and Expertise structures (0:none, 1–2: 1 of 2, 3–4: 2 of 3, 5: 3 of 4) are unchanged.
- **Free Dice (new named concept):** rolled without leaving the Pool, **may exceed the normal maximum**, can become the Success Die or generate Surges, but never satisfy a minimum commitment.
- **Cooldowns (new):** cards are available whenever requirements are met unless printed otherwise; a cooldown starts when the card is *played*, even if it fails or is interrupted, and belongs to the technique (a second printed copy doesn't bypass it).

#### Resolution order (materially changed)
V5's sequence rolled dice, determined the Success Die, then resolved Reaction windows before the effect. V6 makes the informed-defense model explicit and moves Surge purchasing earlier:

> Declare → choose/commit dice → pay all costs → **roll immediately** → identify Success Die → generate and add free Surges → **purchase Surge options** → **then** open and resolve the Reaction chain → then resolve the card's effect and Rider.

"The chosen dice, paid costs, rolled results, Success Die, and purchased Surges are therefore known to eligible defenders before the triggering card resolves." Also new: **all costs remain spent** on failure, interruption, or lost target; **a target that became invalid means automatic failure against that target**.

#### Success and Surges
- **New: Opposed vs Unopposed cards.** Unopposed cards auto-succeed; **no die is reserved as the Success Die, so every rolled 6+ generates a Surge.** (V5 mentioned unopposed rolls only in the design guide.)
- **New: "A natural 10 is not an automatic success."** If the final required Defense is above 10, an unmodified d10 cannot beat it.
- **New: tied-high dice** — the non-chosen tied dice **remain eligible to generate Surges**. V5 only said "choose one of them to be the Success Die."
- **New: Surge options are once per use** unless explicitly repeatable.
- **New: Surge scope** — a Surge improvement applies to **every** successfully affected target unless narrowed by its text.
- Mastery (1 free Surge for exceeding the Expertise requirement, non-scaling) is **unchanged**.

#### Reactions
- **V5: "one Reaction per Action."** **V6: "one response per *chain*."** "If you react to an Action and another character reacts to your Reaction, you cannot react again inside that same chain." **Nerf** — V5 explicitly allowed a new trigger to grant you another Reaction; V6 closes that.
- Reactions are now **played using the full Action commitment sequence** (declare, pay, roll immediately, purchase Surges), so their results are known before anyone responds.
- **New: Invalid Targets** — a Reaction that makes a target illegal causes the original card to fail against that target; Damage already suffered is not undone.
- Declaration in Initiative order / resolution in reverse order, and card-specific Interrupts, are **unchanged**.

#### Rules priority (new section)
Specific overrides general only in the area addressed; **prohibitions override permissions**; independent clauses resolve independently; costs are not optional; **fractions round up by default**.

#### Damage
- Damage domains and the 12 types are **unchanged** (Physical: Bludgeoning, Piercing, Slashing, Fire, Cold, Lightning, Acid, Force; Mental: Psychic, Arcane; Spiritual: Radiant, Necrotic). "Damage types do not automatically cause Conditions" is unchanged.
- **New: Resistance and Vulnerability values** — Resistance reduces applicable incoming Damage by **2** (min 0); Vulnerability increases it by **2**. Applied **before** Resilience or Breach. **Breach bypasses Resilience, not Resistance.** V5 had no numeric rule for either.
- **New Resilience procedure for mid-interval changes:** `Remaining protection = current Resilience − accumulated ordinary Damage, minimum 0`. A Resilience change never creates or removes Wounds retroactively. V5's simpler "damage beyond Resilience causes Wounds" produced ambiguity when Resilience changed mid-interval.
- **New: Mixed-Domain Damage** assignment cycle — `Spiritual → Mental → Physical → repeat`, skipping absent domains.
- V5's flavor guidance ("most ordinary damaging Actions deal approximately 1 or 2 Damage; three or more should feel dangerous") is dropped from the Damage chapter; the pacing guidance now lives in the GM Part.

#### Wounds — the biggest mechanical change set
| Topic | V5 | V6 |
|---|---|---|
| Core Wound track | 2 Light / 2 Serious / 1 Critical, filled strictly in order, "you cannot normally skip spaces" | Same structure, but **fill the earliest *available* empty space, skipping occupied ones** — recovered gaps absorb future Wounds |
| Wound moves on heal? | Implicit re-ordering | Explicit: **"The Wound keeps the severity of the space it entered. It does not move to another space as other Wounds heal."** |
| Wound State | By **count**: 0 Unharmed, 1–2 Lightly, 3–4 Seriously, 5 Critically | By **highest occupied severity**: None / Light / Serious / Critical |
| Natural recovery order | **"Core Wounds recover in reverse order. The most severe currently marked Wound must be recovered before a less severe Wound beneath it."** | **Order-free.** "Any number of eligible Wounds may clear together, regardless of severity or track order. Other Wounds remain where they are; gaps are allowed." |
| Active healing order | Not distinguished from natural recovery | **Lowest-severity first** (Light before Serious before Critical) — "a character with a full track must normally clear the two Light and two Serious Wounds before active healing reaches the Critical Wound" |
| Recovery timing | "Detailed recovery times appear in Part VII" (Part VII was empty) | Light: appropriate Recovery with care. Serious: post-Adventure Downtime. Critical: extended care, duration TBD |
| Wound Conditions | "Wound Condition" produced by each Core Wound | Now delivered by a **Wound Card** (severity + domain, type-specific variants possible); nine baseline fallback cards printed in Appendix E |
| Temporary Wounds max | 5 | **No universal maximum** |
| Breach vs Temp Wounds | Breach does not bypass Temporary Wounds | Unchanged |

**Fallback Wound Cards (new, Appendix E):** Physical Light = Movement −1; Physical Serious = Movement −2 + first Physical Action/Reaction costs 1 extra burned die; Physical Critical = halve Movement (round up) + all Physical Actions/Reactions cost 1 extra burned die. Mental line uses −1 / −1 / −2 Composure with the same burned-die escalation; Spiritual line uses −1 / −1 / −2 Harmony.

#### Death Track
| Topic | V5 | V6 |
|---|---|---|
| Trigger | "Filling the fifth Core Wound makes the character Critically Wounded and activates the Death Track" | Governed by **all five Core spaces filled**, "not merely by whether the character possesses a Critical Wound" |
| States | Active / frozen by treatment | **Three explicit states**: neither Dying nor Stabilized / Dying / Stabilized |
| Activation value | Unstated | **0/5**; filling the last space does **not** also advance it; first automatic advance at the start of the next Turn |
| Advancement | +1 at start of each Turn; +1 per additional Wound while Critically Wounded | Same, plus: an extra Wound while **Stabilized** both advances the track and **ends Stabilization** |
| Removing a Wound | Unstated | **Removing any Core Wound immediately stops automatic advancement.** Recorded progress persists; **removing the Critical Wound resets the track to 0** |
| Recovering progress | No rule | **A non-Dying character reduces the Death Track by 1 per appropriate Recovery**; a Stabilized full-track character qualifies |
| Stabilization | "Treatment can freeze the Death Track" | Formal **Stabilize** Basic Action (burn 3 Action dice, adjacent, meet the Critical Wound Card's treatment requirements, auto-succeeds) |
| Deathless | +1 to starting value | **Placeholder, value TBD** |

#### Conditions
- **New: explicit stacking rules.** Different named effects stack; the same named ordinary Condition does not, and reapplication **refreshes duration rather than increasing magnitude**.
- **New: "Participation" principle** — Essence avoids ordinary Conditions whose main effect is skipping a Turn.
- **New: a printed ordinary Condition catalog** (Appendix C) with playtest numbers: Blinded, Burning (1 Physical Fire Damage at start of Turn; burn 2 Action dice to extinguish), Dazed (first Action/Reaction each Turn costs 1 extra burned die; **never prevents acting**), Immobilized, Prone (standing costs 2 Movement; doubled movement; +1 Fortitude vs ranged physical, −1 vs adjacent physical), Restrained (−1 Fortitude), Silenced, Weakened (−1 Damage, min 0). V5 had none of these written.
- **New: Hidden and unaware are information states, not Conditions.**
- The nine Specialty Conditions and their Style pairings are **unchanged**, but V6 writes full rules for each (Appendix D) where V5 deferred them all to an unwritten reference.

#### Combat Styles
All nine Styles, their Specialty mechanics, Specialty Conditions, Expertise names (7 per Style), and subtype families are retained. Notable changes:

- **Ballistics — Lock:** V5 ended Lock if the target "remains completely outside your line of sight through the end of your Turn." V6 makes it **detection-based** (special Senses can maintain it through visual concealment) and adds "Lock never reveals a Hidden creature or supplies missing targeting information." Marksman's two-Lock benefit is now named in the Style text.
- **Gestalt — Adaptation:** V6 clarifies upkeep is paid **at the end of the Turn the Adaptation is first assumed** and each later Turn, and that if several are assumed in one Turn you pay upkeep only for the one you keep. Adds the Gifted −1 upkeep interaction and the Unstable carve-out.
- **Cunning — Contingency:** V6 adds an explicit **"trigger one Contingency each Round"** limit alongside V5's "establish one each Round," and confirms resolving a Contingency **does not consume your response in a Reaction chain**.
- **Magecraft — Threads: entirely new numeric content.** V5 listed 10 subtypes in 4 families and said the Thread rider was fixed, but never printed what any Thread does. V6 prints the full table: Fire +1 Damage; Water move 2 units; Earth +1 Fortitude; Air +2 Range; Time extend one effect by one Turn; Space +1 unit radius/length; **Light +1 to the Success Die (can exceed 10)**; Shadow −1 to an enemy's next Success Die; Aether −1 Focus cost (min 0); Chaos reroll one rolled die. Also new: a Thread **cannot strengthen the Action that created it**; duplicates allowed; Thread effects **stack**; consumed Threads are spent even if the card fails; Earth/Shadow explicitly combine magnitudes.
- **Psionics — Strain: entirely new numeric content.** V5 deferred all thresholds. V6: 0–2 no penalty; 3–4 **−1 Composure**; 5–6 **−1 Composure + 1 additional burned die on Psionics cards**; hard cap **6**; forced Strain past 6 causes **1 Psychic Breach Damage per excess point**; new relief valve — burn 2 Action dice to remove 2 Strain (forfeiting Psionics Actions for that Turn); **Recovery clears remaining Strain**.
- **Leadership — Authority (nerf + clarification).** V5: "roll all dice committed to it, **including dice that would normally have been burned without being rolled**," then store one result. V6: **"Burned dice and fixed substituted results are not actual rolled dice and cannot become new Authority."** Also new: spending Authority **still removes the die from the Pool and pays the full dice cost** — it substitutes the *result*, not the cost — and the substituted die counts toward the 2-Pool-dice floor. Capacity table printed: Rank 0–2 → 1, Rank 3–4 → 2, Rank 5 → 3.
- **Ritualism — Rites:** V6 adds that a triggered **Echo is mandatory** unless the Rite says otherwise, that several Rites can respond to the same event, and that one Action can trigger the same Rite repeatedly if the wording and remaining Echoes allow it.
- **Calling — Full Manifestation: the largest single rewrite in the book.** V5 gave ~20 lines. V6 gives a full subsystem:
  - **Entry cost table** by manifestation Rank: additional burned dice 3/3/3/4/4/5 and additional Mana 0/1/2/3/4/5 for Ranks 0–5.
  - **Native minimum dice** table: Actions 2/2/3/4/5/6, Reactions 2/2/2/2/3/3.
  - The form uses a **printed Roll Limit** in place of `Attribute + Style Rank`, and uses the **caller's existing dice Pools** — it gets no separate Stamina/Focus/Mana.
  - **The Absent Caller:** the caller's Conditions, Wounds, Death Track, upkeep and durations **pause** (and do not heal); external effects like zones and Rites continue.
  - **Maintenance: burn 1 Action die at the start of each subsequent Turn** to remain manifested (not on the Turn it appears); burn 1 to return voluntarily. V5 had no upkeep.
  - **Shared Manifestation Wound track:** V5 said a manifestation "possesses its own Wound Track." V6 gives **one shared five-space Manifestation Wound track across all of the character's manifestations**, persisting between manifestations and Adventures.
  - **Manifestation defeat is now brutal and explicit:** filling all five spaces collapses the form and **the caller directly suffers 1 Spiritual Core Wound that bypasses Resilience, Resistance, Temporary Wounds, and any prevention/redirection effect.** V5 only said "the bond suffers a serious disruption and the character may become Broken." **Major nerf.**
  - **Broken redefined:** V5 "prevents access to the affected manifestation family." V6: prevents **Full Manifestation** entirely but **ordinary Calling Actions/Reactions remain available**; removing one Manifestation Wound ends Broken. **Each Recovery removes 1 Manifestation Wound.**
  - Manifestation families by Rank are **unchanged** (Familiar/Sprite → … → Outsider/Titan/Primordial), but the numeric profile blocks are flagged as still missing.
- **Subtype families normalized.** V5's Appendix A contained a *different, seven-entry* subtype list per Style than V5's own Part IV body text (e.g. Prowess Appendix A: Opener/Blitz/Chain/Maneuver/Stance/Breaker/Finisher/Reaction; Prowess body text: Opener/Blitz/Finisher/Breaker/Guard). **V6 resolves the contradiction by keeping the five-family body-text set** (Appendix J) and dropping the seven-subtype variant and the "universal Reaction subtype." Magecraft's subtypes are now simply the ten Threads; Calling's are the manifestation families.

### 3.8 Equipment & Armory

- **Armory 8 / Inventory 4 baseline unchanged.** Capacity costs unchanged: complete item 1, Toolkit 1, Consumable Kit 1, loose Chassis ½, loose Fitting ½, Augment 0.
- **New: "used vs unused" preparation commitment.** This is the central new equipment rule. Prepared-but-**unused** equipment's allocation can be transferred to an equal-capacity replacement when the character regains Armory access; **used** equipment's allocation stays committed for the rest of the Adventure "even if stored, lent, depleted, lost, or replaced." Wearing armor in a fight counts as used even if nothing hits it. Explicit purpose: stop players cycling exhausted consumables and defensive gear through one small allowance.
- **Preparing beyond the Inventory Limit — changed cost model.** V5: "Spend **1 Temporary Influence** for each additional full Signature slot." V6: excess capacity (rounded up **on the total**, not per half-item) generates **ordinary Influence pressure**, resolved Reach → Temporary Influence → Core Influence. **Buff** — Reach can now absorb it — and a change in accounting (4.5 supported capacity = 1 pressure; 5.5 = 2).
- **New: another character can pay the support cost** for someone else's preparation, using their own Reach/Influence; the capacity still belongs to the owner.
- **New: Lending and Sharing Equipment chapter** — lending doesn't create a second allocation, item state (Uses, cooldowns, damage) travels with the physical item, and lending **cannot be used to launder an Armory item into Temporary Equipment**.
- **New: Armory access vs supplier access are distinct.**
- **Temporary Equipment:** V5 said it "does not automatically consume permanent Armory capacity while the Adventure is underway." V6 makes it categorical — **neither Armory nor Inventory capacity** — adds that purchase does not make an item prepared Inventory, that it can be used and swapped via Reconfigure without becoming an allocation, and that **found enemy equipment actually exists after the Encounter**.
- **New: "Exceptional Loot Does Not Charge Rent."** Earned/found equipment above your Reach carries no ongoing Reach or Influence surcharge; Reach governs ordinary *acquisition*, not possession.
- **New: "Selling Does Not Create Universal Interchangeability."** A Tier 4 weapon is not a coupon redeemable for any other Tier 4 item.
- **Reconfiguration costs changed (nerf).**

| Change | V5 | V6 |
|---|---|---|
| Swap an installed Augment | **Burn 1 Action die** | **Reconfigure: burn 3 Action dice** |
| Simple Fitting change | ~1 Action die | Reconfigure: burn 3 Action dice (combat-replaceable Fittings only) |
| Structural Fitting change | ~3 Action dice | Out of combat only |
| Swap a complete weapon/Guard/Implement | (no explicit rule) | Reconfigure: burn 3 Action dice |
| Chassis change | Recovery/Downtime/sufficient time | Outside Combat with suitable time and access; **does not require Recovery or Downtime** (*buff*) |
| Link toggle | "extremely fast," with full Link Off/Link On rules | **Deferred** — "The current v0.6 core rules do not assign a universal Link-toggle cost" |

- **Function Augment Uses (nerf).** V5: "Unless stated otherwise: Function Augment Uses **fully refresh at the end of the Adventure**." V6: "There is no universal rule that every Function Augment fully refreshes whenever the Team rests" — each Augment states its own recovery.
- **Consumable Kits (nerf).** V5 refreshed Uses at Adventure end alongside Augments. V6: "Recovering or ending an Encounter does not magically refill them… Replenishment requires believable access to the materials, services, or stock." Resupply restores the Kit's Uses **as a whole**, not per-Use. New: **multiple copies each cost their own capacity, and a used copy's Inventory allocation stays committed.**
- **New: Augment Uses are attached to the physical Augment** — moving, lending, uninstalling or reinstalling never refreshes them; carrying spares lets you switch among remaining Uses, not reset them. Also: **no capacity-based limit on the Augment collection or on carried spares.**
- **New: "No Overall Tier for a Complete Modular Item."** Chassis and Fitting each keep their own Tier; never average them. V5 didn't say this.
- **Tier meanings (1 Routine, 2 Specialized, 3 Significant, 4 Exceptional, 5 Unique) and "no universal character-level requirement" are unchanged.** Chassis/Fitting naming per category is unchanged (Striker/Handling, Launcher/Payload, Shell/Rigging, Guard/Handling, Focus/Interface), though V6 renames two for disambiguation: **"Guard Chassis"** (vs the Prowess Guard subtype) and **"Implement Focus"** (vs the Mental Resource Focus).
- **Ranged ammunition explicitly abstracted** ("Essence does not normally count individual arrows, cartridges, bolts, shots"). New.
- **Toolkits: "not a generic +1 die"** — they change what is attemptable and how risky, and **have no Uses**. V5 was vaguer.
- **Equipment Cards:** new explicit rule that a rule requiring a *Combat Card* does not automatically apply to an *Equipment Card*, and that Equipment Cards do not require Expertises, count as learned cards, carry a Style Rider, or gain Mastery.
- V5's Melee/Ranged/Armor/Guard/Implement detail chapters (Edge/Point/Impact Strikers, Handling/Launcher/Payload/Shell/Rigging descriptions) are compressed into one short Equipment Categories chapter; the actual catalog is explicitly deferred to a companion reference that V6 says must be re-synchronized before it becomes authoritative.

### 3.9 Influence & Social

- **Three-layer model (new).** `Reach → Temporary Influence → Core Influence`. **Reach is now an active absorber of accumulated ordinary pressure**, not just an access gate. V5 had two layers (Temporary → Core) with Reach used only for access scale.
- **Reach is not spent** — you track accumulated pressure against it, and pressure **resets at a story beat, most commonly the end of an Adventure**, not on rest. New.
- **Influence Breach (new mechanic, mirroring Damage Breach).** `Influence Breach → Temporary Influence → Core Influence` — bypasses Reach but **not** Temporary Influence, so a character can still "buy their way out." Reserved for consequences that are *harmful* rather than merely *expensive*.
- **Temporary Influence:** cap of 5 **removed**; explicitly "does not refill through Recovery or merely because an Adventure ends."
- **Core Influence:** severity structure (2/2/1) unchanged; **Influence Consequence Cards** replace V5's generic "Influence Cards," with baseline fallbacks printed in Appendix F (Light: Reach −1 in one sphere; Serious: Reach −1 generally + one blocked relationship; Critical: Reach cannot absorb pressure in the collapsed sphere at all + a major access loss).
- **V5's fixed recovery schedule is deleted:** "Minor/Light = 1 day, Major/Serious = 1 week, Critical = 1 month." V6: "Essence does not use a universal day, week, or month schedule" — each Consequence Card defines its own repair. *More work for the GM; less arbitrary.*
- **V5's "Standing by Injury State" narrative table is deleted** (replaced by the Consequence Cards' explicit mechanical effects).
- **V5's "Collaborative Influence Pooling" is replaced** by "Sharing Influence and Support": Essence **does not use a pooled Team Influence track** and **characters do not add their Reach together**. Costs apply to whoever actually provides the support. V5's rule that contributing beyond your Temporary Influence causes a Core Influence Injury is preserved in spirit but re-expressed.
- **V5's "Creative Applications" (Bribery / Infrastructure Development / Downtime Trading) and "Progression: How Influence Grows"** are cut; V6 covers earning Temporary Influence in one short section plus the GM Rewards chapter.
- **New: "Specific Favors Can Remain Specific"** — not every favor should become generic Temporary Influence.
- **New: Leverage, Offers, and Favors chapter** — "Influence is not a persuasion score"; leverage must change the other party's decision; **"NPCs Are Allowed to Say No"**; **"There Is No Universal Persuasion Roll"**; **"Relationships Are Not Hidden Scores"** (no friendship/loyalty meter); Authority has jurisdictional limits.
- **New: Social Encounter structure** — no default turn order, explicit stakes, social→combat and combat→social transitions **within the same Encounter** (once-per-Encounter abilities do not refresh).
- V5's Part VI social draft (Initiative/turn order in social scenes, "Action Cards in Social Encounters" dual-functionality flavor text, "Encouraging Immersion") is **entirely replaced**.

### 3.10 Campaign, Adventure, Recovery

- **Recovery gets a chapter and real numbers (new).**
  - `Restore 25% of maximum Stamina, Focus, and Mana, rounded up` per Recovery. Worked example: max 9/7/6 → recover 3/2/2.
  - **One fictional opportunity = one Recovery**; you cannot subdivide a rest into several.
  - Recovery **reduces the Death Track by 1** (non-Dying, including Stabilized full-track characters).
  - Recovery **clears Psionic Strain** and **removes 1 Manifestation Wound**.
  - Recovery restores **no** Temporary Wounds, **no** Temporary Influence, does **not** clear Core Influence, does **not** reset Reach pressure, and does **not** refill Consumable Kits.
  - Downtime may contain several Recoveries; the GM may summarize them.
- **"Session Breaks Are Not Recovery"** (V5) is preserved as **"Sessions Are Not a Game-World Unit."**
- **New: "Used Equipment Remains Committed"** and **"What an Adventure Ending Actually Resets"** at the campaign scale.
- **Planning chapter** largely preserved but tightened; V5's "Choosing the Size of the Adventure," "Learning Versus Planning," and "Preparing Equipment" become "Planning Versus Exploration" and "Prepare Inventory," with new explicit framing: **"Planning Is Not an Expenditure Phase."**
- **Exploration (Part IV) is entirely new written content** (V5's Part V was an empty stub): exploration as a connective web, when to roll, "Do Not Roll for Routine Competence," one roll = one meaningful question, obvious information is free, essential clues must move the Adventure, hazards create pressure through decision points not repetition, **"Utility Use Is Not Free Pre-Combat Setup,"** reconfiguration and Armory access during an Adventure, and retreat/avoidance.
- **Advancement (Part VII) is entirely new written content** (V5 had ~15 lines in the middle of Part VI):
  - **5 Tiers × 10 Levels**; Tier 5 Level 10 is the intended ceiling. (Same as V5.)
  - **`Advancement Points = (Tier − 1) × 10 + (Level − 1)`**, so Tier 1 Level 1 = 0 and Tier 5 Level 10 = 49. New formula; V5 implied 1 point per Level with no explicit Level 1 exemption.
  - One Advancement Point unlocks **one Skill Tree node**; nodes may grant Attributes, Style Ranks, Expertises, Cards, Non-Combat Skills, Passive Features, **Resilience, Reach, Inventory/Armory capacity, a second Distinction**, or other lasting benefits.
  - **Attributes range 1–5** through advancement (creation cap of 3 is a starting cap only). New explicit statement.
  - **"Advancement Is Not Recovery"** — leveling restores nothing.
  - **Tier automatically increases only the Action/Reaction Pools plus baseline Reach and equipment capacity**; the exact Reach/Inventory/Armory-per-Tier numbers are **explicitly unfinalized**. V5's table said Tier modifies Reach, Signature Equipment count, and dice pools — also without numbers.
  - **Tier does not increase Stamina/Focus/Mana** (Attribute formulas only). Preserved from V5, now stated more forcefully.
  - **New: Retraining rules** (legal build, same total AP investment, prerequisites must stay legal, cannot harvest one-time benefits, origin choices excluded, retraining is not recovery).
  - **New: Higher-Tier Character Creation procedure** — build at Tier 1 Level 1, reconstruct a legal AP path with prerequisites and Tier gates respected, recalculate derived values, **choose equipment last**.
  - **The Skill Tree itself is deliberately not defined** in v0.6.

### 3.11 Running the Game (Part IX) — entirely new

Nothing in V5 corresponds to this. Notable hard numbers:

- **Combat Encounter categories:** Minor 1–2 Rounds, Severe 2–3, Critical 3–5, Boss usually 3–5.
- **Enemy Wound baselines:** Mook **2**, Normal **4**, Elite **5**.
- **Simplified enemy Wounds:** enemies do **not** use Light/Serious/Critical spaces, Wound Cards, Wound State, or the Death Track. Filling capacity = **Defeated** (not automatically dead).
- **Enemies do not need Stamina/Focus/Mana pools**; use per-Combat limits and cooldowns.
- **Six enemy Roles** (Defender, Striker, Controller, Blaster, Skirmisher, Support) and **three Elite sub-roles** (Champion / Leader / Solo). Champion is ordinary Elite; Leader and Solo define Boss encounters.
- **Solo bosses keep the standard 5 Wound capacity** — extra durability is explicitly not the answer; use action-economy tools and phases. Phases must not refill the Wound track.
- **Support enemies should not heal Wounds** — "Healing is intentionally rare in Essence."
- **Enemy Defenses above 10 should be temporary or exceptional, not routine.**
- **Tier 1 party sanity check:** a five-character Team producing roughly **15 meaningful Actions and ~15 points of Damage in a productive Round** is the rough playtest reference.
- **Adventure combat planning baseline:** Short ≈ 1–2 meaningful combats, Medium ≈ 2–4, Long ≈ 4–6+, with Recovery as the primary divider rather than a per-fight budget.
- Plus: adventure design checklist, exploration-as-a-web node design, social encounter checklist, improvisation/adjudication rules, "Do Not Give Free Versions of Existing Paid Abilities," rewards categories, tactical transparency recommendations, and a **Playtest Priorities** list of what to record.

---

## 4. New Content in V6 (not present in V5)

**Whole Parts / appendices**
- Part IV: Adventures (Exploration) — V5's Part V was an empty stub
- Part V: Social Encounters — replaces V5's legacy Part VI draft
- Part VII: Advancement — replaces ~15 lines in V5
- Part IX: Running the Game — no V5 equivalent
- Appendix A: Rules Glossary
- Appendix B: Core Timing Reference (step-by-step sequences for non-combat rolls, entering combat, start of turn, playing a card, reaction chains, damage/wounds, breach, dying, influence pressure, recovery, inventory commitment)
- Appendix C: Ordinary Conditions (with numbers)
- Appendix D: Specialty Conditions (full rules for all nine)
- Appendix E: Wound Card Reference (nine fallback cards)
- Appendix F: Influence Consequence Reference
- Appendix G: Magecraft Threads (all ten effects)
- Appendix H: Calling Manifestations (shared rules, entry cost table, families)
- Appendix I: Basic and Species Combat Cards
- Appendix M: Worked GM Adventure (9-step example)
- Appendix N: Tier 1 Enemy Examples (9 stat blocks: Mook Skirmisher/Support, Normal Defender/Striker/Controller/Blaster, Elite Champion/Leader/Solo)
- Appendix O: Quick Reference Tables

**New rules**
- Minimum 2-die Pool commitment on every Combat Card
- Free Dice as a named concept
- Cooldowns / card availability
- Cover (Low +1 / High +2 Fortitude)
- Resistance / Vulnerability ±2
- Unaware Reaction tax (+1 burned Reaction die)
- Joining an ongoing Combat; Preparation Before Contact ("no free pre-buff window")
- Opposed vs Unopposed cards; "a natural 10 is not an automatic success"
- Rules Priority section (prohibition beats permission; round up by default)
- Simultaneous effect ordering
- Mixed-Domain Damage assignment cycle
- Resilience "remaining protection" procedure
- Stabilize and Reconfigure as costed Basic Actions
- Death Track: three states, 0/5 activation, persistence, Recovery reduction
- Active healing vs natural recovery distinction
- Non-Combat roll formula, Key Aspect = Attribute + 5, cooperation free dice, Fail Forward, Difficulty guidance
- Influence: Reach as absorber, Influence Breach, Consequence Cards, no Reach pooling
- Inventory used/unused commitment; equipment support pressure; lending rules
- Advancement Points, Skill Tree framework, retraining, higher-Tier creation
- Species Combat Cards
- Distinction Primary Attribute 60/20/20 card-design guideline
- Enemy construction, roles, boss structures, encounter categories, adventure pressure budgeting

---

## 5. Removed Content (in V5, cut from V6)

- **The Combat Skill Rank → Skill Dice table** (Rank 0/1 = 2 dice, 2 = 3, 3 = 4, 4 = 5, 5 = 6). Replaced by `Attribute + Style Rank` with a Rank 0 floor of 2.
- **The "Scene"** as a mechanical unit of time. All per-Scene abilities converted to per-Encounter.
- **Hard caps of 5** on Temporary Wounds and Temporary Influence.
- **Reverse-order Core Wound recovery** ("the most severe currently marked Wound must be recovered before a less severe Wound beneath it").
- **Count-based Wound State** (1–2 Lightly, 3–4 Seriously).
- **Deathless "+1 Death Track starting value"** — replaced with an unfinalized placeholder.
- **Universal Adventure-end refresh** for Consumable Kit Uses and Function Augment Uses.
- **1-Action-die Augment swap** and the ~1/~3 die Fitting-change tiers.
- **Linked Mount rules** (Link Off / Link On / Changing a Link / "Links Are Optional" — four V5 sections) — deferred to a future higher-Tier option with no assigned cost.
- **Influence recovery schedule** (1 day / 1 week / 1 month by severity).
- **"Standing by Injury State"** narrative table.
- **"Collaborative Influence Pooling"** (replaced by explicitly *non*-pooled sharing rules).
- **"Creative Applications" of Influence** (Bribery / Infrastructure Development / Downtime Trading and Crafting) and **"Progression: How Influence Grows."**
- **"Roleplaying Recovery"** — the list of suggested downtime activities per severity tier.
- **V5 Appendix A's alternate seven-subtype-per-Style catalog** and the universal "Reaction" subtype (63 Action Subtypes + shared Reaction → 45 subtype families).
- **V5 Appendix C's ten example builds** (Warrior, Knight, Dancer, Scoundrel, Tactician, Spy, Bard, Zealot, Emissary, Blaster Mage). V6 explicitly declines to import them: *"they use obsolete starting allocations, obsolete Combat Skill terminology, illegal Rank 3 starting values, and older equipment assumptions."* Replaced by a build-target table and a validation checklist.
- **V5's per-category equipment detail chapters** (Striker Edge/Point/Impact, Handling, Launcher, Payload, Shell, Rigging, Guards, Implements, Toolkits, Consumable Kits as separate chapters; Equipment Appearance; Naming Equipment; Physical Carrying; Spare Components) — compressed into Part VIII chapters 9–12, with the item catalog deferred to a companion reference.
- **"Encounter Forms Can Change" / three Encounter forms (Combat, Exploration, Roleplay)** as a formal taxonomy — V6 instead treats Exploration as connective tissue and recognizes only Social and Combat Encounters.
- **Nemesis enemies** — the term appears only in V5 (Initiative ties). V6 uses Mook/Normal/Elite and Champion/Leader/Solo.
- **One-Scene / Multi-Scene Encounters** chapters.
- **"Adventure-Limited Abilities"** as a standalone section (folded into Recovery with stricter rules).

---

## 6. Wording / Formatting-Only Changes

These are pervasive and not enumerated. The dominant pattern is that V5's one-sentence-per-line, bullet-heavy prose was rewritten into compact paragraphs and tables. Two representative examples:

- V5: *"A domain's maximum Resource equals: 2 + the two highest Attributes in that domain"* (as a standalone block) → V6: *"Maximum Resource = 2 + the two highest Attributes in that domain"* inline. Same rule.
- V5 Prowess Expertises were nine bulleted lines with em-dash glosses; V6 Appendix J presents the same seven Expertises as `Name. Description.` sentences with slightly expanded scope text. No mechanical change.
- Species flavor text is byte-identical in most cases apart from whitespace (e.g. `Movement: 10 units Senses: Normal` vs `Movement: 10 units    Senses: Normal`).
- Second-person player voice ("your character") is frequently converted to third person ("the character") in reference chapters.

---

## 7. Website / App Impact

Repo scanned: `C:\Users\shane\Downloads\Essence System\_repo` (pnpm monorepo; `artifacts/essence-system` is the web app, `artifacts/mobile` the Expo app, `artifacts/api-server` the API, `lib/db` the Drizzle/Neon schema). `node_modules` excluded.

Note on the DB: `lib/db/src/schema/character-sheets.ts` stores sheets as a single `jsonb('data')` column, so **no SQL migration is required for most of these** — the work is in the TypeScript models, validators, option data, and the mirrored rules markdown. `combat_cards` does have a typed `skill text` column that carries the old "Combat Skill" naming.

### 7.1 Substantive changes WITH matching app code

| V6 change | Files to update |
|---|---|
| Signature Loadout → **Inventory** (`signatureEquipment`, `signatureEquipmentLimit`) | `artifacts/essence-system/src/lib/character-model.ts` (16 hits, incl. type fields, defaults, migration, validation msg "Signature Loadout exceeds the Signature Item Limit"); `artifacts/mobile/lib/types.ts` (6); `artifacts/mobile/context/CharacterContext.tsx` (3); `artifacts/essence-system/src/pages/character-builder.tsx` (32); `.../pages/character-sheet.tsx` (3); `.../pages/card-library.tsx` (3); `.../components/character-pdf.tsx` (8); `.../data/essence-options.ts` (10); `play-state-contract.md` (2). Needs a **schemaVersion bump + migration** in `character-model.ts` (`migrated.signatureEquipment` handling around lines 397–417) |
| Combat Skill → **Combat Style** | `artifacts/essence-system/src/data/essence-options.ts` (`SkillKey`, `SKILL_*`, `getExpertisesForSkill`); `lib/character-model.ts`; `lib/card-builder.ts` (CSV header keys `Combat_Skill`, `Combat_Skill_Vs`, and the `style:` field); `lib/db/src/schema/combat-cards.ts` (`skill` column); all `artifacts/essence-system/src/content/rules/*.md` |
| **Distinction Primary Attribute swaps** (Athlete Vigor→Might, Gifted Might→Vigor, Strategist Resolve→Intellect, Psyker Intellect→Resolve) | `artifacts/essence-system/src/data/essence-options.ts` lines **344, 362, 371, 380** (`primaryAttr` fields) |
| **Expertise limits now Rank-based (+1 for Distinction Style)** | `artifacts/essence-system/src/lib/character-model.ts` lines **279–305** — currently hard-codes `expertiseCap = 4 + dBonus.bonusExpertises` and a `perSkillCap` of 2 at Tier 1 Level 1, with rank-based checks only above T1L1. V6 makes the rank rule universal and adds the Distinction +1 per-Style bonus at all ranks. Also `lib/__tests__/character-model.test.ts` |
| **Subtype families normalized to V6's 45** | `artifacts/essence-system/src/data/essence-options.ts` `SUBTYPE_DATABASE` (lines 618–628) is out of sync with V6 on **seven of nine Styles**: prowess has a spurious `Stance`; gestalt has `Mimic`; cunning has `Diversion`; magecraft is missing `Light`, `Shadow`, `Chaos`; psionics has `Resonance` instead of nothing; leadership has `Signal`; ritualism has `Circle`; calling lists only Rank 0–2 families (missing Dragon/Fiend/Celestial/Abomination/Leviathan/Avatar/Outsider/Titan/Primordial) |
| **Wound State by highest severity, not count** | `artifacts/essence-system/src/content/rules/part-iv-combat.md` lines **1091–1099** (the `1–2 / 3–4 / 5` table); `attached_assets/Pasted-Part-II-Building-Your-Character-…txt` line 194. `character-model.ts` stores `coreWounds: CoreWoundSlot[]` with no severity labels — needs severity per slot |
| **Death Track redefinition** (all-five-filled, 0/5, three states, persistence, Recovery −1) | `artifacts/essence-system/src/content/rules/part-iv-combat.md` lines **1138–1165**; `artifacts/essence-system/src/content/guide/how-combat-works.md` line 43. **No Death Track field exists in any model** — `play-mode.ts` tracks only `currentCoreWounds`; a `deathTrack` counter and `dying`/`stabilized` state need adding to `artifacts/api-server/src/services/play-mode.ts` (lines 9–15, 46–52) and the sheet models |
| **Deathless Death Track modifier removed → placeholder** | `artifacts/essence-system/src/data/essence-options.ts` line **185** and `content/rules/part-ii-character-creation.md` line **1090** both still carry the V5 text "increase its starting value by 1" |
| **Temporary Wounds: cap of 5 removed** | `artifacts/api-server/src/routes/play-mode.ts` line 426 already uses `Math.max(0, …)` with no upper bound (good), but `character-model.ts` `temporaryWoundsAvailable` and any sheet UI that renders exactly 5 boxes (`character-sheet.tsx`, `character-pdf.tsx`, `mockup-sandbox` play sheets) need to become open-ended |
| **Temporary Influence: cap of 5 removed; Core Influence 2/2/1 severity; Reach absorbs first** | `character-model.ts` lines 98–99, 142, 165–167 (`temporaryInfluence: number`, `coreInfluence: CoreInfluenceSlot[]` — slots are `{filled: boolean}` with **no severity**); `api-server/src/services/play-mode.ts` (`currentTemporaryInfluence`, `currentCoreInfluence`); needs a new accumulated-Reach-pressure field |
| **Influence rules rewrite (Breach, Consequence Cards, no fixed recovery schedule, no pooling)** | `artifacts/essence-system/src/content/rules/part-vi-roleplay-and-influence.md` — this whole file is V5 content and needs replacing with V6 Part V |
| **Heritage Legacy changes** (Quartermaster's Due = Chassis + Fitting; Letters of Standing & Prepared Cache use ordinary pressure not Breach; Sacred Trust reduces by 1) | `artifacts/essence-system/src/data/essence-options.ts` (Heritage entries) and `content/rules/part-ii-character-creation.md` |
| **Species Trait rename + the four Species Combat Cards + per-Scene→per-Encounter** | `artifacts/essence-system/src/data/essence-options.ts` (Species/Adaptation data) and `content/rules/part-ii-character-creation.md` |
| **Armory / Inventory capacity semantics** (Armory 8 is inclusive; used-vs-unused commitment; excess = Influence pressure not 1 Temp Influence) | `artifacts/essence-system/src/lib/character-model.ts` lines 330–342 (`computeSlotCost`, `signatureSlotUsage`, `armorySlotUsage` — armory over-limit is currently only a **warning**); `artifacts/essence-system/src/lib/equipment-model.ts`; `lib/__tests__/equipment-library.test.ts`; `content/rules/part-viii-equipment-and-armory.md`; `content/guide/gear-and-equipment.md` |
| **Reconfigure cost 1→3 Action dice; Function Augment / Consumable Kit refresh removed** | `artifacts/essence-system/src/content/rules/part-viii-equipment-and-armory.md`; `artifacts/api-server/src/routes/equipment-cards.ts`; any seeded equipment card data carrying "refresh at end of Adventure" text |
| **Card rank/min-dice/expertise benchmarks and the 2-Pool-dice floor** | `artifacts/essence-system/src/lib/card-builder.ts` — `RANK_MIN` and the `min:2` defaults already match V6's benchmarks, but there is **no validation enforcing the ≥2 Pool dice rule** and no notion of free/burned dice. `artifacts/essence-system/src/pages/card-builder.tsx` |
| **Magecraft Thread effects now fixed and printed** | `card-builder.ts` sample cards (e.g. line 177 "Gravity Well" invents a Space Thread effect that differs from V6's canonical "+1 unit radius/length"). All ten Thread effects should become authored data, not per-card free text |
| **Whole-book restructure (Parts renumbered, three new Parts)** | `artifacts/essence-system/src/content/rules/` — all 11 files are V5-structured (`part-v-exploration.md` and `part-vii-downtime-and-advancement.md` mirror V5's stubs/old content); `artifacts/essence-system/src/data/rules-nav.ts`; `artifacts/essence-system/src/data/guide-nav.ts`; `scripts/validate-wiki.ts` |

### 7.2 Substantive changes with NO matching app code (nothing to update, or the app does not model it yet)

- **Advancement Points, the Skill Tree, retraining, higher-Tier character creation** — no `advancementPoints`, `skillTree`, or node model anywhere. `part-vii-downtime-and-advancement.md` is prose only. A brand-new subsystem if the builder is ever to support above Tier 1 Level 1.
- **Recovery: 25% of max resources, rounded up** — no recovery action exists in `play-mode.ts`; resources are set manually.
- **Resistance / Vulnerability ±2** — no resistance/vulnerability fields on characters or equipment.
- **Cover (+1 / +2 Fortitude)** — the only "cover" hit in the app is a stale card effect string; no cover model.
- **Resilience accumulated-damage interval and the "remaining protection" formula** — `resilience` is a flat number on the sheet; the app never simulates the damage interval.
- **Cooldowns / card availability / once-per-Encounter tracking** — not modeled.
- **Unaware Reaction tax, reaction chains, one-response-per-chain, initiative, action/reaction pools** — the app has no combat runtime at all.
- **Psionics Strain table, Leadership Authority capacity, Cunning Contingency limits, Gestalt Adaptation upkeep, Ritualism Rites, Calling Full Manifestation (entry costs, shared Manifestation Wound track, Broken)** — Specialty mechanics exist only as card flavor text; no state tracking.
- **Wound Cards and Influence Consequence Cards as card entities** — `condition-cards.ts` exists in the schema but there is no wound-card or influence-consequence-card table/type.
- **Non-Combat roll formula, Key Aspect = Attribute + 5, cooperation free dice, Difficulty** — `keyAspects` is stored as three free-text strings with no roll support; the dice roller (`dice_rolls` in `character-sheets.ts`) has `expression`/`faces`/`successes` but no Key Aspect awareness.
- **Enemy construction, roles, encounter categories, boss structures, Tier 1 enemy stat blocks** — no enemy/NPC model. `part-ix-running-the-game.md` exists but is V5-era content; V6's Part IX would be almost entirely new.
- **Reach pressure accumulation and reset** — `reach` is a plain number (`character-model.ts` line 100, default 1) with no pressure tracking.
- **Species Combat Cards** — no mechanism for a Trait to grant a card outside the 10-card selection.
- **Ordinary Condition catalog with numbers (Blinded, Burning, Dazed, …)** — `condition-cards.ts` schema exists but the V6 catalog is not seeded.
- **Difficult Terrain doubling, forced-movement collision, units/hexes** — no tactical map model.

### 7.3 Suggested update order for the app
1. Rename pass: `signatureEquipment*` → `inventory*`, `combatSkill` → `combatStyle` (schemaVersion bump + `migrateCharacter` handling, mobile `types.ts` mirror, PDF/sheet/builder UI strings).
2. Data fixes that are pure content: `primaryAttr` for the four Distinctions, `SUBTYPE_DATABASE`, Deathless text, Heritage Legacy texts, Species Trait rename.
3. Validation logic: Expertise Rank limits + Distinction +1; Armory/Inventory capacity semantics (Armory over-limit should probably become an error, and Armory should be inclusive of Inventory).
4. Replace `src/content/rules/*.md` wholesale with the V6 Parts and rebuild `rules-nav.ts` / `guide-nav.ts` (10 Parts + 15 appendices).
5. Only then consider new subsystems (Death Track state, Reach pressure, Advancement Points).
