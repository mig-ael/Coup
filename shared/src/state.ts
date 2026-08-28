import type { ActionType, TimerSetting } from "./actions.js";
import type { Card } from "./cards.js";

export type Phase =
  | "lobby"
  | "awaiting_action"
  | "awaiting_action_challenge"
  | "awaiting_block"
  | "awaiting_block_challenge"
  | "awaiting_influence_loss"
  | "awaiting_exchange"
  | "game_over";

export type LossReason = "coup" | "assassinate" | "failed_challenge" | "forfeit";

/**
 * The public history of the game. Every entry is safe to broadcast to every client:
 * a card only ever appears here once it is face up for everyone.
 */
export type LogEntry =
  | { type: "game_started"; turnOrder: string[] }
  | { type: "action"; actorId: string; action: ActionType; targetId: string | null }
  | { type: "block"; blockerId: string; claim: Card }
  | { type: "challenge"; challengerId: string; claimantId: string; claim: Card; proved: boolean }
  | { type: "influence_lost"; playerId: string; card: Card; reason: LossReason }
  | { type: "eliminated"; playerId: string }
  | { type: "forfeited"; playerId: string }
  | { type: "action_resolved"; actorId: string; action: ActionType }
  | { type: "action_failed"; actorId: string; action: ActionType; cause: "challenge" | "block" }
  | { type: "game_over"; winnerId: string | null };

export interface PublicPlayerView {
  id: string;
  name: string;
  coins: number;
  /** How many cards this player still holds face down. Never which ones. */
  influenceCount: number;
  revealed: Card[];
  eliminated: boolean;
  connected: boolean;
}

export interface PublicPendingView {
  actorId: string;
  action: ActionType;
  targetId: string | null;
  claim: Card | null;
  blockerId: string | null;
  blockClaim: Card | null;
  /** Players the game is still waiting on to block, challenge, or pass. */
  awaiting: string[];
}

/**
 * Everything every client is allowed to see. This is the ONLY shape that reaches
 * shared state — a player's own cards travel separately, addressed to them alone.
 */
export interface PublicView {
  phase: Phase;
  hostId: string | null;
  players: PublicPlayerView[];
  turnOrder: string[];
  currentTurnIndex: number;
  pending: PublicPendingView | null;
  /** Whose choice of card the game is waiting on, if any. */
  awaitingLossFrom: string | null;
  /** Who is mid-exchange, if anyone. */
  exchangePlayerId: string | null;
  deckCount: number;
  winnerId: string | null;
  timerSeconds: TimerSetting;
  /** Epoch ms the open window closes, or null when no timer is configured. */
  deadline: number | null;
  log: LogEntry[];
}
