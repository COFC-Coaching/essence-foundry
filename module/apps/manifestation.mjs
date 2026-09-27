import {
  SEVERITY_BY_INDEX, deathTrackAfterWoundFilled, attachWoundCards, hasOriginDistinction,
  manifestationEntryCost, manifestationTrack, MANIFESTATION_TRACK
} from "../utils.mjs";

/**
 * Calling's Full Manifestation, built on Foundry's own native mechanism for "this token is
 * temporarily a different creature" — reassigning which Actor a Token's `actorId` points at — the
 * same approach systems like dnd5e use for Wild Shape/Polymorph, rather than inventing a bespoke
 * transformation layer. The Combatant document, turn order, and initiative are all untouched; only
 * which Actor the token (and therefore the player's active sheet) represents changes.
 *
 * Each of the 8 profiles from CALLING_PROFILES.md lives as a template Actor (its own dedicated
 * "manifestation" type — see actor-manifestation.mjs) in the "essence-system.manifestations"
 * compendium (see scripts/calling-profiles-data.json /
 * build-packs.mjs's manifestationProfileToActor()). The FIRST time a given character manifests a
 * given subtype, this clones that template into the world — that world copy is the character's own
 * persistent copy of the profile, reused by every later manifestation of the same subtype. The
 * clone is linked back to its caller via an `essence-system` flag rather than a duplicated ID
 * field, so the reverse lookup (Return/collapse) never drifts out of sync with
 * `specialties.manifestationRecords`.
 *
 * 0.12.0 (Doc Part X "Calling", L6285-L6435): every form shares ONE five-space Manifestation Wound
 * track, recorded on the character (`specialties.manifestationWounds`). The active form's own
 * `coreWounds` is a working view of it: filled from the count on entry, written back on return or
 * collapse. Broken is character-wide (the shared track is full) and ends when a Recovery removes a
 * Wound. The old per-subtype `manifestationRecords[].broken` flag is no longer read.
 */

const FLAG_SCOPE = "essence-system";

/** Rank-gated per CALLING_PROFILES.md's "Rank 0 offers Familiar/Sprite, Rank 1 adds
 *  Beast/Phantom/Golem, Rank 2 adds Elemental/Ancestor/Fey." */
export const MANIFESTATION_SUBTYPES = [
  { name: "Familiar", rank: 0 },
  { name: "Sprite", rank: 0 },
  { name: "Beast", rank: 1 },
  { name: "Phantom", rank: 1 },
  { name: "Golem", rank: 1 },
  { name: "Elemental", rank: 2 },
  { name: "Ancestor", rank: 2 },
  { name: "Fey", rank: 2 }
];

/** Every subtype this character's current Calling Rank can enter, in profile order. The authored
 *  profiles stop at Rank 2, but a higher-Rank caller can still enter every one of them; before
 *  0.7.10 a `rank <= 2` condition here left Calling Rank 3+ with no options at all. */
export function availableSubtypes(actor) {
  const rank = actor.system.calling ?? 0;
  return MANIFESTATION_SUBTYPES.filter((s) => rank >= s.rank);
}

/** Doc L6387, L6433: Broken while the shared Manifestation Wound track is full. */
export function isBroken(actor) {
  return (actor.system.specialties?.manifestationWounds ?? 0) >= MANIFESTATION_TRACK;
}

/** The entry surcharge this caller pays for a form of `rank` (Doc L6295-L6305). */
export function entryCostFor(actor, rank) {
  const distinctions = actor.items.filter((i) => i.type === "distinction");
  return manifestationEntryCost(rank, { summoner: hasOriginDistinction(distinctions, "Summoner") });
}

function getRecord(actor, subtype) {
  return actor.system.specialties.manifestationRecords.find((r) => r.subtype === subtype) ?? null;
}

/** The caller's own linked, active token — Full Manifestation swaps THIS token's actorId, so a
 *  character with no token placed on the current scene can't manifest through this flow. Character
 *  tokens are always force-linked in this system (see the GM Guide journal), so `linked=true` here
 *  is never a false negative for a real player character. */
function activeToken(actor) {
  return actor.getActiveTokens(true, true)[0] ?? null;
}

/**
 * Gets this character's existing persistent world-Actor copy of `subtype`, or clones one from the
 * compendium template the first time it's needed. Ownership is copied straight from the caller so
 * whichever player(s) control the character also get to control their own manifestation, per the
 * "should be an NPC sheet a player can control" design intent.
 */
async function getOrCreateProfileActor(actor, subtype) {
  const record = getRecord(actor, subtype);
  if (record?.actorId) {
    const existing = game.actors.get(record.actorId);
    if (existing) return existing;
  }

  const pack = game.packs.get("essence-system.manifestations");
  const index = await pack.getIndex();
  const entry = index.find((e) => e.name === subtype);
  if (!entry) {
    ui.notifications.error(`No "${subtype}" profile found in the Calling Full Manifestations compendium.`);
    return null;
  }
  const template = await pack.getDocument(entry._id);
  const data = template.toObject();
  delete data._id;
  data.folder = null;
  data.ownership = foundry.utils.deepClone(actor.ownership);
  data.flags = foundry.utils.mergeObject(data.flags ?? {}, {
    [FLAG_SCOPE]: { manifestationOf: actor.id, manifestationSubtype: subtype }
  });
  const created = await Actor.create(data);

  const records = actor.system.specialties.manifestationRecords.map((r) => ({ ...r }));
  const idx = records.findIndex((r) => r.subtype === subtype);
  if (idx >= 0) records[idx].actorId = created.id;
  else records.push({ subtype, actorId: created.id, broken: false });
  await actor.update({ "system.specialties.manifestationRecords": records });

  return created;
}

/**
 * Enters Full Manifestation as `subtype` (Doc L6289-L6319). The Calling card itself was played
 * normally first; this pays the Rider's surcharge from the table (extra burned Action dice, which
 * must be available, and extra Mana, warned when short per this project's convention), then swaps
 * the token. Pools, Turn and Initiative carry over unchanged; the form starts with no Temporary
 * Wounds of its own and the shared Manifestation Wound track as it stands.
 */
export async function enterManifestation(actor, subtype) {
  if (isBroken(actor)) {
    ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CallerBroken", { name: actor.name }));
    return;
  }
  const token = activeToken(actor);
  if (!token) {
    ui.notifications.warn(`${actor.name} needs a placed token on the current scene before manifesting.`);
    return;
  }
  const profile = await getOrCreateProfileActor(actor, subtype);
  if (!profile) return;

  const rank = profile.system.rank ?? 0;
  const cost = entryCostFor(actor, rank);
  const ps = actor.system.playState;
  const actionDice = ps.actionDice ?? 0;
  if (actionDice < cost.burn) {
    ui.notifications.warn(game.i18n.format("ESSENCE.Notify.ManifestationNeedsDice", { name: actor.name, burn: cost.burn, available: actionDice }));
    return;
  }
  const mana = actor.system.resources?.mana?.value ?? 0;
  if (cost.mana > mana) {
    ui.notifications.warn(game.i18n.format("ESSENCE.Notify.CardCostExceedsResource", { name: `Full Manifestation (Rank ${rank})`, cost: cost.mana, resource: "Mana", actorName: actor.name, current: mana }));
  }
  const remainingDice = actionDice - cost.burn;

  // No fresh Action Pool, Reaction Pool, or Damage-pressure reset on entry (Doc L6317) — the form
  // picks up exactly where the caller's Turn stood. poolBonus is synced too since
  // EssenceManifestationData has no Attributes of its own to derive baseCombatDice from.
  await profile.update({
    "system.poolBonus": actor.system.poolBonus ?? 0,
    "system.playState.actionDice": remainingDice,
    "system.playState.reactionDice": ps.reactionDice,
    "system.playState.accumulatedDamage": ps.accumulatedDamage,
    "system.playState.currentTemporaryWounds": 0,
    "system.playState.overflowWounds": 0,
    "system.playState.combatStarted": ps.combatStarted,
    "system.playState.combatTurn": ps.combatTurn,
    "system.coreWounds": manifestationTrack(actor.system.specialties.manifestationWounds ?? 0)
  });
  await token.update({ actorId: profile.id });
  const update = {
    "system.playState.actionDice": remainingDice,
    "system.specialties.activeManifestation": subtype,
    "system.specialties.manifested": true
  };
  if (cost.mana > 0) update["system.playState.currentMana"] = Math.max(0, mana - cost.mana);
  await actor.update(update);

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p><strong>${actor.name}</strong> fully manifests as their <strong>${subtype}</strong> (Rank ${rank}): burns ${cost.burn} additional Action ${cost.burn === 1 ? "die" : "dice"}${cost.mana ? ` and spends ${cost.mana} Mana` : ""}.</p>`
  });
}

/** Copies the shared turn-state fields back from a profile Actor onto its caller — the inverse
 *  half of enterManifestation's copy, used by a return and by collapse. */
function callerUpdateFromProfile(profile, manifestationWounds) {
  const ps = profile.system.playState;
  return {
    "system.playState.actionDice": ps.actionDice,
    "system.playState.reactionDice": ps.reactionDice,
    "system.playState.accumulatedDamage": ps.accumulatedDamage,
    "system.specialties.activeManifestation": "",
    "system.specialties.manifested": false,
    "system.specialties.manifestationWounds": manifestationWounds,
    "system.specialties.broken": manifestationWounds >= MANIFESTATION_TRACK
  };
}

function findCaller(profile) {
  const callerId = profile.getFlag(FLAG_SCOPE, "manifestationOf");
  return callerId ? game.actors.get(callerId) ?? null : null;
}

/** Doc L6337, L6371: the form's own Conditions and Temporary Wounds end when it ends. */
async function endFormState(profile) {
  const conditions = profile.items.filter((i) => i.type === "condition");
  if (conditions.length) await profile.deleteEmbeddedDocuments("Item", conditions.map((i) => i.id));
  await profile.update({ "system.playState.currentTemporaryWounds": 0, "system.playState.overflowWounds": 0 });
}

/**
 * Returns the caller to their own body (Doc L6361, L6371). A voluntary return during the Turn
 * burns 1 Action die from the shared Pool; an Encounter-end return is free. The shared
 * Manifestation Wound count is written back, the form's Conditions and Temporary Wounds end, and
 * the caller resumes with their own paused Wounds and durations unchanged.
 */
export async function returnFromManifestation(profile, { reason = "voluntary" } = {}) {
  const caller = findCaller(profile);
  if (!caller) {
    ui.notifications.error(`${profile.name} has no recorded caller to return to.`);
    return false;
  }
  let dice = profile.system.playState.actionDice ?? 0;
  if (reason === "voluntary") {
    if (dice < 1) {
      ui.notifications.warn(game.i18n.format("ESSENCE.Notify.ReturnNeedsDie", { name: profile.name }));
      return false;
    }
    dice -= 1;
    await profile.update({ "system.playState.actionDice": dice });
  }
  const filled = profile.system.coreWounds.filter((w) => w.filled).length;
  await caller.update(callerUpdateFromProfile(profile, Math.min(MANIFESTATION_TRACK, filled)));
  await endFormState(profile);
  const token = activeToken(profile);
  if (token) await token.update({ actorId: caller.id });

  const why = reason === "voluntary" ? "returns to their own body (1 Action die burned)" : "returns to their own body as the Encounter ends";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: caller }),
    content: `<p><strong>${caller.name}</strong> ${why}. Manifestation Wounds: ${filled} / ${MANIFESTATION_TRACK}.</p>`
  });
  return true;
}

/** Kept for existing call sites: a voluntary return. */
export async function dismissManifestation(profile) {
  return returnFromManifestation(profile, { reason: "voluntary" });
}

/**
 * Collapse (Doc L6381-L6389): the shared track is full, the form ends at once and the caller
 * returns, then directly suffers 1 Spiritual Core Wound that nothing reduces, prevents or absorbs.
 * It fills the earliest open Core space with a Spiritual Wound Card; a full Core track resolves it
 * as an additional Wound reaching it (Death Track). The character is Broken until a Recovery
 * removes a Manifestation Wound. `remaining` lists Damage components the collapsing hit had not yet
 * resolved; they recheck against the returned caller by hand (L6385), so they are posted to chat.
 */
export async function collapseManifestation(profile, { remaining = [] } = {}) {
  const caller = findCaller(profile);
  if (!caller) {
    ui.notifications.error(`${profile.name} has no recorded caller to return to.`);
    return false;
  }
  await caller.update(callerUpdateFromProfile(profile, MANIFESTATION_TRACK));
  await endFormState(profile);
  const token = activeToken(profile);
  if (token) await token.update({ actorId: caller.id });

  const coreWounds = caller.system.coreWounds.map((w) => ({ ...w }));
  let deathTrackStep = caller.system.playState.deathTrackStep ?? 0;
  let deathTrackState = caller.system.playState.deathTrackState ?? "none";
  const max = caller.system.deathTrackMax ?? 5;
  const wasFull = coreWounds.length > 0 && coreWounds.every((w) => w.filled);
  const log = [];
  let filledSlot = null;
  let died = false;
  if (deathTrackState === "dead") {
    log.push("The caller is dead; no further Wound applies.");
  } else if (wasFull) {
    deathTrackStep = Math.min(max, deathTrackStep + 1);
    const change = deathTrackAfterWoundFilled(deathTrackState, true, true);
    if (change) deathTrackState = change.deathTrackState;
    died = deathTrackStep >= max;
    log.push(`Core track already full: the Death Track advances to ${deathTrackStep} / ${max}.`);
  } else {
    const slot = coreWounds.findIndex((w) => !w.filled);
    const severity = SEVERITY_BY_INDEX[slot];
    coreWounds[slot] = { filled: true, domain: "Spiritual", severity, condition: `${severity} Spiritual Wound` };
    filledSlot = { slot, domain: "Spiritual", severity };
    log.push(`Direct Spiritual Core Wound: <strong>${severity} Spiritual Wound</strong> (bypasses Resilience, Resistance and Temporary Wounds).`);
    const nowFull = coreWounds.every((w) => w.filled);
    const change = deathTrackAfterWoundFilled(deathTrackState, false, nowFull);
    if (change) {
      deathTrackState = change.deathTrackState;
      if (change.deathTrackStep !== undefined) deathTrackStep = change.deathTrackStep;
    }
  }

  await caller.update({
    "system.coreWounds": coreWounds,
    "system.playState.currentCoreWounds": coreWounds.filter((w) => w.filled).length,
    "system.playState.deathTrackStep": deathTrackStep,
    "system.playState.deathTrackState": deathTrackState
  });
  if (filledSlot) await attachWoundCards(caller, [filledSlot]);
  if (died) await caller.markDead();

  const rest = remaining.filter((c) => (c.amount | 0) > 0);
  const restText = rest.length
    ? `<p>Still to resolve against <strong>${caller.name}</strong> by hand (Doc: later components recheck the returned caller): ${rest.map((c) => `${c.amount} ${c.type}${c.breach ? " (Breach)" : ""}${c.nonlethal ? " (nonlethal)" : ""}`).join(" + ")}.</p>`
    : "";
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: caller }),
    content: `<p><strong>${profile.name}</strong> collapses: the shared Manifestation Wound track is full (${MANIFESTATION_TRACK} / ${MANIFESTATION_TRACK}). <strong>${caller.name}</strong> returns and is <strong>Broken</strong> until a Recovery removes a Manifestation Wound.</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>${restText}`
  });
  return true;
}

/** Kept for the manifestation sheet's header control: collapse once the track reads full. */
export async function applyManifestationDefeat(profile) {
  if (!profile.system.defeated) {
    ui.notifications.warn(`${profile.name}'s Manifestation Wound track isn't full yet.`);
    return false;
  }
  return collapseManifestation(profile);
}

export { FLAG_SCOPE as MANIFESTATION_FLAG_SCOPE };
