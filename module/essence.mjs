import EssenceCharacterData from "./data/actor-character.mjs";
import { EssenceActionCardData, EssenceReactionCardData, EssenceConditionData, EssenceEquipmentData } from "./data/item-card.mjs";
import EssenceActorSheet from "./sheets/actor-sheet.mjs";
import { EssenceCardSheet, EssenceConditionSheet, EssenceEquipmentSheet } from "./sheets/item-sheet.mjs";

Hooks.once("init", () => {
  console.log("Essence System | Initializing");

  CONFIG.Actor.dataModels.character = EssenceCharacterData;
  CONFIG.Item.dataModels["action-card"] = EssenceActionCardData;
  CONFIG.Item.dataModels["reaction-card"] = EssenceReactionCardData;
  CONFIG.Item.dataModels.condition = EssenceConditionData;
  CONFIG.Item.dataModels.equipment = EssenceEquipmentData;

  const { Actors, Items } = foundry.documents.collections;
  Actors.registerSheet("essence-system", EssenceActorSheet, { types: ["character"], makeDefault: true });

  Items.registerSheet("essence-system", EssenceCardSheet, { types: ["action-card", "reaction-card"], makeDefault: true });
  Items.registerSheet("essence-system", EssenceConditionSheet, { types: ["condition"], makeDefault: true });
  Items.registerSheet("essence-system", EssenceEquipmentSheet, { types: ["equipment"], makeDefault: true });
});
