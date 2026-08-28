/** The five characters. Three copies of each make up the 15-card Court deck. */
export const CARDS = ["Duke", "Assassin", "Captain", "Ambassador", "Contessa"] as const;

export type Card = (typeof CARDS)[number];

export const COPIES_PER_CARD = 3;
