import { describe, expect, test } from "vitest";
import { toSnapshot } from "../src/net/snapshot.js";

/** What the Colyseus schema actually decodes to: sentinels, never null. */
const raw = (over: Record<string, unknown> = {}) => ({
  phase: "lobby",
  hostId: "",
  players: [],
  turnOrder: [],
  currentTurnIndex: 0,
  pending: undefined,
  awaitingLossFrom: "",
  exchangePlayerId: "",
  deckCount: 0,
  winnerId: "",
  timerSeconds: 0,
  deadline: 0,
  log: [],
  ...over,
});

describe("toSnapshot", () => {
  test("turns the no-timer sentinel back into null", () => {
    expect(toSnapshot(raw(), "me", "ABCDE").timerSeconds).toBeNull();
  });

  test("keeps a real timer length", () => {
    expect(toSnapshot(raw({ timerSeconds: 30 }), "me", "ABCDE").timerSeconds).toBe(30);
  });

  test("turns absent-id sentinels back into null", () => {
    const view = toSnapshot(raw(), "me", "ABCDE");

    expect(view.hostId).toBeNull();
    expect(view.winnerId).toBeNull();
    expect(view.awaitingLossFrom).toBeNull();
    expect(view.exchangePlayerId).toBeNull();
    expect(view.deadline).toBeNull();
  });

  test("keeps real ids", () => {
    const view = toSnapshot(raw({ hostId: "alice", winnerId: "bob" }), "me", "ABCDE");

    expect(view.hostId).toBe("alice");
    expect(view.winnerId).toBe("bob");
  });

  test("normalises the pending action's optional fields", () => {
    const view = toSnapshot(
      raw({
        pending: {
          actorId: "alice",
          action: "tax",
          targetId: "",
          claim: "Duke",
          blockerId: "",
          blockClaim: "",
          awaiting: ["bob"],
        },
      }),
      "me",
      "ABCDE",
    );

    expect(view.pending).toEqual({
      actorId: "alice",
      action: "tax",
      targetId: null,
      claim: "Duke",
      blockerId: null,
      blockClaim: null,
      awaiting: ["bob"],
    });
  });

  test("an absent pending action is null, not undefined", () => {
    expect(toSnapshot(raw(), "me", "ABCDE").pending).toBeNull();
  });

  test("parses the log from its wire form", () => {
    const view = toSnapshot(
      raw({ log: [JSON.stringify({ type: "eliminated", playerId: "bob" })] }),
      "me",
      "ABCDE",
    );

    expect(view.log).toEqual([{ type: "eliminated", playerId: "bob" }]);
  });

  test("carries who this client is and which room it is in", () => {
    const view = toSnapshot(raw(), "me", "ABCDE");

    expect(view.playerId).toBe("me");
    expect(view.code).toBe("ABCDE");
  });
});
