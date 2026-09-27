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
    // A Team is a group, so give a new one Foundry's own group icon instead of the default
    // single-person silhouette.
    if (data.type === "team" && !data.img) {
      this.updateSource({ img: "icons/environment/people/group.webp" });
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

  /**
   * V6: a Recovery reduces the Death Track by 1 for a non-Dying character, including a Stabilized
   * character sitting on a full Core Wound track (part-iv-combat.md § Recovery). Deliberately a
   * standalone actor-level operation rather than being called from Grant Recovery yet — the plan's
   * Phase 5 (0.6.82) is where Recovery's full V6 numbers (25% rounded up, clear Strain, etc.) land,
   * so this is left as a ready extension point for that session to call rather than half-wiring it
   * here. A "dying" character is excluded on purpose: the whole point of an actively-advancing Death
   * Track is that it doesn't get quietly walked back by an unrelated Recovery grant.
   */
  /**
   * End of Turn (v0.6 Part VII "End of Turn and Reaction Pool", Doc L3461-3463): "Reaction Pool =
   * base pool size + unused, unreserved Action Dice." Unused Action dice become Reaction dice; they
   * do not remain Action dice.
   *
   * One implementation for both paths that end a Turn: EssenceCombat#_onEndTurn (Foundry's own
   * lifecycle hook, which fires however the tracker advances) and the sheets' End Turn buttons.
   * Before 0.7.10 only the sheet button did this, so advancing the Combat Tracker directly left the
   * combatant with no Reaction Pool at all. Idempotent: it acts only while the Turn is still live
   * ("first"/"active"), so the button followed by the tracker's own _onEndTurn applies it once.
   * @returns {Promise<boolean>} whether the pool was formed
   */
  async formEndOfTurnReactionPool() {
    const ps = this.system.playState;
    if (!ps || !["first", "active"].includes(ps.combatTurn)) return false;
    await this.update({
      "system.playState.combatTurn": "ended",
      "system.playState.reactionDice": (this.system.baseCombatDice ?? 0) + (ps.actionDice ?? 0),
      "system.playState.actionDice": null
    });
    return true;
  }

  async reduceDeathTrack() {
    const ps = this.system.playState;
    if (!ps || ps.deathTrackState === "dying" || ps.deathTrackState === "dead") return false;
    const step = ps.deathTrackStep ?? 0;
    if (step <= 0) return false;
    await this.update({ "system.playState.deathTrackStep": step - 1 });
    return true;
  }

  /**
   * Death (Doc L4059): "Reaching the character's death threshold causes death... Death is final
   * under the game rules." Sets the terminal state, applies Foundry's own defeated status so the
   * Combat Tracker and token show it, and posts the note. Idempotent.
   */
  async markDead() {
    if (this.system.playState?.deathTrackState === "dead") return false;
    await this.update({ "system.playState.deathTrackState": "dead" });
    const defeated = CONFIG.specialStatusEffects?.DEFEATED;
    if (defeated) await this.toggleStatusEffect(defeated, { active: true, overlay: true });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor: this }),
      content: `<p><strong>${this.name}</strong> has died. Death is final; only explicit GM fiat can change it.</p>`
    });
    return true;
  }

  /**
   * Stabilize (Doc L4276-L4280): a full-track Dying or Stabilized character stops deteriorating.
   * For a simplified enemy (Defeated), it "stops dying from the treated injuries but remains
   * Defeated and unable to act"; the same state field records that. Heals nothing.
   * @returns {Promise<boolean>} false when there was nothing to stabilize
   */
  async stabilize() {
    const ps = this.system.playState;
    if (!ps || ps.deathTrackState === "dead") return false;
    const simplified = !!this.system.usesSimplifiedWounds;
    const eligible = simplified
      ? this.system.woundState === "Defeated"
      : ps.deathTrackState === "dying" || ps.deathTrackState === "stabilized";
    if (!eligible) return false;
    await this.update({ "system.playState.deathTrackState": "stabilized" });
    return true;
  }

  /** Foundry's unconscious status, used for nonlethal defeat and Defeated enemies (Doc L4117,
   *  L4127). A no-op when the status isn't configured. */
  async setUnconscious(active) {
    const id = CONFIG.statusEffects.find((s) => s.id === "unconscious") ? "unconscious" : null;
    if (!id) return false;
    await this.toggleStatusEffect(id, { active });
    return true;
  }

  /** Prepare Action (Doc L4320): hold one preparation; its reserved dice leave the Action Pool. */
  async setPreparedAction({ cardId, cardName, trigger, reserved }) {
    const ps = this.system.playState;
    const available = ps.actionDice ?? 0;
    const n = Math.max(0, Math.min(available, reserved));
    await this.update({
      "system.playState.actionDice": available - n,
      "system.playState.preparedAction": { cardId, cardName, trigger, reserved: n }
    });
    return n;
  }

  /** Discards the held preparation and its reserved dice (Doc L4330: after firing, canceling,
   *  replacing, or expiring, "discard all remaining reserved dice"). */
  async clearPreparedAction() {
    if (!this.system.playState?.preparedAction?.cardName && !this.system.playState?.preparedAction?.reserved) return false;
    await this.update({ "system.playState.preparedAction": { cardId: "", cardName: "", trigger: "", reserved: 0 } });
    return true;
  }
}
