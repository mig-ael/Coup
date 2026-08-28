import type { LogEntry } from "@coup/shared";
import { label } from "./game/prompt.js";

/** Error codes the server may reject a command with, in words a player can act on. */
const ERRORS: Record<string, string> = {
  room_not_found: "No game with that code.",
  game_already_started: "That game has already started.",
  room_full: "That game is full.",
  invalid_name: "Enter a display name.",
  already_joined: "You are already in this game.",
  not_host: "Only the host can do that.",
  not_enough_players: "You need at least two players.",
  not_your_turn: "It is not your turn.",
  illegal_action: "You cannot take that action right now.",
  invalid_target: "That is not a valid target.",
  invalid_block: "That character cannot block this action.",
  invalid_selection: "Pick the right number of cards.",
  invalid_card: "That card is not in your hand.",
  invalid_timer: "That timer length is not available.",
  not_awaiting_you: "The table is not waiting on you.",
  wrong_phase: "That is not available right now.",
  player_connected: "That player is still connected.",
  already_eliminated: "That player is already out.",
  could_not_connect: "Could not reach the server.",
};

export function errorText(code: string): string {
  return ERRORS[code] ?? "Something went wrong.";
}

/** One line of public history. Never mentions a card that is not face up. */
export function logText(entry: LogEntry, nameOf: (id: string | null) => string): string {
  switch (entry.type) {
    case "game_started":
      return `Game started. ${nameOf(entry.turnOrder[0] ?? null)} goes first.`;
    case "action":
      return entry.targetId
        ? `${nameOf(entry.actorId)} → ${label(entry.action)} on ${nameOf(entry.targetId)}`
        : `${nameOf(entry.actorId)} → ${label(entry.action)}`;
    case "block":
      return `${nameOf(entry.blockerId)} claims ${entry.claim} to block`;
    case "challenge":
      return entry.proved
        ? `${nameOf(entry.challengerId)} challenged — ${nameOf(entry.claimantId)} had ${entry.claim}`
        : `${nameOf(entry.challengerId)} challenged — ${nameOf(entry.claimantId)} was bluffing`;
    case "influence_lost":
      return `${nameOf(entry.playerId)} lost ${entry.card}`;
    case "eliminated":
      return `${nameOf(entry.playerId)} is out`;
    case "forfeited":
      return `${nameOf(entry.playerId)} forfeited`;
    case "action_resolved":
      return `${label(entry.action)} succeeded`;
    case "action_failed":
      return entry.cause === "block"
        ? `${label(entry.action)} was blocked`
        : `${label(entry.action)} failed`;
    case "game_over":
      return `${nameOf(entry.winnerId)} wins`;
  }
}
