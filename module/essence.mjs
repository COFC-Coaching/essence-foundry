import EssenceCharacterData from "./data/actor-character.mjs";
import EssenceNpcData from "./data/actor-npc.mjs";
import { EssenceActionCardData, EssenceReactionCardData, EssenceConditionData, EssenceEquipmentData } from "./data/item-card.mjs";
import { EssenceSpeciesData, EssenceHeritageData, EssenceDistinctionData } from "./data/item-origin.mjs";
import EssenceActorSheet from "./sheets/actor-sheet.mjs";
import EssenceNpcSheet from "./sheets/npc-sheet.mjs";
import {
  EssenceCardSheet, EssenceConditionSheet, EssenceEquipmentSheet,
  EssenceSpeciesSheet, EssenceHeritageSheet, EssenceDistinctionSheet
} from "./sheets/item-sheet.mjs";
import EssenceCombat from "./documents/combat.mjs";
import EssenceActor from "./documents/actor.mjs";
import EssenceContentWizard, { canCreateContent } from "./apps/content-wizard.mjs";

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

  Handlebars.registerHelper("addOne", (n) => Number(n) + 1);
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
