import { describe, expect, test } from "vitest";
import { toPublicView, privateHand } from "../../src/game/project.js";
import { ok, startedGame, lobbyOf } from "../helpers.js";

describe("toPublicView", () => {
  test("reports how much influence a player holds, never which cards", () => {
    const state = startedGame({ hands: { bob: ["Duke", "Contessa"] } });

    const view = toPublicView(state);
    const bob = view.players.find((p) => p.id === "bob")!;

    expect(bob.influenceCount).toBe(2);
    expect(bob).not.toHaveProperty("hand");
    expect(Object.values(bob)).not.toContain("Duke");
  });

  test("no hidden card appears anywhere in the projected view", () => {
    // Every face-down card is an Ambassador and nothing is face up, so any
    // occurrence of "Ambassador" in the projection is a leak.
    const state = startedGame({
      hands: { alice: ["Ambassador", "Ambassador"], bob: ["Ambassador", "Duke"] },
    });

    const serialized = JSON.stringify(toPublicView(state));

    expect(serialized).not.toContain("Ambassador");
  });

  test("the court deck is reduced to a count", () => {
    const state = startedGame({});

    const view = toPublicView(state);

    expect(view.deckCount).toBe(state.deck.length);
    expect(view).not.toHaveProperty("deck");
    expect(JSON.stringify(view)).not.toContain('"deck"');
  });

  test("face-up cards are shown to everyone", () => {
    const state = startedGame({ eliminated: ["bob"], hands: { bob: ["Duke", "Captain"] } });

    const view = toPublicView(state);
    const bob = view.players.find((p) => p.id === "bob")!;

    expect(bob.revealed).toEqual(["Duke", "Captain"]);
    expect(bob.influenceCount).toBe(0);
    expect(bob.eliminated).toBe(true);
  });

  test("carries the open window so clients can derive their own prompt", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    const view = toPublicView(state);

    expect(view.phase).toBe("awaiting_action_challenge");
    expect(view.pending).toEqual({
      actorId: "alice",
      action: "tax",
      targetId: null,
      claim: "Duke",
      blockerId: null,
      blockClaim: null,
      awaiting: ["bob", "carol"],
    });
  });

  test("names the claimed blocker once a block is on the table", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });
    state = ok(state, { type: "BLOCK", playerId: "bob", claim: "Duke" });

    const view = toPublicView(state);

    expect(view.pending?.blockerId).toBe("bob");
    expect(view.pending?.blockClaim).toBe("Duke");
  });

  test("names whose card choice the table is waiting on", () => {
    let state = startedGame({ coins: { alice: 7 } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    const view = toPublicView(state);

    expect(view.awaitingLossFrom).toBe("bob");
  });

  test("names who is mid-exchange without showing what they drew", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });
    state = ok(state, { type: "PASS", playerId: "bob" });
    state = ok(state, { type: "PASS", playerId: "carol" });

    const view = toPublicView(state);

    expect(view.exchangePlayerId).toBe("alice");
    expect(view.players.find((p) => p.id === "alice")?.influenceCount).toBe(2);
  });

  test("passes the public log through untouched", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "income" });

    expect(toPublicView(state).log).toEqual(state.log);
  });

  test("carries the lobby roster before a game starts", () => {
    const state = lobbyOf("Alice", "Bob");

    const view = toPublicView(state);

    expect(view.phase).toBe("lobby");
    expect(view.hostId).toBe("alice");
    expect(view.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    expect(view.deckCount).toBe(0);
  });

  test("carries the configured timer and its deadline", () => {
    const state = startedGame({});

    expect(toPublicView(state).deadline).toBeNull();
    expect(toPublicView(state, { deadline: 1234 }).deadline).toBe(1234);
    expect(toPublicView(state).timerSeconds).toBeNull();
  });
});

describe("privateHand", () => {
  test("returns only the asking player's own cards", () => {
    const state = startedGame({ hands: { alice: ["Duke", "Captain"], bob: ["Contessa"] } });

    expect(privateHand(state, "alice")).toEqual(["Duke", "Captain"]);
  });

  test("returns nothing for a player who is not in the game", () => {
    const state = startedGame({});

    expect(privateHand(state, "nobody")).toEqual([]);
  });
});
