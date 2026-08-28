import { expect } from "vitest";
import { apply, createGame } from "../src/game/engine.js";
import { createDeck } from "../src/game/deck.js";
import { CARDS, type Card } from "@coup/shared";
import type { Command, GameState, ApplyResult } from "../src/game/types.js";

/** Applies a command and fails the test if the engine rejected it. */
export function ok(state: GameState, cmd: Command): GameState {
  const result: ApplyResult = apply(state, cmd);
  if (!result.ok) {
    expect.unreachable(`expected ${cmd.type} to succeed, got error: ${result.error}`);
  }
  return result.state;
}

/** Applies a command expecting rejection, and returns the error code. */
export function err(state: GameState, cmd: Command): string {
  const result = apply(state, cmd);
  if (result.ok) {
    expect.unreachable(`expected ${cmd.type} to be rejected, but it succeeded`);
  }
  return result.error;
}

/** A lobby containing `names.length` players; the first is the host. */
export function lobbyOf(...names: string[]): GameState {
  let state = createGame();
  for (const name of names) {
    state = ok(state, { type: "ADD_PLAYER", playerId: name.toLowerCase(), name });
  }
  return state;
}

export interface StartedGameOptions {
  /** Player names, in turn order. Defaults to Alice, Bob, Carol. */
  players?: string[];
  coins?: Record<string, number>;
  hands?: Record<string, Card[]>;
  eliminated?: string[];
  seed?: number;
}

/**
 * A game in progress with a *deterministic* turn order (the given player order,
 * not the engine's random one) so tests can name who acts without chasing a seed.
 */
export function startedGame(opts: StartedGameOptions): GameState {
  const names = opts.players ?? ["Alice", "Bob", "Carol"];
  let state = lobbyOf(...names);
  state = ok(state, { type: "START_GAME", playerId: names[0]!.toLowerCase(), seed: opts.seed ?? 1 });

  state.turnOrder = names.map((n) => n.toLowerCase());
  state.currentTurnIndex = 0;

  for (const player of state.players) {
    const coins = opts.coins?.[player.id];
    if (coins !== undefined) player.coins = coins;

    const hand = opts.hands?.[player.id];
    if (hand !== undefined) player.hand = [...hand];

    if (opts.eliminated?.includes(player.id)) {
      player.revealed = [...player.hand];
      player.hand = [];
      player.eliminated = true;
    }
  }

  rebuildDeck(state);
  return state;
}

/**
 * Overriding hands would otherwise leave cards duplicated between a hand and the
 * deck. Rebuild the deck as "the 15 cards minus everything players hold" so that
 * conservation assertions stay meaningful on synthetic states.
 */
function rebuildDeck(state: GameState): void {
  const remaining = createDeck();
  for (const card of state.players.flatMap((p) => [...p.hand, ...p.revealed])) {
    const at = remaining.indexOf(card);
    if (at === -1) throw new Error(`test setup deals more than three ${card}s`);
    remaining.splice(at, 1);
  }
  state.deck = remaining;
}

/** Every player in `ids` declines the open window, in order. */
export function passAll(state: GameState, ...ids: string[]): GameState {
  for (const playerId of ids) {
    state = ok(state, { type: "PASS", playerId });
  }
  return state;
}

/**
 * The 15 cards are conserved: every card is in exactly one of a hand, a face-up
 * pile, or the deck. Guards against the deck-return/replacement paths duplicating
 * or dropping cards.
 */
export function expectCardsConserved(state: GameState): void {
  const all = [
    ...state.players.flatMap((p) => [...p.hand, ...p.revealed]),
    ...state.deck,
  ];

  expect(all).toHaveLength(15);
  for (const card of CARDS) {
    expect({ card, count: all.filter((c) => c === card).length }).toEqual({ card, count: 3 });
  }
}
