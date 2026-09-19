# V6 Rulebook Revision — Delta Against the Built-Against Snapshot

**Baseline (what Phases 1–5 were built against):** `C:\second-brain\raw\Essence System\Essence System V6.docx` (3,381 extracted lines; re-extracted for this audit).
**New text (this revision):** the shared Google Doc export, 4,583 lines, still self-identified `Version 0.6 · Playtest edition`.
**Method:** section-by-section topical matching (the book was *restructured*, so a line diff is worthless — see §0), then normalized set-diffs within each matched chapter, then verification against the shipped code in `module/`.

---

## 0. What kind of revision this is

The revision is **a structural reorganization plus a set of genuine rules additions**, not a rewrite. Roughly half the prose is byte-identical once whitespace and table-cell encoding are normalized.

The reorganization matters for citing the book later:

| Old structure | New structure |
|---|---|
| Part III Campaigns / IV Adventures / V Social / VI Combat / VII Advancement / VIII Equipment & Armory / IX Running the Game / X Appendices A–O | **Part III: Core Rules** (new — absorbs Attributes, Non-Combat, Equipment & Preparation, Influence), IV Campaigns, V Adventures, VI Social, VII Combat, VIII Advancement, IX Character Options, X Combat Styles, XI Equipment Catalog, XII Combat Card Catalog, XIII Passive Feature Catalog, XIV Running the Game, **Appendices A–C only** |
| Appendices E (Wound Cards), F (Influence Consequences), C/D (Conditions), I (Basic/Species cards), H (Calling), N (Tier 1 enemies), M (worked adventure) | all folded inline into the body chapters |
| A standing "Current v0.6 Reference Tasks Still Open" list in Appendix O | replaced by **inline `Draft note:` markers** (10 of them — see §4) |

**Net:** ten `Draft note:` markers remain open; the old "Reference Tasks Still Open" list is gone, and with it the line that explicitly named *"the Deathless Death Track modifier"* as unresolved — because it now **is** resolved.

---

## 1. Executive summary — priority order

| # | Change | Class | Urgency |
|---|---|---|---|
| 1 | **Resistance + Vulnerability of the same type now CANCEL** (neither applies), and both are explicitly keyed to **named Damage types** (Fire, Psychic), never to a Physical/Mental/Spiritual **domain**. `utils.mjs#applyResistanceVulnerability` implements the opposite on both counts, and its doc comment says so out loud. | **Built, now wrong** | **Highest** — 0.6.85 ships a rule the book now contradicts |
| 2 | **Recovery restores +Anima extra Resource points** (distributed as the player chooses) on top of the 25%, and **restores Adaptability's Exploration reroll**. `#onGrantRecovery` (0.6.82) does neither. | **Built, incomplete** | **High** |
| 3 | **Deathless Nature now has a concrete rule: the Death Track threshold becomes 7, not 5.** §9.1's "new design in progress" is delivered. Every Death Track cap in the module is a hardcoded `5`. | **Built, now wrong + §9.1 resolved** | **High** |
| 4 | **"Acting While Dying" — brand-new provisional exertion mechanic.** First Action or Reaction played each Round while Dying advances the Death Track by 1 after it resolves. No prior text, no prior scope, no code. | **New content, no prior scope** | **High** (it is the Death Track, which Phase 3 owns) |
| 5 | **Nine new per-Attribute benefits** (Might loads, Grace jumps, Vigor exertion, Intellect free Rank-1 Skills, Acuity extended senses, Resolve sustained attention, Presence Adventure Temporary Influence, Adaptability reroll, Anima Recovery bonus). Three of them are mechanically load-bearing for already-built systems (Recovery, Influence, Character Creation). | **New subsystem** | **High** |
| 6 | **Temporary Wounds and Temporary Influence now have an expiry-ordering rule** (earliest expiry first; no-expiry last; owner breaks ties; ineligible restricted grants cannot pay). Neither field models expiry today. | **Built, now underspecified** | Medium |
| 7 | **`Perform Task` is a 7th universal Basic Combat Card** (burn 2 Action dice). Plan §7.2 says "Basic Combat Cards 6". | **Plan needs updating** (Phase 7, 0.6.91) | Medium |
| 8 | **Reconfigure's scope widened** to ready / stow / recover / hand over an item, and to Temporary Equipment, not just swapping prepared items. Cost unchanged (burn 3). | **Plan needs updating** (Phase 6, 0.6.87) | Medium |
| 9 | **The entire minimum commitment must come from the Pool**, not just the first 2 dice (old text allowed alternative payment beyond the first two). The Rank-0 max-floor of 2 now covers **Basic** cards too, and a card with a **printed roll limit** uses that instead of Attribute + Style Rank. | **Built, partly wrong** (0.6.83) | Medium |
| 10 | **Enemies: "Roll Limit is a per-card maximum, not a separate pool"; enemies do NOT get the player Basic-card package; a profile with no Reaction cannot use Defend implicitly.** Confirms §9.5 and constrains 0.6.79's design. | **Built, needs a guard** | Medium |
| 11 | **Hiding & Searching, Jumping, Climbing/Swimming, Falling, Gliding, Airless/Submersion** — a full Movement/Detection procedure chapter that did not exist. Plus a new **Senses and Detection** chapter and a (stub) **Passive Feature Catalog** Part. | **New content, no prior scope** | Low–Medium |
| 12 | **Leadership Authority's storage model tightened** (results live on the *generating card*, Orator can hold two on one card each spendable separately). | **Not built either way** | Low |
| 13 | **Skill Tree node topology and Tier-based Reach/Inventory/Armory numbers are STILL unresolved** — now carrying explicit `Draft note:` markers. §9.3 and §9.7 stand. | **Confirmed still blocked** | — |

---

## 2. Corrections needed to already-built phases

### 2.1 Resistance / Vulnerability cancel, and apply to Damage *types* not *domains* — Phase 5, 0.6.85

**Old text** (Combat §13, "Resistance and Vulnerability - Playtest Values"):
> "Resistance reduces applicable incoming Damage by 2. Vulnerability increases applicable incoming Damage by 2. Apply these modifiers to the incoming Damage event before Resilience or Breach is resolved. Damage cannot be reduced below 0."

**New text** (Combat Encounters → Damage → "Resistance and Vulnerability - Playtest Values"):
> "Resistance and Vulnerability apply to **named Damage types, such as Fire or Psychic**. They do **not** apply to an entire Physical, Mental, or Spiritual domain or to a Combat Style… **Multiple sources of Resistance to the same type do not increase this reduction**… If Resistance and Vulnerability both apply to the same Damage type, **they cancel for that event: neither changes the Damage.** Resolve that cancellation before applying either modifier or flooring Damage at 0."

Appendix C's quick table restates it: *"Does not stack; cancels matching Vulnerability… Domains and Combat Styles do not qualify as types."*

**Who built it:** Phase 5, **0.6.85** ("Damage: Resistance/Vulnerability ±2, Breach-vs-Resistance fix, Resilience mid-interval bug fix"), plan §5.6 / §6.2.

**Where it lives:**
- `module/utils.mjs:78-104` — `applyResistanceVulnerability(actor, damageType, amount)`. The doc comment at **lines 82-84** states the now-wrong reading explicitly: *"A Resistance and a Vulnerability of the same damageType don't cancel per any stated rule text found — both apply in sequence."* The `@param` at **line 86** documents `damageType` as *"Physical/Mental/Spiritual, matching Apply Damage's own Domain."*
- `module/sheets/actor-sheet.mjs:1160` and `module/sheets/npc-sheet.mjs:806` — both call `applyResistanceVulnerability(this.actor, result.domain, result.amount)`, passing the **domain**.
- `module/sheets/actor-sheet.mjs:1119-1131` — the Apply Damage dialog offers only a three-option **Domain** select; there is no Damage-type field at all.
- `module/data/actor-combatant.mjs:84-97` — `resistances` / `vulnerabilities` are `ArrayField(SchemaField({damageType, source}))`. The field name is already right; only what gets stored in it is wrong.
- `module/sheets/actor-sheet.mjs:1045-1103` and `module/sheets/npc-sheet.mjs:895-947` — `#onAddResistanceOrVulnerability`, the entry UI.

**What has to change:**
1. Add the cancellation branch to `applyResistanceVulnerability`: compute `hasR` / `hasV` first; **if both, return the amount unchanged** with a log line saying they cancelled; only otherwise apply −2 (floored at 0) or +2. Replace the lines 82-84 comment, and cite the new Appendix C row so a later session doesn't revert it.
2. Non-stacking is **already correct by accident** — `.some()` at `utils.mjs:95` and `:99` means N sources behave as 1. Add a comment saying that is now the rule, not an implementation shortcut.
3. Change the matching key from domain to **Damage type**. Minimum viable: add a `damageType` text/select field to the Apply Damage dialog (the 12 types are printed: Bludgeoning, Piercing, Slashing, Fire, Cold, Lightning, Acid, Force / Psychic, Arcane / Radiant, Necrotic), keep `domain` for Wound Card selection, and match Resistance on the new field. The Resistance/Vulnerability entry dialogs should offer the same 12-type list rather than free text or the three domains.
4. Optional guard: warn (don't block, per the standing convention at `actor-sheet.mjs:1396-1399`) if someone enters a domain name as a `damageType`, since the new text says domains do not qualify.

### 2.2 Recovery is missing the Anima bonus and the Adaptability restore — Phase 5, 0.6.82

**Old text** (Campaigns §7 Recovery → "Resource Recovery"):
> "When a character completes a Recovery, restore each renewable Resource separately: Recover 25% of maximum Stamina, Focus, and Mana, rounded up."

**New text** (Campaigns → Recovery → **"Resource and Attribute Recovery"**):
> "…first calculate the base restoration… Recover 25% of maximum Stamina, Focus, and Mana, rounded up. **Then restore additional Resource points equal to Anima in total, distributed among those three Resources as you choose.** … Allocate Anima's extra points only where capacity remains; any points that cannot be restored are lost and cannot be saved for later.
> **Completing a Recovery also restores your one use of Adaptability's Exploration reroll.** An unused use remains available and does not accumulate with the restored use."

Appendix C adds an "Attribute benefits" row to the Recovery table saying exactly this.

**Who built it:** Phase 5, **0.6.82** ("Recovery: 25% rounded up, Death Track −1, clear Strain, −1 Manifestation Wound"), plan §5.4.

**Where it lives:** `module/sheets/actor-sheet.mjs:1311-1428` `#onGrantRecovery`. The resource loop is **lines 1346-1357** (`Math.ceil(resource.max * pct/100)` — the 25%-rounded-up part is correct). Dialog copy at **lines 1316-1320** enumerates the V6 effects and omits both new ones.

**What has to change:**
- After the 25% loop, add an **Anima allocation step**: `sys.anima` extra points, distributed by the player. Given this project's warn-don't-block convention and the existing dialog shape, the cheapest correct implementation is three additional numeric inputs (Stamina / Focus / Mana extra) in the Grant Recovery dialog, pre-seeded to 0, with a note *"distribute up to {anima} additional points"*, validated to sum ≤ Anima and clamped at each `resource.max`. Points that cannot land are simply lost — do not bank them.
- Add an **Adaptability reroll** tracker. There is no field for it today; this needs a new `playState.adaptabilityRerollAvailable: BooleanField{initial: true}` on `EssenceCombatantData` (or `EssenceCharacterData` — the benefit is a PC Attribute benefit, but Reach lives on the shared base for the same reason, so the shared base is the consistent home), set back to `true` by `#onGrantRecovery`, with a sheet toggle. Note the explicit non-accumulation rule: an unused use does **not** stack with the restored one, so this is a boolean, never a counter.
- Update the dialog copy at lines 1316-1320 and the chat summary at 1417-1427.

### 2.3 Deathless Death Track threshold = 7 — Phase 3, 0.6.76 + plan §4.7/§9.1

**Old text** (Species → Deathless → Nature):
> "When your Core Wound track becomes full and you begin Dying, your Deathless nature gives you additional time before death. **The exact Deathless Death Track modifier remains a playtest placeholder and will be finalized with the Death Track reference.**"
> (Combat §16 "Deathless": *"Deathless characters receive additional time on the Death Track according to their Species rule. The exact Deathless modifier remains a playtest placeholder…"*)

**New text** — now stated in **three** places:
> *Species → Deathless → Nature:* "**Deathless Nature - Playtest: your Death Track ends at 7 instead of 5.** When all five Core Wound spaces first fill, become Dying at 0/7; reaching 7 causes death… Your Core Wound track still has five spaces."
> *Combat → Dying, Stabilization, and Death → Beginning to Die:* "Its normal death threshold is 5; **Deathless Nature raises that threshold to 7.**"
> *Combat → Dying… → Deathless:* "A Deathless character first becomes Dying at 0/7 and dies on reaching 7."

**Who built it:** Phase 3, **0.6.76** (Death Track rewrite). The trait text itself was *deliberately left at V5* per plan §4.7 and §9.1.

**Where it lives — every hardcoded `5`:**
- `module/data/actor-combatant.mjs:297` — `deathTrackStep: new fields.NumberField({ integer: true, initial: 0, min: 0, max: 5 })` — **the schema cap itself blocks a value of 6 or 7.**
- `module/documents/combat.mjs:177` — `const next = Math.min(5, (ps.deathTrackStep ?? 0) + 1);` (turn-start advance)
- `module/sheets/actor-sheet.mjs:1212` — `deathTrackStep = Math.min(5, deathTrackStep + 1);` (overflow Wound in `#onApplyDamage`)
- `module/apps/manifestation.mjs:211` — same `Math.min(5, …)` in `applyManifestationDefeat`
- `module/sheets/actor-sheet.mjs:406` and `module/sheets/npc-sheet.mjs:273` — `context.deathTrackPips = pips(system.playState.deathTrackStep, 5);` — the sheet renders exactly five pips
- `scripts/origin-data.json`, Deathless → Nature — still carries the **V5** sentence: *"When your Critical Wound activates the Death Track, increase its starting value by 1."* This is now flatly wrong in a different way (V5 raised the *starting* value; V6 raises the *threshold*).

**What has to change:**
1. Introduce a derived `deathTrackMax` on `EssenceCombatantData` — default 5, 7 when the actor has Deathless Nature. Deathless-ness is already discoverable through the Species origin item; `deriveOriginFeatures()` (`module/data/origin-features.mjs`) is the existing seam. Do **not** hardcode a species-name string comparison in five places — derive once.
2. Raise the schema `max` at `actor-combatant.mjs:297` to 7 (the schema cannot be per-actor; the derived `deathTrackMax` is what gates play). Replace all four `Math.min(5, …)` with `Math.min(deathTrackMax, …)` and both `pips(…, 5)` with `pips(…, deathTrackMax)`.
3. Rewrite Deathless Nature in `scripts/origin-data.json` to the new text and re-run `node scripts/build-packs.mjs --only=species`. Do not hand-edit `packs/_source/species/deathless_*.json`.
4. Update plan §4.7's Deathless bullet and §9.1 — see §4.1 below.

### 2.4 "Acting While Dying" exertion — Phase 3, 0.6.76 / `documents/combat.mjs`

**Old text:** nothing. The old Death Track advanced only at the start of each Turn, plus overflow Wounds.

**New text** (Combat → Dying… → **"Acting While Dying - Provisional Playtest"**):
> "The first time each Round you play an Action or Reaction while Dying, advance your Death Track by 1 **after that card finishes resolving**, if you are still Dying. **A failed or interrupted card still counts.** This extra advance occurs **at most once per Round**, even if you stop Dying and become Dying again. It is additional to normal start-of-Turn deterioration and advances caused by further Wounds… **Ordinary Movement does not trigger this additional advance.**"
> Also: "Dying does not itself make a character unconscious or prevent Actions, Reactions, or Movement."

**Where it would live:** `module/documents/combat.mjs:168-180` (`_onStartTurn`'s existing advance) is the sibling logic, and the per-Round gate maps cleanly onto the existing `playState.lastReactionRound` / `lastReactionCombatantId` per-Round-proxy pattern (`actor-combatant.mjs:221-222`). The hook points are the card-roll paths: `actor-sheet.mjs:751` (`#promptDiceCount` card path) and `:845` (equipment-card path), after `rollEssencePool` resolves.

**Scope:** small and self-contained — one new `playState.dyingExertionRound: NumberField` (the Round number the exertion advance was last charged), a check in the card-roll completion path, and the existing `deathTrackAfterWoundFilled`-style helper treatment in `utils.mjs` so all call sites share it. Classify as **new content with no prior placeholder**, but it belongs in a Phase 3 follow-up version (suggest **0.6.97**) rather than waiting, because it changes the most consequential moment in play and the rest of the Death Track is already built.

### 2.5 Minimum commitment must come *entirely* from the Pool; Basic cards join the Rank-0 floor; printed roll limits — Phase 5, 0.6.83

**Old text** (Combat §7 Ranked Combat Cards):
> "Every Combat Card must consume at least 2 dice from the appropriate Action or Reaction Pool for its primary commitment. This applies to ranked, Basic, and Species Combat Cards… **At least 2 dice** of its primary commitment must come from the relevant Pool; free dice never satisfy that requirement. **An explicit alternative payment may replace additional dice beyond those two Pool dice.**"
> "When using a **Rank 0** card, this maximum cannot be lower than 2."

**New text** (Combat → **"Using Cards and Paying Costs"**):
> "Every Combat **or Equipment** Card must consume **its full minimum primary commitment** from the appropriate Action or Reaction Pool, with a minimum of 2 Pool dice. This applies to ranked, Basic, Species, and Equipment Cards…"
> "**The card's entire minimum commitment must come from the relevant Pool. A minimum-3 card consumes at least 3 Pool dice; 2 Pool dice plus 1 free die cannot pay it.**"
> "When using a **Basic or Rank 0** card, its normal Combat roll maximum cannot be lower than 2."
> (Part I summary:) "The normal limit on how many dice you may roll is the relevant Attribute + Combat Style Rank. **Basic and Rank 0 cards have a minimum roll limit of 2; cards with a specific printed roll limit use that limit.**"
> (Equipment Cards:) "…if the card requires no roll and specifies no dice cost, **burn 2**. Free dice cannot pay that minimum."

**Who built it:** Phase 5, **0.6.83** (2-die minimum + Rank 0 floor + max-rolled advisory + Free Dice), plan §5.2.1/§5.2.2.

**Where it lives:**
- `module/sheets/actor-sheet.mjs:751-757` and `:845-849` — `min: cardMin` on the commit dialogs; `npc-sheet.mjs:509`, `:591` mirror it. The "entire minimum from the Pool" rule is **already satisfied** by these (`cardMin` is the dialog floor) — good, no change, but worth a comment since the old text permitted alternative payment beyond 2 and someone might "restore" that.
- `module/sheets/actor-sheet.mjs:587-590` — `#maxRolledDiceNote` computes `Math.max(2, attr + styleRank)`, i.e. it applies the floor-of-2 to **every** card. Under the old text the floor was Rank-0-only; under the new text it is **Basic and Rank 0 only**, and a card with a **printed roll limit** should use that limit instead of `Attribute + Style Rank` at all.

**What has to change:** `#maxRolledDiceNote` needs three branches — (a) card has a printed roll limit → use it verbatim; (b) card is Basic or Rank 0 → `Math.max(2, attr + styleRank)`; (c) otherwise → `attr + styleRank` with no floor. That implies an optional `rollLimit: NumberField` on the card schema (`module/data/item-card.mjs`), which is also what the enemy Roll Limit rule needs (§2.6). The floor-2 on Basic cards is also now the printed rule for Basic Melee / Basic Ranged / Defend themselves (*"The maximum is Might + Prowess, or 2 if that sum is lower"*), so that text goes into the Basic card entries when Phase 7's 0.6.91 authors them.

Also note the new Basic attack default: old said *"Roll a relevant Physical Attribute + Prowess"*; new says **"The maximum is Might + Prowess… If the Source explicitly permits another Physical Attribute, substitute it for Might."** Might is now the default, not "a relevant Physical Attribute."

### 2.6 Enemy Roll Limit semantics and the enemy card package — Phase 3, 0.6.79

**Old text:** nothing equivalent. §9.5's decision ("all enemies roll") was Ryan's answer, not book text.

**New text** (Running the Game → Building Opposition → Enemy Construction / "Start From a Usable Enemy Entry"):
> "Enemies **use their printed card profiles and do not gain the player Basic-card package**. Mooks and Normals need only their specific abilities; Elites can have a broader explicit selection. If an Elite profile grants a Basic or learned card, **state its roll limit** and any needed substitutions in that profile. **A profile with no Reaction cannot use Defend implicitly.**"
> "Use the **normal Tier-based dice pools and Initiative costs** unless the enemy entry provides an exception. **Roll Limit is a per-card maximum, not a separate pool or a number of dice received for every Action.** Enemy Wounds use the simplified capacity described here. **Filling a Mook's two spaces defeats it; it does not produce two player Wound Cards.**"

**Who built it:** Phase 3, **0.6.78** (simplified Wounds 2/4/5) and **0.6.79** (retire the Reduced Engine, all grades roll).

**Assessment:** the new text **confirms** both 0.6.78 and 0.6.79 as correct, and adds two constraints worth auditing:
- `module/data/actor-adversary.mjs` — whatever replaced `fixedAttack`/`fixedDefenses` must express Roll Limit as a **per-card max**, not as a pool size. If 0.6.79 modelled it as a pool, that is now wrong. Verify.
- The NPC/Monster sheets must not hand adversaries the universal Basic Combat Cards when Phase 7's 0.6.91 authors them, and must not offer Defend to a profile without a printed Reaction.
- "Filling a Mook's two spaces defeats it; it does not produce two player Wound Cards" — confirm `npc-sheet.mjs`'s damage path does not call `attachWoundCards`. `npc-sheet.mjs:277` already gates the Death Track on `!system.usesSimplifiedWounds`, and `npc-sheet.mjs`'s imports (line 8) notably **omit** `attachWoundCards` — so this appears already correct. Worth one explicit check.

### 2.7 Temporary Wound and Temporary Influence expiry ordering — Phases 3 and 4

**Old text** (Combat §14): "Whenever a character suffers a Wound, **remove one Temporary Wound first** if one is available."
**New text:** "…remove one **eligible** Temporary Wound first if one is available. **Consume the Temporary Wound with the earliest expiry; those without an expiry are consumed last. If expiries are tied or their relative order is not yet knowable, the owner chooses between them.** … Resolve multiple Wounds one at a time, **respecting any source-specific restrictions**."

**Old text** (Social §8): "Once spent, it is gone. It does not refill through Recovery or merely because an Adventure ends."
**New text** adds: "**Track separately any grants with different expiry times or spending restrictions. Spend eligible Temporary Influence with the earliest expiry first; grants without an expiry are spent last. An Encounter expiry precedes its Adventure expiry.** If expiries are tied or their relative order is not yet knowable, the owner chooses between them. **Ineligible restricted Influence cannot pay the cost.**"

**Where it lives:**
- `module/data/actor-combatant.mjs` — `playState.currentTemporaryWounds` is a **plain integer counter**; `temporaryInfluence` likewise. Neither can represent per-grant expiry or restriction.
- `module/sheets/actor-sheet.mjs:1193, 1201-1204` — `#onApplyDamage`'s Temporary Wound decrement.
- `module/sheets/actor-sheet.mjs` `#onApplyInfluenceInjury` / `#onPayInventorySupport` (Phase 4, 0.6.80/0.6.81).

**Recommendation:** this is a **model change**, not a bug fix. A scalar counter is a legitimate simplification for a table where the GM tracks which grant is which. Do **not** rebuild both fields as arrays-of-grants in a correction pass. Instead: (a) note the rule in the schema doc comments so it is not silently lost, (b) when Presence's per-Adventure grant lands (§3.4) it **needs** an expiry (expires at Adventure end), which is the first grant that genuinely can't be represented by a counter — bundle the model change with that work rather than doing it twice.

### 2.8 Smaller confirmations that needed a second look

- **Breach does not bypass Temporary Wounds** — new text states it explicitly. `actor-sheet.mjs:1200-1205` runs the breach-derived wound count through the same Temporary Wound loop. **Already correct.**
- **Mixed-Domain Damage** — old hedged it (*"Current cards should normally deal one Damage domain at a time. If a future effect genuinely combines…"*); new drops the hedge and states the cycle as a live rule. The cycle itself (`Spiritual → Mental → Physical → repeat`, skipping absent domains) is **unchanged**. Plan §6.11 / Phase 7's 0.6.95 stands, now slightly higher priority.
- **Conditions → Participation** — old: *"Essence generally avoids ordinary Conditions whose primary effect is simply to make a player skip their Turn."* New: *"A Condition restricts only the capabilities named in its entry. Apply those restrictions while allowing the character to use their remaining Actions, Reactions, and Movement normally."* Design guidance became a resolution rule. No code impact; worth a line in the conditions pack guide text (plan §6.5).

---

## 3. Plan updates needed for not-yet-built phases

### 3.1 Phase 6, 0.6.87 — Reconfigure's scope widened (plan §4.9, §7.2)

**Old Reconfigure:**
> "Burn 3 Action dice. Choose one: **swap** one complete prepared weapon, Guard, Implement, or other combat-ready item you are using for another physically available prepared item; or exchange one installed Augment or one combat-replaceable Fitting for a compatible replacement."

**New Reconfigure:**
> "Burn 3 Action dice. Choose one: **ready, stow, recover, or hand over** one complete physically accessible combat-ready item; **swap** one such item you are using for another; or exchange one installed Augment or one combat-replaceable Fitting for a compatible replacement."
> "Use Reconfigure to **draw a combat item into an empty hand, recover one within reach from the ground, stow it**, or exchange it for another… You may instead **hand one item you are using to an adjacent willing creature.** It is ready for the recipient only if that creature has the required free hands… **The recipient cannot include a separate swap in your Action.**"
> Equipment in Combat adds: "**Simply releasing a held item during your own Turn requires no Action: it falls where released.**"
> And: "**Prepared items and Temporary Equipment use the same handling procedure without changing their Inventory accounting.**"

**Plan section to update:** **§4.9** ("Fitting reconfiguration costs") — the cost (burn 3) and the `reconfigureCategory` / `reconfigureCostOverride` treatment are unchanged and still correct, but §4.9 describes Reconfigure as a *swap/exchange* action only. It now also covers draw / stow / pick up / hand over, and explicitly extends to Temporary Equipment. **§7.2**'s Basic Combat Cards row needs the new Reconfigure body text.

### 3.2 Phase 6, 0.6.87/0.6.88 — Equipment Card minimum, and equipment rules confirmed

**New text** (Equipment Cards, and again under Equipment in Combat):
> "**Every Equipment Card consumes at least 2 dice from the appropriate Pool, or its higher printed minimum, in addition to any Resource or Use cost. Roll or burn those dice as instructed; if the card requires no roll and specifies no dice cost, burn 2. Free dice cannot pay that minimum.**"
> "Unless stated otherwise, Equipment Cards **do not require Expertises, count as learned Combat Cards, use Combat Style subtype Riders, or interact with rules that specifically require a Combat Card.**"
> "If it requires Concentration, use Combat Styles: Concentration for the shared limit, upkeep, and disruption rules. **Concentration applies to the equipment's effect even if you have no Magecraft ranks.**"

This **confirms and sharpens §9.6**. Two additions the plan's §5.2.2 / §9.6 don't cover: the *"no roll and no dice cost → burn 2"* default, and the explicit list of what Equipment Cards are **not** (no Expertises, not learned cards, no Style Rider, not a "Combat Card" for rules that name one). That last clause matters — the plan's §9.6 says to "fold it into the shared Combat Card commitment flow," and that is still right for *dice*, but the code must not start applying Mastery (`utils.mjs#hasMastery`) or Style Riders to Equipment Cards as a side effect.

Also new and un-planned: **Concentration applies to equipment effects without Magecraft ranks.**

**Plan sections to update:** §9.6, §5.2.2, and §8's 0.6.83 note ("Equipment Cards ride along automatically here").

### 3.3 Phase 7, 0.6.91 — Basic Combat Cards are now **seven**, not six (plan §7.2)

The new text prints a seventh universal Basic card that has no old-text equivalent:

> **Perform Task - Playtest.** "Action. **Burn 2 Action dice.** Attempt one ordinary task that can reasonably be performed in a brief action… If a roll is needed, roll **the full relevant Attribute + Non-Combat Skill, or Attribute + 5 for a directly applicable Key Aspect**, at the normal card-roll step. **This task roll does not consume further Action dice or use a Combat Style maximum.** Use the normal Non-Combat success rules; **it generates no Surges.** Resolve legal Reactions before applying the task result. The two burned Action dice remain spent even if the attempt fails or is interrupted."
> "Use Perform Task for meaningful handling of ordinary objects… **Ready, recover, stow, swap, or hand over combat equipment with Reconfigure instead.** Perform Task cannot replace an attack, Reconfigure, Stabilize, or another defined Action to bypass its costs."

Perform Task is now load-bearing across the new chapters: **hiding** and **searching** in Combat use it, **Movement** uncertainty (climbing, jumping, swimming) uses it, and several Species Traits now route through it (Deathless "Detached Scout" is rewritten as *"Use Perform Task to detach or reattach… burning its normal 2 Action dice during Combat"*).

**Plan sections to update:** **§7.2**'s row *"Basic Combat Cards | 6 (Basic Melee, Basic Ranged, Defend, Dash, Reconfigure, Stabilize)"* → **7**, adding Perform Task. **§8**'s 0.6.91 line. Note also that Perform Task is the first Basic card that runs the **Non-Combat** roll path inside Combat — it needs `rollEssencePool` with Surges suppressed, which is exactly the suppression work already scoped into Phase 7's **0.6.90**. Consider merging 0.6.90 and 0.6.91.

### 3.4 Phase 7, 0.6.94 — Character Creation changes (plan §8, `character-wizard.mjs`)

Two creation-time changes from the new Attribute benefits:

**Intellect** (new): "**Gain one different Non-Combat Skill at Rank 1 per point of permanent Intellect.** Each selection must be a Skill you do not already possess… **At Character Creation, make these selections before spending the ordinary 5 Skill Points.** Those points and later advancement can improve the granted Skills normally; the Intellect benefit itself cannot raise an existing Skill. **No starting Skill may exceed Rank 2.** … When permanent Intellect increases, gain one new Rank 1 Skill for each point gained. **Temporary Attribute changes do not grant or remove learned Skills.** Record which Skills came from Intellect; retraining recalculates these grants from the resulting permanent score and cannot repeatedly harvest them."

Appendix C's Standard Starting Character row now reads: *"Non-Combat Skills | **Intellect new Rank 1 Skills, then 5 ordinary points** to add or improve Skills; maximum Rank 2."*

**Presence** (new): "**Once during preparation for each Adventure, gain Temporary Influence equal to your Presence** when the grant is received. **Record it separately; any unspent portion expires when that Adventure ends.** If an Adventure begins without a preparation opportunity, receive the grant when it begins. Reopening preparation, changing plans, returning to town, or increasing Presence afterward does not grant additional points for the same Adventure. … It does not increase Reach or Armory or Inventory limits."

**Where these land:**
- `module/apps/character-wizard.mjs` — the Non-Combat Skills step must add an Intellect-granted pre-step before the 5 ordinary points, and tag which Skills came from Intellect (so retraining can recompute them). The wizard's `STEPS` array is positionally indexed by `#prepareStep`'s `switch` (plan §3.2) — **add the sub-step inside the existing Non-Combat step; do not insert a new step**.
- `module/utils.mjs:436-448` `resetAdventureUses` — the natural home for the Presence grant, alongside the `reachPressure: 0` reset already there. But the grant *expires* at Adventure end, so it needs a separate tracked bucket (see §2.7) rather than being added to the scalar `temporaryInfluence`.
- Plan **§8**'s 0.6.94 entry currently covers "Expertise limit = Style Rank (+1 for Distinction Style)… `advancementPoints` derived field… Level 1 grants no AP." Add the Intellect skill grant. Presence's grant belongs with the Influence work (Phase 4 follow-up) rather than 0.6.94.

### 3.5 Phase 6, 0.6.88 — used-vs-unused preparation: **confirmed unchanged, with two clarifications**

The central Phase 6 rule survives verbatim:
> "Prepared, but unused | Counts while prepared. **If Armory access is regained, its allocation may be transferred to an equal-capacity replacement.**"
> "Used during the Adventure | **Its allocation remains committed for the rest of the Adventure, even if stored, lent, depleted, lost, or replaced.**"

New clarifications worth folding into plan §5.7:
- **Lending commits the lender's allocation:** "Rook lends Mara a prepared Toolkit. Mara can use it without making a second Inventory allocation; it remains attached to Rook's preparation. **If it was unused before, its contribution now commits that allocation for the Adventure.** Passing it back does not restore the allocation or change the item into Temporary Equipment." Plan §5.7 currently lists "Lending / item state travels with the physical item — no model; low priority." The lending↔commitment interaction is now explicit and is *not* low priority once `usedThisAdventure` exists.
- **Over-limit pressure is not refunded:** "Putting equipment away later does not refund the pressure already accumulated." And the worked example confirms the **ceil-on-total** rule shipped in 0.6.81 (4.5 → 1; 5 → still 1; 6 → 2, paying only the additional 1). **Already correct.**
- **Armory-inclusive-of-Inventory** confirmed: *"Prepared items are already part of the Armory; they are not a second collection."* Plan §5.7's `computeSlotUsage` change stands.

### 3.6 New chapters with no phase at all

These have no plan section to correct — they need a decision about whether to scope them:

| New chapter | Size | Entanglement |
|---|---|---|
| **Senses and Detection** (Part IX) — passive vs deliberate Senses, base ranges, Acuity extension, "locating identifies the occupied space," Senses never extend Range or pass barriers | Medium | Touches Species Traits (Sensor Suite, Grave Sense, Keen, etc. now cite it), Cover/Awareness, and Acuity's Attribute benefit. Self-contained as *data* (per-Sense entries on species items); the Acuity +1/+2 range derivation is the only code. |
| **Hiding and Searching** (Combat → Cover, Barriers, and Awareness) — Hidden is per-observer, Perform Task + Grace/Infiltration to hide, Acuity/Investigation to search, task roll not opposed, persistence without re-rolling | Small–Medium | Depends on Perform Task (§3.3). Mostly GM procedure; a Hidden condition already exists as `revealed_*` in `packs/_source/conditions/`. |
| **Movement: Climbing, Swimming, Jumping, Falling, Gliding, Airless/Submersion** | Medium | Climb/Swim cost 2 Movement per unit (4 in Difficult Terrain); one running Movement total across mode changes; running jump = Grace units with a 2-unit run-up; gliding descends 1 per 2 horizontal. Several Species Traits (Glider, Swimmer, Climber, Wings, Alternate Chassis, Jet Propulsion) now reference these. Largely reminder text; the only real state is the per-Turn Movement running total. |
| **Passive Feature Catalog** (Part XIII) | Stub | *"The complete set of Skill Tree Passive Feature entries is not yet included in this edition."* No content to build. Character Creation Step 8 already records Species/Heritage/Distinction passives, which the module already derives. **No action.** |
| **Vigor / Resolve / Might / Grace Attribute benefits** | Small each | Exceptional loads (50 lb per Might), extreme exertion (Vigor minutes = 6×Vigor Rounds), sustained attention (Resolve hours), running jump (Grace units). All are GM-adjudicated reminders — best delivered as sheet tooltips on the Attribute rows, not as tracked state. |

---

## 4. Previously-open questions now answered

### 4.1 §9.1 Deathless — **ANSWERED. Override the existing decision.**

> **New text:** "Deathless Nature - Playtest: **your Death Track ends at 7 instead of 5.** When all five Core Wound spaces first fill, become Dying at 0/7; reaching 7 causes death. Advancement of the Death Track, exertion while Dying, additional Wounds, Stabilization, retained progress, and recovery otherwise follow the normal rules. **Your Core Wound track still has five spaces.**"

§9.1 currently reads *"a new direction is being designed separately, currently in progress. Don't restore the V5 rule, don't guess a replacement — leave the existing V5 text in place untouched until the new design is delivered."* **The new design has been delivered and is in this revision.** §9.1 and §4.7's Deathless bullet should both be rewritten to point at the new rule, and §5.1.3's table row ("Deathless modifier — Resolved, §9.1 — new design in progress") likewise. The V5 text still sitting in `scripts/origin-data.json` is now actively wrong, not merely a placeholder. See §2.3 for the build.

### 4.2 §9.8 Critical Wound recovery duration — **still unanswered, same status**

> **New text (five separate places):** "**Draft note: the duration of natural Critical Wound recovery is not yet specified.**"

Unchanged from the old *"with the exact duration still to be finalized."* §9.8's decision (**warn only — Critical Wounds are GM/DM fiat**) remains correct. No action.

### 4.3 §9.3 Skill Tree — **point total re-confirmed, node topology still blocked**

> **New text:** "Advancement Points earned beyond standard Character Creation = **(Tier - 1) x 10 + (Level - 1)**" … "Tier 5, Level 10 | **49**" … "**Every advancement after the character's initial Tier 1, Level 1 position grants one Advancement Point. Entering a new Tier at Level 1 therefore still grants an Advancement Point; only the initial starting position is exempt.**"
> "**Draft note: the Skill Tree's complete paths, prerequisites, and node list are not yet included.** This Part explains how Advancement Points and node benefits work, but does not provide the full set of advancement choices."

§9.3 stands exactly as written. The formula is re-confirmed (49 max, Level 1 grants none), and the tree itself is now *explicitly* flagged as absent in the book rather than merely missing. **Ship the derived `advancementPoints` field in 0.6.94 as planned; keep the tree blocked.** One clarification worth recording: the new text spells out that **entering a new Tier at Level 1 still grants a point** — the formula already produces this ((2−1)×10 + (1−1) = 10), but a naive "only Levels grant points" reading would not.

New in this revision and relevant to 0.6.94: **"A node granting a second Distinction requires at least Tier 3,"** and **"Dilettante… may only be chosen during Character Creation. It cannot be acquired later as a second Distinction."** The plan's appendix notes "Second Distinction gating — `item-origin.mjs` has no auto-grant-on-Tier logic to remove"; that remains correct (the gate is a *node prerequisite*, not an automatic Tier grant), but the Tier-3 floor and the Dilettante exclusion are new facts for whenever the tree is built.

### 4.4 §9.4 Summoner / the 17 manifestation profiles — **still blocked, families re-confirmed**

> **New text (Part XII):** "**The fixed numeric profiles for the manifestation families listed in Combat Styles are not yet included in this edition.** The shared Full Manifestation rules and family names do not supply the values needed to use a form in play."

The 17 family names are unchanged (Rank 0: Familiar, Sprite / 1: Beast, Phantom, Golem / 2: Elemental, Ancestor, Fey / 3: Dragon, Fiend, Celestial / 4: Abomination, Leviathan, Avatar / 5: Outsider, Titan, Primordial). §9.4's "deprioritized" decision stands.

Two Calling rules *are* now more specific than the old text, for whenever this is picked up:
- "The form can use only its profile's granted Actions and Reactions; **it does not inherit universal Basic cards, the caller's learned cards, or the caller's Species and Equipment Actions.**"
- A printed **native Action/Reaction minimum-dice table** by Rank (Rank 0–1: 2/2; Rank 2–3: 3/2 and 4/2; Rank 4: 5/3; Rank 5: 6/3), and "**A manifestation's printed Roll Limit replaces Attribute + Combat Style Rank** for its native abilities. Free dice can exceed that limit; minimum commitments still apply."
- "**Each Recovery removes 1 Manifestation Wound as a specific Calling exception**" — this is what `#reduceOneManifestationWound` (`actor-sheet.mjs:1415`) already implements, and it is now printed book text rather than plan inference. §5.4's row is confirmed.

### 4.5 §9.7 What Tier grants (Reach / Inventory / Armory) — **still unanswered, but the book now asserts it exists**

> **Old text:** "Armory Limit measures maintained significant equipment… **Tier advancement and Skill Tree nodes can later increase it.** The current starting relationship… is approximately two maintained options for every one normal prepared option; **the exact higher-Tier progression remains a playtest value.**"
> **New text (Advancement → Tier Advancement → Reach and Equipment Capacity):** "**Tier also provides automatic baseline growth in Reach and equipment capacity.** These automatic increases exist alongside Skill Tree nodes that can provide further Reach, Inventory, or Armory growth. **Draft note: the exact automatic Reach, Inventory, and Armory increases at each Tier are not yet specified.**"

The *numbers* are still missing, so §9.7's decision ("keep manual for now, GM-set as today") remains the right call. But the framing shifted: the book now commits to Tier providing an **automatic baseline**, not merely "can increase." When the numbers arrive, `reach` / `armoryLimit` / `inventoryLimit` will want to become derived-with-override fields rather than plain GM-set numbers. Worth a one-line note in §9.7 so that design isn't foreclosed.

### 4.6 §9.6 Equipment Card dice cap — **answered in the book, matching Ryan's decision**

The book now prints the rule §9.6 recorded as Ryan's call: Equipment Cards use the same minimum Pool commitment (2, or higher printed) as Combat Cards. See §3.2 for the two additions the decision didn't cover (the burn-2 default; the explicit "not a Combat Card for rules that name one" list).

### 4.7 §9.2 Augment recharge, §9.5 how weak enemies fight, §9.9 Adventure sizing — **unchanged**

- **§9.2:** no per-Augment recovery rules appear. The book still says *"Uses belong to the actual item or Augment. Moving, lending, or reinstalling something does not refresh expended Uses"* and supplies no universal refresh. §9.2's "keep the V5 blanket refresh" stands. `utils.mjs:440-447` unchanged.
- **§9.5:** confirmed and strengthened — see §2.6.
- **§9.9:** the Adventure length table is byte-identical (Short 1–2 / Medium 2–4 / Long 4–6+). No action.

### 4.8 §10.1 Multi-actor Influence-support payer UI — **unchanged**

> "**Sharing Influence and Support**" is present in the new text with the same content. The follow-up question in §10.1 (one-off dropdown vs. a shared actor-picker component) is unaffected. Note that the new **Cooperation** rules and the new **Reconfigure "hand over an item to an adjacent willing creature"** clause both create a second and third place where "pick another actor" is needed — which strengthens the case for the shared component §10.1 asks about.

---

## 5. New content with no prior scope

Ordered by how entangled each is with what already exists.

| # | New mechanic | Size | Entanglement |
|---|---|---|---|
| 1 | **Acting While Dying** (Death Track exertion) | Small | **Deeply entangled** — modifies the Phase 3 Death Track state machine. One new per-Round flag + a hook in the card-resolution path. Do it soon; see §2.4. |
| 2 | **Nine per-Attribute benefits** | Small each, Medium together | **Three are entangled with shipped code**: Anima → `#onGrantRecovery` (§2.2), Presence → Temporary Influence + `resetAdventureUses` (§3.4), Intellect → `character-wizard.mjs` (§3.4). Adaptability's reroll needs one new boolean. Might / Grace / Vigor / Resolve / Acuity are reminder text + one derived sense-range bonus. |
| 3 | **Perform Task** Basic card | Small | Entangled with Phase 7's Surge-suppression work and with Hiding/Searching and Movement. Merge into 0.6.90/0.6.91. |
| 4 | **Senses and Detection** chapter | Medium | Mostly **content**: per-Sense entries with ranges on Species items, plus Acuity's +1/+2 range derivation. Several Species Traits were rewritten to cite it (Sensor Suite, Grave Sense, Detached Scout). |
| 5 | **Hiding and Searching** procedure | Small–Medium | Needs Perform Task. Otherwise GM procedure + reminder text. |
| 6 | **Movement: Climbing, Swimming, Jumping, Falling, Gliding, Airless/Submersion** | Medium | Self-contained. The only genuine state is "one running Movement total across mode changes." Several Species Traits reference it. Mostly reminder text. |
| 7 | **Risk Casting** (named procedure) | Small | Formalizes buying a targeting Surge to make an intended target legal, plus a fallback-selection rule. Affects the card-resolution chat card at most; the module has no targeting runtime, so this is reminder text. |
| 8 | **Leadership Authority: storage on the generating card** + Orator two-results-per-card exception | Small | Not built either way (`specialties` has no Authority model). New detail for whenever Leadership is modelled. Note the old text already had the capacity table (half Rank, rounded up, min 1) — what's new is that results live on the *generating* card and cannot transfer. |
| 9 | **Equipment Card ↔ Concentration** ("Concentration applies to the equipment's effect even if you have no Magecraft ranks") | Small | New cross-link. Relevant to Phase 6. |
| 10 | **Ending Combat while effects persist** ("Continue the existing Initiative order and ten-second Rounds while ongoing effects require periodic resolution… This includes Dying, Burning, maintained Adaptations, and Concentration upkeep") | Small | Interacts with Phase 7's 0.6.92 "New Encounter" button and with the Death Track's turn-start advance — if combat ends while a PC is Dying, the book says tracking continues. |
| 11 | **Passive Feature Catalog** (Part XIII) | Stub | No content. No action. |

---

## 6. Confirmed unchanged — do not re-check these

Checked line-by-line against the baseline and found materially identical:

- **Core Wound track structure** — five spaces, 2 Light / 2 Serious / 1 Critical; gap-filling ("fill the earliest available empty space… skipping spaces that are already occupied"); "the Wound keeps the severity of the space it entered."
- **Wound State by highest occupied severity** — table identical (None/Light/Serious/Critical → Unharmed/Lightly/Seriously/Critically Wounded), including the "occupancy still determines remaining capacity" clause. Phase 3's 0.6.75 stands.
- **The nine baseline fallback Wound Cards** — names (Impaired Body, Debilitated Body, Catastrophic Injury, Disrupted Mind, Cognitive Trauma, Fractured Consciousness, Unmoored Essence, Spiritual Trauma, Severed Essence), ongoing effects (Movement −1 / −2 / halve rounded up; Composure −1/−1/−2; Harmony −1/−1/−2), and natural-recovery baselines are **word-for-word identical**. Only the trailing "exact duration remains to be finalized" became "Draft note: …". **0.6.77's nine Condition Items need no change.**
- **Natural recovery order-free vs. active healing lowest-severity-first** — identical, including "the absence of lesser Wounds does not allow a Light-only healing effect to remove a Critical Wound."
- **Death Track three-state table, activation at 0 without advancing, first advance at next Turn start, overflow Wound advances and breaks Stabilization, removing any Core Wound stops advancement while recorded progress persists, removing the Critical Wound resets to 0, Recovery −1 while not Dying** — all identical. Only the *threshold* changed (Deathless), plus the new exertion rule.
- **Resilience and accumulated Damage** — the "remaining protection = current Resilience − accumulated ordinary Damage, min 0" procedure and the "a Resilience change never retroactively creates or removes Wounds" guarantee are word-for-word identical, including the worked example. **0.6.85's `accumulatedDamageWounds` fix stands.**
- **Breach Damage** — "skips Resilience entirely and does not add to accumulated ordinary Damage… After Resistance or Vulnerability is applied, each point causes 1 Wound directly… Breach does not bypass Temporary Wounds." Identical.
- **Influence: three-layer sequence** — Reach absorbs ordinary pressure first, then Temporary Influence, then Core Influence; Breach skips Reach but still passes through Temporary Influence; "Reach does not decrease as pressure accumulates — record the accumulated pressure instead"; Reach pressure resets at a story beat, normally end of Adventure. **Phase 4's 0.6.80 stands.**
- **Influence Consequence Cards** — the three baseline fallbacks (Strained Position / Compromised Standing / Crisis of Standing) are word-for-word identical, including effects and recovery. **0.6.81's three Condition Items need no change.**
- **Inventory over-limit → ordinary pressure, rounded up on the total** — confirmed by a new worked example (4.5 → 1; 5 → still 1; 6 → 2, paying only the additional 1). "Another character can pay the support cost" retained. **0.6.81 stands.**
- **Cover** — Low +1 / High +2 Fortitude, identical in both the chapter and the quick-reference table. **0.6.86's two Condition Items stand.**
- **The eight ordinary Conditions** — Blinded, Burning, Dazed, Immobilized, Prone, Restrained, Silenced, Weakened: all eight effect texts are word-for-word identical. Stacking/reapplication rules identical. "Hidden and unaware are information states, not Conditions" retained, with the unaware Reaction tax still "burn 1 additional Reaction die." Plan §6.5 / Phase 6's 0.6.89 is unaffected.
- **Psionics Strain** — the 0-2 / 3-4 / 5-6 table, the voluntary-Strain-for-a-Surge rule, the 6 cap, forced-Strain-past-6 → 1 Psychic Breach Damage per excess, the burn-2-to-remove-2 procedure, and Recovery clearing Strain are all identical. **Plan §4.2's target values are still correct.**
- **Appendix J subtype families** (all nine Styles, including Calling's Rank 0–5 list of 17) — identical. **Plan §4.3's re-derivation target is unchanged.**
- **Species Combat Cards** (Shaper, True Breath, Ink Cloud, Spore Cloud) — same four, same costs (burn 2 Action dice), same frequencies (Shaper once per Turn; the other three once per Encounter), same effects. Only cosmetic rewording ("create a 1-unit area of opaque ink" → "fill one adjacent hex with opaque ink"). **Plan §6.7 / 0.6.93 unchanged.**
- **Magecraft Thread effects** (Appendix G, all ten) — unchanged. Plan §6.12 stands.
- **Initiative and pools** — "choose 1 to 5 + Tier dice… the chosen Initiative dice reduce only your first Action Pool; your starting Reaction Pool is not reduced"; base Action and Reaction Pools = 5 + Tier; end-of-Turn Reaction Pool = 5 + Tier + unused Action dice. Identical. **The plan's appendix entries stay correct.**
- **Start-of-Turn sequence** — clear Reaction Pool → reset accumulated ordinary Damage → form Action Pool → resolve start-of-Turn effects. Identical.
- **Success and Surges** — opposed reserves one highest die and every *other* rolled 6+ Surges (so tied-high dice at other indices still Surge); unopposed reserves none and every 6+ Surges; a natural 10 is not automatic success. Identical. **`essence-roll.mjs:34-43` stands.**
- **Reactions: one response per chain** — identical. Plan §5.2.7's "keep the proxy, don't build a chain tracker" recommendation stands.
- **Enemy Wound capacities** — Mook 2 / Normal 4 / Elite 5, and Solo keeps the Elite 5. Identical. Six enemy Roles and three Elite sub-roles identical. **0.6.78 stands.**
- **Encounter categories and Adventure sizing** — Minor 1–2 / Severe 2–3 / Critical 3–5 / Boss 3–5 Rounds; Short 1–2 / Medium 2–4 / Long 4–6+ combats. Identical.
- **Non-Combat resolution** — Attribute + Skill Rank, Key Aspect = Attribute + 5 (replacing, not stacking), 1-die roll legal with no applicable Skill, Career never rolled, no Non-Combat Surges, Cooperation grants 1 free die per meaningful helper. Identical. **Plan §5.5 unchanged.** (The only addition is Adaptability's reroll — §2.2.)
- **Resources and Defenses formulas** — 2 + two highest / 2 + two lowest per domain. Identical.
- **Character Creation numbers** — 7 additional Attribute points (max 3), 5 Combat Style points (max Rank 2), 4 Expertises, 10 learned cards, 5 Non-Combat Skill points (max Rank 2), 1 Career + 3 Key Aspects, Reach 1, Armory 8, Inventory 4. Identical *except* the Intellect skill pre-step (§3.4).
- **Expertise limit = Style Rank, +1 for an associated Distinction** — identical. Plan §8's 0.6.94 item stands.
- **Equipment capacity table** — complete item 1, Toolkit 1, Consumable Kit 1, loose Chassis 1/2, loose Fitting 1/2, all Augments 0 (stored, spare, and installed). Identical. **`utils.mjs:140`'s unconditional 0 for Augments stands.**
- **Quartermaster's Due** — still one Chassis + one compatible Fitting, each ≤1 Tier above the Reach-supported allowance, occupying capacity normally. Plan §4.6's "registry-shape extension" note stands. (New: a "to a maximum of Tier 5" ceiling and a worked "at Reach 1 you get Tier 2 + Tier 2" example.)
- **"Exceptional Loot Does Not Charge Rent"**, Consumable Kit resupply, Function Augment Uses not refreshing on move/lend/reinstall — all retained unchanged.

---

## 7. Suggested sequencing

Fitting into the existing §8 build order with minimum disruption:

- **Now, before Phase 6** — a correction pass, one version each:
  - **0.6.97** Resistance/Vulnerability cancellation + Damage-type keying (§2.1). *Highest priority: shipped code contradicts printed text.*
  - **0.6.98** Recovery: Anima bonus + Adaptability reroll restore (§2.2).
  - **0.6.99** Deathless Death Track = 7: derived `deathTrackMax`, all five hardcoded caps, `origin-data.json` rewrite (§2.3), **plus** Acting While Dying (§2.4) — they touch the same state machine, so do them together.
  - *(These consume the 0.6.9x band; if that collides with the reserved `0.7.0` content release, renumber into a 0.6.9x gap rather than splitting the Death Track work.)*
- **Fold into Phase 6 as scoped** — Reconfigure's widened scope (§3.1) into 0.6.87; Equipment Card minimum details (§3.2) into 0.6.87/0.6.88; lending↔commitment (§3.5) into 0.6.88.
- **Fold into Phase 7** — Perform Task + merged Surge suppression (§3.3) into a combined 0.6.90/0.6.91; Intellect skill grant (§3.4) into 0.6.94; `#maxRolledDiceNote` branches + card `rollLimit` field (§2.5) alongside 0.6.91.
- **Decide before scheduling** — Senses and Detection, Hiding and Searching, the Movement procedures, and the remaining Attribute benefits (§5, items 4–6 and the non-entangled half of item 2). None blocks anything built; all are mostly content and reminder text.
- **Still blocked, unchanged** — Skill Tree nodes (§4.3), Calling manifestation profiles (§4.4), Tier-based Reach/Inventory/Armory numbers (§4.5), Critical Wound recovery duration (§4.2).

Per plan §7.3, each correction version above also needs the matching sentence checked in the three `guide` journals (`scripts/guide-data.json`) and the `essence-foundry.wiki` mirror — the Deathless and Recovery changes in particular restate rules in prose there.
