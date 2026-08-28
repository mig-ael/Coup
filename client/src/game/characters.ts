import { ACTION_RULES, characterAbilities, type Card } from "@coup/shared";
import { label } from "./prompt.js";

/**
 * One CSS class per character, matching the physical deck: Duke purple, Assassin
 * black, Captain blue, Ambassador green, Contessa red. Desaturated so five cards
 * side by side read as distinct without shouting.
 */
export const CARD_CLASS: Record<Card, string> = {
  Duke: "duke",
  Assassin: "assassin",
  Captain: "captain",
  Ambassador: "ambassador",
  Contessa: "contessa",
};

export interface CharacterText {
  action: string | null;
  counteraction: string | null;
}

const ACTION_TEXT: Partial<Record<string, string>> = {
  tax: "Take 3 coins from the treasury.",
  assassinate: "Pay 3 coins to make a player lose one influence.",
  steal: "Take 2 coins from another player.",
  exchange: "Draw 2 from the deck, then keep as many cards as you started with.",
};

/** The card's own rules, in words. The mapping itself comes from the shared rules table. */
export function characterText(card: Card): CharacterText {
  const { action, blocks } = characterAbilities(card);

  return {
    action: action ? `${label(action)} — ${ACTION_TEXT[action] ?? ""}`.trim() : null,
    counteraction:
      blocks.length === 0
        ? null
        : `Blocks ${blocks.map((a) => label(a)).join(" and ")}${
            blocks.some((a) => ACTION_RULES[a].targeted) ? " aimed at you" : ""
          }.`,
  };
}
