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
export default class EssenceCombat extends Combat {
  /** Fires once per round, awaited before _onStartTurn. Round 1 is combat's actual start. */
  async _onStartRound(context) {
    await super._onStartRound(context);
    if (context.round !== 1) return;
    for (const combatant of this.combatants) {
      const actor = combatant.actor;
      if (actor?.type !== "character") continue;
      await actor.update({
        "system.playState.combatStarted": true,
        "system.playState.combatTurn": "notStarted",
        "system.playState.actionDice": null,
        "system.playState.reactionDice": 0
      });
    }
  }

  /** Fires once per combatant whose turn is starting, after _onStartRound has resolved. */
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    const actor = combatant.actor;
    if (actor?.type !== "character") return;

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
        ui.notifications.error(`${actor.name} has reached the end of the Death Track.`);
        await ChatMessage.create({
          speaker: ChatMessage.getSpeaker({ actor }),
          content: `<p><strong>${actor.name}</strong>'s Death Track has reached its final step.</p>`
        });
      }
    }

    await actor.update(update);
  }
}
