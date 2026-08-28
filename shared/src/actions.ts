import type { Card } from "./cards.js";

export const ACTIONS = [
  "income",
  "foreign_aid",
  "coup",
  "tax",
  "assassinate",
  "steal",
  "exchange",
] as const;

export type ActionType = (typeof ACTIONS)[number];

export interface ActionRule {
  /** Character claimed to take this action, or null for general actions. */
  claim: Card | null;
  /** Coins paid up front, at declare time. Never refunded once paid. */
  cost: number;
  /** Whether the action names another player. */
  targeted: boolean;
  /** Characters that may be claimed to block it. Empty means unblockable. */
  blockedBy: readonly Card[];
}

export const ACTION_RULES: Readonly<Record<ActionType, ActionRule>> = {
  income: { claim: null, cost: 0, targeted: false, blockedBy: [] },
  foreign_aid: { claim: null, cost: 0, targeted: false, blockedBy: ["Duke"] },
  coup: { claim: null, cost: 7, targeted: true, blockedBy: [] },
  tax: { claim: "Duke", cost: 0, targeted: false, blockedBy: [] },
  assassinate: { claim: "Assassin", cost: 3, targeted: true, blockedBy: ["Contessa"] },
  steal: { claim: "Captain", cost: 0, targeted: true, blockedBy: ["Ambassador", "Captain"] },
  exchange: { claim: "Ambassador", cost: 0, targeted: false, blockedBy: [] },
};

/** A player holding this many coins or more must Coup; no other action is legal. */
export const FORCED_COUP_THRESHOLD = 10;

/** Cards drawn from the Court deck by an Ambassador exchange. */
export const EXCHANGE_DRAW = 2;

export const STARTING_COINS = 2;
export const STARTING_INFLUENCE = 2;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
