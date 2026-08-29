import { describe, expect, test } from "vitest";
import { ok, startedGame } from "../helpers.js";
import { currentPlayerId } from "../../src/game/rules.js";

const p = (state: ReturnType<typeof startedGame>, id: string) =>
  state.players.find((pl) => pl.id === id)!;

describe("dropping on your own turn", () => {
  test("the turn is skipped rather than stalling the table", () => {
    let state = startedGame({});

    state = ok(state, { type: "SET_CONNECTED", playerId: "alice", connected: false });

    expect(currentPlayerId(state)).toBe("bob");
    expect(p(state, "alice").eliminated).toBe(false);
  });

  test("their turn comes round again and is skipped while still away", () => {
    let state = startedGame({});
    state = ok(state, { type: "SET_CONNECTED", playerId: "alice", connected: false });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "bob", action: "income" });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "carol", action: "income" });

    expect(currentPlayerId(state)).toBe("bob");
  });

  test("a player who comes back takes their turn as normal", () => {
    let state = startedGame({});
    state = ok(state, { type: "SET_CONNECTED", playerId: "alice", connected: false });
    state = ok(state, { type: "SET_CONNECTED", playerId: "alice", connected: true });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "bob", action: "income" });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "carol", action: "income" });

    expect(currentPlayerId(state)).toBe("alice");
    expect(p(state, "alice").coins).toBe(2);
  });

  test("skipping does not cost them coins or influence", () => {
    let state = startedGame({});

    state = ok(state, { type: "SET_CONNECTED", playerId: "alice", connected: false });

    expect(p(state, "alice").coins).toBe(2);
    expect(p(state, "alice").hand).toHaveLength(2);
  });
});

describe("influence owed by a player who is away", () => {
  test("is taken automatically rather than waiting on a choice", () => {
    let state = startedGame({ coins: { alice: 7 }, hands: { bob: ["Duke", "Contessa"] } });
    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    expect(p(state, "bob").revealed).toHaveLength(1);
    expect(state.phase).toBe("awaiting_action");
    expect(state.pendingLosses).toEqual([]);
  });

  test("dropping while the table waits on your choice resolves it", () => {
    let state = startedGame({ coins: { alice: 7 }, hands: { bob: ["Duke", "Contessa"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });
    expect(state.phase).toBe("awaiting_influence_loss");

    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    expect(p(state, "bob").revealed).toHaveLength(1);
    expect(state.phase).toBe("awaiting_action");
  });

  test("dropping mid-exchange returns the drawn cards automatically", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });
    state = ok(state, { type: "PASS", playerId: "bob" });
    state = ok(state, { type: "PASS", playerId: "carol" });
    expect(state.phase).toBe("awaiting_exchange");

    state = ok(state, { type: "SET_CONNECTED", playerId: "alice", connected: false });

    expect(p(state, "alice").hand).toHaveLength(2);
    expect(state.deck).toHaveLength(9);
    expect(state.phase).toBe("awaiting_action");
  });
});

describe("when too few players are left connected", () => {
  test("a two-player game ends when one of them drops", () => {
    let state = startedGame({ players: ["Alice", "Bob"] });

    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    expect(state.phase).toBe("game_over");
    expect(state.winnerId).toBe("alice");
  });

  test("a three-player game carries on when one drops", () => {
    let state = startedGame({});

    state = ok(state, { type: "SET_CONNECTED", playerId: "carol", connected: false });

    expect(state.phase).toBe("awaiting_action");
    expect(state.winnerId).toBeNull();
  });

  test("it ends once only one connected player is left", () => {
    let state = startedGame({});
    state = ok(state, { type: "SET_CONNECTED", playerId: "carol", connected: false });

    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    expect(state.phase).toBe("game_over");
    expect(state.winnerId).toBe("alice");
  });

  test("an eliminated player leaving does not end the game", () => {
    let state = startedGame({ eliminated: ["carol"] });

    state = ok(state, { type: "SET_CONNECTED", playerId: "carol", connected: false });

    expect(state.phase).toBe("awaiting_action");
  });

  test("the lobby is unaffected by players coming and going", () => {
    let state = startedGame({ players: ["Alice", "Bob"] });
    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });
    state = ok(state, { type: "RESTART", playerId: "alice" });

    state = ok(state, { type: "SET_CONNECTED", playerId: "alice", connected: false });

    expect(state.phase).toBe("lobby");
  });
});
