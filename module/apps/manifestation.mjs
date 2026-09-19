import { SEVERITY_BY_INDEX, deathTrackAfterWoundFilled } from "../utils.mjs";

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
 * given subtype, this clones that template into the world — that world copy becomes the
 * character's own persistent record for the subtype (its Wounds simply stay marked between
 * sessions, since it's a real Actor that never gets deleted), and every later manifestation of the
 * same subtype reuses it. The clone is linked back to its caller via an `essence-system` flag
 * rather than a duplicated ID field, so the reverse lookup (Dismiss/Apply Defeat) never drifts out
 * of sync with `specialties.manifestationRecords`.
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

/** Every subtype this character's current Calling Rank can enter, in profile order. */
export function availableSubtypes(actor) {
  const rank = actor.system.calling ?? 0;
  return MANIFESTATION_SUBTYPES.filter((s) => rank <= 2 && rank >= s.rank);
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
 * Enters Full Manifestation as `subtype`. Assumes the calling card's own cost and this Rider's
 * additional burn (3 Action Dice, or 2 with the Summoner Origin, plus Mana equal to Rank+1) have
 * already been paid by hand, same as every other cost in this system — this only performs the
 * actual swap, it does not deduct the cost itself.
 */
export async function enterManifestation(actor, subtype) {
  const record = getRecord(actor, subtype);
  if (record?.broken) {
    ui.notifications.warn(`${subtype} is Broken until Downtime and cannot be manifested.`);
    return;
  }
  const token = activeToken(actor);
  if (!token) {
    ui.notifications.warn(`${actor.name} needs a placed token on the current scene before manifesting.`);
    return;
  }
  const profile = await getOrCreateProfileActor(actor, subtype);
  if (!profile) return;

  // No fresh Action Pool, Reaction Pool, or Damage-pressure reset on entry (CALLING_PROFILES.md's
  // shared procedure) — the profile picks up exactly where the caller's turn stood. Tier is synced
  // too since EssenceManifestationData has no Attributes of its own to derive baseCombatDice from
  // — see actor-manifestation.mjs.
  const ps = actor.system.playState;
  await profile.update({
    "system.tier": actor.system.tier,
    "system.playState.actionDice": ps.actionDice,
    "system.playState.reactionDice": ps.reactionDice,
    "system.playState.accumulatedDamage": ps.accumulatedDamage
  });
  await token.update({ actorId: profile.id });
  await actor.update({
    "system.specialties.activeManifestation": subtype,
    "system.specialties.manifested": true
  });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<p><strong>${actor.name}</strong> fully manifests as their <strong>${subtype}</strong>.</p>`
  });
}

/** Copies the shared turn-state fields back from a profile Actor onto its caller — the inverse
 *  half of enterManifestation's copy, used by both a voluntary Dismiss and a forced Defeat. */
function callerUpdateFromProfile(profile) {
  const ps = profile.system.playState;
  return {
    "system.playState.actionDice": ps.actionDice,
    "system.playState.reactionDice": ps.reactionDice,
    "system.playState.accumulatedDamage": ps.accumulatedDamage,
    "system.specialties.activeManifestation": "",
    "system.specialties.manifested": false
  };
}

function findCaller(profile) {
  const callerId = profile.getFlag(FLAG_SCOPE, "manifestationOf");
  return callerId ? game.actors.get(callerId) ?? null : null;
}

/** Voluntary dismissal — burn 1 Action Die on the caller's turn (paid by hand, see
 *  enterManifestation's identical note) — returns the token to the caller's own body. */
export async function dismissManifestation(profile) {
  const caller = findCaller(profile);
  if (!caller) {
    ui.notifications.error(`${profile.name} has no recorded caller to return to.`);
    return;
  }
  await caller.update(callerUpdateFromProfile(profile));
  const token = activeToken(profile);
  if (token) await token.update({ actorId: caller.id });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: caller }),
    content: `<p><strong>${caller.name}</strong> dismisses their Full Manifestation and returns to their own body.</p>`
  });
}

/**
 * Resolves a profile's defeat once its own Wound track is completely full: transfers overflow
 * Wounds plus 1 feedback Wound onto the caller, marks that subtype Broken until Downtime (an
 * external, manual Downtime ruling — not automated here, same as Strain recovery and Core Wound
 * recovery elsewhere in this system), and returns the token to the caller.
 *
 * The overflow count comes straight from the profile's own `playState.overflowWounds` — Apply
 * Damage on the manifestation's own sheet (manifestation-sheet.mjs) already increments that
 * counter for every Wound that didn't fit once its track was already full, so a GM triggers this
 * once the track reads full rather than re-deriving the count mid-resolution.
 */
export async function applyManifestationDefeat(profile) {
  const caller = findCaller(profile);
  const subtype = profile.getFlag(FLAG_SCOPE, "manifestationSubtype");
  if (!caller) {
    ui.notifications.error(`${profile.name} has no recorded caller to return to.`);
    return;
  }
  if (!profile.system.defeated) {
    ui.notifications.warn(`${profile.name}'s Wound track isn't full yet.`);
    return;
  }

  const wounds = (profile.system.playState.overflowWounds ?? 0) + 1; // +1 flat feedback Wound, always, per CALLING_PROFILES.md

  let tempWounds = caller.system.playState.currentTemporaryWounds ?? 0;
  const coreWounds = caller.system.coreWounds.map((w) => ({ ...w }));
  let deathTrackStep = caller.system.playState.deathTrackStep ?? 0;
  let deathTrackState = caller.system.playState.deathTrackState ?? "none";
  const wasFull = coreWounds.length > 0 && coreWounds.every((w) => w.filled);
  const log = [];
  for (let i = 0; i < wounds; i++) {
    if (tempWounds > 0) { tempWounds -= 1; log.push("1 Wound absorbed by a Temporary Wound."); continue; }
    const slot = coreWounds.findIndex((w) => !w.filled);
    if (slot === -1) {
      // V6: same "already full" overflow handling as #onApplyDamage (actor-sheet.mjs) — shared via
      // deathTrackAfterWoundFilled rather than reimplemented, since this call site previously
      // advanced deathTrackStep but never actually activated deathTrackState. Ceiling is
      // deathTrackMax (5, or 7 for Deathless — design/v6-revision-delta.md §2.3).
      deathTrackStep = Math.min(caller.system.deathTrackMax ?? 5, deathTrackStep + 1);
      const overflowChange = deathTrackAfterWoundFilled(deathTrackState, true, true);
      if (overflowChange) deathTrackState = overflowChange.deathTrackState;
      log.push("Core Wound track already full — Death Track advances instead.");
      continue;
    }
    const severity = SEVERITY_BY_INDEX[slot];
    const label = `${severity} Manifestation-Feedback Wound`;
    coreWounds[slot] = { filled: true, domain: "spiritual", severity, condition: label };
    log.push(`Core Wound filled: <strong>${label}</strong>.`);
  }
  // V6: activate the Death Track at step 0 if this transfer is what completed the 5th Core Wound
  // space — same wasFull/nowFull transition #onApplyDamage checks.
  const nowFull = coreWounds.length > 0 && coreWounds.every((w) => w.filled);
  const fillChange = deathTrackAfterWoundFilled(deathTrackState, wasFull, nowFull);
  if (fillChange) {
    deathTrackState = fillChange.deathTrackState;
    if (fillChange.deathTrackStep !== undefined) deathTrackStep = fillChange.deathTrackStep;
  }

  const records = caller.system.specialties.manifestationRecords.map((r) => ({ ...r }));
  const idx = records.findIndex((r) => r.subtype === subtype);
  if (idx >= 0) records[idx].broken = true;
  else records.push({ subtype, actorId: profile.id, broken: true });

  await caller.update({
    ...callerUpdateFromProfile(profile),
    "system.playState.currentTemporaryWounds": tempWounds,
    "system.coreWounds": coreWounds,
    "system.playState.currentCoreWounds": coreWounds.filter((w) => w.filled).length,
    "system.playState.deathTrackStep": deathTrackStep,
    "system.playState.deathTrackState": deathTrackState,
    "system.specialties.manifestationRecords": records
  });

  const token = activeToken(profile);
  if (token) await token.update({ actorId: caller.id });

  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: caller }),
    content: `<p><strong>${profile.name}</strong> is defeated! ${wounds} Wound(s) transfer to <strong>${caller.name}</strong> (including 1 feedback Wound), and <strong>${subtype}</strong> is marked Broken until Downtime.</p><ul>${log.map((l) => `<li>${l}</li>`).join("")}</ul>`
  });
}

export { FLAG_SCOPE as MANIFESTATION_FLAG_SCOPE };
