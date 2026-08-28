import { describe, expect, test } from "vitest";
import { ok, startedGame, passAll } from "../helpers.js";
import type { GameState } from "../../src/game/types.js";

/** The log with the setup entry dropped, so tests read from the first real move. */
const moves = (state: GameState) => state.log.filter((e) => e.type !== "game_started");

describe("the action log", () => {
  test("records a declared action and its outcome", () => {
    let state = startedGame({});

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "income" });

    expect(moves(state)).toEqual([
      { type: "action", actorId: "alice", action: "income", targetId: null },
      { type: "action_resolved", actorId: "alice", action: "income" },
    ]);
  });

  test("names the target of a targeted action", () => {
    let state = startedGame({ coins: { alice: 7 } });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    expect(moves(state)[0]).toEqual({
      type: "action",
      actorId: "alice",
      action: "coup",
      targetId: "bob",
    });
  });

  test("accumulates across turns", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "income" });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "bob", action: "income" });

    expect(state.log.filter((e) => e.type === "action")).toHaveLength(2);
  });

  test("records a proved challenge and who paid for it", () => {
    let state = startedGame({ hands: { alice: ["Duke", "Captain"], bob: ["Contessa", "Ambassador"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "bob", cardIndex: 0 });

    expect(state.log).toContainEqual({
      type: "challenge",
      challengerId: "bob",
      claimantId: "alice",
      claim: "Duke",
      proved: true,
    });
    expect(state.log).toContainEqual({
      type: "influence_lost",
      playerId: "bob",
      card: "Contessa",
      reason: "failed_challenge",
    });
  });

  test("records a caught bluff and the action failing", () => {
    let state = startedGame({ hands: { alice: ["Captain", "Contessa"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });
    state = ok(state, { type: "LOSE_INFLUENCE", playerId: "alice", cardIndex: 0 });

    expect(state.log).toContainEqual({
      type: "challenge",
      challengerId: "bob",
      claimantId: "alice",
      claim: "Duke",
      proved: false,
    });
    expect(state.log).toContainEqual({
      type: "action_failed",
      actorId: "alice",
      action: "tax",
      cause: "challenge",
    });
  });

  test("records a block and the action it stopped", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });
    state = ok(state, { type: "BLOCK", playerId: "bob", claim: "Duke" });

    state = passAll(state, "alice", "carol");

    expect(state.log).toContainEqual({ type: "block", blockerId: "bob", claim: "Duke" });
    expect(state.log).toContainEqual({
      type: "action_failed",
      actorId: "alice",
      action: "foreign_aid",
      cause: "block",
    });
  });

  test("records elimination and the winner", () => {
    let state = startedGame({
      players: ["Alice", "Bob"],
      coins: { alice: 7 },
      hands: { bob: ["Duke"] },
    });

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    expect(state.log).toContainEqual({ type: "eliminated", playerId: "bob" });
    expect(state.log).toContainEqual({ type: "game_over", winnerId: "alice" });
  });

  test("records a forfeit", () => {
    let state = startedGame({});
    state = ok(state, { type: "SET_CONNECTED", playerId: "bob", connected: false });

    state = ok(state, { type: "FORFEIT", playerId: "bob", byId: "alice" });

    expect(state.log).toContainEqual({ type: "forfeited", playerId: "bob" });
  });

  test("says nothing about the card drawn to replace a proved one", () => {
    let state = startedGame({ hands: { alice: ["Duke", "Captain"] } });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    state = ok(state, { type: "CHALLENGE", playerId: "bob" });

    const revealed = state.log.filter((e) => e.type === "influence_lost").map((e) => e.card);
    expect(revealed).not.toContain("Duke");
  });

  test("a rematch starts from an empty log", () => {
    let state = startedGame({
      players: ["Alice", "Bob"],
      coins: { alice: 7 },
      hands: { bob: ["Duke"] },
    });
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "coup", targetId: "bob" });

    state = ok(state, { type: "RESTART", playerId: "alice" });

    expect(state.log).toEqual([]);
  });
});
