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
