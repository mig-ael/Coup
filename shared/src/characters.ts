import { ACTIONS, ACTION_RULES, type ActionType } from "./actions.js";
import type { Card } from "./cards.js";

export interface CharacterAbilities {
  /** The action this character lets you claim, or null if it only ever blocks. */
  action: ActionType | null;
  /** The actions this character can be claimed to block. */
  blocks: ActionType[];
}

/**
 * What a character does, derived from the rules table rather than restated.
 *
 * The UI needs this to explain each card, and a second hand-written copy would drift
 * the moment a rule changed. Reading it back out of `ACTION_RULES` means the
 * explanation a player sees cannot disagree with what the server enforces.
 */
export function characterAbilities(card: Card): CharacterAbilities {
  return {
    action: ACTIONS.find((a) => ACTION_RULES[a].claim === card) ?? null,
    blocks: ACTIONS.filter((a) => ACTION_RULES[a].blockedBy.includes(card)),
  };
}
