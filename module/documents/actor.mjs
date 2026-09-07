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
}
