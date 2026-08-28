import type { GameState, PlayerState } from "./types.js";

export { legalActions, validTargets, type LegalAction } from "@coup/shared";

export function currentPlayerId(state: GameState): string | undefined {
  return state.turnOrder[state.currentTurnIndex];
}

export function livingPlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.eliminated);
}

export function getPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}
