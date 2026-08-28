import { describe, expect, test } from "vitest";
import type { TimerSetting } from "@coup/shared";
import { ok, err, lobbyOf, startedGame } from "../helpers.js";
import { currentPlayerId } from "../../src/game/rules.js";

const p = (state: ReturnType<typeof startedGame>, id: string) =>
  state.players.find((pl) => pl.id === id)!;

describe("leaving", () => {
  test("a player may leave the lobby outright", () => {
    let state = lobbyOf("Alice", "Bob");

    state = ok(state, { type: "REMOVE_PLAYER", playerId: "bob" });

    expect(state.players).toHaveLength(1);
  });

  test("a player cannot be removed mid-game; their seat is held", () => {
    const state = startedGame({});

    expect(err(state, { type: "REMOVE_PLAYER", playerId: "bob" })).toBe("wrong_phase");
  });
});

describe("disconnecting", () => {
  test("marks the player disconnected without taking their seat", () => {
    let state = startedGame({});

    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    expect(p(state, "bob").connected).toBe(false);
    expect(p(state, "bob").eliminated).toBe(false);
    expect(state.turnOrder).toContain("bob");
  });

  test("passes any window the player was still owed", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    expect(state.pending?.awaiting).toEqual(["carol"]);
  });

  test("closes the window when the last responder drops", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });
    state = ok(state, { type: "PASS", playerId: "carol" });

    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    expect(p(state, "alice").coins).toBe(5);
    expect(state.phase).toBe("awaiting_action");
  });

  test("does not skip the disconnected player's own turn", () => {
    let state = startedGame({});

    state = ok(state, { type: "SET_CONNECTED", playerId: "alice", connected: false });

    expect(currentPlayerId(state)).toBe("alice");
    expect(state.phase).toBe("awaiting_action");
  });

  test("reconnecting restores the seat", () => {
    let state = startedGame({});
    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: true });

    expect(p(state, "bob").connected).toBe(true);
  });
});

describe("forfeiting", () => {
  test("the host may forfeit a disconnected player", () => {
    let state = startedGame({ hands: { bob: ["Duke", "Contessa"] } });
    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    state = ok(state, { type: "FORFEIT", playerId: "bob", byId: "alice" });

    expect(p(state, "bob").eliminated).toBe(true);
    expect(p(state, "bob").revealed).toEqual(["Duke", "Contessa"]);
    expect(p(state, "bob").hand).toEqual([]);
  });

  test("a connected player cannot be forfeited", () => {
    const state = startedGame({});

    expect(err(state, { type: "FORFEIT", playerId: "bob", byId: "alice" })).toBe("player_connected");
  });

  test("only the host may forfeit", () => {
    let state = startedGame({});
    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    expect(err(state, { type: "FORFEIT", playerId: "bob", byId: "carol" })).toBe("not_host");
  });

  test("forfeiting the player on turn passes the turn along", () => {
    let state = startedGame({});
    state = ok(state, { type: "SET_CONNECTED", playerId: "alice", connected: false });

    state = ok(state, { type: "FORFEIT", playerId: "alice", byId: "alice" });

    expect(currentPlayerId(state)).toBe("bob");
    expect(state.phase).toBe("awaiting_action");
  });

  test("forfeiting the last opponent ends the game", () => {
    let state = startedGame({ players: ["Alice", "Bob"] });
    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    state = ok(state, { type: "FORFEIT", playerId: "bob", byId: "alice" });

    expect(state.phase).toBe("game_over");
    expect(state.winnerId).toBe("alice");
  });
});

describe("the timer setting", () => {
  test("defaults to no timer", () => {
    const state = lobbyOf("Alice", "Bob");

    expect(state.config.timerSeconds).toBeNull();
  });

  test("the host may choose a timer", () => {
    let state = lobbyOf("Alice", "Bob");

    state = ok(state, { type: "SET_CONFIG", playerId: "alice", timerSeconds: 30 });

    expect(state.config.timerSeconds).toBe(30);
  });

  test("only the host may change it", () => {
    const state = lobbyOf("Alice", "Bob");

    expect(err(state, { type: "SET_CONFIG", playerId: "bob", timerSeconds: 30 })).toBe("not_host");
  });

  test("rejects a length that is not on offer", () => {
    const state = lobbyOf("Alice", "Bob");

    // Cast: this value arrives from an untrusted client, so the check must be a
    // runtime one rather than something the type system has already guaranteed.
    const offered = 45 as TimerSetting;

    expect(err(state, { type: "SET_CONFIG", playerId: "alice", timerSeconds: offered })).toBe(
      "invalid_timer",
    );
  });

  test("cannot be changed once the game has started", () => {
    const state = startedGame({});

    expect(err(state, { type: "SET_CONFIG", playerId: "alice", timerSeconds: 15 })).toBe(
      "wrong_phase",
    );
  });
});

describe("rematch", () => {
  const finishedGame = () => {
    let state = startedGame({
      players: ["Alice", "Bob"],
      coins: { alice: 7 },
      hands: { bob: ["Duke"] },
    });
    return ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });
  };

  test("the host returns the room to the lobby with everyone still seated", () => {
    let state = finishedGame();

    state = ok(state, { type: "RESTART", playerId: "alice" });

    expect(state.phase).toBe("lobby");
    expect(state.players.map((pl) => pl.id)).toEqual(["alice", "bob"]);
    expect(state.winnerId).toBeNull();
  });

  test("clears out the finished game", () => {
    let state = finishedGame();

    state = ok(state, { type: "RESTART", playerId: "alice" });

    for (const player of state.players) {
      expect(player.hand).toEqual([]);
      expect(player.revealed).toEqual([]);
      expect(player.eliminated).toBe(false);
      expect(player.coins).toBe(0);
    }
  });

  test("a fresh game can be dealt straight afterwards", () => {
    let state = finishedGame();
    state = ok(state, { type: "RESTART", playerId: "alice" });

    state = ok(state, { type: "START_GAME", playerId: "alice", seed: 99 });

    expect(state.phase).toBe("awaiting_action");
    expect(p(state, "bob").hand).toHaveLength(2);
  });

  test("only the host may call it", () => {
    const state = finishedGame();

    expect(err(state, { type: "RESTART", playerId: "bob" })).toBe("not_host");
  });

  test("cannot restart a game still in progress", () => {
    const state = startedGame({});

    expect(err(state, { type: "RESTART", playerId: "alice" })).toBe("wrong_phase");
  });
});
