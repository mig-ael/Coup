import { ACTIONS, ACTION_RULES, FORCED_COUP_THRESHOLD, type ActionType } from "./actions.js";
import type { Phase } from "./state.js";

export interface LegalAction {
  action: ActionType;
  /** Present only for targeted actions; lists every player who may be named. */
  targets?: string[];
}

/**
 * The minimum needed to decide what is legal. Both the server's full game state and
 * the client's public view satisfy it, so the buttons a player sees are computed by
 * the same code that validates what they click. Legality never depends on hidden
 * cards — only on coins, elimination, and whose turn it is.
 */
export interface LegalActionsInput {
  phase: Phase;
  turnOrder: readonly string[];
  currentTurnIndex: number;
  players: readonly { id: string; coins: number; eliminated: boolean }[];
}

/**
 * Who may be named by `action`. Steal is the one action with a value-based
 * restriction: a player holding no coins has nothing to take, so naming them is not
 * a legal move.
 */
export function validTargets(
  state: LegalActionsInput,
  actorId: string,
  action: ActionType,
): string[] {
  if (!ACTION_RULES[action].targeted) return [];

  return state.players
    .filter((p) => !p.eliminated)
    .filter((p) => p.id !== actorId)
    .filter((p) => action !== "steal" || p.coins > 0)
    .map((p) => p.id);
}

/** Every action the given player could declare right now, with their legal targets. */
export function legalActions(state: LegalActionsInput, playerId: string): LegalAction[] {
  if (state.phase !== "awaiting_action") return [];
  if (state.turnOrder[state.currentTurnIndex] !== playerId) return [];

  const actor = state.players.find((p) => p.id === playerId);
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
