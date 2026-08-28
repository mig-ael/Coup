import type { ActionType, TimerSetting } from "./actions.js";
import type { Card } from "./cards.js";

/** The Colyseus room type both sides address. */
export const ROOM_NAME = "coup";

export const MAX_NAME_LENGTH = 20;

/** Seconds a disconnected player's seat is held before the host may forfeit them. */
export const RECONNECT_GRACE_SECONDS = 60;

export interface JoinOptions {
  name: string;
}

/** Client → server. The name is the Colyseus message type; the value is its payload. */
export interface ClientMessages {
  set_config: { timerSeconds: TimerSetting };
  start_game: Record<string, never>;
  action: { action: ActionType; targetId?: string };
  block: { claim: Card };
  challenge: Record<string, never>;
  pass: Record<string, never>;
  lose_influence: { cardIndex: number };
  exchange_keep: { keepIndices: number[] };
  forfeit: { playerId: string };
  restart: Record<string, never>;
}

export type ClientMessageType = keyof ClientMessages;

/**
 * Server → client. Public state arrives as Colyseus state sync instead; these are
 * only the things that cannot: one player's own cards, and rejected commands.
 */
export interface ServerMessages {
  /** Sent to a single client. Never broadcast. */
  hand: { cards: Card[] };
  error: { code: string };
}

export type ServerMessageType = keyof ServerMessages;
