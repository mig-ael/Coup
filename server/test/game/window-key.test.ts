import { describe, expect, test } from "vitest";
import { openWindowKey } from "../../src/game/project.js";
import { ok, startedGame } from "../helpers.js";

describe("openWindowKey", () => {
  test("is null when no response window is open", () => {
    const state = startedGame({});

    expect(openWindowKey(state)).toBeNull();
  });

  test("identifies an open action-challenge window", () => {
    let state = startedGame({});

    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });

    expect(openWindowKey(state)).toBeTruthy();
  });

  test("does not change when one player passes", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });
    const before = openWindowKey(state);

    state = ok(state, { type: "PASS", playerId: "bob" });

    expect(openWindowKey(state)).toBe(before);
  });

  test("changes when the challenge window gives way to the block window", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "steal", targetId: "bob" });
    const challengeWindow = openWindowKey(state);

    state = ok(state, { type: "PASS", playerId: "bob" });
    state = ok(state, { type: "PASS", playerId: "carol" });

    expect(state.phase).toBe("awaiting_block");
    expect(openWindowKey(state)).not.toBe(challengeWindow);
  });

  test("changes when a block opens a challenge window of its own", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "foreign_aid" });
    const blockWindow = openWindowKey(state);

    state = ok(state, { type: "BLOCK", playerId: "bob", claim: "Duke" });

    expect(openWindowKey(state)).not.toBe(blockWindow);
  });

  test("is null again once the action resolves", () => {
    let state = startedGame({});
    state = ok(state, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });
    state = ok(state, { type: "PASS", playerId: "bob" });

    state = ok(state, { type: "PASS", playerId: "carol" });

    expect(openWindowKey(state)).toBeNull();
  });

  test("distinguishes two consecutive turns taking the same action", () => {
    let first = startedGame({});
    first = ok(first, { type: "DECLARE_ACTION", playerId: "alice", action: "tax" });
    const aliceWindow = openWindowKey(first);

    let second = ok(first, { type: "PASS", playerId: "bob" });
    second = ok(second, { type: "PASS", playerId: "carol" });
    second = ok(second, { type: "DECLARE_ACTION", playerId: "bob", action: "tax" });

    expect(openWindowKey(second)).not.toBe(aliceWindow);
  });
});
