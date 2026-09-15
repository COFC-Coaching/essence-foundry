import EssenceNpcSheet from "./npc-sheet.mjs";
import { MONSTER_TYPES_LOW, MONSTER_TYPES_HIGH } from "../data/monster-types.mjs";

/**
 * The Monster Actor type's sheet — everything EssenceNpcSheet already does (Attributes, Skills,
 * Wounds, Combat Cards, Equipment, Tactics/Leader/Solo Abilities, the Monster Wizard launcher)
 * reused verbatim by extending it, since none of that logic is Person-specific. Only the template
 * differs: monster-sheet.hbs swaps the Species/Heritage Origin section for a Monster Type badge
 * (kept minimal, just a Distinction pick-list, so gated Combat Skills like Magecraft/Ritualism
 * stay reachable for a spellcasting creature) and drops the Influence/full-Reach sections a
 * creature essentially never uses — see the "People vs. Monsters" plan for the reasoning. A
 * Monster's `system.monsterType` needs the same Grade-gated low/high band lists as monster-wizard.mjs's
 * Concept step; done here instead of duplicated per-render logic in the wizard alone so the sheet
 * and wizard read the exact same lists.
 */
export default class EssenceMonsterSheet extends EssenceNpcSheet {
  // Foundry's ApplicationV2 automatically merges static DEFAULT_OPTIONS up the whole prototype
  // chain (see EssenceNpcSheet's own DEFAULT_OPTIONS, which doesn't spread ActorSheetV2's either)
  // — only the classes list actually needs to change here; every action/dragDrop entry from
  // EssenceNpcSheet is inherited automatically.
  static DEFAULT_OPTIONS = {
    classes: ["essence", "actor", "monster"],
    actions: {
      setMonsterType: EssenceMonsterSheet.#onSetMonsterType
    }
  };

  static PARTS = {
    body: { template: "systems/essence-system/templates/actor/monster-sheet.hbs" }
  };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.monsterTypesLow = MONSTER_TYPES_LOW;
    context.monsterTypesHigh = MONSTER_TYPES_HIGH;
    return context;
  }

  /** Monster Type is picked the same "button pick-list" way Species is on the People sheet —
   *  see monster-wizard.mjs's identical #onSetMonsterType for why the wizard mirrors this. */
  static async #onSetMonsterType(event, target) {
    await this.actor.update({ "system.monsterType": target.dataset.type });
  }
}
