import { ACTIONS, ACTION_RULES, FORCED_COUP_THRESHOLD, type ActionType } from "@coup/shared";
import type { GameState, PlayerState } from "./types.js";

export interface LegalAction {
  action: ActionType;
  /** Present only for targeted actions; lists every player who may be named. */
  targets?: string[];
}

export function currentPlayerId(state: GameState): string | undefined {
  return state.turnOrder[state.currentTurnIndex];
}

export function livingPlayers(state: GameState): PlayerState[] {
  return state.players.filter((p) => !p.eliminated);
}

export function getPlayer(state: GameState, playerId: string): PlayerState | undefined {
  return state.players.find((p) => p.id === playerId);
}

/**
 * Who may be named by `action`, given who is acting. Steal is the one action with a
 * value-based restriction: a player holding no coins has nothing to take, so naming
 * them is not a legal move.
 */
export function validTargets(state: GameState, actorId: string, action: ActionType): string[] {
  if (!ACTION_RULES[action].targeted) return [];

  return livingPlayers(state)
    .filter((p) => p.id !== actorId)
    .filter((p) => action !== "steal" || p.coins > 0)
    .map((p) => p.id);
}

/** Every action the given player could declare right now, with their legal targets. */
export function legalActions(state: GameState, playerId: string): LegalAction[] {
  if (state.phase !== "awaiting_action") return [];
  if (currentPlayerId(state) !== playerId) return [];

  const actor = getPlayer(state, playerId);
  if (!actor || actor.eliminated) return [];

  const forcedCoup = actor.coins >= FORCED_COUP_THRESHOLD;

  const legal: LegalAction[] = [];
  for (const action of ACTIONS) {
    if (forcedCoup && action !== "coup") continue;

    const rule = ACTION_RULES[action];
    if (actor.coins < rule.cost) continue;

    if (!rule.targeted) {
      legal.push({ action });
      continue;
    }

    const targets = validTargets(state, playerId, action);
    if (targets.length > 0) legal.push({ action, targets });
  }

  return legal;
}
