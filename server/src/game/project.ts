import type { Card, PublicPendingView, PublicView } from "@coup/shared";
import type { GameState, PlayerState } from "./types.js";

export interface ProjectionOptions {
  /** Epoch ms the open response window closes; the room owns the clock, not the engine. */
  deadline?: number | null;
}

/**
 * Reduces full game state to the subset every client may see.
 *
 * This is the privacy boundary. Hands and the court deck are the engine's alone;
 * they are collapsed here to counts and never reconstructed downstream, so no
 * amount of client-side inspection can recover them. Anything added to `PublicView`
 * is, by definition, public to every player at the table.
 */
export function toPublicView(state: GameState, opts: ProjectionOptions = {}): PublicView {
  return {
    phase: state.phase,
    hostId: state.hostId,
    players: state.players.map((player) => ({
      id: player.id,
      name: player.name,
      coins: player.coins,
      influenceCount: influenceOf(state, player),
      revealed: [...player.revealed],
      eliminated: player.eliminated,
      connected: player.connected,
    })),
    turnOrder: [...state.turnOrder],
    currentTurnIndex: state.currentTurnIndex,
    pending: projectPending(state),
    awaitingLossFrom:
      state.phase === "awaiting_influence_loss" ? (state.pendingLosses[0]?.playerId ?? null) : null,
    exchangePlayerId: state.exchange?.playerId ?? null,
    deckCount: state.deck.length,
    winnerId: state.winnerId,
    timerSeconds: state.config.timerSeconds,
    deadline: opts.deadline ?? null,
    log: state.log.map((entry) => ({ ...entry })),
  };
}

/**
 * Mid-exchange the drawn cards sit in the actor's hand, which would otherwise show
 * opponents an influence count of four. Report what they will hold once they choose.
 */
function influenceOf(state: GameState, player: PlayerState): number {
  if (state.exchange?.playerId === player.id) return state.exchange.keepCount;
  return player.hand.length;
}

function projectPending(state: GameState): PublicPendingView | null {
  const pending = state.pending;
  if (!pending) return null;

  return {
    actorId: pending.actorId,
    action: pending.action,
    targetId: pending.targetId,
    claim: pending.claim,
    blockerId: pending.block?.playerId ?? null,
    blockClaim: pending.block?.claim ?? null,
    awaiting: [...pending.awaiting],
  };
}

/** The cards belonging to one player, for delivery to that player's connection alone. */
export function privateHand(state: GameState, playerId: string): Card[] {
  const player = state.players.find((p) => p.id === playerId);
  return player ? [...player.hand] : [];
}

/**
 * A stable identity for the response window currently open, or null if none is.
 *
 * The room uses this to decide when its countdown belongs to a new window. One
 * command can close a window and open the next one — passing an action challenge
 * opens the block window immediately — so "is a window open?" is not enough to tell
 * them apart, and the next window would otherwise inherit the previous one's clock.
 * Passing does not change the identity; moving between windows does.
 */
export function openWindowKey(state: GameState): string | null {
  const pending = state.pending;
  if (!pending || pending.awaiting.length === 0) return null;

  // Adjacent windows always differ by phase or by who blocked, and a closed window
  // resets the key to null in between, so this need not encode the turn number.
  return [
    state.phase,
    state.currentTurnIndex,
    pending.actorId,
    pending.action,
    pending.block?.playerId ?? "",
  ].join("|");
}
