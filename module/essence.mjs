import EssenceCharacterData from "./data/actor-character.mjs";
import EssenceNpcData from "./data/actor-npc.mjs";
import { EssenceActionCardData, EssenceReactionCardData, EssenceConditionData, EssenceEquipmentData, EQUIPMENT_CATEGORY_LABELS } from "./data/item-card.mjs";
import { EssenceSpeciesData, EssenceHeritageData, EssenceDistinctionData } from "./data/item-origin.mjs";
import { EssenceChassisData, EssenceFittingData, EssenceAugmentData } from "./data/item-component.mjs";
import EssenceActorSheet from "./sheets/actor-sheet.mjs";
import EssenceNpcSheet from "./sheets/npc-sheet.mjs";
import {
  EssenceCardSheet, EssenceConditionSheet, EssenceEquipmentSheet,
  EssenceSpeciesSheet, EssenceHeritageSheet, EssenceDistinctionSheet,
  EssenceComponentSheet, EssenceAugmentSheet
} from "./sheets/item-sheet.mjs";
import EssenceCombat from "./documents/combat.mjs";
import EssenceActor from "./documents/actor.mjs";
import EssenceContentWizard, { canCreateContent } from "./apps/content-wizard.mjs";
import EssenceBulkImport from "./apps/bulk-import.mjs";
import { capitalize, fitTitleSize, domainResource } from "./utils.mjs";
import { syncEquipmentEffect } from "./data/equipment-effects.mjs";
import { ROLE_BUDGETS } from "./data/monster-budgets.mjs";
import EssenceRoleBudgetsSettings from "./apps/role-budgets-settings.mjs";

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

  CONFIG.Actor.dataModels.character = EssenceCharacterData;
  CONFIG.Actor.dataModels.npc = EssenceNpcData;
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

  // Homebrew Role (Minion/Standard/Elite/Nemesis) budget table the Monster Creator auto-fills
  // stat blocks from — see monster-budgets.mjs's own doc comment on why this is meant to be
  // GM-tunable. `config: false` since this is an Object setting with no sensible single-control
  // UI; `restricted: true` on the menu means only a GM (Foundry's own permission check, not a
  // custom one) can even open the settings app that edits it.
  game.settings.register("essence-system", "roleBudgets", {
    scope: "world", config: false, type: Object, default: ROLE_BUDGETS
  });
  game.settings.registerMenu("essence-system", "roleBudgetsMenu", {
    name: "ESSENCE.Settings.RoleBudgets.Title",
    label: "ESSENCE.Settings.RoleBudgets.MenuLabel",
    hint: "ESSENCE.Settings.RoleBudgets.Hint",
    icon: "fa-solid fa-scale-balanced",
    type: EssenceRoleBudgetsSettings,
    restricted: true
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
    if (actor?.type !== "character" && actor?.type !== "npc") continue;
    const update = {
      "system.playState.combatStarted": false,
      "system.playState.combatTurn": "notStarted"
    };
    // Everything else that happened in Combat persists (spent resources, Wounds, equipment
    // damage — part-iv-combat.md § What Persists After Combat) except these two Specialties,
    // which explicitly end when the Encounter ends.
    if (actor.system.specialties?.threads?.length) update["system.specialties.threads"] = [];
    if (actor.system.specialties?.authority?.length) update["system.specialties.authority"] = [];
    await actor.update(update);
  }
});

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
  const relevant = ["fortitude", "resilience", "movement", "reachBonus", "slot"];
  if (relevant.some((key) => sys[key] !== undefined)) syncEquipmentEffect(item);
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
