import { ACTION_RULES, legalActions, type Card, type LegalAction } from "@coup/shared";
import type { Snapshot } from "../net/session.js";

export type Prompt =
  | { kind: "lobby" }
  | { kind: "waiting"; message: string }
  | { kind: "choose_action"; actions: LegalAction[] }
  | { kind: "respond"; canChallenge: boolean; blocks: Card[]; message: string }
  | { kind: "lose_influence" }
  | { kind: "exchange"; keepCount: number }
  | { kind: "game_over"; winnerId: string | null };

/**
 * Turns the shared view into the single question this client is being asked.
 *
 * Everything here is derived from public state, never from a server instruction, so
 * a reconnecting player gets the right prompt immediately from the state they sync —
 * there is no message they can miss while disconnected.
 */
export function derivePrompt(view: Snapshot): Prompt {
  const me = view.playerId;
  const nameOf = (id: string | null) =>
    view.players.find((p) => p.id === id)?.name ?? "another player";

  switch (view.phase) {
    case "lobby":
      return { kind: "lobby" };

    case "game_over":
      return { kind: "game_over", winnerId: view.winnerId };

    case "awaiting_action": {
      const actorId = view.turnOrder[view.currentTurnIndex] ?? null;
      if (actorId !== me) return { kind: "waiting", message: `Waiting for ${nameOf(actorId)}` };
      return { kind: "choose_action", actions: legalActions(view, me) };
    }

    case "awaiting_action_challenge":
    case "awaiting_block_challenge":
    case "awaiting_block": {
      const pending = view.pending;
      if (!pending?.awaiting.includes(me)) {
        return { kind: "waiting", message: "Waiting for the other players" };
      }

      const blocking = view.phase === "awaiting_block";
      return {
        kind: "respond",
        canChallenge: !blocking,
        blocks: blocking ? [...ACTION_RULES[pending.action].blockedBy] : [],
        message: describeClaim(view, nameOf),
      };
    }

    case "awaiting_influence_loss": {
      if (view.awaitingLossFrom === me) return { kind: "lose_influence" };
      return { kind: "waiting", message: `Waiting for ${nameOf(view.awaitingLossFrom)} to choose` };
    }

    case "awaiting_exchange": {
      if (view.exchangePlayerId !== me) {
        return { kind: "waiting", message: `${nameOf(view.exchangePlayerId)} is exchanging` };
      }
      const keepCount = view.players.find((p) => p.id === me)?.influenceCount ?? 0;
      return { kind: "exchange", keepCount };
    }
  }
}

/** A plain sentence for the claim currently on the table. */
export function describeClaim(view: Snapshot, nameOf: (id: string | null) => string): string {
  const pending = view.pending;
  if (!pending) return "";

  if (pending.blockerId) {
    return `${nameOf(pending.blockerId)} claims ${pending.blockClaim} to block`;
  }

  const target = pending.targetId ? ` on ${nameOf(pending.targetId)}` : "";
  if (pending.claim) {
    return `${nameOf(pending.actorId)} claims ${pending.claim} to ${label(pending.action)}${target}`;
  }
  return `${nameOf(pending.actorId)} takes ${label(pending.action)}${target}`;
}

const LABELS: Record<string, string> = {
  income: "Income",
  foreign_aid: "Foreign Aid",
  coup: "Coup",
  tax: "Tax",
  assassinate: "Assassinate",
  steal: "Steal",
  exchange: "Exchange",
};

export function label(action: string): string {
  return LABELS[action] ?? action;
}
