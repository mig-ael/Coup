import { describe, expect, test } from "vitest";
import { ok, err, startedGame, passAll, expectCardsConserved } from "../helpers.js";
import { currentPlayerId } from "../../src/game/rules.js";

const p = (state: ReturnType<typeof startedGame>, id: string) =>
  state.players.find((pl) => pl.id === id)!;

describe("the block window", () => {
  test("foreign aid is offered to every opponent", () => {
    let state = startedGame({});

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });

    expect(state.phase).toBe("awaiting_block");
    expect(state.pending?.awaiting).toEqual(["bob", "carol"]);
  });

  test("foreign aid pays out when nobody blocks", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });

    state = passAll(state, "bob", "carol");

    expect(p(state, "alice").coins).toBe(4);
    expect(currentPlayerId(state)).toBe("bob");
  });

  test("a steal block is offered to the target alone", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "steal", targetId: "bob" });

    state = passAll(state, "bob", "carol");

    expect(state.phase).toBe("awaiting_block");
    expect(state.pending?.awaiting).toEqual(["bob"]);
  });

  test("a bystander cannot block a steal", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "steal", targetId: "bob" });
    state = passAll(state, "bob", "carol");

    expect(err(state, { type: "BLOCK", playerId: "carol", claim: "Captain" })).toBe(
      "not_awaiting_you",
    );
  });

  test("blocking with a character that cannot block the action is rejected", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });

    expect(err(state, { type: "BLOCK", playerId: "bob", claim: "Contessa" })).toBe("invalid_block");
  });

  test("an unchallenged block stops the action", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });

    state = ok(state, { type: "BLOCK", playerId: "bob", claim: "Duke" });
    state = passAll(state, "alice", "carol");

    expect(p(state, "alice").coins).toBe(2);
    expect(currentPlayerId(state)).toBe("bob");
  });

  test("a block opens a challenge window to everyone but the blocker", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });

    state = ok(state, { type: "BLOCK", playerId: "bob", claim: "Duke" });

    expect(state.phase).toBe("awaiting_block_challenge");
    expect(state.pending?.awaiting).toEqual(["alice", "carol"]);
  });
});

describe("challenging a block", () => {
  test("a truthful block survives and the challenger loses an influence", () => {
    let state = startedGame({ hands: { bob: ["Duke", "Captain"], alice: ["Contessa", "Ambassador"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });
    state = ok(state, { type: "BLOCK", playerId: "bob", claim: "Duke" });

    state = ok(state, { type: "CHALLENGE", playerId: "alice" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "alice", cardIndex: 0 });

    expect(p(state, "alice").revealed).toEqual(["Contessa"]);
    expect(p(state, "alice").coins).toBe(2);
    expectCardsConserved(state);
  });

  test("a bluffed block collapses and the action goes through", () => {
    let state = startedGame({ hands: { bob: ["Captain", "Ambassador"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });
    state = ok(state, { type: "BLOCK", playerId: "bob", claim: "Duke" });

    state = ok(state, { type: "CHALLENGE", playerId: "alice" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "bob", cardIndex: 0 });

    expect(p(state, "bob").revealed).toEqual(["Captain"]);
    expect(p(state, "alice").coins).toBe(4);
  });

  test("a bluffed Contessa lets the assassination land", () => {
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
    state = passAll(state, "bob", "carol");
    state = ok(state, { type: "BLOCK", playerId: "bob", claim: "Contessa" });

    state = ok(state, { type: "CHALLENGE", playerId: "alice" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "bob", cardIndex: 0 });

    expect(p(state, "bob").eliminated).toBe(true);
    expect(p(state, "bob").revealed).toEqual(["Captain", "Ambassador"]);
  });
});

describe("challenge before block", () => {
  test("a steal runs its challenge window before offering the block", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "steal", targetId: "bob" });

    expect(state.phase).toBe("awaiting_action_challenge");
    expect(state.pending?.awaiting).toEqual(["bob", "carol"]);
  });

  test("a target who loses the action challenge may still block", () => {
    let state = startedGame({
      hands: { alice: ["Captain", "Duke"], bob: ["Contessa", "Ambassador"] },
    });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "steal", targetId: "bob" });
    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "bob", cardIndex: 0 });

    expect(state.phase).toBe("awaiting_block");
    expect(state.pending?.awaiting).toEqual(["bob"]);

    state = ok(state, { type: "BLOCK", playerId: "bob", claim: "Ambassador" });
    state = passAll(state, "alice", "carol");

    expect(p(state, "alice").coins).toBe(2);
  });

  test("an action the actor bluffed never reaches its block window", () => {
    let state = startedGame({ hands: { alice: ["Duke", "Contessa"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "steal", targetId: "bob" });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "alice", cardIndex: 0 });

    expect(state.phase).toBe("awaiting_action");
    expect(p(state, "bob").coins).toBe(2);
  });
});
