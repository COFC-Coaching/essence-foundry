import { adaptationUpkeep, hasOriginDistinction } from "../utils.mjs";

const ATTRIBUTES = ["might", "grace", "vigor", "intellect", "acuity", "resolve", "presence", "adaptability", "anima"];

/**
 * Character actors should always use a linked token — every combat/sheet mechanic (Action
 * Dice, wounds, combat state) updates the world Actor via `this.actor`, and an unlinked token
 * silently diverges onto its own synthetic per-token actor instead. Foundry's own default for
 * a brand-new Actor is unlinked, so this sets the sane default at creation time via the
 * standard `_preCreate` lifecycle hook (the same mechanism most systems use for this).
 */
export default class EssenceActor extends Actor {
  /** Attributes cannot be 0 (Ryan, 2026-09-27, gap question 22): a 0 means the character is
   *  functionally dead in that Attribute. The sheet inputs carry min=1; this catches a typed 0 or
   *  a scripted update. Existing data is not rewritten, only new values. */
  async _preUpdate(changes, options, user) {
    const sys = changes.system;
    if (sys) for (const k of ATTRIBUTES) if (typeof sys[k] === "number" && sys[k] < 1) sys[k] = 1;
    // Lowering the Temporary Wounds granted below the number still available would leave the
    // sidebar reading "3 of 1" and let Apply Damage spend Wounds the character no longer has.
    if (sys && typeof sys.temporaryWoundsAvailable === "number") {
      const granted = Math.max(0, sys.temporaryWoundsAvailable);
      const current = sys.playState?.currentTemporaryWounds ?? this.system?.playState?.currentTemporaryWounds ?? 0;
      if (current > granted) foundry.utils.setProperty(changes, "system.playState.currentTemporaryWounds", granted);
    }
    return super._preUpdate(changes, options, user);
  }
  /**
   * Species Trait sub-choices with a mechanical home (Ryan, 2026-09-27, gap question 10): a
   * "Resistance" choice becomes a Resistance row and a "Senses" choice becomes Senses entries.
   * Runs on the client that changed the Species Item, through Foundry's own descendant hooks.
   * Rows this sync wrote carry the source "Species: <Trait>"; the senses it wrote are remembered in
   * a flag so a changed pick replaces them without touching hand-entered ones.
   */
  async syncSpeciesSubChoices() {
    const species = this.items.find((i) => i.type === "species");
    const traits = species ? [species.system.nature, ...(species.system.traits ?? [])].filter(Boolean) : [];
    const wantRes = []; const wantSenses = [];
    for (const t of traits) {
      if (t.chosen === false && t !== species?.system.nature) continue;
      const label = t.subChoice?.label ?? ""; const picks = t.subChoice?.selected ?? [];
      if (/^resistance/i.test(label)) for (const p of picks) wantRes.push({ damageType: p, source: `Species: ${t.name}` });
      if (/^senses/i.test(label)) for (const p of picks) wantSenses.push(p);
    }
    const update = {};
    const res = this.system.resistances ?? [];
    const kept = res.filter((r) => !/^Species: /.test(r.source ?? ""));
    const nextRes = [...kept, ...wantRes];
    if (JSON.stringify(nextRes) !== JSON.stringify(res)) update["system.resistances"] = nextRes;
    const prevSenses = this.getFlag("essence-system", "speciesSenses") ?? [];
    const senses = this.system.senses ?? [];
    const keptSenses = senses.filter((x) => !prevSenses.includes(x));
    const nextSenses = [...keptSenses, ...wantSenses.filter((x) => !keptSenses.includes(x))];
    if (JSON.stringify(nextSenses) !== JSON.stringify(senses)) update["system.senses"] = nextSenses;
    if (JSON.stringify(wantSenses) !== JSON.stringify(prevSenses)) update["flags.essence-system.speciesSenses"] = wantSenses;
    if (Object.keys(update).length) await this.update(update);
  }

  #speciesChanged(collection, documents) {
    return collection === "items" && documents.some((d) => d.type === "species");
  }

  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (userId === game.user.id && this.#speciesChanged(collection, documents)) this.syncSpeciesSubChoices();
  }

  _onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId) {
    super._onUpdateDescendantDocuments(parent, collection, documents, changes, options, userId);
    if (userId === game.user.id && this.#speciesChanged(collection, documents)) this.syncSpeciesSubChoices();
  }

  _onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId) {
    super._onDeleteDescendantDocuments(parent, collection, documents, ids, options, userId);
    if (userId === game.user.id && this.#speciesChanged(collection, documents)) this.syncSpeciesSubChoices();
  }

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
    // Doc L3464: "Mooks and Normals do not form Pools or convert unused Actions into Reactions."
    if (this.system.engine === "reduced") {
      await this.update({ "system.playState.combatTurn": "ended" });
      return true;
    }
    // End-of-Turn Specialty steps (Part X, 0.12.0) run before the Pool converts, so an Adaptation's
    // Stamina upkeep and Combo loss are settled on this Turn.
    await this.#endOfTurnSpecialties();
    await this.update({
      "system.playState.combatTurn": "ended",
      "system.playState.reactionDice": (this.system.baseCombatDice ?? 0) + (ps.actionDice ?? 0),
      "system.playState.actionDice": null
    });
    return true;
  }

  /**
   * End-of-Turn Specialty bookkeeping (Part X; 0.12.0), run once per Turn from
   * formEndOfTurnReactionPool. Kept automatic rather than prompted because the combat tracker's
   * end-of-turn hook runs on the GM's client, where a modal would block the tracker.
   * - Gestalt (Doc L5937-L5941, L5977): pay the Adaptation's Stamina upkeep (less 1 with Efficient
   *   Transformation, plus 1 while Unstable) or the Adaptation ends. An Adaptation assumed outside
   *   the Turn (`deferUpkeep`) is first charged at the end of the NEXT Turn. To stop maintaining a
   *   zero-upkeep Adaptation, the player clicks End before ending the Turn.
   * - Prowess (Doc L8100): lose 1 Combo if no Prowess card dealt Damage this Turn (the sheet's
   *   "dealt Damage" tick), then clear the tick.
   */
  async #endOfTurnSpecialties() {
    const sp = this.system.specialties;
    if (!sp) return;
    const update = {};
    const notes = [];
    const adaptation = sp.adaptation;
    if (adaptation?.name) {
      if (adaptation.deferUpkeep) {
        update["system.specialties.adaptation.deferUpkeep"] = false;
        notes.push(`${adaptation.name} was assumed outside the Turn; its first upkeep is due at the end of the next Turn.`);
      } else {
        const distinctions = this.items.filter((i) => i.type === "distinction");
        const unstable = this.items.some((i) => i.type === "condition" && (i.name || "").toUpperCase() === "UNSTABLE");
        const due = adaptationUpkeep(adaptation.upkeep, { efficient: hasOriginDistinction(distinctions, "Gifted"), unstable });
        const stamina = this.system.resources?.stamina?.value ?? 0;
        if (due === 0) {
          notes.push(`${adaptation.name} is maintained (no upkeep).`);
        } else if (stamina >= due) {
          update["system.playState.currentStamina"] = stamina - due;
          notes.push(`${adaptation.name} upkeep paid: ${due} Stamina${unstable ? " (includes +1 for Unstable)" : ""}.`);
        } else {
          update["system.specialties.adaptation"] = { name: "", upkeep: 0, deferUpkeep: false };
          notes.push(`${adaptation.name} ends: its upkeep of ${due} Stamina could not be paid (${stamina} available).`);
        }
      }
    }
    if ((sp.combo ?? 0) > 0 && !sp.comboDealtDamage) {
      update["system.specialties.combo"] = sp.combo - 1;
      notes.push(`No Prowess Damage this Turn: Combo falls to ${sp.combo - 1}.`);
    }
    if (sp.comboDealtDamage) update["system.specialties.comboDealtDamage"] = false;
    if (!Object.keys(update).length) return;
    await this.update(update);
    if (notes.length) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: this }), content: `<p><strong>${this.name}</strong>, end of Turn:</p><ul>${notes.map((n) => `<li>${n}</li>`).join("")}</ul>` });
    }
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
