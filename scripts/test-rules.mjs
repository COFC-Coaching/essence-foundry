/**
 * Rule-math regression tests: pure helpers checked against the worked examples printed in the
 * Essence System v0.6 rulebook (the Google Doc). Each case cites the Doc line it reproduces, so a
 * future rules revision shows exactly which example moved.
 *
 * Run with `npm test` (after test-migration.mjs). Only helpers with no Foundry dependency belong
 * here; module/utils.mjs has no imports and loads under plain Node.
 */

import { ordinaryDamageWounds, isDistinctionStyle, componentTiers, computeTierGate } from "../module/utils.mjs";
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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
