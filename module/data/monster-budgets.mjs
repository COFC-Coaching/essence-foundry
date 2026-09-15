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
 * Essence's full combat system" — Champion/Leader/Boss are differentiated by eliteType and ability
 * access, not by a separate budget tier.
 */
export const GRADE_BUDGETS = {
  Mook: {
    attributePool: 2, attributeMax: 2,
    skillPool: 2, skillMax: 2,
    resilienceBase: 1, resiliencePerTier: 1,
    temporaryWoundsAvailable: 0,
    actionCards: 1, reactionCards: 0,
    equipmentCount: 1
  },
  Normal: {
    attributePool: 7, attributeMax: 3,
    skillPool: 5, skillMax: 3,
    resilienceBase: 3, resiliencePerTier: 2,
    temporaryWoundsAvailable: 1,
    actionCards: 2, reactionCards: 1,
    equipmentCount: 2
  },
  Elite: {
    attributePool: 13, attributeMax: 5,
    skillPool: 12, skillMax: 5,
    resilienceBase: 7, resiliencePerTier: 4,
    temporaryWoundsAvailable: 3,
    actionCards: 4, reactionCards: 3,
    equipmentCount: 4
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
