# Essence System — Design Regressions & Persistent Gaps (V5 → V6 / v0.6)

Scope: cases where the design process had **already reached a concrete answer** (in V5, or in a planning/design document) and V6 now drops it, contradicts it, or reopens it as a placeholder. Every claim below cites a real source. Speculation is excluded.

Sources consulted: V5 book, V6 book (v0.6), `The Skill Tree System.md`, `Enemies and NPC's.txt`, `Essence_Equipment_Catalog.xlsx`, `Combat Adventure Sizing.md`, `Designing a Combat Card.md`, `Action_Reaction Card Generation Prompts v3.md`, `Rank 0 Cards.md`, `Role-Budget-System.md`, `code_mechanics_plan.md`, `essence-system-rules-plan.md`, `Character Sheet and Die Roller.md`, `Essence System — Improvement Task List.md`, and all 8 transcripts in `Transcripts/`.

---

## 1. Confirmed regressions

### 1.1 The Skill Tree — a fully designed system that V6 declares "not defined," and whose point economy V6 silently replaced

**What was resolved.** `C:\second-brain\raw\Essence System\The Skill Tree System.md` is a complete, ~270-line design document, not a sketch. It settles:

- Geography: three overlapping organic domains, nine Distinction Starting Points in a central Convergence Zone, three seam zones, an outer edge ~20 nodes out holding Deep Nodes.
- Four node sizes with fixed reward menus (Small = Card or Roleplay Skill Rank; Medium = Combat Skill Rank or Passive Skill; Large = Attribute Point or Expertise/Mastery; Key = Second Distinction or Distorting Passive).
- A **point budget and schedule**: *"Across Tiers 1 through 5 a character earns 80 Tree Points"*; milestone Levels (1, 6, 11, 16, …) grant 4 points, all other Levels grant 1 — *"10 milestone levels × 4 points + 40 standard levels × 1 point = 80 total Tree Points."*
- Costs: *"One point, one node, except Second Distinction nodes (5 points) and Deep Nodes (2 points)."* Border Nodes cost 1 and gate territory.
- Purchasing rules (adjacency/connection, banking, *"At each Tier-up, refund and reallocate up to 3 nodes"*).
- Second Distinction: *"Cost: 5 Tree Points. Requirement: Tier 3 or higher... One Second Distinction maximum per character."*
- A GM adjudication procedure for Passives (Currency Test / Always Test / Fit Test) with an explicit legal-currency list.
- A full distribution table showing where 80 points land (41 Small / 21 Medium / 14 Large / 4 Key).

**What V6 says instead.** V6 builds Part VII around the Skill Tree but declines to define it: *"The full Skill Tree topology and its complete list of nodes"* is listed under **"10. Advancement Still to Be Finalized."**

**Why this is a regression and not just an unwritten chapter.** V6 did not merely leave the tree blank — it **replaced the resolved point economy with an incompatible one** without acknowledging the existing design:

| Item | `The Skill Tree System.md` | V6 |
|---|---|---|
| Total points, Tier 1→5 | **80** | **49** (`Advancement Points = (Tier − 1) × 10 + (Level − 1)`, max at T5 L10) |
| Points per Level | 1, with **4 at 10 milestone Levels** | Exactly 1 per Level; *"Level 1 does not provide an Advancement Point"* |
| Node cost | 1, except **Second Distinction = 5**, **Deep Node = 2** | *"An Advancement Point is spent to unlock one available node"* — flat 1 |
| Retraining | *"At each Tier-up, refund and reallocate up to 3 nodes"* | Open-ended retraining rules, no 3-node/Tier-up limit |

V6 *did* carry forward the Second Distinction gate from this document (Key Node, Tier 3+, one per character), which shows the document was in scope — making the omission of the rest a loss rather than a rejection.

**Why it matters at the table.** Advancement is the only long-term reward loop in the game. A GM running above Tier 1 currently has a formula that produces a number of points and no legal thing to spend them on, while a finished design that would have answered it sits outside the book. The two documents also disagree by 31 points over a campaign, so anything built against one is wrong against the other.

**Caveat (be aware before importing wholesale).** The Skill Tree document is internally inconsistent with *both* books in three places, which is likely why it was not lifted as-is: it caps Attributes at 4 (*"No attribute may exceed 4 from any source"*) where V5 and V6 both say *"Attributes are normally rated from 1 to 5"*; it asserts a Defense ceiling of 9 (*"No effect, stance, or bonus may raise a Defense value above 9"*) which V6 contradicts with *"If the final required Defense is above 10, an ordinary unmodified d10 result cannot beat it"* and *"Values above 10 should be temporary, exceptional..."*; and it uses the retired "Combat Skill"/"Roleplay Skill"/"Mentalist"/"Permanent Item slot" vocabulary and a 7-card/7-point starting package that no longer matches creation. The right fix is a reconciliation pass, not a copy-paste — but the tree is designed, and V6 should say so rather than saying it is not.

---

### 1.2 Deathless Death Track modifier — a working rule downgraded to a placeholder

**What was resolved.** V5, Deathless Nature: *"When your Critical Wound activates the Death Track, increase its starting value by 1."* This was not just book text — `code_mechanics_plan.md` (Sept 4) audits it as live shipped content in `essence-options.ts:185` and in `part-ii-character-creation.md`, and treats the only open item as a **rename** ("Death Tracker" → "Death Track"), explicitly *"the same rename as the wiki... matches the decision already made on the wiki."* The value itself was settled enough to be in production in two surfaces.

**What V6 says instead.** *"When your Core Wound track becomes full and you begin Dying, your Deathless nature gives you additional time before death. The exact Deathless Death Track modifier remains a playtest placeholder and will be finalized with the Death Track reference."* Repeated in the Death Track chapter and in the closing "still to finalize" list.

**Is there a prior reason it was +1?** No transcript discusses the Death Track at all — the recorded conversations predate the Wound system entirely (grep for "death track", "core wound", "temporary wound", "resilience" across all 8 transcripts returns zero hits). So there is no design rationale to recover. But that cuts against V6: nothing was found to be wrong with +1, and V6 rebuilt the Death Track around a **defined 0/5 activation**, which makes "+1 to starting value" *more* precisely expressible in V6 than it was in V5, not less.

**Why it matters.** Deathless is the only Species whose Nature is a survival mechanic. As written, a Deathless character's core racial trait has no mechanical effect at all — the player has to ask the GM to invent one mid-fight, at the single most consequential moment in the game.

---

### 1.3 Linked Mounts — a fully specified mechanic deleted over an unresolved *cost*

**Correction to the framing in the brief:** this is not a riding-mount system. "Link" is the Augment mechanic on modular equipment.

**What was resolved.** V5 printed four working sections — *Linked Mounts*, *Link Off*, *Link On*, *Links Are Optional*, plus *Changing a Link*. The functional rules are complete and unambiguous:

- *"A Linked pair can operate with its Link either On or Off. The player decides which state is currently active."*
- Link Off: *"the Function provides its normal ability; the Support modifies the Chassis."*
- Link On: *"The Support no longer modifies the Chassis. Instead: The Support modifies the linked Function... The Function continues spending its own Uses normally. The Support remains always active and does not gain its own Uses."*
- *"a normal Link requires: 1 Function + 1 Support"*, and *"The base equipment system does not use long chains of Linked Augments."*

**What was genuinely open in V5.** Only the combat cost: *"Turning an existing Link On or Off is designed to be extremely quick... The general Reconfiguration rules determine the exact combat cost."* So V5 never assigned a number either.

**What V6 says instead.** The entire subsystem is gone; one sentence survives in Part VIII ch. 15: *"The equipment architecture supports Linked Mounts in which a Support can be redirected from modifying the Chassis to modifying a paired Function Augment. Linked arrangements are an advanced higher-Tier option rather than a requirement of the current starting catalog."* Plus the deferral: *"The current v0.6 core rules do not assign a universal Link-toggle cost."*

**Assessment.** The *cost* is not a regression — it was never settled. The **mechanic** is: four sections of resolved, playable rules were reduced to one descriptive sentence over a missing number, and the surviving sentence is not sufficient to actually run a Linked pair (it does not say who chooses the state, when, that Support gains no Uses, or that a Link requires exactly 1 Function + 1 Support). Mitigating: the equipment catalog was deliberately built *"No linking"* / *"No Linked Mounts or linked effects are included"* (R1), so nothing shipping depends on it today.

---

### 1.4 Equipment catalog — V6 removed rules the finished catalog was built on, without supplying replacements

`Essence_Equipment_Catalog.xlsx` (PLAYTEST 0.1, dated in-file September 13) is not a rough draft. Its *Checks* tab shows 14 structural validations all PASS: 60 Components (38 Tier 1 + 22 Tier 2), 24 tierless Augments (12 Support + 12 Function), 17 Equipment Cards, 12 example assemblies, 171 enumerated compatible Chassis/Fitting pairs, and every one of the 26 original combat-equipment effects mapped in a migration ledger. It carries a *Rules* tab (R1–R8, D1–D8) recording the conventions the item data was authored against.

V6 itself flags the mismatch: *"The separate Tier 1-2 Component and tierless Augment catalog must be synchronized before it becomes book-authoritative."* But the direction of the problem is worth stating precisely — in several places **V6 deleted a rule the catalog depends on and did not replace it**, so re-syncing is not a mechanical edit, it requires new design:

| Catalog (resolved) | V6 | Consequence |
|---|---|---|
| **R5:** *"Uses refresh at the end of the Adventure. Removal, refitting, transfer, or placing it in a new host does not refresh it."* | *"There is no universal rule that every Function Augment fully refreshes whenever the Team rests"* — each Augment must state its own recovery | All **12 Function Augments** now have **no recovery rule at all**. V6 removed the universal answer and the catalog has no per-item replacement to fall back on. |
| **R8:** per-component printed swap costs — *"Striker/Shield Handling, Payloads, and Interfaces use a simple 1-Action-die swap here; Rigging uses a structural 3-Action-dice swap. Exchange an Augment for 1 burned Action die. Chassis replacement requires Recovery or Downtime."* The catalog has a populated **Swap** column per component. | Single *Reconfigure* Basic Action: **burn 3 Action dice** for everything; structural Fittings out of combat only; Chassis change explicitly does **not** require Recovery or Downtime | Every populated Swap value in a 60-row catalog is now wrong, in both directions (Augment swap 1→3 is a 3× nerf; Chassis change is a buff). |
| **D1:** *"The inspected Equipment chapter does not specify a universal Equipment roll cap; this rule fills that gap for testing"* — proposed `maximum rolled dice = printed Attribute + Character Tier` | V6 ch. 16 defines what an Equipment Card *is* and is not, but assigns **no maximum rolled dice**. `Maximum rolled dice = Attribute + Combat Style Rank` cannot apply, because Equipment Cards explicitly have no Style Rank. V6 introduces `Roll Limit` for enemies and manifestations only. | The catalog's 17 rolled Equipment Cards have no legal dice ceiling under V6. The gap was identified and a fix proposed; V6 neither adopted it nor closed it another way. |
| **D6:** *"The normal cap is five Temporary Wounds"* and *"Core Wounds recover from the most severe marked space first"* | Temporary Wounds have **no universal maximum**; natural recovery is **order-free**, active healing is **lowest-severity-first** | Catalog assumptions inverted. Low blast radius (both are conventions rather than item data), but they are printed in the catalog's rules tab. |

**Why it matters.** The catalog is the only source of actual items in the project. Under v0.6, a GM cannot answer "when do my Function Augment Uses come back?" or "how many dice do I roll for this Equipment Card?" from either document.

---

### 1.5 Enemy design — the resolved Mook/Normal "reduced engine" is contradicted by V6

**What was resolved.** `Enemies and NPC's.txt` ("Essence Enemy Rules — Current Working Summary") settles a single organizing principle: *"Mooks and Normals use a simplified GM-facing combat engine. Elites use the full player-facing combat engine."* Concretely:

- Mooks: *"Mooks do not use Combat Cards, dice pools, or MP-style combat resources. Their attacks and defenses use predetermined values."* Behavior governed by *"an ordered Tactics block."*
- Normals: *"They use the same reduced enemy engine as Mooks: no Combat Cards; no dice pools; no MP tracking; predetermined combat values."* The difference is agency — *"Mooks follow instructions. Normals make choices."*
- Elites: *"all Elites use the full Essence combat engine"* — Attributes, Skills, dice pools, Combat Cards, Riders and Surges, **full wound mechanics**, equipment.

**What V6 says instead.** V6 flattens this into one engine for everyone: *"Mooks still roll dice. They are not automatic-hit or automatic-damage tokens."* Appendix N confirms it — every Mook block carries a **Roll Limit (4)** and abilities reading *"Minimum 2 dice"*, i.e. exactly the player resolution procedure. The only simplification V6 keeps is on the Wound side, and it applies to *all* grades including Elites: *"Mooks, Normals, and Elites, including Champions, Leaders, and Solos, normally use this simplified rule"* (no Light/Serious/Critical, no Wound Cards, no Wound State, no Death Track).

**Net effect:** the two axes are swapped. The notes gave Elites the full engine including full Wounds and stripped the engine from Mooks/Normals. V6 gives Mooks the full resolution engine and strips full Wounds from Elites.

**Also lost from the notes, with nothing equivalent in V6:**
- **The Tactics block.** *"Their behavior is normally governed by an ordered Tactics block. The GM follows the first applicable instruction rather than stopping to optimize."* This is the actual mechanism that made Mooks fast to run. V6 has role guidance and "Role use" advice but no ordered-instruction format, and none of the nine Appendix N blocks contains one.
- **The three named major-encounter structures** — Solo Boss (1 Elite Boss), **Command Encounter** (1 Leader + numerous Mooks), **Champion Encounter** (several Champions) — with the design intent *"Boss: Figure out this monster. Leader: Break the enemy machine. Champions: Outfight the opposing team."* V6 keeps Leader and Solo as Boss structures but drops the Champion Encounter as a named structure and the three-experience framing.
- **The `Tier / Grade / Role` header convention** (`Tier 2 Elite — Striker (Champion)`), with the explicit rule *"A high-Tier Mook is completely valid, as is a low-Tier Elite."* V6's Appendix N blocks are all Tier 1 and use bare names.
- **The Elite-only ability test:** *"If this ability could reasonably belong to a player character without breaking the structure of the game, it should probably be a normal Essence ability rather than an NPC-only ability."* No equivalent in V6.

**Renames (not regressions, but they will break cross-referencing):** role **Artillery → Blaster**; Elite type **Boss → Solo**; **Grade → enemy class**.

**Not a regression:** the notes say *"Mook Durability: The exact numbers have not yet been determined."* V6's Mook 2 / Normal 4 / Elite 5 baselines resolve that open item. Credit where due.

**Why it matters.** The whole stated purpose of the notes was *"to preserve Essence's crunchy tactical combat without forcing the GM to effectively run ten player characters whenever a large encounter occurs."* V6's Part IX is well written but gives every Mook a dice pool and a Roll Limit, which is exactly the load the notes existed to prevent. The notes' own closing line — *"The next major piece to design is the actual Reduced Enemy Engine"* — is a task V6 has now quietly cancelled rather than completed.

---

### 1.6 Adventure sizing — a simulation-derived answer that V6's new Part IX contradicts

**What was resolved.** `Combat Adventure Sizing.md` is not an opinion piece; it reports a **500-trial Monte Carlo per row** against four built Tier 1 PCs. Its conclusion:

- *"The challenge band is 7 to 9 scenes."*
- *"Recommended shape: 3 Encounters, 2 to 3 Scenes each (7 to 9 Scenes total), with the 2 Recovery periods falling one after each of the first two Encounters."*
- *"The number that controls difficulty is Recovery periods, not calendar days."*
- Expected outcome at that size: near-certain completion, ~40% chance of a PC death, 3 of 4 standing, all consumables spent.
- A pressure currency used throughout: **Minor 10% / Severe 25% / Critical 50% Load**, with a ~100%/day ceiling.

**What V6 says instead.** Part IX's adventure planning table:

| Size | V6 | Sizing doc equivalent |
|---|---|---|
| Short | *"1-2 meaningful Combats"* / *"Often no guaranteed Recovery"* | — |
| Medium | *"2-4 meaningful Combats"* / *"Roughly one plausible Recovery opportunity"* | — |
| Long | *"4-6+ meaningful Combats"* / *"One or more Recovery opportunities"* | **7–9**, with **exactly 2** Recovery periods |

V6 also deletes **Scene** as a mechanical unit (*"Essence does not use Scene as a formal mechanical unit"*) — the sizing document's counting unit — and drops the Load percentages entirely in favour of *"Recovery as the primary divider rather than a per-fight budget."*

**Assessment.** V6 carried forward the document's central *insight* (Recovery count, not fight count, is the difficulty dial) and discarded its *numbers*. A GM following V6's "Long" upper bound builds an adventure roughly 40% smaller than the simulated challenge band, and V6 never commits to a Recovery count, which is the variable the simulation identified as decisive.

**Honest counterweight — do not treat the 7–9 figure as canon-ready.** The document's own audit section lists its placeholders, and several are now contradicted by both books: it assumes *"2 wounds per Recovery period, via the healer"*, wound die-loss of *"Light 0, Serious −1 (placeholder)"*, and *"Temporary Wounds reset"* on a long rest. Neither V5 nor V6 grants Temporary Wound restoration on rest (V6: *"Recovery does not automatically restore Temporary Wounds"*; V5 only ever said *"Individual abilities and recovery rules determine when Temporary Wounds are gained or restored"*). It also assumes the deleted Influence recovery schedule (see 1.7). **The regression is that V6 replaced a quantified answer with an unquantified one; it is not that V6's numbers are provably wrong.** The correct remedy is to re-run the simulation against v0.6 rules, not to paste 7–9 into the book.

---

### 1.7 Influence recovery schedule — a concrete answer replaced with GM improvisation

**What was resolved.** V5 printed a fixed schedule by severity: **Minor/Light = 1 day, Major/Serious = 1 week, Critical = 1 month.** The sizing document treats this as load-bearing, building a day-by-day week around it (*"One deep recovery, Day 4. A full day at the haven treats Core Wounds and clears Light Influence, which needs a full day to heal"*) and tabulating Influence as *"Very slow: Light 1 day, Serious 1 week, Critical 1 month."* This also matches the transcript-level intent for injury pacing (`Combat Philosophy and Mechanics.md`: *"If the outcome of the fight is you've gotten a break, or a sprain... then yeah, you might need a week"*).

**What V6 says instead.** *"Essence does not use a universal day, week, or month schedule."* Repair is now defined per Consequence Card. To V6's credit, Appendix F's three fallback cards **do** state recovery requirements, so this is a genuine replacement rather than a hole — but all three are qualitative (*"Take a concrete corrective action... then receive a suitable Downtime opportunity"*, *"This may require several Downtime opportunities"*, *"Time alone is insufficient"*).

**Assessment — a soft regression.** V6 traded an arbitrary-but-runnable number for a principled-but-unquantified process. The real cost is that it removes the only calendar anchor the system had: no GM can now answer "how long before this clears?" without inventing it, and any pacing model built on the old schedule (including the sizing document's 7-day plan) no longer computes.

---

## 2. Long-standing gaps that remain gaps

These were identified as problems in design documents but were **never resolved in V5 either**. V6 has not made them worse; they are simply still open. Listed because they are the real backlog.

**2.1 Reach / Inventory / Armory increase per Tier.** V6 lists three of these under "still to be finalized." V5 had the identical hole: its Tier table says Tier modifies *"Reach — The scale of your purchases, favors, and social leverage"* and *"Signature Equipment — The number of Signature (Permanent) Items you can maintain"* with **no values**. `Role-Budget-System.md` does **not** fill this — it is a Foundry-module homebrew for *NPC* budgets on a different taxonomy (Minion/Standard/Elite/Nemesis), self-describes as *"homebrew, not canon"*, and assigns no PC Reach/Inventory/Armory values. `code_mechanics_plan.md` independently confirms the hole from the code side: *"Reach and Signature Equipment Limit are fully manual fields, not derived from Tier at all, despite the doc saying Tier should drive both"*, and proposes a Tier lookup table as an option that was never chosen. **Not a regression — a three-document-deep unresolved item.** V6 at least states it openly, which V5 did not.

**2.2 Alignment / Reputation.** Neither V5 nor V6 contains the word "alignment" (0 hits in both). But this is **not** an oversight: the transcript resolved *against* building one. Ryan: *"your alignment should have no mechanical impact, and I don't like systems that make alignment a mechanical function"*; on reputation: *"that falls out the purview of the system... I'm not going to create a reputation slider that says how NPCs should react to you."* `code_mechanics_plan.md` confirms the closure: *"There is no `alignment` field anywhere... Confirms it was stale doc text only — closed, no action."* **The genuinely unbuilt deliverable is the thing they agreed to build instead:** *"this would get moved to a second page... a set of resources designed to help you make a living, breathing, well rounded character"* — a backstory/personality/bonds-and-flaws page, with alignment demoted to a non-mechanical prompt. That page exists in neither book. V6's closest approach is Career + Key Aspects, which are mechanical, not the character-building aid that was agreed. Low mechanical stakes; worth a page.

**2.3 Critical Core Wound recovery duration.** V5 punted (*"Detailed recovery times appear in Part VII"* — Part VII was an empty stub). V6 gives Light and Serious real answers and leaves Critical as *"extended care, duration TBD."* Net improvement, still open at the top severity.

**2.4 Equipment Card maximum rolled dice.** Flagged explicitly by the catalog (D1: *"The inspected Equipment chapter does not specify a universal Equipment roll cap; this rule fills that gap for testing"*) with a proposed fix (`Attribute + Character Tier`). V5 had no rule. V6 has no rule and does not acknowledge the gap. See 1.4.

**2.5 Synergy cards.** `Action_Reaction Card Generation Prompts v3.md` defines the category in full — *"Synergy cards require exactly two Combat Skills as prerequisites and draw attributes from both of their domains. A character must have at least 1 pip in both listed Combat Skills... No Synergy card may require three Combat Skills"* — with a dedicated generation prompt. `The Skill Tree System.md` references *"a unique Synergy Action unlock"* as a Deep Node reward. The word "synergy" appears **zero times in V5** and only once in V6 (describing enemy role synergy). Designed, referenced by another designed system, never entered either book.

**2.6 Minor Actions.** Same document: *"Minor Actions (cheap self-buffs that can be stacked) are a confirmed card category but have no prompts yet."* Confirmed category, absent from V5 and V6.

**2.7 Default Reaction timing.** Same document: *"Reaction timing (before the triggering roll vs. after) is not uniformly resolved... A global rule on default timing is still needed."* V6 improves things substantially — Reactions now use the full commitment sequence and the attacker's dice/Success Die/Surges are known before the Reaction chain opens — but there is still no default for a Reaction whose trigger does not state its own timing. Largely mitigated, not formally closed.

**2.8 Full Core Influence track procedure.** V6 admits it: *"The complete Influence Consequence catalog still needs an explicit full-track procedure... This is a v0.6 framework flag rather than a finalized subsystem."* V5 had no rule either. The asymmetry is notable — a full Core Wound track has an entire Death Track subsystem; a full Core Influence track has nothing.

**2.9 Calling manifestation numeric profiles.** V6: *"Before Calling is considered reference-complete, Appendix H needs the fixed profile entries for Familiar, Sprite, Beast, Phantom, Golem, Elemental, Ancestor, Fey, Dragon, Fiend, Celestial, Abomination, Leviathan, Avatar, Outsider, Titan, and Primordial."* V5 never had them either. Seventeen missing stat blocks make the Summoner Distinction unplayable at the table; this is arguably the largest single unplayable hole in v0.6, and it is inherited, not new.

**2.10 Species Senses have no downsides.** The Heritage transcript settled a principle: *"every type of unique sense needs to have some capacity of downside. Otherwise, everybody takes dark vision"*, with the stated failure mode *"Fifth edition... if you don't have Dark Vision, you have a huge detriment."* Neither V5 nor V6 attaches a downside to any Sense. V6 arguably addresses the balance concern by a different route — Senses are narrow (2-unit Hidden-detection), cost a Trait choice, and are spread across most Species — so this may be resolved-by-design rather than ignored. Flagged for a decision, not as a defect.

---

## 3. False alarms / checked and fine

- **Prowess "Stance" subtype.** `Designing a Combat Card.md` includes a sample card labeled `Prowess - Stance`, which is not a legal V6 subtype (V6 Prowess = Opener / Blitz / Finisher / Breaker / Guard). This is V6 deliberately resolving a V5 self-contradiction (V5's Appendix A printed a seven-subtype list that disagreed with V5's own body text). Correct call; the sample card just needs relabeling.
- **`Designing a Combat Card.md` vs V6 Appendix L.** Substantively carried forward — Rank→min-dice ladder (0-1:2, 2:3, 3:4, 4:5, 5:6), Expertise ladder (0: none, 1-2: 1 of 2, 3-4: 2 of 3, 5: 3 of 4), Attribute-fits-technique, Rider-supports-not-replaces, "base effect worth using without Surges". V6 line-for-line preserves the core: *"Pick the Attribute that reflects how the technique is performed."* No regression.
- **`Rank 0 Cards.md`** (18 universal Attribute-only cards, *"Cost: 1 die"*, ranges in feet, *"Characters choose 7"*). A superseded pre-V5 draft — it contradicts the 2-die floor, the units system, and V6's "Rank 0 cards are learned Style cards, not Basics." Nothing to carry forward; V6's six named Basic cards in Appendix I are strictly more than V5 offered (V5 only promised *"the exact cards are authoritative once finalized"*).
- **`Role-Budget-System.md`.** Foundry NPC-generator homebrew on a retired taxonomy, self-labeled *"homebrew, not canon."* Not a source of canonical numbers for anything.
- **`essence-system-rules-plan.md`, `Character Sheet and Die Roller.md`, `Essence System — Improvement Task List.md`, `code_mechanics_plan.md`.** App/wiki build plans, not rules design. Only `code_mechanics_plan.md` contributes rules evidence (used above for Deathless, Alignment, and Tier→Reach).
- **The Skill Tree's Tier Perk column** (*"Increased Die Pool +1"* at Levels 11/21/31/41) is consistent with `5 + Tier` in both books. No conflict there.
- **Mook/Normal/Elite Wound baselines (2/4/5).** A genuine *resolution* of an item `Enemies and NPC's.txt` explicitly left open (*"The exact numbers have not yet been determined"*). Progress, not regression.
- **Link-toggle cost specifically.** V5 never assigned one (*"The general Reconfiguration rules determine the exact combat cost"*), so V6's "no universal Link-toggle cost assigned" is not a regression on its own. The deletion of the surrounding Link On/Off rules is — see 1.3.
- **Second Distinction gating.** V6's "acquired through an eligible Skill Tree node, Tier 3+, not automatic on reaching a Tier" matches `The Skill Tree System.md` exactly. Correctly carried forward.

---

## Priority order, if you only fix a few

1. **Deathless +1** (1.2) — one number, restores a broken Species trait, zero design risk.
2. **Function Augment recovery** (1.4) — V6 removed the universal rule and the catalog has no per-item replacement; 12 Augments are currently unplayable.
3. **Equipment Card roll cap** (1.4 / 2.4) — one sentence; the catalog already proposes the wording.
4. **Skill Tree point economy** (1.1) — decide 49 vs 80 *before* anyone plays above Tier 1, and say in the book that a tree design exists.
5. **Catalog Swap column re-sync** (1.4) — mechanical, but 60 rows are wrong today.
6. **Enemy reduced engine** (1.5) — decide explicitly whether the Mook/Normal reduced engine is cancelled or deferred; right now it is neither.
