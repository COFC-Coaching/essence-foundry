import EssenceAdversaryData from "./actor-adversary.mjs";

/**
 * People — humanoid-shaped adversaries built the same way a player character is (Species/
 * Heritage/Distinction Origin, full Attributes/Skills, full sheet). See actor-adversary.mjs for
 * the identity fields (Grade/Role/Elite Type/Tactics/Abilities) shared with the Monster Actor
 * type, and actor-monster.mjs for the creature-shaped counterpart to this class.
 */
export default class EssenceNpcData extends EssenceAdversaryData {}
