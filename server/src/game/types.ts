import type { ActionType, Card } from "@coup/shared";

export type Phase =
  | "lobby"
  | "awaiting_action"
  | "awaiting_action_challenge"
  | "awaiting_block"
  | "awaiting_block_challenge"
  | "awaiting_influence_loss"
  | "awaiting_exchange"
  | "game_over";

/** Why a player owes an influence. Carried into the public log. */
export type LossReason = "coup" | "assassinate" | "failed_challenge";

export interface PendingLoss {
  playerId: string;
  reason: LossReason;
}

/**
 * The action currently working its way through the response windows. Only one exists
 * at a time: a challenge always targets the most recent claim, and resolves before
 * another claim can be made.
 */
export interface PendingAction {
  actorId: string;
  action: ActionType;
  targetId: string | null;
  /** The character the actor claimed, or null for a general action. */
  claim: Card | null;
  block: { playerId: string; claim: Card } | null;
  /** Players who have not yet responded to the open window. */
  awaiting: string[];
}

/** An Ambassador exchange awaiting the actor's choice of which cards to keep. */
export interface PendingExchange {
  playerId: string;
  /** How many of the enlarged hand the player must keep — what they held before drawing. */
  keepCount: number;
}

/** Where to pick up once every owed influence has been paid. */
export type ResumeStep = "open_block" | "resolve_action" | "end_turn";

export interface PlayerState {
  id: string;
  name: string;
  coins: number;
  /** PRIVATE. Never projected into shared state — see the room's projection layer. */
  hand: Card[];
  /** PUBLIC. Influence lost permanently, face up for the rest of the game. */
  revealed: Card[];
  eliminated: boolean;
  connected: boolean;
}

export interface GameState {
  phase: Phase;
  hostId: string | null;
  players: PlayerState[];
  /** Player ids in play order, randomised at game start. */
  turnOrder: string[];
  currentTurnIndex: number;
  /** PRIVATE. The Court deck. */
  deck: Card[];
  /**
   * Influence owed, oldest first. A single resolution step can owe two losses from
   * the same player — losing a challenge against a real Assassin costs one influence
   * for the challenge and another to the assassination that then proceeds.
   */
  pendingLosses: PendingLoss[];
  pending: PendingAction | null;
  exchange: PendingExchange | null;
  /**
   * Set when a resolution is interrupted to collect influence. Losing a challenge can
   * require a card choice mid-action, so the engine parks what to do next here rather
   * than resolving on a stack it cannot serialise.
   */
  resume: ResumeStep | null;
  winnerId: string | null;
  /** Current PRNG position, so the engine stays deterministic across commands. */
  rngSeed: number;
}

export type Command =
  | { type: "ADD_PLAYER"; playerId: string; name: string }
  | { type: "REMOVE_PLAYER"; playerId: string }
  | { type: "START_GAME"; playerId: string; seed: number }
  | { type: "DECLARE_ACTION"; playerId: string; action: ActionType; targetId?: string }
  | { type: "LOSE_INFLUENCE"; playerId: string; cardIndex: number }
  | { type: "CHALLENGE"; playerId: string }
  | { type: "BLOCK"; playerId: string; claim: Card }
  | { type: "PASS"; playerId: string }
  | { type: "TIMEOUT" }
  | { type: "EXCHANGE_KEEP"; playerId: string; keepIndices: number[] };

export type ApplyResult =
  | { ok: true; state: GameState }
  | { ok: false; error: string };
