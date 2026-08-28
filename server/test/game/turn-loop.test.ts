import { describe, expect, test } from "vitest";
import { ok, err, startedGame } from "../helpers.js";
import { currentPlayerId } from "../../src/game/rules.js";

describe("declaring an action", () => {
  test("income takes one coin and passes the turn", () => {
    let state = startedGame({});

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "income" });

    expect(state.players.find((p) => p.id === "alice")?.coins).toBe(3);
    expect(currentPlayerId(state)).toBe("bob");
    expect(state.phase).toBe("awaiting_action");
  });

  test("a player cannot act out of turn", () => {
    const state = startedGame({});

    expect(err(state, { type: "DECLARE_ACTION", playerId: "bob", action: "income" })).toBe(
      "not_your_turn",
    );
  });

  test("an action the player cannot afford is rejected", () => {
    const state = startedGame({ coins: { alice: 6 } });

    expect(
      err(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" }),
    ).toBe("illegal_action");
  });

  test("holding ten coins makes every action but coup illegal", () => {
    const state = startedGame({ coins: { alice: 10 } });

    expect(err(state, { type: "DECLARE_ACTION", playerId: "alice", action: "income" })).toBe(
      "illegal_action",
    );
  });

  test("a targeted action without a target is rejected", () => {
    const state = startedGame({ coins: { alice: 7 } });

    expect(err(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup" })).toBe(
      "invalid_target",
    );
  });

  test("naming an eliminated player as target is rejected", () => {
    const state = startedGame({ coins: { alice: 7 }, eliminated: ["bob"] });

    expect(
      err(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" }),
    ).toBe("invalid_target");
  });

  test("targeting yourself is rejected", () => {
    const state = startedGame({ coins: { alice: 7 } });

    expect(
      err(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "alice" }),
    ).toBe("invalid_target");
  });
});

describe("turn advance", () => {
  test("wraps back to the first player", () => {
    let state = startedGame({});

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "income" });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "bob", action: "income" });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "carol", action: "income" });

    expect(currentPlayerId(state)).toBe("alice");
  });

  test("skips eliminated players", () => {
    let state = startedGame({ eliminated: ["bob"] });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "income" });

    expect(currentPlayerId(state)).toBe("carol");
  });
});

describe("coup", () => {
  test("pays seven coins and asks the target which card to lose", () => {
    let state = startedGame({ coins: { alice: 7 } });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    expect(state.players.find((p) => p.id === "alice")?.coins).toBe(0);
    expect(state.phase).toBe("awaiting_influence_loss");
    expect(state.pendingLosses[0]?.playerId).toBe("bob");
  });

  test("the turn does not advance until the influence is chosen", () => {
    let state = startedGame({ coins: { alice: 7 } });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    expect(currentPlayerId(state)).toBe("alice");
  });

  test("the chosen card moves face up and the turn passes", () => {
    let state = startedGame({ coins: { alice: 7 }, hands: { bob: ["Duke", "Contessa"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "bob", cardIndex: 0 });

    const bob = state.players.find((p) => p.id === "bob")!;
    expect(bob.revealed).toEqual(["Duke"]);
    expect(bob.hand).toEqual(["Contessa"]);
    expect(currentPlayerId(state)).toBe("bob");
  });

  test("only the named player may choose", () => {
    let state = startedGame({ coins: { alice: 7 } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    expect(err(state, { type: "LOSE_INFLUENCE", playerId: "carol", cardIndex: 0 })).toBe(
      "not_awaiting_you",
    );
  });

  test("an out-of-range card index is rejected", () => {
    let state = startedGame({ coins: { alice: 7 } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    expect(err(state, { type: "LOSE_INFLUENCE", playerId: "bob", cardIndex: 5 })).toBe(
      "invalid_card",
    );
  });
});

describe("losing influence with nothing to choose", () => {
  test("a player down to one card loses it without being asked", () => {
    let state = startedGame({ coins: { alice: 7 }, hands: { bob: ["Duke"] } });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    const bob = state.players.find((p) => p.id === "bob")!;
    expect(bob.revealed).toEqual(["Duke"]);
    expect(bob.eliminated).toBe(true);
    expect(state.phase).toBe("awaiting_action");
  });
});

describe("elimination and winning", () => {
  test("losing both influence eliminates the player", () => {
    let state = startedGame({ coins: { alice: 14 }, hands: { bob: ["Duke", "Contessa"] } });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "bob", cardIndex: 0 });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "bob", action: "income" });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "carol", action: "income" });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    const bob = state.players.find((p) => p.id === "bob")!;
    expect(bob.eliminated).toBe(true);
    expect(bob.revealed).toEqual(["Duke", "Contessa"]);
  });

  test("the last player holding influence wins", () => {
    let state = startedGame({
      players: ["Alice", "Bob"],
      coins: { alice: 7 },
      hands: { bob: ["Duke"] },
    });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    expect(state.phase).toBe("game_over");
    expect(state.winnerId).toBe("alice");
  });

  test("no actions are legal once the game is over", () => {
    let state = startedGame({
      players: ["Alice", "Bob"],
      coins: { alice: 7 },
      hands: { bob: ["Duke"] },
    });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    expect(err(state, { type: "DECLARE_ACTION", playerId: "alice", action: "income" })).toBe(
      "wrong_phase",
    );
  });
});
