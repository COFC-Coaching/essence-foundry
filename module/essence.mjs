import EssenceCharacterData from "./data/actor-character.mjs";
import EssenceNpcData from "./data/actor-npc.mjs";
import EssenceMonsterData from "./data/actor-monster.mjs";
import EssenceManifestationData from "./data/actor-manifestation.mjs";
import EssenceTeamData from "./data/actor-team.mjs";
import { EssenceActionCardData, EssenceReactionCardData, EssenceConditionData, EssenceEquipmentData, EQUIPMENT_CATEGORY_LABELS, MODULAR_EQUIPMENT_CATEGORIES } from "./data/item-card.mjs";
import { EssenceSpeciesData, EssenceHeritageData, EssenceDistinctionData } from "./data/item-origin.mjs";
import { EssenceChassisData, EssenceFittingData, EssenceAugmentData } from "./data/item-component.mjs";
import EssenceActorSheet from "./sheets/actor-sheet.mjs";
import EssenceNpcSheet from "./sheets/npc-sheet.mjs";
import EssenceMonsterSheet from "./sheets/monster-sheet.mjs";
import EssenceManifestationSheet from "./sheets/manifestation-sheet.mjs";
import EssenceTeamSheet from "./sheets/team-sheet.mjs";
import {
  EssenceCardSheet, EssenceConditionSheet, EssenceEquipmentSheet,
  EssenceSpeciesSheet, EssenceHeritageSheet, EssenceDistinctionSheet,
  EssenceComponentSheet, EssenceAugmentSheet
} from "./sheets/item-sheet.mjs";
import EssenceCombat from "./documents/combat.mjs";
import EssenceActor from "./documents/actor.mjs";
import EssenceContentWizard, { canCreateContent } from "./apps/content-wizard.mjs";
import EssenceBulkImport from "./apps/bulk-import.mjs";
import { capitalize, fitTitleSize, domainResource, fittingReconfigureCost } from "./utils.mjs";
import { rollEssencePool, resolvePendingCardPlay } from "./dice/essence-roll.mjs";
import { targetsFromTokens, resolveTargetsForDefense } from "./sheets/card-play.mjs";
import { syncEquipmentEffect } from "./data/equipment-effects.mjs";
import { GRADE_BUDGETS } from "./data/monster-budgets.mjs";
import EssenceGradeBudgetsSettings from "./apps/grade-budgets-settings.mjs";
import { registerWhatsNewSetting, checkWhatsNew, handleWhatsNewChatCommand } from "./apps/whats-new.mjs";
import { repairWorldData } from "./apps/world-repair.mjs";

/** Foundry combat's own enum values, given a display label a player should actually see. */
const TURN_LABELS = { notStarted: "Not Started", first: "First Turn", active: "Active", ended: "Ended" };

/**
 * Replacement for core's own `{{editor}}` Handlebars helper. That helper's `button=true` output
 * is plain `<div class="editor"><a class="editor-edit">…` markup that only becomes clickable via
 * FormApplication#_activateEditor (jQuery `activateListeners`, the legacy V1 sheet API) — every
 * sheet in this system is ApplicationV2/DocumentSheetV2-based and never gets that wiring, so every
 * rich-text field's edit button was inert (see e.g. the Character Wizard's Concept/Background, or
 * the actor sheet's Biography tab). `<prose-mirror>` is a real, self-activating, form-associated
 * custom element Foundry core already registers — it needs no JS glue at all, and its native
 * `change` event is exactly what these sheets' existing `submitOnChange: true` form config already
 * listens for, so saving works the same way every other named input already does.
 */
function essenceEditorHelper(content, options) {
  const { target, button = false } = options.hash;
  const value = foundry.utils.escapeHTML(content ?? "");
  const attrs = [`class="editor"`, `name="${foundry.utils.escapeHTML(target)}"`, button ? "toggled" : "", `value="${value}"`]
    .filter(Boolean).join(" ");
  return new Handlebars.SafeString(`<prose-mirror ${attrs}>${content ?? ""}</prose-mirror>`);
}

Hooks.once("init", () => {
  console.log("Essence System | Initializing");

  // Shared partials (Finding 6 / build-history): the Death Track block was hand-copied
  // byte-for-byte across character-sheet.hbs/npc-sheet.hbs/monster-sheet.hbs, and the Wounds
  // section header separately duplicated between npc-sheet.hbs/monster-sheet.hbs. This project has
  // no prior Handlebars-partial convention to follow, so this establishes one: register each
  // "parts/*.hbs" file under its own path as the partial key, then `{{> "that same path"}}` from
  // any sheet template. foundry.applications.handlebars.loadTemplates both compiles/caches the
  // template AND registers it as a partial when given an array of paths.
  foundry.applications.handlebars.loadTemplates([
    "systems/essence-system/templates/actor/parts/death-track.hbs",
    "systems/essence-system/templates/actor/parts/wounds-header.hbs",
    "systems/essence-system/templates/chat/d10-shape.hbs"
  ]);

  CONFIG.Actor.dataModels.character = EssenceCharacterData;
  CONFIG.Actor.dataModels.npc = EssenceNpcData;
  CONFIG.Actor.dataModels.monster = EssenceMonsterData;
  CONFIG.Actor.dataModels.manifestation = EssenceManifestationData;
  CONFIG.Actor.dataModels.team = EssenceTeamData;
  CONFIG.Item.dataModels["action-card"] = EssenceActionCardData;
  CONFIG.Item.dataModels["reaction-card"] = EssenceReactionCardData;
  CONFIG.Item.dataModels.condition = EssenceConditionData;
  CONFIG.Item.dataModels.equipment = EssenceEquipmentData;
  CONFIG.Item.dataModels.species = EssenceSpeciesData;
  CONFIG.Item.dataModels.heritage = EssenceHeritageData;
  CONFIG.Item.dataModels.distinction = EssenceDistinctionData;
  CONFIG.Item.dataModels.chassis = EssenceChassisData;
  CONFIG.Item.dataModels.fitting = EssenceFittingData;
  CONFIG.Item.dataModels.augment = EssenceAugmentData;
  CONFIG.Combat.documentClass = EssenceCombat;
  CONFIG.Actor.documentClass = EssenceActor;

  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet("essence-system", EssenceActorSheet, { types: ["character"], makeDefault: true });
  Actors.registerSheet("essence-system", EssenceNpcSheet, { types: ["npc"], makeDefault: true });
  Actors.registerSheet("essence-system", EssenceMonsterSheet, { types: ["monster"], makeDefault: true });
  Actors.registerSheet("essence-system", EssenceManifestationSheet, { types: ["manifestation"], makeDefault: true });
  Actors.registerSheet("essence-system", EssenceTeamSheet, { types: ["team"], makeDefault: true });

  Items.registerSheet("essence-system", EssenceCardSheet, { types: ["action-card", "reaction-card"], makeDefault: true });
  Items.registerSheet("essence-system", EssenceConditionSheet, { types: ["condition"], makeDefault: true });
  Items.registerSheet("essence-system", EssenceEquipmentSheet, { types: ["equipment"], makeDefault: true });
  Items.registerSheet("essence-system", EssenceSpeciesSheet, { types: ["species"], makeDefault: true });
  Items.registerSheet("essence-system", EssenceHeritageSheet, { types: ["heritage"], makeDefault: true });
  Items.registerSheet("essence-system", EssenceDistinctionSheet, { types: ["distinction"], makeDefault: true });
  Items.registerSheet("essence-system", EssenceComponentSheet, { types: ["chassis", "fitting"], makeDefault: true });
  Items.registerSheet("essence-system", EssenceAugmentSheet, { types: ["augment"], makeDefault: true });

  Handlebars.registerHelper("addOne", (n) => Number(n) + 1);
  Handlebars.registerHelper("essenceEditor", essenceEditorHelper);
  Handlebars.registerHelper("capitalize", capitalize);
  // Equipment's `category` is stored lowercase/hyphenated ("consumable-kit") — a plain capitalize
  // or CSS text-transform only capitalizes the first letter, leaving "Consumable-kit." Any
  // template showing a category display value should use this instead for a properly-capitalized
  // multi-word label ("Consumable Kit") consistent everywhere it appears.
  Handlebars.registerHelper("equipmentCategoryLabel", (category) => EQUIPMENT_CATEGORY_LABELS[category] ?? capitalize(category ?? ""));
  Handlebars.registerHelper("turnLabel", (turn) => TURN_LABELS[turn] ?? capitalize(turn ?? ""));
  Handlebars.registerHelper("fitTitleSize", (text, options) => fitTitleSize(text, options.hash));
  Handlebars.registerHelper("domainResource", domainResource);
  Handlebars.registerHelper("fittingReconfigureCost", fittingReconfigureCost);

  // Homebrew Grade (Mook/Normal/Elite) budget table the Monster Creator auto-fills stat blocks
  // from — see monster-budgets.mjs's own doc comment on why this is meant to be GM-tunable.
  // `config: false` since this is an Object setting with no sensible single-control UI;
  // `restricted: true` on the menu means only a GM (Foundry's own permission check, not a custom
  // one) can even open the settings app that edits it.
  game.settings.register("essence-system", "gradeBudgets", {
    scope: "world", config: false, type: Object, default: GRADE_BUDGETS
  });
  game.settings.registerMenu("essence-system", "gradeBudgetsMenu", {
    name: "ESSENCE.Settings.GradeBudgets.Title",
    label: "ESSENCE.Settings.GradeBudgets.MenuLabel",
    hint: "ESSENCE.Settings.GradeBudgets.Hint",
    icon: "fa-solid fa-scale-balanced",
    type: EssenceGradeBudgetsSettings,
    restricted: true
  });

  registerWhatsNewSetting();

  // Cover art behind every actor sheet (sheet concept, 2026-09-27). A world-scoped image path
  // through Foundry's own FilePathField, so the settings UI shows its file picker; blank = plain
  // ground. The sheet class passes it to the template as a CSS variable (see actor-sheet.mjs).
  game.settings.register("essence-system", "sheetArtwork", {
    name: "ESSENCE.Settings.SheetArtwork.Name",
    hint: "ESSENCE.Settings.SheetArtwork.Hint",
    scope: "world", config: true,
    type: new foundry.data.fields.FilePathField({ categories: ["IMAGE"], required: false, blank: true, initial: "" }),
    default: "",
    onChange: () => { for (const app of foundry.applications.instances.values()) if (app.document?.documentName === "Actor") app.render(); }
  });

  game.settings.register("essence-system", "grantedItemCreatePermission", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.register("essence-system", "migratedEquipmentBonusEffects", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.register("essence-system", "prunedOrphanedExpertises", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.register("essence-system", "resyncedModularEquipmentBonusEffects", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.register("essence-system", "dedupedEquipmentBonusEffects", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.register("essence-system", "grantedConsumableKitCards", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.register("essence-system", "notifiedPersonalTierRemoved", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.register("essence-system", "rekeyedResilienceEffects", {
    scope: "world", config: false, type: Boolean, default: false
  });
  game.settings.register("essence-system", "migratedRoleToGrade", {
    scope: "world", config: false, type: Boolean, default: false
  });
  // Legacy setting kept registered (but otherwise unused) solely so the migration below can read
  // whatever a GM had already customized before "roleBudgets" was replaced by "gradeBudgets" —
  // default {} rather than the old ROLE_BUDGETS module export, which no longer exists.
  game.settings.register("essence-system", "roleBudgets", {
    scope: "world", config: false, type: Object, default: {}
  });
});

/**
 * Registers every Condition in the compendium as a Token HUD status-icon toggle. Kept out of
 * "init" because it needs the compendium's index, which isn't available that early; "ready" is
 * also before any player can open a Token HUD, so there's no risk of missing an interaction.
 * Each entry's `id` is slugified from the Condition's name (stable across a "Refresh compendium
 * content" re-import, unlike the compendium document's own _id) and carries `essenceConditionUuid`
 * so EssenceActor#toggleStatusEffect (module/documents/actor.mjs) knows which real Item to apply.
 */
/**
 * FIRST ready hook deliberately — every migration below this one iterates `game.actors`, and a
 * document that failed schema validation isn't IN `game.actors` to be iterated. See
 * module/data/migration.mjs for what makes a document fail to load in the first place, and
 * module/apps/world-repair.mjs for what this does about it (persist the repair, then tell the GM
 * in plain language — no console, no instructions to follow).
 */
Hooks.once("ready", async () => {
  await repairWorldData();
});

/** See whats-new.mjs — posts a per-client, once-per-version "what's new" chat card. */
Hooks.once("ready", () => {
  checkWhatsNew();
});

/** Lets any user type /whatsnew to redisplay the current version's card on demand — see
 *  whats-new.mjs's handleWhatsNewChatCommand(). Returning false suppresses the normal "send this
 *  as a chat message" behavior, matching every other slash-command hook's contract. */
Hooks.on("chatMessage", (chatLog, message) => handleWhatsNewChatCommand(message));

/**
 * Foundry's core "Create Items" world permission (the one that actually gates a Player creating a
 * new Equipment/Action Card/etc. Item document — not the same thing as owning their own character,
 * which already lets them add existing Items to it) defaults to Gamemaster-only. Players building
 * homebrew Equipment or Action Cards for their own character is normal for this system, so a GM's
 * world is nudged to allow it out of the box on first load after upgrading, without silently
 * overriding a GM who has already deliberately configured permissions differently.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.settings.get("essence-system", "grantedItemCreatePermission")) return;
  const permissions = game.settings.get("core", "permissions") ?? {};
  const itemCreate = permissions.ITEM_CREATE ?? [];
  if (!itemCreate.includes(CONST.USER_ROLES.PLAYER)) {
    await game.settings.set("core", "permissions", {
      ...permissions,
      ITEM_CREATE: [...itemCreate, CONST.USER_ROLES.PLAYER]
    });
  }
  await game.settings.set("essence-system", "grantedItemCreatePermission", true);
});

/**
 * One-time migration: every equipment Item's transferred "Equipment Bonus" ActiveEffect that was
 * ever synced before this version targeted system.resilience/movement/reach DIRECTLY (see
 * equipment-effects.mjs's buildChanges doc comment for why that was wrong) — those effect documents
 * already exist on disk with the old `changes` array baked in, and nothing re-triggers
 * syncEquipmentEffect for an item that isn't itself being created/updated right now. Re-running it
 * for every equipment Item once, world-wide, rebuilds each stale effect onto the new indirect
 * *Bonus fields without waiting for a GM to happen to re-save every piece of gear by hand.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.settings.get("essence-system", "migratedEquipmentBonusEffects")) return;
  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (item.type === "equipment") await syncEquipmentEffect(item);
    }
  }
  await game.settings.set("essence-system", "migratedEquipmentBonusEffects", true);
});

/**
 * One-time migration: buildEquipmentResolver() (equipment-features.mjs) now falls back to the
 * `essence-system.equipment` compendium when a modular equipment Item's chassisItemId/
 * fittingItemId was never actually embedded on its owning actor (confirmed live — several owned
 * items had those set to a compendium document's id with nothing embedded to match). Before that
 * fix, syncEquipmentEffect() resolved 0 for such an item and correctly deleted/never created its
 * "Equipment Bonus" effect; now that resolution can succeed, those items are still sitting there
 * with no effect (or a stale one) until something re-triggers a sync. Same shape as the migration
 * above — re-run once, world-wide, rather than waiting for a GM to happen to re-save every item.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.settings.get("essence-system", "resyncedModularEquipmentBonusEffects")) return;
  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (item.type === "equipment" && item.system.isModular) await syncEquipmentEffect(item);
    }
  }
  await game.settings.set("essence-system", "resyncedModularEquipmentBonusEffects", true);
});

/**
 * One-time repair: an equipment Item could end up carrying TWO "Equipment Bonus" ActiveEffects,
 * both transferred and both applying, so its Fortitude/Resilience/Movement contribution was
 * doubled — a +2 Resilience / -2 Movement Half-Plate reading as +4 and -4 on its owner. The race
 * that produced them is fixed at source (syncEquipmentEffect now queues per Item), but the extra
 * effect documents are already on disk in any world that hit it, and nothing re-triggers a sync
 * for an item nobody happens to re-save. One world-wide pass clears them: the sync itself now
 * deletes every duplicate it finds, so simply re-running it per equipment Item is the repair.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.settings.get("essence-system", "dedupedEquipmentBonusEffects")) return;
  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (item.type === "equipment") await syncEquipmentEffect(item);
    }
  }
  await game.settings.set("essence-system", "dedupedEquipmentBonusEffects", true);
});

/**
 * One-time fill (0.20.2): the four Consumable Kits (Explosives, Medical, Munitions, Potion Pack)
 * shipped with an `effect` promising a named card that never existed. The compendium copies now
 * carry it as an Equipment Card (item-card.mjs's `equipmentCards`), but a kit already sitting on an
 * actor keeps whatever it was imported with. One world-wide pass copies the cards from the
 * compendium onto any owned Consumable Kit of the same name that has none of its own — so a GM
 * doesn't have to delete and re-import every pack on every sheet. A kit the GM has already given
 * cards to is left alone; nothing else on the item changes.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.settings.get("essence-system", "grantedConsumableKitCards")) return;
  const pack = game.packs.get("essence-system.equipment");
  // Filtered in JS: a nested "system.category" query to getDocuments matches nothing in v14 (live, 2026-10-04).
  const templates = pack ? (await pack.getDocuments({ type: "equipment" })).filter((t) => t.system.category === "consumable-kit") : [];
  const byName = new Map(templates.filter((t) => t.system.equipmentCards?.length).map((t) => [t.name, t.system.equipmentCards]));
  if (byName.size) {
    for (const actor of game.actors) {
      for (const item of actor.items) {
        if (item.type !== "equipment" || item.system.category !== "consumable-kit") continue;
        if (item.system.equipmentCards?.length) continue;
        const cards = byName.get(item.name);
        if (!cards) continue;
        await item.update({ "system.equipmentCards": cards.map((c) => ({ ...c })), "system.effect": templates.find((t) => t.name === item.name).system.effect });
      }
    }
  }
  await game.settings.set("essence-system", "grantedConsumableKitCards", true);
});

/**
 * One-time notice (0.8.0): v0.6 removes personal Tier. Base Action and Reaction Pools become a flat
 * 6 (they were 5 + Tier), Level now means total Advancement Points earned (it used to count within
 * a Tier), and Team Tier lives on a Team actor. Per the decision recorded in
 * design/v0.6-doc-implementation-plan.md, nothing is converted automatically: this whispers the GM
 * which characters had a personal Tier above 1, so their pools and Level can be adjusted by hand.
 * It reads the legacy `system.tier` straight from the stored data.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.settings.get("essence-system", "notifiedPersonalTierRemoved")) return;
  const affected = game.actors
    .filter((a) => a.type === "character" && (a._source.system?.tier ?? 1) > 1)
    .map((a) => game.i18n.format("ESSENCE.Notify.PersonalTierEntry", { name: a.name, tier: a._source.system.tier, level: a._source.system.level ?? 1 }));
  await ChatMessage.create({
    whisper: ChatMessage.getWhisperRecipients("GM"),
    content: game.i18n.format("ESSENCE.Notify.PersonalTierRemoved", {
      list: affected.length
        ? `${game.i18n.localize("ESSENCE.Notify.PersonalTierAffectedIntro")}<ul>${affected.map((l) => `<li>${l}</li>`).join("")}</ul>`
        : game.i18n.localize("ESSENCE.Notify.PersonalTierNoneAffected")
    })
  });
  await game.settings.set("essence-system", "notifiedPersonalTierRemoved", true);
});

/**
 * One-time repair (0.7.10): Athlete's "Peak Performance: Resilience +1" Active Effect targeted
 * `system.resilience` directly — the plain sheet input — so every unrelated form save wrote the
 * already-boosted value back as the new base and the effect then added 1 again (the compounding
 * the schema comment on `resilienceBonus` in actor-combatant.mjs describes). The compendium now
 * targets `resilienceBonus`, but each character's embedded Distinction keeps its own copy of the
 * old effect, so re-point those here. A character's base Resilience may already have crept up and
 * there's no record of the true value, so the GM gets a whispered list to check by hand rather
 * than a guessed correction.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.settings.get("essence-system", "rekeyedResilienceEffects")) return;
  const affected = [];
  const rekey = async (item) => {
    for (const effect of item.effects) {
      if (!effect.changes.some((c) => c.key === "system.resilience")) continue;
      const changes = effect.changes.map((c) => (c.key === "system.resilience" ? { ...c, key: "system.resilienceBonus" } : c));
      await effect.update({ changes });
      return true;
    }
    return false;
  };
  for (const actor of game.actors) {
    for (const item of actor.items) {
      if (item.type === "distinction" && (await rekey(item))) affected.push(actor.name);
    }
  }
  for (const item of game.items) {
    if (item.type === "distinction") await rekey(item);
  }
  if (affected.length) {
    await ChatMessage.create({
      whisper: ChatMessage.getWhisperRecipients("GM"),
      content: game.i18n.format("ESSENCE.Notify.ResilienceEffectRekeyed", { names: affected.join(", ") })
    });
  }
  await game.settings.set("essence-system", "rekeyedResilienceEffects", true);
});

/**
 * One-time migration: character-wizard.mjs's #onAdjustSkill let a Combat Style's rank drop back to
 * 0 without clearing any Expertise the player had already picked under it (fixed going forward —
 * see that function's comment), so an Expertise already orphaned this way is invisible in the
 * wizard's by-skill breakdown (which only lists skills at rank >= 1) yet still counts toward the
 * Expertises total, silently inflating it (confirmed live: "EXPERTISES (5 / 4)" with only 4
 * actually visible/chosen anywhere). The fix above stops new orphans; this sweeps existing ones off
 * every character actor once.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.settings.get("essence-system", "prunedOrphanedExpertises")) return;
  for (const actor of game.actors) {
    if (actor.type !== "character") continue;
    const expertises = actor.system.expertises ?? [];
    const pruned = expertises.filter((e) => (actor.system[e.skill] ?? 0) >= 1);
    if (pruned.length !== expertises.length) await actor.update({ "system.expertises": pruned });
  }
  await game.settings.set("essence-system", "prunedOrphanedExpertises", true);
});

/**
 * One-time migration: system.role (Minion/Standard/Elite/Nemesis) was replaced by system.grade
 * (Mook/Normal/Elite) — see actor-npc.mjs and Things To Work On/Enemies and NPC's.txt. Grade is no
 * longer in the NPC schema, so `actor.system.role` reads as undefined post-upgrade; the old value
 * still exists in the raw persisted source until something writes over it, so it's read off
 * `actor._source` here rather than the prepared data. Minion→Mook and Standard→Normal are 1:1;
 * Elite and Nemesis both collapse to Elite, since Grade no longer distinguishes a mid-tier "mini-
 * boss" from "the boss" — eliteType (Champion/Leader/Solo) and the design doc's Elite-Only Ability
 * Principle are what carry that distinction now. Also migrates the old "roleBudgets" world setting
 * (keyed Minion/Standard/Elite/Nemesis) to the new "gradeBudgets" setting the Monster Creator
 * actually reads, using the same collapse — but only if a GM had actually customized it; an
 * untouched roleBudgets setting is just monster-budgets.mjs's old defaults and gradeBudgets already
 * has its own current defaults, so leave those alone rather than overwriting with a stale shape.
 */
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;
  if (game.settings.get("essence-system", "migratedRoleToGrade")) return;

  // The per-actor half of this migration now happens at source level in module/data/migration.mjs
  // (LEGACY_FIELD_RENAMES role -> grade, LEGACY_VALUE_ALIASES Minion/Standard/Nemesis -> Mook/
  // Normal/Elite), which is both earlier and strictly broader: it runs before the document is
  // constructed rather than after, and it covers Monsters as well as NPCs, which the loop that
  // used to live here never did. It also covers the case this loop structurally could not — an
  // actor whose stored data the schema rejects is not in `game.actors` to be iterated at all.
  // What remains here is the world SETTING migration, which is not document data and so has no
  // source-level equivalent.

  const oldRoleBudgets = game.settings.get("essence-system", "roleBudgets");
  const hasCustomValue = ["Minion", "Standard", "Elite", "Nemesis"].some((role) =>
    Object.keys(oldRoleBudgets?.[role] ?? {}).length > 0
  );
  if (hasCustomValue) {
    await game.settings.set("essence-system", "gradeBudgets", {
      Mook: { ...oldRoleBudgets.Minion },
      Normal: { ...oldRoleBudgets.Standard },
      Elite: { ...oldRoleBudgets.Nemesis, ...oldRoleBudgets.Elite }
    });
  }

  await game.settings.set("essence-system", "migratedRoleToGrade", true);
});

Hooks.once("ready", async () => {
  const pack = game.packs.get("essence-system.conditions");
  if (!pack) return;
  const index = await pack.getIndex({ fields: ["img"] });
  for (const entry of index) {
    const slug = entry.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    CONFIG.statusEffects.push({
      id: `essence-${slug}`,
      name: entry.name,
      img: entry.img || "icons/svg/skull.svg",
      essenceConditionUuid: entry.uuid
    });
  }
});

/**
 * Adds a "Create Content" scene-control button that opens the Action/Reaction Card, Equipment,
 * and Condition creation wizard — gated by Foundry's own assignable "Create Items" permission
 * (World Settings > Configure Permissions), not just game.user.isGM, so a GM can delegate content
 * authoring to trusted players without giving them full GM access. Uses a `button: true` tool
 * (the same pattern as Lighting's Day/Night/Reset buttons) since this fires an action immediately
 * rather than switching into an interaction mode.
 */
Hooks.on("getSceneControlButtons", (controls) => {
  if (!canCreateContent()) return;
  controls.essenceContent = {
    name: "essenceContent",
    order: 100,
    title: "Essence System",
    icon: "fa-solid fa-wand-magic-sparkles",
    tools: {
      createContent: {
        name: "createContent",
        order: 1,
        title: "Create Card / Equipment / Condition",
        icon: "fa-solid fa-plus",
        button: true,
        onChange: () => new EssenceContentWizard().render(true)
      },
      bulkImportContent: {
        name: "bulkImportContent",
        order: 2,
        title: "Bulk Import Cards / Equipment / Conditions (CSV)",
        icon: "fa-solid fa-file-csv",
        button: true,
        onChange: () => new EssenceBulkImport().render(true)
      }
    }
  };
});

/**
 * Combat start is handled by EssenceCombat#_onStartRound (see module/documents/combat.mjs) —
 * that override is properly awaited inside Foundry's own turn-event lifecycle, unlike a plain
 * Hooks.on("combatStart", ...) listener, which fires via Hooks.callAll *before* Combat#startCombat
 * awaits its own round/turn update and so races that update instead of running before it.
 *
 * Ending combat has no such race (nothing updates the Combat document afterward), so a plain
 * hook is fine here. Fires on every connected client; only the active GM applies the reset.
 */
Hooks.on("deleteCombat", async (combat) => {
  if (!game.user.isActiveGM) return;
  for (const combatant of combat.combatants) {
    const actor = combatant.actor;
    if (!["character", "npc", "monster"].includes(actor?.type)) continue;
    const update = {
      "system.playState.combatStarted": false,
      "system.playState.combatTurn": "notStarted"
    };
    // Everything else persists. Threads and Authority used to be cleared here too, but they end
    // when the ENCOUNTER ends, not when Combat does (Doc L3039: "A Social Encounter may become
    // Combat without creating a fresh Encounter"); the explicit New Encounter action clears them
    // (utils.mjs resetEncounterSpecialties). A held Prepare Action has no meaning outside Combat.
    if (actor.system.playState?.preparedAction?.cardName || actor.system.playState?.preparedAction?.reserved) {
      update["system.playState.preparedAction"] = { cardId: "", cardName: "", trigger: "", reserved: 0 };
    }
    await actor.update(update);
  }
});

/**
 * Roll at resolution (Doc 2026-09-28, "Card Sequence"): a card played with "roll when it resolves"
 * posts a chat card with these two buttons. Roll reads the user's targets NOW (targeting is
 * finalized at resolution), asks for the Success Dice requirement (set before rolling) and rolls
 * through the same engine as an immediate play. Cancel marks the card cancelled; its dice and
 * Resources were spent when it was played and stay spent. Either way the pending card is marked
 * so the buttons go away for everyone. Only the card's owner or a GM may act.
 */
function wirePendingCardButtons(message, html, data) {
  const pending = data?.pending;
  if (!pending) return;
  const state = data.pendingState ?? "open";
  const box = html.querySelector(".rc-pending");
  if (!box) return;
  if (state !== "open") {
    box.querySelectorAll("button").forEach((b) => { b.disabled = true; });
    const note = box.querySelector(".rc-pending-state");
    if (note) note.textContent = game.i18n.localize(state === "cancelled" ? "ESSENCE.Chat.PendingCancelled" : "ESSENCE.Chat.PendingResolved");
    return;
  }
  const mayAct = async () => {
    const actor = pending.actorUuid ? await fromUuid(pending.actorUuid) : null;
    if (game.user.isGM || actor?.isOwner) return true;
    ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.PendingNotYours"));
    return false;
  };
  const settle = async (next) => {
    if (message.isOwner || game.user.isGM) await message.update({ "flags.essence-system.pendingState": next });
  };
  const rollBtn = box.querySelector("[data-action='resolvePending']");
  if (rollBtn) rollBtn.onclick = async () => {
    if (!(await mayAct())) return;
    // Targets (Shane, 2026-09-28): whoever the clicker has targeted now (the GM can target for a
    // player), else the tokens targeted when the card was played, else one Declare Defense prompt.
    // Success Dice: the number on the card, prefilled from the play prompt; never asked again.
    const defenseKey = pending.unopposed ? "" : pending.defenseKey;
    let list = targetsFromTokens(game.user.targets, defenseKey);
    if (!list.length && Array.isArray(pending.playTargets)) list = pending.playTargets;
    let defense = null, targets = null;
    if (list.length > 1) targets = list;
    else if (list.length === 1) { defense = list[0].defense; targets = [list[0]]; }
    else if (defenseKey) {
      // Nobody targeted anyone (Shane, 2026-09-28): ask for the Defense, as an immediate play
      // does; blank rolls open.
      const declared = await resolveTargetsForDefense(defenseKey);
      defense = declared.defense;
    }
    const required = Math.max(1, parseInt(box.querySelector("input[name='required']")?.value, 10) || pending.requiredSuccesses || 1);
    rollBtn.disabled = true;
    await resolvePendingCardPlay(message, { defense, targets, requiredSuccesses: required });
    await settle("resolved");
  };
  const cancelBtn = box.querySelector("[data-action='cancelPending']");
  if (cancelBtn) cancelBtn.onclick = async () => {
    if (!(await mayAct())) return;
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: pending.label }, classes: ["essence-dialog"],
      content: `<p>${game.i18n.localize("ESSENCE.Chat.CancelPendingConfirm")}</p>`, rejectClose: false
    });
    if (!ok) return;
    await settle("cancelled");
    const actor = pending.actorUuid ? await fromUuid(pending.actorUuid) : null;
    await ChatMessage.create({ speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(), content: `<p>${game.i18n.format("ESSENCE.Chat.PendingCancelledMsg", { name: actor?.name ?? "", card: pending.label })}</p>` });
  };
}

/**
 * Adaptability's Non-Combat reroll (Doc 2026-09-28, Core Rules "Improvisation"): the button on a
 * character's Non-Combat chat card spends one of this Adventure's uses and rerolls every die of
 * that check with the same Difficulty and requirement. "You must use the new result": the original
 * card is marked rerolled and its button removed. The reroll's own card offers no further reroll.
 */
function wireRerollButton(message, html, data) {
  const offer = data?.rerollOffer;
  const btn = html.querySelector("[data-action='adaptabilityReroll']");
  if (!offer || !btn) return;
  if (data.rerolled) { btn.disabled = true; btn.textContent = game.i18n.localize("ESSENCE.Chat.Rerolled"); return; }
  btn.onclick = async () => {
    const actor = offer.actorUuid ? await fromUuid(offer.actorUuid) : null;
    if (!actor) return;
    if (!(game.user.isGM || actor.isOwner)) return ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.PendingNotYours"));
    const state = actor.system.adaptabilityRerolls ?? { max: 0, used: 0, remaining: 0 };
    if (state.remaining <= 0) return ui.notifications.warn(game.i18n.format("ESSENCE.Notify.NoRerollsLeft", { name: actor.name }));
    await actor.update({ "system.playState.adaptabilityRerollsUsed": state.used + 1 });
    if (message.isOwner || game.user.isGM) await message.update({ "flags.essence-system.rerolled": true });
    await rollEssencePool({
      pool: offer.pool, freeDice: offer.freeDice, difficulty: offer.difficulty, requiredSuccesses: offer.requiredSuccesses,
      label: game.i18n.format("ESSENCE.Chat.RerollLabel", { label: offer.label }), actor, nonCombat: true,
      rerollOf: { messageId: message.id, remaining: state.remaining - 1, max: state.max }
    });
  };
}

/**
 * Keeps an `equipment` Item's transferred "Equipment Bonus" ActiveEffect in sync with its own
 * Fortitude/Resilience/Movement/Reach fields and its `slot` (see equipment-effects.mjs for why
 * this uses Foundry's native transfer instead of the sheet's usual hand-summed derived data).
 * `createItem` covers a brand-new equipment Item; `updateItem` re-syncs only when a field the
 * effect actually depends on changed, so editing something unrelated (a Toolkit's flavor text,
 * say) doesn't trigger a redundant effect rebuild on every keystroke-driven autosave.
 */
Hooks.on("createItem", (item) => syncEquipmentEffect(item));
Hooks.on("updateItem", (item, changes) => {
  const sys = changes.system;
  if (!sys) return;
  // chassisItemId/fittingItemId/isModular added alongside the modular-bonus sync below — swapping
  // which Chassis/Fitting is assembled (or flipping isModular) changes the summed bonus just as
  // much as editing the item's own flat fields does.
  const relevant = ["fortitude", "resilience", "movement", "reachBonus", "slot", "chassisItemId", "fittingItemId", "isModular"];
  if (relevant.some((key) => sys[key] !== undefined)) syncEquipmentEffect(item);
});

/**
 * A modular equipment Item's Fortitude/Resilience/Movement come from its assembled Chassis +
 * Fitting (equipment-features.mjs), not its own flat fields — see syncEquipmentEffect's own
 * isModular branch. Nothing re-triggers that sync when the CHASSIS or FITTING itself changes
 * (or is deleted) while already installed, so these two hooks find every equipment Item on the
 * same actor referencing the changed/removed Component and re-sync each one. A Component's own
 * `category`/`effect`/etc. changing doesn't affect the bonus sum, so only the three numeric fields
 * (and deletion) trigger this — same "only recompute when something the effect actually depends on
 * changed" discipline as the plain-item hook above.
 */
function resyncEquipmentReferencing(componentItem) {
  if (!["chassis", "fitting"].includes(componentItem.type) || !componentItem.actor) return;
  for (const equip of componentItem.actor.items) {
    if (equip.type !== "equipment") continue;
    if (equip.system.chassisItemId === componentItem.id || equip.system.fittingItemId === componentItem.id) {
      syncEquipmentEffect(equip);
    }
  }
}
Hooks.on("updateItem", (item, changes) => {
  const sys = changes.system;
  if (!sys) return;
  if (["fortitude", "resilience", "movement"].some((key) => sys[key] !== undefined)) resyncEquipmentReferencing(item);
});
Hooks.on("deleteItem", (item) => resyncEquipmentReferencing(item));

/**
 * Melee Weapon/Ranged Weapon/Armor/Shield/Magical Implement are always an assembled Chassis +
 * Fitting now (Source A's "no non-modular version of the five combat categories" — see
 * MODULAR_EQUIPMENT_CATEGORIES's doc comment in item-card.mjs) — force `isModular: true` into the
 * create/update data itself so it can't be unchecked on the sheet, rather than just defaulting it,
 * which would leave an already-unchecked item silently wrong. Runs pre-create/pre-update (not a
 * sheet-side guard) so it also catches a category changed via Bulk Import or a script, not just
 * the sheet's own dropdown.
 */
Hooks.on("preCreateItem", (item, data) => {
  if (item.type !== "equipment") return;
  const category = data.system?.category ?? "gear";
  if (MODULAR_EQUIPMENT_CATEGORIES.includes(category)) item.updateSource({ "system.isModular": true });
});
Hooks.on("preUpdateItem", (item, changes) => {
  if (item.type !== "equipment") return;
  const nextCategory = changes.system?.category ?? item.system.category;
  if (MODULAR_EQUIPMENT_CATEGORIES.includes(nextCategory)) foundry.utils.setProperty(changes, "system.isModular", true);
});

/**
 * Makes a card roll's chat-card Surge options actually clickable. The template renders each
 * option baked with whatever spentIndices existed at post-time (always empty), so every render
 * — including the first — has to reconcile the DOM against the message's *current* flags rather
 * than trust the static `content` HTML, since flags are the persisted source of truth and get
 * updated (not the stored content) each time someone spends or un-spends a Surge.
 */
Hooks.on("renderChatMessageHTML", (message, html) => {
  const data = message.flags?.["essence-system"];
  wirePendingCardButtons(message, html, data);
  wireRerollButton(message, html, data);
  // Apply and Card buttons on a card play (Shane, 2026-09-27): Apply opens the target's own Apply
  // Damage dialog through the sheet's registered action, so the engine, Wound Cards and status
  // handling are exactly what the sheet button gives; Card opens the played card's sheet.
  // An Apply button stays live after use (a Reaction can change the damage, Shane 2026-09-27) but
  // shows "Applied" once damage has gone through, so a GM can see which targets are done (0.18.12).
  // The mark is a message flag; a player who cannot edit the message still sees it on their click.
  const applied = new Set(data?.appliedTo ?? []);
  // "Apply to targeted tokens" (Shane, 2026-09-28): reads the clicker's targets when pressed, so a
  // GM can target one or several tokens and apply a card the player rolled without a target.
  const applyAll = html.querySelector("[data-action='applyToTargets']");
  if (applyAll) applyAll.onclick = async () => {
    const tokens = Array.from(game.user.targets).filter((t) => t.actor);
    if (!tokens.length) return ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.ApplyNeedsTarget"));
    for (const t of tokens) {
      const sheet = t.actor.sheet;
      await sheet.render(true);
      const handler = sheet.options.actions?.applyDamage;
      if (typeof handler === "function") await handler.call(sheet, new Event("click"), sheet.element);
    }
  };
  for (const btn of html.querySelectorAll(".rc-actions [data-action]")) {
    // Only the Apply and Card buttons belong to this loop; the reroll and pending-card buttons
    // share the .rc-actions row and are wired above (0.19.0).
    if (!["applyDamage", "openCard"].includes(btn.dataset.action)) continue;
    const markApplied = () => {
      btn.classList.add("applied");
      // A class, not the `hidden` attribute: Foundry strips that attribute from stored chat content.
      btn.querySelector(".rc-applied-mark")?.classList.remove("is-hidden");
    };
    if (btn.dataset.action === "applyDamage" && applied.has(btn.dataset.uuid)) markApplied();
    btn.onclick = async () => {
      const doc = await fromUuid(btn.dataset.uuid);
      if (!doc) return ui.notifications.warn(game.i18n.localize("ESSENCE.Notify.ChatTargetGone"));
      const sheet = doc.sheet;
      await sheet.render(true);
      if (btn.dataset.action === "applyDamage") {
        const handler = sheet.options.actions?.applyDamage;
        if (typeof handler !== "function") return;
        const done = await handler.call(sheet, new Event("click"), sheet.element);
        if (done !== true) return;
        markApplied();
        if (message.isOwner && !applied.has(btn.dataset.uuid)) {
          await message.update({ "flags.essence-system.appliedTo": [...applied, btn.dataset.uuid] });
        }
      }
    };
  }
  if (!data?.surgeOptions?.length) return;

  const spent = new Set(data.spentIndices ?? []);
  const cost = (i) => parseInt(data.surgeOptions[i]?.n, 10) || 1;
  const spentTotal = [...spent].reduce((sum, i) => sum + cost(i), 0);
  const remaining = data.surgesAvailable - spentTotal;

  const remainingEl = html.querySelector(".surges-remaining .remaining");
  if (remainingEl) remainingEl.textContent = remaining;

  for (const btn of html.querySelectorAll(".surge-option")) {
    // Foundry's own unlayered core CSS (a.button/button { height: var(--button-size) } and
    // .chat-message button { height: var(--input-height) }) wins over anything in our
    // @import ... layer(system) stylesheet for this property — even !important there loses,
    // since unlayered !important outranks layered !important per the Cascade Layers spec.
    // An inline !important is the one thing that reliably beats it, so size these here rather
    // than fight the layer in CSS; without this a multi-line Surge option's text overflows its
    // clamped 32px box onto the next chat element instead of the button growing to fit it.
    btn.style.setProperty("height", "auto", "important");
    btn.style.setProperty("min-height", "0", "important");

    const i = Number(btn.dataset.index);
    const isSpent = spent.has(i);
    btn.classList.toggle("spent", isSpent);
    btn.disabled = !isSpent && cost(i) > remaining;
    btn.onclick = async () => {
      const next = new Set(spent);
      if (isSpent) next.delete(i); else next.add(i);
      await message.update({ "flags.essence-system.spentIndices": Array.from(next) });
    };
  }
});
