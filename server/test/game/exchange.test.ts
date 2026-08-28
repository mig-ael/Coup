import { describe, expect, test } from "vitest";
import { ok, err, startedGame, passAll, expectCardsConserved } from "../helpers.js";
import { currentPlayerId } from "../../src/game/rules.js";

const p = (state: ReturnType<typeof startedGame>, id: string) =>
  state.players.find((pl) => pl.id === id)!;

describe("exchange", () => {
  test("draws two cards for the actor to choose from once unchallenged", () => {
    let state = startedGame({ hands: { alice: ["Duke", "Contessa"] } });
    const deckSize = state.deck.length;
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });

    state = passAll(state, "bob", "carol");

    expect(state.phase).toBe("awaiting_exchange");
    expect(p(state, "alice").hand).toHaveLength(4);
    expect(state.deck).toHaveLength(deckSize - 2);
    expect(state.exchange).toEqual({ playerId: "alice", keepCount: 2 });
  });

  test("keeps the chosen cards and returns the rest to the deck", () => {
    let state = startedGame({ hands: { alice: ["Duke", "Contessa"] } });
    const deckSize = state.deck.length;
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });
    state = passAll(state, "bob", "carol");
    const drawn = [...p(state, "alice").hand];

    state = ok(state, { type: "EXCHANGE_KEEP", playerId: "alice", keepIndices: [0, 3] });

    expect(p(state, "alice").hand).toEqual([drawn[0], drawn[3]]);
    expect(state.deck).toHaveLength(deckSize);
    expect(state.exchange).toBeNull();
    expectCardsConserved(state);
  });

  test("the turn passes once the exchange is settled", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });
    state = passAll(state, "bob", "carol");

    state = ok(state, { type: "EXCHANGE_KEEP", playerId: "alice", keepIndices: [0, 1] });

    expect(state.phase).toBe("awaiting_action");
    expect(currentPlayerId(state)).toBe("bob");
  });

  test("a player down to one influence draws two and keeps one", () => {
    let state = startedGame({ hands: { alice: ["Duke"] } });
    state.players.find((pl) => pl.id === "alice")!.revealed = ["Captain"];
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });

    state = passAll(state, "bob", "carol");

    expect(p(state, "alice").hand).toHaveLength(3);
    expect(state.exchange?.keepCount).toBe(1);
  });

  test("keeping the wrong number of cards is rejected", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });
    state = passAll(state, "bob", "carol");

    expect(err(state, { type: "EXCHANGE_KEEP", playerId: "alice", keepIndices: [0] })).toBe(
      "invalid_selection",
    );
  });

  test("keeping the same card twice is rejected", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });
    state = passAll(state, "bob", "carol");

    expect(err(state, { type: "EXCHANGE_KEEP", playerId: "alice", keepIndices: [1, 1] })).toBe(
      "invalid_selection",
    );
  });

  test("an out-of-range index is rejected", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });
    state = passAll(state, "bob", "carol");

    expect(err(state, { type: "EXCHANGE_KEEP", playerId: "alice", keepIndices: [0, 9] })).toBe(
      "invalid_selection",
    );
  });

  test("nobody but the exchanging player may choose", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });
    state = passAll(state, "bob", "carol");

    expect(err(state, { type: "EXCHANGE_KEEP", playerId: "bob", keepIndices: [0, 1] })).toBe(
      "not_awaiting_you",
    );
  });

  test("a successfully challenged exchange never draws", () => {
    let state = startedGame({ hands: { alice: ["Duke", "Contessa"] } });
    const deckSize = state.deck.length;
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "exchange" });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "alice", cardIndex: 0 });

    expect(state.phase).toBe("awaiting_action");
    expect(state.deck).toHaveLength(deckSize);
    expect(p(state, "alice").hand).toHaveLength(1);
  });
});
