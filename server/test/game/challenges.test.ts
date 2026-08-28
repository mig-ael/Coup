import { describe, expect, test } from "vitest";
import { ok, err, startedGame, passAll, expectCardsConserved } from "../helpers.js";
import { currentPlayerId } from "../../src/game/rules.js";

const hand = (state: ReturnType<typeof startedGame>, id: string) =>
  state.players.find((p) => p.id === id)!;

describe("the challenge window", () => {
  test("a character action opens a window naming every living opponent", () => {
    let state = startedGame({});

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    expect(state.phase).toBe("awaiting_action_challenge");
    expect(state.pending?.awaiting).toEqual(["bob", "carol"]);
  });

  test("a general action opens no window at all", () => {
    let state = startedGame({});

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "income" });

    expect(state.pending).toBeNull();
  });

  test("eliminated players are not asked", () => {
    let state = startedGame({ eliminated: ["bob"] });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    expect(state.pending?.awaiting).toEqual(["carol"]);
  });

  test("disconnected players are treated as having passed", () => {
    let state = startedGame({});
    state.players.find((p) => p.id === "bob")!.connected = false;

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    expect(state.pending?.awaiting).toEqual(["carol"]);
  });

  test("the actor cannot challenge their own claim", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    expect(err(state, { type: "CHALLENGE", playerId: "alice" })).toBe("not_awaiting_you");
  });

  test("a player cannot pass a window twice", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });
    state = ok(state, { type: "PASS", playerId: "bob" });

    expect(err(state, { type: "PASS", playerId: "bob" })).toBe("not_awaiting_you");
  });

  test("the action resolves once everyone has passed", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = passAll(state, "bob", "carol");

    expect(hand(state, "alice").coins).toBe(5);
    expect(state.phase).toBe("awaiting_action");
    expect(currentPlayerId(state)).toBe("bob");
  });

  test("a timeout closes the window as if everyone passed", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = ok(state, { type: "TIMEOUT" });

    expect(hand(state, "alice").coins).toBe(5);
    expect(state.phase).toBe("awaiting_action");
  });
});

describe("challenging a truthful claim", () => {
  test("the challenger loses an influence and the action still happens", () => {
    let state = startedGame({ hands: { alice: ["Duke", "Captain"], bob: ["Contessa", "Ambassador"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "bob", cardIndex: 0 });

    expect(hand(state, "bob").revealed).toEqual(["Contessa"]);
    expect(hand(state, "alice").coins).toBe(5);
  });

  test("the proved card is swapped for a fresh one rather than lost", () => {
    let state = startedGame({ hands: { alice: ["Duke", "Captain"], bob: ["Contessa", "Ambassador"] } });
    const deckSize = state.deck.length;
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });

    expect(hand(state, "alice").hand).toHaveLength(2);
    expect(hand(state, "alice").revealed).toEqual([]);
    expect(state.deck).toHaveLength(deckSize);
    expectCardsConserved(state);
  });

  test("the proved card returns to the deck rather than leaving the game", () => {
    let state = startedGame({
      players: ["Alice", "Bob"],
      hands: { alice: ["Duke", "Contessa"], bob: ["Captain", "Ambassador"] },
    });
    const deckSize = state.deck.length;
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });

    const stillInPlay = [...hand(state, "alice").hand, ...state.deck];
    expect(stillInPlay.filter((c) => c === "Duke")).toHaveLength(3);
    expect(hand(state, "alice").revealed).toEqual([]);
    expect(state.deck).toHaveLength(deckSize);
  });

  test("only one challenge is taken; the window closes on the first", () => {
    let state = startedGame({ hands: { alice: ["Duke", "Captain"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });
    state = ok(state, { type: "CHALLENGE", playerId: "bob" });

    expect(err(state, { type: "CHALLENGE", playerId: "carol" })).toBe("wrong_phase");
  });
});

describe("challenging a bluff", () => {
  test("the bluffer loses an influence and the action does not happen", () => {
    let state = startedGame({ hands: { alice: ["Captain", "Contessa"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "alice", cardIndex: 0 });

    expect(hand(state, "alice").revealed).toEqual(["Captain"]);
    expect(hand(state, "alice").coins).toBe(2);
    expect(currentPlayerId(state)).toBe("bob");
  });

  test("a lost card stays out of the game", () => {
    let state = startedGame({ hands: { alice: ["Captain", "Contessa"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });
    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "alice", cardIndex: 0 });

    expect(hand(state, "alice").hand).toEqual(["Contessa"]);
    expectCardsConserved(state);
  });

  test("coins already paid for a failed assassinate are not refunded", () => {
    let state = startedGame({
      coins: { alice: 3 },
      hands: { alice: ["Captain", "Contessa"] },
    });
    state = ok(state, {
      type: "DECLARE_ACTION",
      playerId: "alice",
      action: "assassinate",
      targetId: "bob",
    });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "alice", cardIndex: 0 });

    expect(hand(state, "alice").coins).toBe(0);
    expect(hand(state, "bob").revealed).toEqual([]);
  });
});

describe("a challenge that costs two influence", () => {
  test("losing a challenge against a real Assassin also costs the assassination", () => {
    let state = startedGame({
      coins: { alice: 3 },
      hands: { alice: ["Assassin", "Duke"], bob: ["Captain", "Ambassador"] },
    });
    state = ok(state, {
      type: "DECLARE_ACTION",
      playerId: "alice",
      action: "assassinate",
      targetId: "bob",
    });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "bob", cardIndex: 0 });
    state = ok(state, { type: "PASS", playerId: "bob" });

    expect(hand(state, "bob").revealed).toEqual(["Captain", "Ambassador"]);
    expect(hand(state, "bob").eliminated).toBe(true);
  });

  test("a target eliminated by the challenge owes nothing further", () => {
    let state = startedGame({
      coins: { alice: 3 },
      hands: { alice: ["Assassin", "Duke"], bob: ["Captain"] },
    });
    state = ok(state, {
      type: "DECLARE_ACTION",
      playerId: "alice",
      action: "assassinate",
      targetId: "bob",
    });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });

    expect(hand(state, "bob").revealed).toEqual(["Captain"]);
    expect(hand(state, "bob").eliminated).toBe(true);
    expect(state.pendingLosses).toEqual([]);
    expect(state.phase).toBe("awaiting_action");
  });
});
