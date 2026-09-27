/**
 * Rule-math regression tests: pure helpers checked against the worked examples printed in the
 * Essence System v0.6 rulebook (the Google Doc). Each case cites the Doc line it reproduces, so a
 * future rules revision shows exactly which example moved.
 *
 * Run with `npm test` (after test-migration.mjs). Only helpers with no Foundry dependency belong
 * here; module/utils.mjs has no imports and loads under plain Node.
 */

import { ordinaryDamageWounds, isDistinctionStyle } from "../module/utils.mjs";

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

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
