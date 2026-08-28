import {
  ACTION_RULES,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_COINS,
  STARTING_INFLUENCE,
  EXCHANGE_DRAW,
  TIMER_OPTIONS,
  type ActionType,
  type Card,
  type TimerSetting,
} from "@coup/shared";
import { createDeck, createRng, shuffle } from "./deck.js";
import { currentPlayerId, getPlayer, legalActions, livingPlayers } from "./rules.js";
import type {
  ApplyResult,
  Command,
  GameState,
  LossReason,
  PendingAction,
  Phase,
  PlayerState,
} from "./types.js";

export function createGame(): GameState {
  return {
    config: { timerSeconds: null },
    phase: "lobby",
    hostId: null,
    players: [],
    turnOrder: [],
    currentTurnIndex: 0,
    deck: [],
    pendingLosses: [],
    pending: null,
    exchange: null,
    resume: null,
    winnerId: null,
    log: [],
    rngSeed: 0,
  };
}

const fail = (error: string): ApplyResult => ({ ok: false, error });

/**
 * The single entry point into the rules engine. Pure: never mutates `state`, and
 * every rejection is a value rather than a thrown error, so the room layer can
 * report it back to the offending client without unwinding the game.
 */
export function apply(state: GameState, cmd: Command): ApplyResult {
  const next = structuredClone(state);

  switch (cmd.type) {
    case "ADD_PLAYER":
      return addPlayer(next, cmd.playerId, cmd.name);
    case "REMOVE_PLAYER":
      return removePlayer(next, cmd.playerId);
    case "START_GAME":
      return startGame(next, cmd.playerId, cmd.seed);
    case "DECLARE_ACTION":
      return declareAction(next, cmd.playerId, cmd.action, cmd.targetId);
    case "LOSE_INFLUENCE":
      return loseInfluence(next, cmd.playerId, cmd.cardIndex);
    case "CHALLENGE":
      return challenge(next, cmd.playerId);
    case "BLOCK":
      return block(next, cmd.playerId, cmd.claim);
    case "PASS":
      return pass(next, cmd.playerId);
    case "TIMEOUT":
      return timeout(next);
    case "EXCHANGE_KEEP":
      return exchangeKeep(next, cmd.playerId, cmd.keepIndices);
    case "SET_CONNECTED":
      return setConnected(next, cmd.playerId, cmd.connected);
    case "SET_CONFIG":
      return setConfig(next, cmd.playerId, cmd.timerSeconds);
    case "FORFEIT":
      return forfeit(next, cmd.playerId, cmd.byId);
    case "RESTART":
      return restart(next, cmd.playerId);
  }
}

// ---------------------------------------------------------------- lobby

function addPlayer(state: GameState, playerId: string, name: string): ApplyResult {
  if (state.phase !== "lobby") return fail("wrong_phase");
  if (getPlayer(state, playerId)) return fail("already_joined");
  if (state.players.length >= MAX_PLAYERS) return fail("room_full");

  state.players.push({
    id: playerId,
    name,
    coins: 0,
    hand: [],
    revealed: [],
    eliminated: false,
    connected: true,
  });
  state.hostId ??= playerId;

  return { ok: true, state };
}

function removePlayer(state: GameState, playerId: string): ApplyResult {
  // Mid-game a departure is a disconnect, not a removal: the seat and its cards are
  // held so the player can rejoin, and turn order stays intact.
  if (state.phase !== "lobby") return fail("wrong_phase");
  if (!getPlayer(state, playerId)) return fail("unknown_player");

  state.players = state.players.filter((p) => p.id !== playerId);
  if (state.hostId === playerId) {
    state.hostId = state.players[0]?.id ?? null;
  }

  return { ok: true, state };
}

function setConfig(
  state: GameState,
  playerId: string,
  timerSeconds: TimerSetting,
): ApplyResult {
  if (state.phase !== "lobby") return fail("wrong_phase");
  if (!getPlayer(state, playerId)) return fail("unknown_player");
  if (state.hostId !== playerId) return fail("not_host");
  if (!TIMER_OPTIONS.includes(timerSeconds)) return fail("invalid_timer");

  state.config.timerSeconds = timerSeconds;

  return { ok: true, state };
}

function restart(state: GameState, playerId: string): ApplyResult {
  if (state.phase !== "game_over") return fail("wrong_phase");
  if (!getPlayer(state, playerId)) return fail("unknown_player");
  if (state.hostId !== playerId) return fail("not_host");

  for (const player of state.players) {
    player.coins = 0;
    player.hand = [];
    player.revealed = [];
    player.eliminated = false;
  }

  state.phase = "lobby";
  state.turnOrder = [];
  state.currentTurnIndex = 0;
  state.deck = [];
  state.pendingLosses = [];
  state.pending = null;
  state.exchange = null;
  state.resume = null;
  state.winnerId = null;
  state.log = [];

  return { ok: true, state };
}

function startGame(state: GameState, playerId: string, seed: number): ApplyResult {
  if (!getPlayer(state, playerId)) return fail("unknown_player");
  if (state.phase !== "lobby") return fail("wrong_phase");
  if (state.hostId !== playerId) return fail("not_host");
  if (state.players.length < MIN_PLAYERS) return fail("not_enough_players");

  const rng = createRng(seed);
  const deck = shuffle(createDeck(), rng);

  for (const player of state.players) {
    player.hand = deck.splice(0, STARTING_INFLUENCE);
    player.coins = STARTING_COINS;
  }

  state.deck = deck;
  state.turnOrder = shuffle(
    state.players.map((p) => p.id),
    rng,
  );
  state.currentTurnIndex = 0;
  state.rngSeed = rng.seed;
  state.phase = "awaiting_action";
  state.log.push({ type: "game_started", turnOrder: [...state.turnOrder] });

  return { ok: true, state };
}

// ---------------------------------------------------------------- turn loop

function declareAction(
  state: GameState,
  playerId: string,
  action: ActionType,
  targetId: string | undefined,
): ApplyResult {
  if (state.phase !== "awaiting_action") return fail("wrong_phase");
  if (!getPlayer(state, playerId)) return fail("unknown_player");
  if (currentPlayerId(state) !== playerId) return fail("not_your_turn");

  const legal = legalActions(state, playerId).find((a) => a.action === action);
  if (!legal) return fail("illegal_action");

  if (ACTION_RULES[action].targeted) {
    if (targetId === undefined || !legal.targets?.includes(targetId)) {
      return fail("invalid_target");
    }
  }

  const rule = ACTION_RULES[action];
  const actor = getPlayer(state, playerId)!;
  actor.coins -= rule.cost;

  state.log.push({ type: "action", actorId: playerId, action, targetId: targetId ?? null });

  state.pending = {
    actorId: playerId,
    action,
    targetId: targetId ?? null,
    claim: rule.claim,
    block: null,
    awaiting: [],
  };

  // A character action must survive a challenge before anyone may block it.
  if (rule.claim !== null) {
    openWindow(state, "awaiting_action_challenge", respondersExcept(state, playerId));
  } else {
    openBlockWindow(state);
  }

  return { ok: true, state };
}

// ------------------------------------------------- connection & forfeit

function setConnected(state: GameState, playerId: string, connected: boolean): ApplyResult {
  const player = getPlayer(state, playerId);
  if (!player) return fail("unknown_player");

  player.connected = connected;

  // A player who is gone cannot answer an open window, and with no timer configured
  // nothing else would ever close it.
  if (!connected && state.pending && inWindow(state)) {
    state.pending.awaiting = state.pending.awaiting.filter((id) => id !== playerId);
    if (state.pending.awaiting.length === 0) closeWindow(state);
  }

  return { ok: true, state };
}

/**
 * Removes a disconnected player from the game, surrendering both influence. Only the
 * host may do this, and only to someone actually disconnected — the grace period
 * before the option appears is the room's business, not the rules engine's.
 */
function forfeit(state: GameState, playerId: string, byId: string): ApplyResult {
  if (state.phase === "lobby" || state.phase === "game_over") return fail("wrong_phase");

  const player = getPlayer(state, playerId);
  if (!player) return fail("unknown_player");
  if (state.hostId !== byId) return fail("not_host");
  if (player.connected) return fail("player_connected");
  if (player.eliminated) return fail("already_eliminated");

  state.log.push({ type: "forfeited", playerId });
  while (player.hand.length > 0) reveal(state, player, 0, "forfeit");

  state.pendingLosses = state.pendingLosses.filter((l) => l.playerId !== playerId);
  if (state.pending) {
    state.pending.awaiting = state.pending.awaiting.filter((id) => id !== playerId);
  }

  resumeAfterForfeit(state, playerId);

  return { ok: true, state };
}

/** Picks the game back up from whatever the forfeited player was holding up. */
function resumeAfterForfeit(state: GameState, playerId: string): void {
  if (checkGameOver(state)) return;

  if (state.phase === "awaiting_influence_loss") {
    settle(state);
    return;
  }

  if (state.pending) {
    if (state.pending.actorId === playerId) {
      state.pending = null;
      endTurn(state);
    } else if (state.pending.block?.playerId === playerId) {
      state.pending.block = null;
      resolveAction(state);
    } else if (inWindow(state) && state.pending.awaiting.length === 0) {
      closeWindow(state);
    }
    return;
  }

  if (state.phase === "awaiting_exchange" && state.exchange?.playerId === playerId) {
    state.exchange = null;
    endTurn(state);
    return;
  }

  if (state.phase === "awaiting_action" && currentPlayerId(state) === playerId) {
    endTurn(state);
  }
}

// ------------------------------------------------- response windows

/** Living, connected players who may respond, excluding the given ids. */
function respondersExcept(state: GameState, ...excluded: string[]): string[] {
  return state.players
    .filter((p) => !p.eliminated && p.connected && !excluded.includes(p.id))
    .map((p) => p.id);
}

function eligibleBlockers(state: GameState, pending: PendingAction): string[] {
  if (ACTION_RULES[pending.action].blockedBy.length === 0) return [];

  // A targeted action may only be blocked by the player it names.
  if (pending.targetId !== null) {
    const target = getPlayer(state, pending.targetId);
    return target && !target.eliminated && target.connected ? [target.id] : [];
  }

  return respondersExcept(state, pending.actorId);
}

/**
 * Opens a response window, or skips straight past it when nobody is left to respond —
 * which is what makes a table of disconnected players resolve instead of hanging.
 */
function openWindow(state: GameState, phase: Phase, awaiting: string[]): void {
  state.pending!.awaiting = awaiting;
  state.phase = phase;
  if (awaiting.length === 0) closeWindow(state);
}

function openBlockWindow(state: GameState): void {
  const blockers = eligibleBlockers(state, state.pending!);
  if (blockers.length === 0) {
    resolveAction(state);
    return;
  }
  openWindow(state, "awaiting_block", blockers);
}

/** Nobody used the open window, so take the default outcome for that window. */
function closeWindow(state: GameState): void {
  switch (state.phase) {
    case "awaiting_action_challenge":
      openBlockWindow(state);
      return;
    case "awaiting_block":
      resolveAction(state);
      return;
    case "awaiting_block_challenge":
      // The block went unchallenged, so it stands and the action does not happen.
      logActionFailed(state, state.pending!, "block");
      state.pending = null;
      settle(state);
      return;
  }
}

function inWindow(state: GameState): boolean {
  return (
    state.phase === "awaiting_action_challenge" ||
    state.phase === "awaiting_block" ||
    state.phase === "awaiting_block_challenge"
  );
}

function pass(state: GameState, playerId: string): ApplyResult {
  if (!inWindow(state) || !state.pending) return fail("wrong_phase");
  if (!state.pending.awaiting.includes(playerId)) return fail("not_awaiting_you");

  state.pending.awaiting = state.pending.awaiting.filter((id) => id !== playerId);
  if (state.pending.awaiting.length === 0) closeWindow(state);

  return { ok: true, state };
}

function timeout(state: GameState): ApplyResult {
  if (!inWindow(state) || !state.pending) return fail("wrong_phase");

  state.pending.awaiting = [];
  closeWindow(state);

  return { ok: true, state };
}

function block(state: GameState, playerId: string, claim: Card): ApplyResult {
  if (state.phase !== "awaiting_block" || !state.pending) return fail("wrong_phase");
  if (!state.pending.awaiting.includes(playerId)) return fail("not_awaiting_you");
  if (!ACTION_RULES[state.pending.action].blockedBy.includes(claim)) return fail("invalid_block");

  state.pending.block = { playerId, claim };
  state.log.push({ type: "block", blockerId: playerId, claim });
  openWindow(state, "awaiting_block_challenge", respondersExcept(state, playerId));

  return { ok: true, state };
}

/**
 * Resolves a challenge against whichever claim is currently on the table. A proved
 * claim costs the challenger an influence and the proved card is swapped for a fresh
 * one, so proving a character never reveals which one you still hold.
 */
function challenge(state: GameState, challengerId: string): ApplyResult {
  const pending = state.pending;
  if (!pending) return fail("wrong_phase");

  const againstBlock = state.phase === "awaiting_block_challenge";
  if (state.phase !== "awaiting_action_challenge" && !againstBlock) return fail("wrong_phase");
  if (!pending.awaiting.includes(challengerId)) return fail("not_awaiting_you");

  const claimantId = againstBlock ? pending.block!.playerId : pending.actorId;
  const claim = againstBlock ? pending.block!.claim : pending.claim!;

  pending.awaiting = [];
  const claimant = getPlayer(state, claimantId)!;
  const held = claimant.hand.indexOf(claim);

  state.log.push({
    type: "challenge",
    challengerId,
    claimantId,
    claim,
    proved: held >= 0,
  });

  if (held >= 0) {
    swapForFreshCard(state, claimant, held);
    state.pendingLosses.push({ playerId: challengerId, reason: "failed_challenge" });
    state.resume = againstBlock ? "end_turn" : "open_block";
    if (againstBlock) logActionFailed(state, pending, "block");
  } else {
    state.pendingLosses.push({ playerId: claimantId, reason: "failed_challenge" });
    state.resume = againstBlock ? "resolve_action" : "end_turn";
    if (!againstBlock) logActionFailed(state, pending, "challenge");
  }

  settle(state);
  return { ok: true, state };
}

/** Returns a proved card to the deck, shuffles, and deals its holder a replacement. */
function swapForFreshCard(state: GameState, player: PlayerState, cardIndex: number): void {
  const rng = createRng(state.rngSeed);

  const [proved] = player.hand.splice(cardIndex, 1);
  state.deck = shuffle([...state.deck, proved!], rng);
  const replacement = state.deck.pop();
  if (replacement) player.hand.push(replacement);

  state.rngSeed = rng.seed;
}

// ------------------------------------------------- effects

function resolveAction(state: GameState): void {
  const pending = state.pending;
  state.pending = null;
  if (!pending) {
    settle(state);
    return;
  }

  const actor = getPlayer(state, pending.actorId);
  const target = pending.targetId === null ? undefined : getPlayer(state, pending.targetId);

  // The actor may have been eliminated by a challenge on the way here.
  if (actor && !actor.eliminated) {
    state.log.push({ type: "action_resolved", actorId: actor.id, action: pending.action });

    switch (pending.action) {
      case "income":
        actor.coins += 1;
        break;
      case "foreign_aid":
        actor.coins += 2;
        break;
      case "tax":
        actor.coins += 3;
        break;
      case "steal":
        if (target && !target.eliminated) {
          const taken = Math.min(2, target.coins);
          target.coins -= taken;
          actor.coins += taken;
        }
        break;
      case "coup":
      case "assassinate":
        if (target && !target.eliminated) {
          state.pendingLosses.push({ playerId: target.id, reason: pending.action });
        }
        break;
      case "exchange":
        beginExchange(state, actor);
        return;
    }
  }

  settle(state);
}

/**
 * Draws two cards into the actor's hand and hands them the choice of which to keep.
 * Drawing into the hand rather than a side pile keeps the cards in exactly one place,
 * so a disconnect mid-exchange cannot strand them outside the deck.
 */
function beginExchange(state: GameState, actor: PlayerState): void {
  const keepCount = actor.hand.length;
  actor.hand.push(...state.deck.splice(0, EXCHANGE_DRAW));

  state.exchange = { playerId: actor.id, keepCount };
  state.phase = "awaiting_exchange";
}

function exchangeKeep(state: GameState, playerId: string, keepIndices: number[]): ApplyResult {
  if (state.phase !== "awaiting_exchange" || !state.exchange) return fail("wrong_phase");
  if (state.exchange.playerId !== playerId) return fail("not_awaiting_you");

  const player = getPlayer(state, playerId)!;
  const unique = new Set(keepIndices);

  if (unique.size !== keepIndices.length) return fail("invalid_selection");
  if (keepIndices.length !== state.exchange.keepCount) return fail("invalid_selection");
  if (keepIndices.some((i) => !Number.isInteger(i) || i < 0 || i >= player.hand.length)) {
    return fail("invalid_selection");
  }

  const kept = keepIndices.map((i) => player.hand[i]!);
  const returned = player.hand.filter((_, i) => !unique.has(i));

  player.hand = kept;
  const rng = createRng(state.rngSeed);
  state.deck = shuffle([...state.deck, ...returned], rng);
  state.rngSeed = rng.seed;

  state.exchange = null;
  settle(state);

  return { ok: true, state };
}

function loseInfluence(state: GameState, playerId: string, cardIndex: number): ApplyResult {
  if (state.phase !== "awaiting_influence_loss") return fail("wrong_phase");
  if (state.pendingLosses[0]?.playerId !== playerId) return fail("not_awaiting_you");

  const player = getPlayer(state, playerId)!;
  if (cardIndex < 0 || cardIndex >= player.hand.length) return fail("invalid_card");

  reveal(state, player, cardIndex, state.pendingLosses[0]!.reason);
  state.pendingLosses.shift();

  settle(state);
  return { ok: true, state };
}

/** Moves one card from a player's hand to their face-up pile, eliminating them if it was their last. */
function reveal(
  state: GameState,
  player: PlayerState,
  cardIndex: number,
  reason: LossReason,
): void {
  const [card] = player.hand.splice(cardIndex, 1);
  player.revealed.push(card!);
  state.log.push({ type: "influence_lost", playerId: player.id, card: card!, reason });

  if (player.hand.length === 0) {
    player.eliminated = true;
    state.log.push({ type: "eliminated", playerId: player.id });
  }
}

function logActionFailed(
  state: GameState,
  pending: PendingAction,
  cause: "challenge" | "block",
): void {
  state.log.push({
    type: "action_failed",
    actorId: pending.actorId,
    action: pending.action,
    cause,
  });
}

/**
 * Pays out every influence the current resolution owes, then either stops to ask a
 * player which card to give up, or closes the turn. A player with a single card has
 * no choice to make, so their loss resolves without a prompt.
 */
function settle(state: GameState): void {
  while (state.pendingLosses.length > 0) {
    const loss = state.pendingLosses[0]!;
    const player = getPlayer(state, loss.playerId);

    if (!player || player.eliminated || player.hand.length === 0) {
      state.pendingLosses.shift();
      continue;
    }

    if (player.hand.length > 1) {
      state.phase = "awaiting_influence_loss";
      return;
    }

    reveal(state, player, 0, loss.reason);
    state.pendingLosses.shift();
  }

  const step = state.resume;
  state.resume = null;

  switch (step) {
    case "open_block":
      openBlockWindow(state);
      return;
    case "resolve_action":
      resolveAction(state);
      return;
    default:
      endTurn(state);
  }
}

function endTurn(state: GameState): void {
  state.pending = null;
  state.exchange = null;
  if (checkGameOver(state)) return;

  advanceTurn(state);
  state.phase = "awaiting_action";
}

/** Last player holding influence wins. Checked after every loss, not just at end of turn. */
function checkGameOver(state: GameState): boolean {
  const living = livingPlayers(state);
  if (living.length > 1) return false;

  state.phase = "game_over";
  state.winnerId = living[0]?.id ?? null;
  state.pending = null;
  state.exchange = null;
  state.pendingLosses = [];
  state.log.push({ type: "game_over", winnerId: state.winnerId });
  return true;
}

function advanceTurn(state: GameState): void {
  for (let i = 1; i <= state.turnOrder.length; i++) {
    const index = (state.currentTurnIndex + i) % state.turnOrder.length;
    const candidate = getPlayer(state, state.turnOrder[index]!);
    if (candidate && !candidate.eliminated) {
      state.currentTurnIndex = index;
      return;
    }
  }
}
