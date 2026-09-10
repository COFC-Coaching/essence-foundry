/**
 * Drives the Action/Reaction Dice lifecycle off Foundry's own Combat Tracker instead of the
 * bespoke Start Combat / End Combat / Start Turn buttons the sheet used to have. The character
 * sheet now only exposes Roll Initiative and End Turn — everything else (adding combatants,
 * beginning combat, advancing rounds/turns, ending combat) is native Foundry tracker UI.
 *
 * Both overrides below are core's own protected extension points, awaited in sequence inside
 * Combat#_manageTurnEvents (_onStartRound always resolves before _onStartTurn) — unlike a plain
 * `Hooks.on("combatStart", ...)`, which Foundry's Combat#startCombat fires via Hooks.callAll
 * *before* awaiting its own round/turn update, so an async hook listener races the transition
 * instead of running before it.
 */
// NPCs use the exact same combat mechanics as player characters (see module/data/actor-npc.mjs),
// so both types need the same Action Dice lifecycle management here.
const COMBATANT_TYPES = ["character", "npc"];

/**
 * Shared dice-commit prompt — same dialog both actor sheets used to duplicate for Roll
 * Initiative, now centralized here since EssenceCombat#rollInitiative is the one place this
 * fires from (sheet button, Combat Tracker's per-combatant dice icon, and its Roll All/Roll NPC
 * buttons all funnel through Combat#rollInitiative).
 */
function promptDiceCount({ title, label, min, max, initial }) {
  return new Promise((resolve) => {
    new foundry.applications.api.DialogV2({
      window: { title },
      content: `<p>${label}</p><input type="number" name="count" value="${initial}" min="${min}" max="${max}" autofocus>`,
      buttons: [
        {
          action: "commit",
          label: "Roll",
          default: true,
          callback: (event, button) => {
            const raw = Number(button.form.elements.count.value);
            const n = Number.isFinite(raw) ? raw : initial;
            return Math.min(max, Math.max(min, n));
          }
        },
        { action: "cancel", label: "Cancel", callback: () => "essence-cancelled" }
      ],
      submit: (result) => resolve(result === "essence-cancelled" ? null : result)
    }).render(true);
  });
}

export default class EssenceCombat extends Combat {
  /**
   * Routes every entry point that rolls Initiative — the sheet's Roll Initiative button, the
   * Combat Tracker's per-combatant dice icon, and its Roll All/Roll NPCs buttons all call this
   * single method — through our dice-commit flow instead of a flat formula roll, for character
   * and npc combatants. Anything else (a plain monster token with no essence-system actor type)
   * falls back to core's own roll.
   */
  async rollInitiative(ids, options = {}) {
    ids = typeof ids === "string" ? [ids] : ids;
    const ours = [];
    const rest = [];
    for (const id of ids) {
      const actor = this.combatants.get(id)?.actor;
      (COMBATANT_TYPES.includes(actor?.type) ? ours : rest).push(id);
    }
    if (rest.length) await super.rollInitiative(rest, options);

    for (const id of ours) {
      const combatant = this.combatants.get(id);
      if (!combatant?.isOwner) continue;
      const actor = combatant.actor;
      const base = actor.system.baseCombatDice;
      const committed = await promptDiceCount({
        title: `Roll Initiative — ${actor.name}`,
        label: `Commit how many dice to Initiative? (0 = Pass, max ${base}). Whatever you don't commit carries over as your first turn's Action Dice.`,
        min: 0, max: base, initial: base
      });
      if (committed === null) continue;

      let faces = [];
      let total = 0;
      if (committed > 0) {
        const roll = new Roll(`${committed}d10`);
        await roll.evaluate();
        faces = roll.terms[0].results.map((r) => r.result);
        total = faces.reduce((a, b) => a + b, 0);
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Initiative" });
      } else {
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>${actor.name}</strong> passes on Initiative.</p>`
        });
      }

      await actor.update({
        "system.playState.initiativeDice": committed,
        "system.playState.initiativeFaces": faces,
        "system.playState.initiativeTotal": total,
        "system.playState.initiativeCommitted": true
      });
      await combatant.update({ initiative: total });
    }
    return this;
  }

  /** Fires once per round, awaited before _onStartTurn. Round 1 is combat's actual start. */
  async _onStartRound(context) {
    await super._onStartRound(context);
    if (context.round !== 1) return;
    for (const combatant of this.combatants) {
      const actor = combatant.actor;
      if (!COMBATANT_TYPES.includes(actor?.type)) continue;
      // Before anyone's first Turn, every combatant starts with a Reaction Pool of 5 + Tier —
      // not 0 — so combatants who act later in the round can still defend themselves before
      // their own first Turn arrives (see part-iv-combat.md § Starting Reaction Pools). This
      // starting pool clears normally once the combatant's own first Turn begins (_onStartTurn
      // below always resets reactionDice to 0 there).
      await actor.update({
        "system.playState.combatStarted": true,
        "system.playState.combatTurn": "notStarted",
        "system.playState.actionDice": null,
        "system.playState.reactionDice": actor.system.baseCombatDice
      });
    }
  }

  /** Fires once per combatant whose turn is starting, after _onStartRound has resolved. */
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    const actor = combatant.actor;
    if (!COMBATANT_TYPES.includes(actor?.type)) return;

    const ps = actor.system.playState;
    const base = actor.system.baseCombatDice;
    const isFirst = ps.combatTurn === "notStarted";
    const update = {
      "system.playState.combatTurn": isFirst ? "first" : "active",
      "system.playState.actionDice": base - (isFirst ? (ps.initiativeDice || 0) : 0),
      "system.playState.reactionDice": 0,
      // Accumulated Damage resets at the start of each of the character's own Turns
      // (see part-iv-combat.md § Resilience).
      "system.playState.accumulatedDamage": 0
    };

    // A Cunning Contingency not used by its Trigger expires at the start of the character's
    // next Turn (see part-iv-combat.md § Contingency).
    if (actor.system.specialties?.contingency) {
      update["system.specialties.contingency"] = "";
    }

    // While a Critical Wound remains untreated, the Death Track advances 1 step at the start of
    // every one of the character's Turns (see part-iv-combat.md § The Death Track).
    if (actor.system.woundState === "Critically Wounded" && !ps.deathTrackFrozen) {
      const next = Math.min(5, (ps.deathTrackStep ?? 0) + 1);
      update["system.playState.deathTrackStep"] = next;
      if (next >= 5) {
        ui.notifications.error(game.i18n.format("ESSENCE.Notify.EndOfDeathTrack", { name: actor.name }));
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>${actor.name}</strong>'s Death Track has reached its final step.</p>`
        });
      }
    }

    await actor.update(update);
  }
}
