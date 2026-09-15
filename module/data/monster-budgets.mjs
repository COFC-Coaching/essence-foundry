/**
 * Grade (Mook/Normal/Elite) has no mechanical budget in the rules text — it's currently just a
 * GM-facing tag (see actor-npc.mjs). These scaling numbers are a homebrew default the Monster
 * Creator uses to auto-fill a stat block; there's nothing canonical to match, so tune this table
 * freely if actual play calls for it. Normal is the fallback for a blank Grade so the wizard always
 * has something to auto-generate from.
 *
 * Replaces the old 4-value Role table (Minion/Standard/Elite/Nemesis — see the "roleBudgets" world
 * setting this superseded) per Things To Work On/Enemies and NPC's.txt, which collapses enemy
 * identity to 3 Grades. Mook keeps the old Minion numbers, Normal keeps the old Standard numbers
 * (Standard's pool sizes already matched ordinary PC creation — see attributeField()'s doc comment
 * in actor-combatant.mjs). Elite takes over the old Nemesis numbers rather than the old Elite's,
 * since the design doc's Elites are now the rare, top-tier grade that "genuinely participate in
 * Essence's full combat system" — Champion/Leader/Solo are differentiated by eliteType and ability
 * access, not by a separate budget tier.
 */
/**
 * Reduced Engine defaults (Mook/Normal only — see actor-adversary.mjs's class doc comment).
 * Calibration target, straight from the design conversation: at a Tier 1 same-Tier baseline, a
 * Mook/Normal's fixed attack pool should land at roughly the same effectiveness as an ordinary
 * 2d10 PC Action (see the Encounter & Adventure Building Primer's "1 - (0.5 x 0.5) = 75%" 2d10
 * math). computeFixedAttack/computeFixedDefense below use the exact same base+(perTier*tier)
 * shape as computeResilience already does — so, matching how Mook's resilienceBase=1/
 * resiliencePerTier=1 lands on the Primer's own "~2 Core Wounds at Tier 1" (1 + 1*1 = 2),
 * fixedAttackBase is 1 (not 2) so Tier 1 lands on the 2d10 target: 1 + 1*1 = 2. Normal doesn't get
 * a bigger pool than Mook here; it gets MORE of them — the existing actionCards/reactionCards
 * budget below already doubles Normal's action count (2/1) over Mook's (1/0), matching the
 * Primer's Tier 1 Enemy Chassis ("2 Mooks = 4 Core / 2 Actions" ≈ "1 Normal = 4 Core / 2 Actions").
 * fixedDefenseBase is a flat stand-in for the Attribute-derived Fortitude/Composure/Harmony
 * formula a PC uses (2 + two-lowest-of-three-Attributes) — with as few Attribute points as these
 * Grades ever had anyway, a flat 4/5 approximates what that formula would have produced. Every
 * number here is an explicit first draft per the design doc's own warning: unlike the point-buy
 * budget below (no balance risk either way), these numbers set how hard a Mook/Normal hits and
 * how easily it's hit — validate against actual play and the Rank 0-2 Combat Cards before
 * treating them as settled.
 */
const REDUCED_ENGINE_DEFAULTS = {
  Mook: { fixedAttackBase: 1, fixedAttackPerTier: 1, fixedDefenseBase: 4, fixedDefensePerTier: 0 },
  Normal: { fixedAttackBase: 1, fixedAttackPerTier: 1, fixedDefenseBase: 5, fixedDefensePerTier: 0 },
  // Elite stays on the full engine — these are unused, kept only so every Grade has the same shape.
  Elite: { fixedAttackBase: 0, fixedAttackPerTier: 0, fixedDefenseBase: 0, fixedDefensePerTier: 0 }
};

export const GRADE_BUDGETS = {
  Mook: {
    attributePool: 2, attributeMax: 2,
    skillPool: 2, skillMax: 2,
    resilienceBase: 1, resiliencePerTier: 1,
    temporaryWoundsAvailable: 0,
    actionCards: 1, reactionCards: 0,
    equipmentCount: 1,
    ...REDUCED_ENGINE_DEFAULTS.Mook
  },
  Normal: {
    attributePool: 7, attributeMax: 3,
    skillPool: 5, skillMax: 3,
    resilienceBase: 3, resiliencePerTier: 2,
    temporaryWoundsAvailable: 1,
    actionCards: 2, reactionCards: 1,
    equipmentCount: 2,
    ...REDUCED_ENGINE_DEFAULTS.Normal
  },
  Elite: {
    attributePool: 13, attributeMax: 5,
    skillPool: 12, skillMax: 5,
    resilienceBase: 7, resiliencePerTier: 4,
    temporaryWoundsAvailable: 3,
    actionCards: 4, reactionCards: 3,
    equipmentCount: 4,
    ...REDUCED_ENGINE_DEFAULTS.Elite
  }
};

/** Reads the GM-tunable override from the "gradeBudgets" world setting (see
 *  grade-budgets-settings.mjs) when one exists for this Grade, falling back to this module's own
 *  GRADE_BUDGETS defaults — covers both a setting that's never been touched and a settings object
 *  from an older version missing a Grade or field this version added. */
export function getGradeBudget(grade) {
  const defaults = GRADE_BUDGETS[grade] ?? GRADE_BUDGETS.Normal;
  const stored = game.settings?.get("essence-system", "gradeBudgets")?.[grade];
  return stored ? { ...defaults, ...stored } : defaults;
}

export function computeResilience(grade, tier) {
  const budget = getGradeBudget(grade);
  return budget.resilienceBase + Math.max(0, tier || 0) * budget.resiliencePerTier;
}

/** Reduced Engine (Mook/Normal only) — see REDUCED_ENGINE_DEFAULTS above. Applied uniformly
 *  across all three Domains by Auto-Generate; a GM can always hand-tune one Domain higher/lower
 *  afterward for a specialized Mook/Normal (an Artillery Mook with a stronger Mental pool, say). */
export function computeFixedAttack(grade, tier) {
  const budget = getGradeBudget(grade);
  return budget.fixedAttackBase + Math.max(0, tier || 0) * budget.fixedAttackPerTier;
}

export function computeFixedDefense(grade, tier) {
  const budget = getGradeBudget(grade);
  return budget.fixedDefenseBase + Math.max(0, tier || 0) * budget.fixedDefensePerTier;
}
