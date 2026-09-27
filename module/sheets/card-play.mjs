/**
 * Burn-only card plays shared by the Character and NPC sheets (0.10.0, Phase 3.3 to 3.5).
 *
 * A card with a burn-only profile (utils.mjs burnOnlyProfile: Dash, Reconfigure, Stabilize,
 * Prepare Action, the Species cards, or any card flagged noRoll) never rolls: the printed dice are
 * burned from the Action Pool (Doc L3639, "removed from the appropriate Pool but not part of the
 * roll") and the card's text is posted. Two of them do more: Stabilize changes a Death Track state
 * (Doc L4276) and Prepare Action reserves dice against a chosen Action (Doc L4320). Reconfigure's
 * real mechanic lives on the Equipment tab's per-item buttons; from the card row it only spends and
 * posts, as before.
 */
import { burnOnlyProfile, stripHtml } from "../utils.mjs";

function cardText(item) {
  const lines = (item.system.body ?? []).filter((b) => stripHtml(b.html)).map((b) => `<p><strong>${b.label}.</strong> ${b.html}</p>`);
  return lines.join("");
}

/**
 * @param {Actor} actor
 * @param {Item} item - an action-card or reaction-card
 * @returns {Promise<boolean>} true when the card was handled here (burn-only); false when it
 *   rolls and the caller should run its normal commit-and-roll path
 */
export async function playBurnOnlyCard(actor, item) {
  const profile = burnOnlyProfile(item.system, item.name);
  if (!profile) return false;
  // Reduced engine (Doc L6870): a utility Basic "uses one of the profile's available Actions but
  // costs no dice or Resources", at most one per Turn. Prepare Action needs explicit permission
  // (L7966), so it is refused here.
  if (actor.system.engine === "reduced") {
    if (item.name === "Prepare Action") {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.EnemyNeedsPermission", { name: actor.name, card: item.name }));
      return true;
    }
    const turn = actor.system.enemyTurn ?? { actionsUsed: 0, utilityUsed: false };
    if (turn.utilityUsed) ui.notifications.warn(game.i18n.format("ESSENCE.Notify.EnemyUtilityUsed", { name: actor.name }));
    if ((turn.actionsUsed ?? 0) >= (actor.system.effectiveActionsPerTurn ?? 1)) ui.notifications.warn(game.i18n.format("ESSENCE.Notify.EnemyActionsUsed", { name: actor.name, n: actor.system.effectiveActionsPerTurn }));
    await actor.update({ "system.enemyTurn.actionsUsed": (turn.actionsUsed ?? 0) + 1, "system.enemyTurn.utilityUsed": true });
    let extra = "";
    if (item.name === "Stabilize") extra = await stabilizePlay(actor);
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="essence content-type-action-card"><p><strong>${actor.name}</strong> uses <strong>${item.name}</strong> as this Turn's utility Action (no dice cost).</p>${cardText(item)}${extra}</div>`
    });
    return true;
  }
  const isReaction = item.type === "reaction-card";
  const poolField = isReaction ? "reactionDice" : "actionDice";
  const poolLabel = isReaction ? "Reaction" : "Action";
  const available = actor.system.playState[poolField] ?? 0;
  // Doc L3592: the minimum commitment is never less than 2 Pool dice, burned or rolled.
  const burn = Math.max(2, profile.burn);
  if (available < burn) {
    ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardRequiresMoreDice", { name: item.name, min: burn, available, label: poolLabel }));
    return true;
  }

  if (item.name === "Prepare Action") return preparePlay(actor, item, available, burn);
  // Dash (Shane, 2026-09-27): a reminder card for the general movement rule, 1 unit per burned
  // die. Ask how many dice (never below the 2-die minimum), burn them, grant that many units.
  if (item.name === "Dash") {
    const n = await foundry.applications.api.DialogV2.prompt({
      window: { title: item.name },
      content: `<p>${game.i18n.format("ESSENCE.Sheet.DashPrompt", { min: burn, max: available })}</p><input type="number" name="count" value="${burn}" min="${burn}" max="${available}" autofocus>`,
      ok: { label: "Burn", callback: (event, button) => Math.min(available, Math.max(burn, parseInt(button.form.elements.count.value, 10) || burn)) },
      rejectClose: false
    });
    if (!n) return true;
    await actor.update({ [`system.playState.${poolField}`]: available - n });
    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content: `<div class="essence content-type-action-card"><p><strong>${actor.name}</strong> uses <strong>Dash</strong>: burns ${n} ${poolLabel} dice and gains ${n} Movement this Turn.</p>${cardText(item)}</div>`
    });
    return true;
  }

  await actor.update({ [`system.playState.${poolField}`]: available - burn });
  let extra = "";
  if (item.name === "Stabilize") extra = await stabilizePlay(actor);
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="essence content-type-action-card"><p><strong>${actor.name}</strong> uses <strong>${item.name}</strong>: burns ${burn} ${poolLabel} dice, no roll.</p>${cardText(item)}${extra}</div>`
  });
  return true;
}

/**
 * Stabilize (Doc L4276-L4280). The target is the first targeted token's actor when one is
 * targeted, else this actor. Treatment requirements are the table's call (the Critical Wound
 * Card prints them); this asks for confirmation that they are met, then sets the state.
 */
async function stabilizePlay(actor) {
  const targeted = Array.from(game.user.targets).map((t) => t.actor).filter(Boolean);
  const target = targeted[0] ?? actor;
  const confirmed = await foundry.applications.api.DialogV2.confirm({
    window: { title: `Stabilize ${target.name}` },
    content: `<p>${game.i18n.format("ESSENCE.Sheet.StabilizeConfirm", { name: target.name })}</p>`,
    rejectClose: false
  });
  if (!confirmed) return `<p class="muted">${game.i18n.format("ESSENCE.Sheet.StabilizeNotMet", { name: target.name })}</p>`;
  const done = await target.stabilize();
  if (!done) return `<p class="muted">${game.i18n.format("ESSENCE.Sheet.StabilizeNothing", { name: target.name })}</p>`;
  const simplified = !!target.system.usesSimplifiedWounds;
  return `<p><strong>${target.name}</strong> is ${simplified ? "Defeated but stable: no longer dying, still unable to act" : "Stabilized: the Death Track stops advancing"}. No Wound is healed.</p>`;
}

/**
 * Prepare Action (Doc L4320-L4342): choose one owned Action (not Prepare Action itself), a
 * perceivable trigger, and reserve X of the remaining Action dice for it. Replacing a held
 * preparation discards its reserved dice (L4330).
 */
async function preparePlay(actor, item, available, burn) {
  const remaining = available - burn;
  const actions = actor.items.filter((i) => i.type === "action-card" && i.id !== item.id && i.name !== "Prepare Action");
  if (!actions.length) {
    ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.NoActionToPrepare"));
    return true;
  }
  const picked = await new Promise((resolve) => {
    new foundry.applications.api.DialogV2({
      window: { title: "Prepare Action" },
      content: `
        <label>${game.i18n.localize("ESSENCE.Sheet.PrepareChooseAction")}
          <select name="card">${actions.map((c) => `<option value="${c.id}">${c.name}</option>`).join("")}</select>
        </label>
        <label>${game.i18n.localize("ESSENCE.Sheet.PrepareTrigger")}<input type="text" name="trigger" placeholder="${game.i18n.localize("ESSENCE.Sheet.PrepareTriggerPlaceholder")}"></label>
        <label>${game.i18n.format("ESSENCE.Sheet.PrepareReserve", { max: remaining })}<input type="number" name="reserved" value="${Math.min(remaining, 2)}" min="0" max="${remaining}"></label>
        <p class="muted">${game.i18n.localize("ESSENCE.Sheet.PrepareNote")}</p>`,
      buttons: [{
        action: "prepare", label: "Prepare", default: true,
        callback: (event, button) => ({
          cardId: button.form.elements.card.value,
          trigger: button.form.elements.trigger.value.trim(),
          reserved: Math.max(0, Math.min(remaining, parseInt(button.form.elements.reserved.value, 10) || 0))
        })
      }],
      submit: (result) => resolve(result === "prepare" ? null : result)
    }).render(true);
  });
  if (!picked) return true;
  const card = actor.items.get(picked.cardId);
  const previous = actor.system.playState.preparedAction;
  await actor.update({ "system.playState.actionDice": available - burn });
  const reserved = await actor.setPreparedAction({ cardId: card.id, cardName: card.name, trigger: picked.trigger, reserved: picked.reserved });
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="essence content-type-action-card"><p><strong>${actor.name}</strong> prepares <strong>${card.name}</strong>: burns ${burn} Action dice and reserves ${reserved}.</p><p><strong>Trigger.</strong> ${picked.trigger || "(not stated)"}</p>${previous?.cardName ? `<p class="muted">The earlier preparation (${previous.cardName}, ${previous.reserved} dice) is discarded.</p>` : ""}<p class="muted">Reserved dice are separate from both Pools and expire at the start of the next Turn.</p></div>`
  });
  return true;
}

/**
 * Apply Damage prompt (0.10.1, Doc L3896-L3918): up to three printed components, each with an
 * amount, Damage type, Breach and (when the source grants it) nonlethal; plus the generic flat
 * reduction applied once to the total, with Weakened (Doc L4188) as a one-click −1 source.
 * @returns {Promise<{components: Array, reduction: number, weakened: boolean}|null>}
 */
export async function promptDamageComponents({ title = "Apply Damage", types, rows = 3 } = {}) {
  const typeOptions = types.map((t) => `<option value="${t}">${t}</option>`).join("");
  const row = (i) => `
    <div class="damage-component" style="display:grid;grid-template-columns:4em 1fr auto auto;gap:6px;align-items:center;margin-bottom:4px;">
      <input type="number" name="amount${i}" value="${i === 0 ? 1 : 0}" min="0" aria-label="Component ${i + 1} amount"${i === 0 ? " autofocus" : ""}>
      <select name="type${i}" aria-label="Component ${i + 1} Damage type">${typeOptions}</select>
      <label data-tooltip-text="${game.i18n.localize("ESSENCE.Sheet.BreachHint")}"><input type="checkbox" name="breach${i}"> ${game.i18n.localize("ESSENCE.Sheet.Breach")}</label>
      <label data-tooltip-text="${game.i18n.localize("ESSENCE.Sheet.NonlethalHint")}"><input type="checkbox" name="nonlethal${i}"> ${game.i18n.localize("ESSENCE.Sheet.Nonlethal")}</label>
    </div>`;
  const result = await new Promise((resolve) => {
    new foundry.applications.api.DialogV2({
      window: { title },
      content: `
        <p class="muted">${game.i18n.localize("ESSENCE.Sheet.DamageComponentsHint")}</p>
        ${Array.from({ length: rows }, (_, i) => row(i)).join("")}
        <div style="display:flex;gap:12px;align-items:center;margin-top:6px;">
          <label>${game.i18n.localize("ESSENCE.Sheet.FlatReduction")} <input type="number" name="reduction" value="0" min="0" style="width:4em"></label>
          <label data-tooltip-text="${game.i18n.localize("ESSENCE.Sheet.WeakenedHint")}"><input type="checkbox" name="weakened"> ${game.i18n.localize("ESSENCE.Sheet.AttackerWeakened")}</label>
        </div>`,
      buttons: [{
        action: "apply", label: "Apply", default: true,
        callback: (event, button) => {
          const f = button.form.elements;
          const components = [];
          for (let i = 0; i < rows; i++) {
            const amount = Math.max(0, Math.floor(Number(f[`amount${i}`].value)) || 0);
            if (amount > 0) components.push({ amount, type: f[`type${i}`].value, breach: f[`breach${i}`].checked, nonlethal: f[`nonlethal${i}`].checked });
          }
          const reduction = Math.max(0, Math.floor(Number(f.reduction.value)) || 0);
          // Weakened (Ryan, 2026-09-27, gap question 17): each Damage instance is reduced by 1 on its
          // own, before the flat reduction, which still comes off the total once.
          const weakened = f.weakened.checked;
          if (weakened) for (const c of components) c.amount = Math.max(0, c.amount - 1);
          return { components, reduction, weakened };
        }
      }],
      submit: (result) => resolve(result === "apply" ? null : result)
    }).render(true);
  });
  if (!result || !result.components.length) return null;
  return result;
}

/**
 * Concentration on a Core Wound (Doc L4632): "burn 1 die from their currently available Action or
 * Reaction Pool or end Concentration. If no appropriate die is available, Concentration ends." Not
 * a Reaction. A Temporary Wound absorbing the harm does not trigger it, so callers pass only real
 * Core Wound fills.
 */
export async function promptConcentrationOnWound(actor) {
  const item = actor.items.find((i) => i.type === "condition" && (i.name || "").toUpperCase() === "CONCENTRATION");
  if (!item) return;
  const ps = actor.system.playState;
  const pools = [["actionDice", "Action", ps.actionDice ?? 0], ["reactionDice", "Reaction", ps.reactionDice ?? 0]].filter(([, , n]) => n > 0);
  if (!pools.length) {
    await item.delete();
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${actor.name}</strong> suffers a Core Wound with no Pool die available: Concentration ends.</p>` });
    return;
  }
  const choice = await new Promise((resolve) => {
    new foundry.applications.api.DialogV2({
      window: { title: "Concentration" },
      content: `<p>${game.i18n.format("ESSENCE.Sheet.ConcentrationWound", { name: actor.name })}</p>`,
      buttons: [
        ...pools.map(([field, label, n]) => ({ action: field, label: `Burn 1 ${label} die (${n} left)`, callback: () => field })),
        { action: "end", label: "End Concentration", callback: () => "end" }
      ],
      submit: (result) => resolve(result ?? "end")
    }).render(true);
  });
  if (choice === "end" || !choice) {
    await item.delete();
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${actor.name}</strong> ends Concentration after a Core Wound.</p>` });
    return;
  }
  await actor.update({ [`system.playState.${choice}`]: (ps[choice] ?? 0) - 1 });
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<p><strong>${actor.name}</strong> burns 1 ${choice === "actionDice" ? "Action" : "Reaction"} die to keep Concentration through a Core Wound.</p>` });
}
