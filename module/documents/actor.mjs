/**
 * Character actors should always use a linked token — every combat/sheet mechanic (Action
 * Dice, wounds, combat state) updates the world Actor via `this.actor`, and an unlinked token
 * silently diverges onto its own synthetic per-token actor instead. Foundry's own default for
 * a brand-new Actor is unlinked, so this sets the sane default at creation time via the
 * standard `_preCreate` lifecycle hook (the same mechanism most systems use for this).
 */
export default class EssenceActor extends Actor {
  async _preCreate(data, options, user) {
    const allowed = await super._preCreate(data, options, user);
    if (allowed === false) return false;
    if (data.type === "character" && data.prototypeToken?.actorLink === undefined) {
      this.updateSource({ prototypeToken: { actorLink: true } });
    }
  }

  /**
   * The Token HUD's status-icon toggles call this for every configured CONFIG.statusEffects
   * entry. For the Essence Conditions registered there (see essence.mjs's "ready" hook), toggling
   * the icon adds/removes a real owned Condition Item — the same Item type the sheet already
   * lists and that carries the rules' actual mechanical effect (e.g. Chilled's Movement -2) —
   * instead of a bare core status stub with no game-mechanical meaning. Anything else (core's own
   * default statuses, if a GM adds them back) falls through to Foundry's normal handling.
   */
  async toggleStatusEffect(statusId, options = {}) {
    const config = CONFIG.statusEffects.find((s) => s.id === statusId);
    if (!config?.essenceConditionUuid) return super.toggleStatusEffect(statusId, options);

    const existing = this.items.find(
      (i) => i.type === "condition" && i.getFlag("essence-system", "statusId") === statusId
    );
    const shouldBeActive = options.active ?? !existing;

    if (!shouldBeActive) {
      if (existing) await existing.delete();
      return false;
    }
    if (existing) return true;

    const source = await fromUuid(config.essenceConditionUuid);
    if (!source) return undefined;
    const itemData = source.toObject();
    delete itemData._id;
    itemData.effects = itemData.effects.map((e) => ({ ...e, statuses: [statusId] }));
    if (!itemData.effects.length) {
      // Most Conditions are reminder-text only with no mechanical Active Effect — give them one
      // anyway (no changes, just the status tag) so the Token HUD still highlights the icon.
      itemData.effects = [{ name: source.name, img: source.img, statuses: [statusId], changes: [] }];
    }
    foundry.utils.setProperty(itemData, "flags.essence-system.statusId", statusId);
    const [created] = await this.createEmbeddedDocuments("Item", [itemData]);
    return created;
  }
}
