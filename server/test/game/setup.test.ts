import { describe, expect, test } from "vitest";
import { STARTING_COINS, STARTING_INFLUENCE } from "@coup/shared";
import { createGame, apply } from "../../src/game/engine.js";
import { ok, err, lobbyOf } from "../helpers.js";

describe("lobby", () => {
  test("a new game starts empty and in the lobby phase", () => {
    const state = createGame();

    expect(state.phase).toBe("lobby");
    expect(state.players).toHaveLength(0);
    expect(state.hostId).toBeNull();
  });

  test("the first player to join becomes the host", () => {
    const state = lobbyOf("Alice", "Bob");

    expect(state.hostId).toBe("alice");
  });

  test("host passes to the next player when the host leaves", () => {
    let state = lobbyOf("Alice", "Bob");

    state = ok(state, { type: "REMOVE_PLAYER", playerId: "alice" });

    expect(state.hostId).toBe("bob");
    expect(state.players).toHaveLength(1);
  });

  test("rejects a seventh player", () => {
    const state = lobbyOf("P1", "P2", "P3", "P4", "P5", "P6");

    expect(err(state, { type: "ADD_PLAYER", playerId: "p7", name: "P7" })).toBe("room_full");
  });

  test("rejects a duplicate player id", () => {
    const state = lobbyOf("Alice");

    expect(err(state, { type: "ADD_PLAYER", playerId: "alice", name: "Alice" })).toBe(
      "already_joined",
    );
  });

  test("allows two players to share a display name", () => {
    let state = lobbyOf("Alice");

    state = ok(state, { type: "ADD_PLAYER", playerId: "alice2", name: "Alice" });

    expect(state.players.map((p) => p.name)).toEqual(["Alice", "Alice"]);
  });
});

describe("START_GAME", () => {
  test("deals two cards and two coins to every player", () => {
    let state = lobbyOf("Alice", "Bob", "Carol");

    state = ok(state, { type: "START_GAME", playerId: "alice", seed: 42 });

    for (const player of state.players) {
      expect(player.hand).toHaveLength(STARTING_INFLUENCE);
      expect(player.coins).toBe(STARTING_COINS);
      expect(player.revealed).toEqual([]);
      expect(player.eliminated).toBe(false);
    }
  });

  test("leaves the undealt cards in the court deck", () => {
    let state = lobbyOf("Alice", "Bob", "Carol");

    state = ok(state, { type: "START_GAME", playerId: "alice", seed: 42 });

    expect(state.deck).toHaveLength(15 - 3 * STARTING_INFLUENCE);
  });

  test("turn order is a permutation of the players", () => {
    let state = lobbyOf("Alice", "Bob", "Carol");

    state = ok(state, { type: "START_GAME", playerId: "alice", seed: 42 });

    expect([...state.turnOrder].sort()).toEqual(["alice", "bob", "carol"]);
  });

  test("turn order is randomised rather than join order", () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 40; seed++) {
      let state = lobbyOf("Alice", "Bob", "Carol");
      state = ok(state, { type: "START_GAME", playerId: "alice", seed });
      orders.add(state.turnOrder.join(","));
    }

    expect(orders.size).toBeGreaterThan(1);
  });

  test("the same seed deals the same game", () => {
    const deal = (seed: number) => {
      let state = lobbyOf("Alice", "Bob", "Carol");
      state = ok(state, { type: "START_GAME", playerId: "alice", seed });
      return state;
    };

    expect(deal(7)).toEqual(deal(7));
  });

  test("moves to the acting phase with the first player in turn order", () => {
    let state = lobbyOf("Alice", "Bob", "Carol");

    state = ok(state, { type: "START_GAME", playerId: "alice", seed: 42 });

    expect(state.phase).toBe("awaiting_action");
    expect(state.currentTurnIndex).toBe(0);
  });

  test("only the host may start the game", () => {
    const state = lobbyOf("Alice", "Bob");

    expect(err(state, { type: "START_GAME", playerId: "bob", seed: 1 })).toBe("not_host");
  });

  test("needs at least two players", () => {
    const state = lobbyOf("Alice");

    expect(err(state, { type: "START_GAME", playerId: "alice", seed: 1 })).toBe("not_enough_players");
  });

  test("cannot be started twice", () => {
    let state = lobbyOf("Alice", "Bob");
    state = ok(state, { type: "START_GAME", playerId: "alice", seed: 1 });

    expect(err(state, { type: "START_GAME", playerId: "alice", seed: 1 })).toBe("wrong_phase");
  });

  test("nobody holds a card that is still in the deck", () => {
    let state = lobbyOf("Alice", "Bob", "Carol");
    state = ok(state, { type: "START_GAME", playerId: "alice", seed: 42 });

    const dealt = state.players.flatMap((p) => p.hand);
    const all = [...dealt, ...state.deck].sort();

    expect(all).toHaveLength(15);
    expect(all.filter((c) => c === "Duke")).toHaveLength(3);
  });
});

describe("apply", () => {
  test("rejects an unknown player", () => {
    const state = lobbyOf("Alice", "Bob");

    expect(err(state, { type: "START_GAME", playerId: "nobody", seed: 1 })).toBe("unknown_player");
  });

  test("does not mutate the state it is given", () => {
    const state = lobbyOf("Alice", "Bob");
    const snapshot = structuredClone(state);

    apply(state, { type: "START_GAME", playerId: "alice", seed: 1 });

    expect(state).toEqual(snapshot);
  });
});
