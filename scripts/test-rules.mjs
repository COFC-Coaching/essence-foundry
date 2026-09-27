/**
 * Rule-math regression tests: pure helpers checked against the worked examples printed in the
 * Essence System v0.6 rulebook (the Google Doc). Each case cites the Doc line it reproduces, so a
 * future rules revision shows exactly which example moved.
 *
 * Run with `npm test` (after test-migration.mjs). Only helpers with no Foundry dependency belong
 * here; module/utils.mjs has no imports and loads under plain Node.
 */

import { ordinaryDamageWounds, isDistinctionStyle, distinctionUnlocks, componentTiers, computeTierGate, deathTrackAfterWoundRemoval, deathTrackAfterWoundFilled, burnOnlyProfile, equipmentCardCommitment, recoveryBaseAmount, initiativeTieBreak, applyFlatReduction, resolveDamageComponents, hasOriginDistinction, addThread, authorityCapacity, authorityResultsPerCard, storeAuthority, spendAuthority, lockCapacity, contingencyCapacity, riteCapacity, placeRite, adaptationUpkeep, forcedStrain, psionicsBurnSurchargeAt, manifestationEntryCost, manifestationTrack } from "../module/utils.mjs";
import { resolveNonCombatRoll } from "../module/dice/essence-roll.mjs";
import { laterAcquisitionText } from "../module/data/origin-features.mjs";
import { ITEM_GRANT_REGISTRY, tierQualifiesForGrant } from "../module/data/item-grants.mjs";

let pass = 0;
let fail = 0;
function check(name, actual, expected) {
  if (Object.is(actual, expected)) {
    pass++;
    console.log(`  ok  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}\n       expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

console.log("\n--- ordinaryDamageWounds (Part VII, Resilience and Accumulated Damage) ---");
// Rook, Resilience 1 (Doc L3883): the first 1 Damage is absorbed, the second causes 1 Wound.
check("L3883 first point absorbed", ordinaryDamageWounds(1, 0, 1), 0);
check("L3883 second point wounds", ordinaryDamageWounds(1, 1, 1), 1);
// Resilience 3 with 2 accumulated falls to 1 (Doc L3885): no immediate Wound, next 1 Damage = 1 Wound.
// The pre-0.7.10 stored-running-count code gave 2 here.
check("L3885 Resilience drop, next point", ordinaryDamageWounds(1, 2, 1), 1);
// 3 Fire + 2 Psychic against Resilience 2 (Doc L3913): Fire causes 1, then Psychic meets no protection.
check("L3913 first component", ordinaryDamageWounds(2, 0, 3), 1);
check("L3913 second component", ordinaryDamageWounds(2, 3, 2), 2);
// Hazard vent, Resilience 1, 2 Fire Damage (Doc L7093): 1 Core Wound.
check("L7093 hazard vent", ordinaryDamageWounds(1, 0, 2), 1);
// "A change to Resilience never creates or removes Wounds retroactively" (Doc L3885), rising case.
check("Resilience rise mid-interval", ordinaryDamageWounds(3, 2, 1), 0);
check("zero Damage", ordinaryDamageWounds(2, 0, 0), 0);

console.log("\n--- isDistinctionStyle (Distinction +1 Expertise limit, Doc L846) ---");
const athlete = { system: { keyCombatSkill: "Prowess" } };
check("capitalized Distinction matches lowercase key", isDistinctionStyle(athlete, "prowess"), true);
check("different Style", isDistinctionStyle(athlete, "cunning"), false);
check("no Distinction", isDistinctionStyle(null, "prowess"), false);
check("'None' key matches nothing", isDistinctionStyle({ system: { keyCombatSkill: "None" } }, "prowess"), false);

console.log("\n--- Non-Combat resolution (Part I, Doc L1238-L1241, L1265-L1269) ---");
// "A final highest result meeting or exceeding the Difficulty succeeds"; the dice are never summed.
check("L1239 highest die meets Difficulty", resolveNonCombatRoll([3, 7, 5], 7).succeeded, true);
check("L1239 highest die below Difficulty", resolveNonCombatRoll([3, 6, 5], 7).succeeded, false);
check("L1238 read the highest, not the sum", resolveNonCombatRoll([4, 4, 4], 8).succeeded, false);
check("L1241 Attribute 1, no Skill: one die", resolveNonCombatRoll([9], 8).succeeded, true);
check("L1269 Difficulty above 10 is unreachable", resolveNonCombatRoll([10, 10], 11).succeeded, false);
check("no Difficulty: the GM decides", resolveNonCombatRoll([8, 2], null).succeeded, null);
check("highest die is reported", resolveNonCombatRoll([8, 2], null).highest, 8);

console.log("\n--- Two Distinctions (Part VIII, Doc L4911-L4921, L5592) ---");
const strategist = { system: { keyCombatSkill: "Cunning", unlocks: null, benefit: "Gain one additional Cunning Expertise. If acquired later: instead increase Cunning to a minimum of 2 pips, then gain one additional Cunning Expertise." } };
const arcanist = { system: { keyCombatSkill: "Magecraft", unlocks: "magecraft", benefit: "Gain access to Magecraft." } };
check("L4921 each Distinction raises its own Style", isDistinctionStyle([strategist, arcanist], "magecraft"), true);
check("L4921 the first still counts", isDistinctionStyle([strategist, arcanist], "cunning"), true);
check("an unrelated Style is not raised", isDistinctionStyle([strategist, arcanist], "prowess"), false);
check("single item still accepted", isDistinctionStyle(strategist, "cunning"), true);
check("L4921 a later Distinction unlocks its restricted Style", distinctionUnlocks([strategist, arcanist], "magecraft"), true);
check("no Distinction unlocks nothing", distinctionUnlocks([], "magecraft"), false);
check("L4919 later-acquisition text is the clause after the marker", laterAcquisitionText(strategist.system.benefit), "instead increase Cunning to a minimum of 2 pips, then gain one additional Cunning Expertise.");
check("no marker: the whole benefit", laterAcquisitionText(arcanist.system.benefit), "Gain access to Magecraft.");

console.log("\n--- Death Track edges (Part VII, Doc L2729, L4057-L4100) ---");
check("L2729 removing the Critical Wound resets the step even when not governed", deathTrackAfterWoundRemoval("none", 4)?.resetStep, true);
check("removing a Light Wound while not governed changes nothing", deathTrackAfterWoundRemoval("none", 0), null);
check("removing any Wound while dying stops the track", deathTrackAfterWoundRemoval("dying", 1)?.state, "none");
check("removing a Light Wound while dying keeps the step", deathTrackAfterWoundRemoval("dying", 1)?.resetStep, false);
check("L4059 death is final: removal does nothing", deathTrackAfterWoundRemoval("dead", 4), null);
check("L4100 a refilled track resumes from the recorded step", deathTrackAfterWoundFilled("none", false, true)?.deathTrackStep, undefined);
check("L4057 filling the fifth space starts dying", deathTrackAfterWoundFilled("none", false, true)?.deathTrackState, "dying");
check("an overflow Wound breaks Stabilization", deathTrackAfterWoundFilled("stabilized", true, true)?.deathTrackState, "dying");
check("death is final: overflow does nothing", deathTrackAfterWoundFilled("dead", true, true), null);

console.log("\n--- Burned dice and printed commitments (Doc L3639, L3680, L4258, L4276, L4320, L5421, L4204) ---");
check("Dash burns 2 by name", burnOnlyProfile({}, "Dash")?.burn, 2);
check("Stabilize burns 3 by name", burnOnlyProfile({}, "Stabilize")?.burn, 3);
check("Prepare Action burns 2 by name", burnOnlyProfile({}, "Prepare Action")?.burn, 2);
check("a Species card burns 2", burnOnlyProfile({ speciesGranted: true }, "Shaper")?.burn, 2);
check("schema fields win over the name table", burnOnlyProfile({ noRoll: true, burnDice: 4 }, "Dash")?.burn, 4);
check("a rolling card has no burn profile", burnOnlyProfile({ min: "2" }, "Basic Melee Attack"), null);
check("L4204 Equipment Card: printed burn", equipmentCardCommitment("REACTION • Burn 2 • USES 2").burn, 2);
check("L4204 Equipment Card: printed roll minimum", equipmentCardCommitment("Roll 3+ Action dice against Fortitude.").min, 3);
check("L4204 Equipment Card: nothing printed burns 2", equipmentCardCommitment("Gain +1 Fortitude until your next Turn.").burn, 2);
check("L3592 a printed burn below 2 is floored at 2", equipmentCardCommitment("Burn 1 die.").burn, 2);

console.log("\n--- Recovery and Fatigued (Doc L2701, L2709, L2713) ---");
check("L2709 Stamina 9: base 3", recoveryBaseAmount(9), 3);
check("L2709 Focus 7: base 2", recoveryBaseAmount(7), 2);
check("L2713 Fatigued Stamina 9: 2", recoveryBaseAmount(9, 25, true), 2);
check("L2713 Fatigued Focus 7: 1", recoveryBaseAmount(7, 25, true), 1);
check("L2713 Fatigued Mana 6: 1", recoveryBaseAmount(6, 25, true), 1);

console.log("\n--- Initiative ties (Doc L3402) ---");
check("a PC goes before a tied enemy", initiativeTieBreak("character", "npc") < 0, true);
check("an enemy goes after a tied PC", initiativeTieBreak("monster", "character") > 0, true);
check("two PCs: no rule here", initiativeTieBreak("character", "character"), 0);

console.log("\n--- Damage components (Part VII, Doc L3896-L3918, L4117-L4119, L4188) ---");
const track = () => Array.from({ length: 5 }, () => ({ filled: false }));
check("L3900 −1 comes off the largest component", JSON.stringify(applyFlatReduction([3, 2], 1)), "[2,2]");
check("L3900 a further −1 on a tie reduces the earlier one", JSON.stringify(applyFlatReduction([2, 2], 1)), "[1,2]");
check("reduction stops at 0", JSON.stringify(applyFlatReduction([1], 3)), "[0]");
// L3912-L3914: Resilience 2, nothing accumulated: 3 Fire + 2 Psychic = 1 Physical Wound then 2 Mental Wounds, accumulated 5.
const ex1 = resolveDamageComponents({ resilience: 2, accumulated: 0, tempWounds: 0, coreWounds: track() }, [{ amount: 3, type: "Fire" }, { amount: 2, type: "Psychic" }]);
check("L3914 three Wounds in all", ex1.filledSlots.length, 3);
check("L3914 first Wound is Physical", ex1.filledSlots[0].domain, "Physical");
check("L3914 the Psychic Wounds are Mental", ex1.filledSlots[1].domain + "/" + ex1.filledSlots[2].domain, "Mental/Mental");
check("L3914 accumulated Damage is 5", ex1.accumulated, 5);
// L3918: 3 Fire + 2 Psychic reduced by 1 -> 2 Fire + 2 Psychic; Fire Resistance takes the Fire to 0; 2 Psychic resolve normally.
const ex2 = resolveDamageComponents({ resilience: 0, accumulated: 0, tempWounds: 0, coreWounds: track(), resistances: [{ damageType: "Fire" }] }, [{ amount: 3, type: "Fire" }, { amount: 2, type: "Psychic" }], 1);
check("L3918 reduction is not reassigned after Resistance", ex2.filledSlots.length, 2);
check("L3918 both Wounds are Mental", ex2.filledSlots.every((f) => f.domain === "Mental"), true);
check("Temporary Wounds absorb first", resolveDamageComponents({ resilience: 0, accumulated: 0, tempWounds: 1, coreWounds: track() }, [{ amount: 2, type: "Slashing", breach: true }]).filledSlots.length, 1);
check("L4057 filling the fifth space starts Dying", resolveDamageComponents({ resilience: 0, accumulated: 0, tempWounds: 0, coreWounds: track() }, [{ amount: 5, type: "Slashing", breach: true }]).deathTrackState, "dying");
const ex3 = resolveDamageComponents({ resilience: 0, accumulated: 0, tempWounds: 0, coreWounds: track() }, [{ amount: 7, type: "Bludgeoning", breach: true, nonlethal: true }]);
check("L4117 nonlethal last space: stabilized", ex3.deathTrackState, "stabilized");
check("L4117 nonlethal: unconscious flag", ex3.nonlethalStable, true);
check("L4119 nonlethal surplus does not advance the track", ex3.deathTrackStep, 0);
const full = track().map(() => ({ filled: true }));
const ex4 = resolveDamageComponents({ resilience: 0, accumulated: 0, tempWounds: 0, coreWounds: full, deathTrackState: "stabilized", deathTrackStep: 2 }, [{ amount: 1, type: "Slashing", breach: true }]);
check("an extra Wound while Stabilized breaks it and advances", ex4.deathTrackState + ex4.deathTrackStep, "dying3");
const ex5 = resolveDamageComponents({ resilience: 0, accumulated: 0, tempWounds: 0, coreWounds: full, deathTrackState: "dying", deathTrackStep: 4 }, [{ amount: 1, type: "Slashing", breach: true }]);
check("L4059 reaching the threshold is death", ex5.died, true);
check("L4119 a nonlethal component does not stabilize someone already Dying", resolveDamageComponents({ resilience: 0, accumulated: 0, tempWounds: 0, coreWounds: full, deathTrackState: "dying", deathTrackStep: 1 }, [{ amount: 1, type: "Slashing", breach: true, nonlethal: true }]).deathTrackState, "dying");
const ex6 = resolveDamageComponents({ resilience: 1, accumulated: 0, tempWounds: 0, coreWounds: track().slice(0, 3), capacity: 3, overflow: "none" }, [{ amount: 5, type: "Fire" }]);
check("simplified enemy: capacity 3 caps the fills", ex6.filledSlots.length, 3);
check("Manifestation overflow is counted", resolveDamageComponents({ resilience: 0, accumulated: 0, tempWounds: 0, coreWounds: full, overflow: "count" }, [{ amount: 2, type: "Force", breach: true }]).overflowCount, 2);

console.log("\n--- Team Tier access (Part III, Team Tier and Acquisition, Doc L1793) ---");
const part = (id, type, tier) => ({ id, type, system: { tier } });
const assembled = (chassisId, fittingId) => ({ type: "equipment", system: { isModular: true, chassisItemId: chassisId, fittingItemId: fittingId } });
const items = [part("c2", "chassis", 2), part("f1", "fitting", 1), part("c1", "chassis", 1)];
check("each Component checked separately: T2 Chassis + T1 Fitting",
  JSON.stringify(componentTiers(assembled("c2", "f1"), items)), JSON.stringify([2, 1]));
// "A Tier 1 Team ordinarily accesses Tier 1 Components; a Tier 4 Team... through Tier 4, even if a
// member's personal Reach remains 1."
check("T2 Component is above a Tier 1 Team", computeTierGate(assembled("c2", "f1"), 1, items).overTier, true);
check("T1 Components are within a Tier 1 Team", computeTierGate(assembled("c1", "f1"), 1, items).overTier, false);
check("T2 Component is within a Tier 4 Team", computeTierGate(assembled("c2", "f1"), 4, items).overTier, false);
check("a loose Chassis uses its own Tier", computeTierGate(part("x", "chassis", 3), 2, []).overTier, true);
check("Augments are Tierless", computeTierGate({ type: "augment", system: {} }, 1, []).componentTier, null);
check("a flat item with no Tier is never flagged", computeTierGate({ type: "equipment", system: { tier: null } }, 1, []).overTier, false);
const qd = { type: "equipment", system: { isModular: true, chassisItemId: "c2", fittingItemId: "f1", reachExceptionSource: "Quartermaster's Due", reachExceptionMargin: 1 } };
check("an access exception adds its margin", computeTierGate(qd, 1, items).overTier, false);

console.log("\n--- Item grants (Part IX Heritage/Species features) ---");
// Quartermaster's Due (Doc L5470): "each up to 1 Tier above the Team's normal procurement Tier,
// to a maximum of Tier 5. In a Tier 1 Team, you can choose a Tier 2 Chassis and Tier 2 Fitting."
const quartermaster = ITEM_GRANT_REGISTRY["Quartermaster's Due"];
check("QD: Tier 2 parts in a Tier 1 Team qualify", tierQualifiesForGrant(assembled("c2", "f1"), quartermaster, 1, items), true);
const t3 = [...items, part("c3", "chassis", 3)];
check("QD: a Tier 3 part in a Tier 1 Team does not", tierQualifiesForGrant(assembled("c3", "f1"), quartermaster, 1, t3), false);
const t5 = [part("c5", "chassis", 5), part("f5", "fitting", 5)];
check("QD: capped at Tier 5", tierQualifiesForGrant(assembled("c5", "f5"), quartermaster, 5, t5), true);
check("Inherited Tools has no Tier limit", tierQualifiesForGrant({ type: "equipment", system: { tier: 4 } }, ITEM_GRANT_REGISTRY["Inherited Tools"], 1, []), true);
check("Internal Compartment is within ordinary access only",
  tierQualifiesForGrant({ type: "equipment", system: { tier: 2 } }, ITEM_GRANT_REGISTRY["Internal Compartment"], 1, []), false);

console.log("\n--- Combat Style Specialties (Part X, 0.12.0) ---");
const deep = (name, actual, expected) => check(name, JSON.stringify(actual), JSON.stringify(expected));
const orator = { name: "Orator", system: { acquiredLater: false } };
const laterOrator = { name: "Orator", system: { acquiredLater: true } };
check("Origin Benefit from the creation Distinction", hasOriginDistinction([orator], "orator"), true);
check("a later-acquired Distinction grants no Origin Benefit", hasOriginDistinction([laterOrator], "Orator"), false);
deep("Threads: duplicates allowed", addThread(["Fire", "Fire"], "Fire").threads, ["Fire", "Fire", "Fire"]);
check("Threads: a fourth needs a discard", addThread(["Fire", "Air", "Earth"], "Fire").error, "capacity");
deep("Authority capacity Rank 0-2 -> 1", [authorityCapacity(0), authorityCapacity(2)], [1, 1]);
deep("Authority capacity Rank 3-4 -> 2, Rank 5 -> 3", [authorityCapacity(3), authorityCapacity(4), authorityCapacity(5)], [2, 2, 3]);
deep("Orator holds 2 results per card", [authorityResultsPerCard(false), authorityResultsPerCard(true)], [1, 2]);
const s1 = storeAuthority([], "Rally", [8], { capacity: 1, perCard: 1 });
deep("Doc L6168: store the 8 on the generating card", s1.cards, [{ card: "Rally", results: [8] }]);
check("a second card at capacity is refused", storeAuthority(s1.cards, "Hold", [5], { capacity: 1, perCard: 1 }).error, "capacity");
deep("the same card keeps or replaces (newest wins)", storeAuthority(s1.cards, "Rally", [9], { capacity: 1, perCard: 1 }).cards, [{ card: "Rally", results: [9] }]);
const o1 = storeAuthority([], "Rally", [8, 6], { capacity: 1, perCard: 2 });
deep("Doc L6199: an Orator stores an 8 and a 6 on one card", o1.cards, [{ card: "Rally", results: [8, 6] }]);
const o2 = spendAuthority(o1.cards, 0, 0);
deep("spending the 8 leaves the 6", o2, [{ card: "Rally", results: [6] }]);
deep("the card later stores a 9 alongside the 6", storeAuthority(o2, "Rally", [9], { capacity: 1, perCard: 2 }).cards, [{ card: "Rally", results: [6, 9] }]);
deep("an emptied card releases its slot", spendAuthority(o2, 0, 0), []);
deep("Lock capacity: 1, Marksman 2", [lockCapacity(false), lockCapacity(true)], [1, 2]);
deep("Contingency capacity: 1, Strategist 2", [contingencyCapacity(false), contingencyCapacity(true)], [1, 2]);
deep("Rite capacity: 3, Invoker 4", [riteCapacity(false), riteCapacity(true)], [3, 4]);
const ward = { name: "Ward of Ash", trigger: "t", echo: "e", echoLimit: 2, subject: "Kel" };
const p1 = placeRite([ward], { ...ward, echoLimit: 1 }, 3);
deep("Possessed: a same-named Rite on the same subject replaces it", [p1.replacedIndex, p1.rites.length, p1.rites[0].echoLimit], [0, 1, 1]);
check("a fourth Rite needs a removal", placeRite([{}, {}, {}], { name: "x" }, 3).error, "capacity");
check("Invoker's fourth Rite fits", placeRite([{}, {}, {}], { name: "x" }, 4).rites.length, 4);
deep("Gestalt upkeep: Efficient Transformation −1, minimum 0", [adaptationUpkeep(2, { efficient: true }), adaptationUpkeep(0, { efficient: true })], [1, 0]);
check("Unstable adds 1 that the reduction cannot remove", adaptationUpkeep(0, { efficient: true, unstable: true }), 1);
deep("Doc L6120: forced Strain past 6 stays at 6, excess becomes Breach Damage", forcedStrain(5, 3), { strain: 6, excess: 2 });
deep("Doc L6126: Strain 5 adds a burned die (2 rolled + 1 burned = 3)", [psionicsBurnSurchargeAt(4), psionicsBurnSurchargeAt(5)], [0, 1]);
deep("Doc L6309: Rank 1 form adds 3 burned dice and 1 Mana", manifestationEntryCost(1), { burn: 3, mana: 1, actionMin: 2, reactionMin: 2 });
check("Doc L6313: the Summoner pays 2 burned dice, Mana unchanged", manifestationEntryCost(1, { summoner: true }).burn, 2);
check("Rank 0 with the Summoner pays 2 burned dice (3 − 1)", manifestationEntryCost(0, { summoner: true }).burn, 2);
deep("Rank 5: 5 dice, 5 Mana, native minimums 6 / 3", manifestationEntryCost(5), { burn: 5, mana: 5, actionMin: 6, reactionMin: 3 });
check("Rank 2 native Reaction minimum stays 2", manifestationEntryCost(2).reactionMin, 2);
deep("the shared track view fills the first N of five", manifestationTrack(3).map((w) => w.filled), [true, true, true, false, false]);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
