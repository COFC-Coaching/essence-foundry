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
// NPCs and Monsters both use the exact same combat mechanics as player characters (see
// module/data/actor-adversary.mjs, the shared base both extend), so all three types need the
// same Action Dice lifecycle management here. A Full Manifestation profile
// (module/data/actor-manifestation.mjs) is "the same character for timing and Turn purposes" per
// the official rules once manifested — it keeps sharing the caller's existing Combatant slot (see
// module/apps/manifestation.mjs's token-swap approach), so on any of ITS later Turns it needs the
// same per-round/per-turn dice reset as anyone else, even though entering/dismissing itself
// deliberately does NOT grant a fresh Action Pool (that's handled by copying playState directly in
// manifestation.mjs, not by this lifecycle hook).
import { initiativeTieBreak } from "../utils.mjs";

const COMBATANT_TYPES = ["character", "npc", "monster", "manifestation"];

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
   * single method — through our dice-commit flow instead of a flat formula roll, for character,
   * npc, and monster combatants. Anything else (a plain token with no essence-system actor type)
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
      // Reduced engine (Doc L6876): Mooks and Normals "roll 2d10 and total the results. This costs
      // no Action." No prompt, no Pool.
      if (actor.system.engine === "reduced") {
        const n = actor.system.effectiveInitiativeDice ?? 2;
        const roll = new Roll(`${n}d10`);
        await roll.evaluate();
        const total = roll.total;
        await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Initiative (printed dice)" });
        await actor.update({
          "system.playState.initiativeDice": 0,
          "system.playState.initiativeFaces": roll.terms[0].results.map((r) => r.result),
          "system.playState.initiativeTotal": total,
          "system.playState.initiativeCommitted": true
        });
        await combatant.update({ initiative: total });
        continue;
      }
      const base = actor.system.baseCombatDice;
      // Doc L3386: "Choose from 1 die up to your base Action Pool size." No 0-die pass.
      const committed = await promptDiceCount({
        title: `Roll Initiative — ${actor.name}`,
        label: `Commit how many dice to Initiative? (1 to ${base}). The chosen dice reduce only your first Action Pool; your starting Reaction Pool is not reduced.`,
        min: 1, max: base, initial: base
      });
      if (committed === null) continue;

      const roll = new Roll(`${committed}d10`);
      await roll.evaluate();
      const faces = roll.terms[0].results.map((r) => r.result);
      const total = faces.reduce((a, b) => a + b, 0);
      await roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: "Initiative" });

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

  /**
   * Initiative ties (Doc L3402-L3406): Player Characters win ties against enemies; tied PCs may
   * arrange their own order and the GM resolves ties among enemies, so those fall through to
   * Foundry's default ordering.
   */
  _sortCombatants(a, b) {
    const ia = Number.isFinite(a.initiative) ? a.initiative : -Infinity;
    const ib = Number.isFinite(b.initiative) ? b.initiative : -Infinity;
    if (ia !== ib) return ib - ia;
    const tie = initiativeTieBreak(a.actor?.type, b.actor?.type);
    if (tie !== 0) return tie;
    return super._sortCombatants(a, b);
  }

  /**
   * The play state every combatant starts Combat with (Doc L3411, "Starting Reaction Pools"):
   * before anyone's first Turn, each combatant has its base Reaction Pool, not 0, so a combatant who
   * acts late can still respond before its own first Turn. That pool clears normally when the
   * combatant's own first Turn begins (_onStartTurn always resets reactionDice to 0), and the
   * "notStarted" turn state is what makes _onStartTurn subtract its Initiative dice from that first
   * Action Pool.
   */
  static startingCombatState(actor) {
    // Reduced engine (Doc L6878): no Pools; the Reaction allowance is refreshed at the start of
    // each Round, and a late arrival "receives its allowance on entry".
    if (actor.system.engine === "reduced") {
      return {
        "system.playState.combatStarted": true,
        "system.playState.combatTurn": "notStarted",
        "system.playState.actionDice": null,
        "system.playState.reactionDice": null,
        "system.enemyTurn": { actionsUsed: 0, utilityUsed: false, reactionsUsed: 0 }
      };
    }
    return {
      "system.playState.combatStarted": true,
      "system.playState.combatTurn": "notStarted",
      "system.playState.actionDice": null,
      "system.playState.reactionDice": actor.system.baseCombatDice
    };
  }

  /** Fires once per round, awaited before _onStartTurn. Round 1 is combat's actual start. */
  async _onStartRound(context) {
    await super._onStartRound(context);
    for (const combatant of this.combatants) {
      const actor = combatant.actor;
      if (!COMBATANT_TYPES.includes(actor?.type)) continue;
      if (context.round === 1) {
        // Limited uses no longer refill here (Doc L6921: "Combat ending does not refresh them...
        // Returning enemies keep their spent uses until they recover"); the enemy sheet's Recovery
        // action does.
        await actor.update(EssenceCombat.startingCombatState(actor));
      } else if (actor.system.engine === "reduced" && (actor.system.enemyTurn?.reactionsUsed ?? 0) > 0) {
        // Doc L6878: "Refresh the printed allowance at the start of each Round."
        await actor.update({ "system.enemyTurn.reactionsUsed": 0 });
      }
      // Per-Round Specialty limits (Part X): one Contingency trigger per Round (Doc L5985) and the
      // Invoker's once-per-Round Final Echo (L6243) reset at the start of every Round.
      const sp = actor.system.specialties;
      const roundReset = {};
      if (sp?.contingencyTriggered) roundReset["system.specialties.contingencyTriggered"] = false;
      if (sp?.finalEchoUsed) roundReset["system.specialties.finalEchoUsed"] = false;
      if (Object.keys(roundReset).length) await actor.update(roundReset);
    }
  }

  /**
   * Joining an ongoing Combat (Doc L3421-3423): "The newcomer receives its base Reaction Pool and
   * pays their Initiative dice against their first Action Pool... Existing participants do not
   * reroll Initiative and do not reset any Pool." _onStartRound only sets up the combatants present
   * at Round 1, so before 0.7.10 a combatant added mid-fight began with no Reaction Pool. Foundry's
   * own descendant-creation hook runs on every client; only the active GM writes, matching how core
   * runs the turn events above.
   */
  _onCreateDescendantDocuments(parent, collection, documents, data, options, userId) {
    super._onCreateDescendantDocuments(parent, collection, documents, data, options, userId);
    if (collection !== "combatants" || !game.user.isActiveGM || !this.started || this.round < 1) return;
    for (const combatant of documents) {
      const actor = combatant.actor;
      if (!COMBATANT_TYPES.includes(actor?.type)) continue;
      actor.update(EssenceCombat.startingCombatState(actor));
    }
  }

  /**
   * End of Turn — Foundry's own lifecycle hook, run by the active GM whenever a turn ends, however
   * the tracker was advanced. See EssenceActor#formEndOfTurnReactionPool, which the sheets' End
   * Turn buttons also call (it only acts once per Turn).
   */
  async _onEndTurn(combatant, context) {
    await super._onEndTurn(combatant, context);
    const actor = combatant.actor;
    if (!COMBATANT_TYPES.includes(actor?.type)) return;
    await actor.formEndOfTurnReactionPool();
  }

  /** Fires once per combatant whose turn is starting, after _onStartRound has resolved. */
  async _onStartTurn(combatant, context) {
    await super._onStartTurn(combatant, context);
    const actor = combatant.actor;
    if (!COMBATANT_TYPES.includes(actor?.type)) return;

    const ps = actor.system.playState;
    const base = actor.system.baseCombatDice;
    const isFirst = ps.combatTurn === "notStarted";
    // Reduced engine (Doc L3450, L6874): no Pool steps; refresh the Turn's Action allowance and
    // utility slot, reset accumulated Damage, re-enable per-Round abilities.
    if (actor.system.engine === "reduced") {
      const update = {
        "system.playState.combatTurn": isFirst ? "first" : "active",
        "system.playState.accumulatedDamage": 0,
        "system.playState.accumulatedDamageWounds": 0,
        "system.enemyTurn.actionsUsed": 0,
        "system.enemyTurn.utilityUsed": false
      };
      if (actor.system.abilities?.some((a) => a.usedThisRound)) {
        update["system.abilities"] = actor.system.abilities.map((a) => ({ ...a, usedThisRound: false }));
      }
      await actor.update(update);
      return;
    }
    // Start of Turn order (Doc L3443-L3446): 1. clear the Reaction Pool and expire any prepared
    // Action with its reserved dice; 2. reset accumulated Damage; 3. form the Action Pool, then
    // resolve Dazed's one-time burn; 4. start-of-Turn effects.
    let actionDice = base - (isFirst ? (ps.initiativeDice || 0) : 0);
    const prepared = ps.preparedAction;
    const expiredPreparation = !!(prepared?.cardName || prepared?.reserved);
    // Dazed (Doc L4182): "burn 3 Action dice, or all remaining dice if fewer than 3 remain. Then
    // remove Dazed." Mooks and Normals waive it (their reduced engine has no Pool).
    const dazed = actor.system.usesSimplifiedWounds && actor.system.grade && actor.system.grade !== "Elite"
      ? null
      : actor.items?.find((i) => i.type === "condition" && (i.name || "").toUpperCase() === "DAZED") ?? null;
    let dazedBurn = 0;
    if (dazed) {
      dazedBurn = Math.min(3, actionDice);
      actionDice -= dazedBurn;
    }
    const update = {
      "system.playState.combatTurn": isFirst ? "first" : "active",
      "system.playState.actionDice": actionDice,
      "system.playState.reactionDice": 0,
      // Accumulated Damage resets at the start of each of the character's own Turns
      // (Doc L3445). accumulatedDamageWounds is no longer read (see ordinaryDamageWounds in
      // utils.mjs) but is still zeroed so stored data stays tidy.
      "system.playState.accumulatedDamage": 0,
      "system.playState.accumulatedDamageWounds": 0
    };

    if (expiredPreparation) {
      update["system.playState.preparedAction"] = { cardId: "", cardName: "", trigger: "", reserved: 0 };
    }

    // Cunning (Doc L5987): an unused Contingency expires at the start of the character's next
    // Turn. Psionics (L6122): the "no Psionics Actions this Turn" lock from venting Strain ends.
    // Prowess: the "dealt Damage" tick was settled at End Turn; make sure it starts clear.
    const sp = actor.system.specialties;
    if (sp?.contingency) update["system.specialties.contingency"] = "";
    if (sp?.contingencies?.length) update["system.specialties.contingencies"] = [];
    if (sp?.strainVented) update["system.specialties.strainVented"] = false;
    if (sp?.comboDealtDamage) update["system.specialties.comboDealtDamage"] = false;

    // Reduced Engine "1 per Round" Abilities (module/data/actor-adversary.mjs) re-enable at the
    // start of every one of this actor's own Turns, same cadence as Action Dice above.
    if (actor.system.abilities?.some((a) => a.usedThisRound)) {
      update["system.abilities"] = actor.system.abilities.map((a) => ({ ...a, usedThisRound: false }));
    }

    // V6 §6.8 (plan): a player/NPC Combat or Reaction Card with `cooldownFrequency: "perRound"`
    // (item-card.mjs) re-enables at the start of every one of this actor's own Turns too — same
    // cadence as the adversary "1 per Round" reset just above, same reasoning. "perEncounter" cards
    // are deliberately NOT touched here (see utils.mjs's resetEncounterCooldowns doc comment).
    const perRoundCards = actor.items?.filter((i) => (i.type === "action-card" || i.type === "reaction-card") && i.system.cooldownFrequency === "perRound" && i.system.cooldownUsed) ?? [];
    for (const card of perRoundCards) await card.update({ "system.cooldownUsed": false });

    // V6: the Death Track advances 1 step at the start of every one of the character's own Turns
    // while all 5 Core Wound spaces are filled AND the character is actively "dying" — governed by
    // occupancy (system.coreWoundsFilled), not by possessing a Critical Wound specifically, and
    // NOT while "stabilized" (see actor-combatant.mjs's deathTrackState schema comment for the full
    // state model). Adversaries never use the Death Track at all (V6 §2415) — see actor-adversary.mjs.
    const usesDeathTrack = !actor.system.usesSimplifiedWounds;
    const trackIsFull = actor.system.coreWoundsFilled === actor.system.coreWounds.length;
    let died = false;
    if (usesDeathTrack && trackIsFull && ps.deathTrackState === "dying") {
      // V6 Deathless Nature (design/v6-revision-delta.md §2.3): the cap is 7 for a Deathless
      // character, 5 otherwise — see actor-combatant.mjs's deathTrackMax (derived once, read here
      // rather than re-hardcoded). Governs both the advance's ceiling and the death trigger below.
      const max = actor.system.deathTrackMax ?? 5;
      const next = Math.min(max, (ps.deathTrackStep ?? 0) + 1);
      update["system.playState.deathTrackStep"] = next;
      // Doc L4059: reaching the threshold causes death, which is final. EssenceActor#markDead sets
      // the terminal state and Foundry's defeated status; a "dead" actor never re-enters this branch.
      died = next >= max;
      if (died) ui.notifications.error(game.i18n.format("ESSENCE.Notify.EndOfDeathTrack", { name: actor.name }));
    }

    await actor.update(update);
    if (expiredPreparation) {
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${actor.name}</strong>'s prepared ${prepared.cardName || "Action"} expires; ${prepared.reserved} reserved dice are discarded.</p>` });
    }
    if (dazed) {
      await dazed.delete();
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${actor.name}</strong> is Dazed: burns ${dazedBurn} Action dice after forming the Pool, then Dazed ends.</p>` });
    }
    if (died) await actor.markDead();
  }
}
