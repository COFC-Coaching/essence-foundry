import EssenceAdversaryData from "./actor-adversary.mjs";
import { MONSTER_TYPES } from "./monster-types.mjs";

const { fields } = foundry.data;

/**
 * Monsters — creature-shaped adversaries (beasts, spirits, elementals, dragons, ...) that share
 * every identity/budget concept a Person (EssenceNpcData) has, per actor-adversary.mjs, but swap
 * Species/Heritage/Distinction Origin for a single Monster Type tag (see monster-types.mjs) and
 * get their own compact sheet (module/sheets/monster-sheet.mjs) instead of the full Person sheet.
 *
 * Nothing here validates a type against the current Grade/Tier — that gating is presentational
 * only (the sheet/wizard only show the Tier 3-5 band once Grade is Elite), matching how this
 * system treats Tier everywhere else: guidance, not a hard rule.
 */
export default class EssenceMonsterData extends EssenceAdversaryData {
  static defineSchema() {
    return {
      ...super.defineSchema(),
      monsterType: new fields.StringField({ initial: "", blank: true, choices: ["", ...MONSTER_TYPES] })
    };
  }
}
