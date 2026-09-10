/**
 * Role (Minion/Standard/Elite/Nemesis) has no mechanical budget in the rules text — it's
 * currently just a GM-facing tag (see actor-npc.mjs). These scaling numbers are a homebrew
 * default the Monster Creator uses to auto-fill a stat block; there's nothing canonical to match,
 * so tune this table freely if actual play calls for it. Standard is the fallback for a blank
 * Role so the wizard always has something to auto-generate from.
 */
export const ROLE_BUDGETS = {
  Minion: {
    attributePool: 2, attributeMax: 2,
    skillPool: 2, skillMax: 2,
    resilienceBase: 1, resiliencePerTier: 1,
    temporaryWoundsAvailable: 0,
    actionCards: 1, reactionCards: 0,
    equipmentCount: 1
  },
  Standard: {
    attributePool: 7, attributeMax: 3,
    skillPool: 5, skillMax: 3,
    resilienceBase: 3, resiliencePerTier: 2,
    temporaryWoundsAvailable: 1,
    actionCards: 2, reactionCards: 1,
    equipmentCount: 2
  },
  Elite: {
    attributePool: 10, attributeMax: 4,
    skillPool: 8, skillMax: 4,
    resilienceBase: 5, resiliencePerTier: 3,
    temporaryWoundsAvailable: 2,
    actionCards: 3, reactionCards: 2,
    equipmentCount: 3
  },
  Nemesis: {
    attributePool: 13, attributeMax: 5,
    skillPool: 12, skillMax: 5,
    resilienceBase: 7, resiliencePerTier: 4,
    temporaryWoundsAvailable: 3,
    actionCards: 4, reactionCards: 3,
    equipmentCount: 4
  }
};

/** Reads the GM-tunable override from the "roleBudgets" world setting (see
 *  role-budgets-settings.mjs) when one exists for this Role, falling back to this module's own
 *  ROLE_BUDGETS defaults — covers both a setting that's never been touched and a settings object
 *  from an older version missing a Role or field this version added. */
export function getRoleBudget(role) {
  const defaults = ROLE_BUDGETS[role] ?? ROLE_BUDGETS.Standard;
  const stored = game.settings?.get("essence-system", "roleBudgets")?.[role];
  return stored ? { ...defaults, ...stored } : defaults;
}

export function computeResilience(role, tier) {
  const budget = getRoleBudget(role);
  return budget.resilienceBase + Math.max(0, tier || 0) * budget.resiliencePerTier;
}
