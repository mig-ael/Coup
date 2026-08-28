import { describe, expect, test } from "vitest";
import type { Card, Phase, PublicPendingView } from "@coup/shared";
import { derivePrompt } from "../src/game/prompt.js";
import type { Snapshot } from "../src/net/session.js";

interface Overrides {
  phase?: Phase;
  me?: string;
  coins?: Record<string, number>;
  pending?: Partial<PublicPendingView> | null;
  awaitingLossFrom?: string | null;
  exchangePlayerId?: string | null;
  influence?: Record<string, number>;
  winnerId?: string | null;
}

function view(o: Overrides = {}): Snapshot {
  const ids = ["alice", "bob", "carol"];
  return {
    phase: o.phase ?? "awaiting_action",
    hostId: "alice",
    players: ids.map((id) => ({
      id,
      name: id[0]!.toUpperCase() + id.slice(1),
      coins: o.coins?.[id] ?? 2,
      influenceCount: o.influence?.[id] ?? 2,
      revealed: [],
      eliminated: false,
      connected: true,
    })),
    turnOrder: ids,
    currentTurnIndex: 0,
    pending: o.pending === null
      ? null
      : {
          actorId: "alice",
          action: "tax",
          targetId: null,
          claim: "Duke",
          blockerId: null,
          blockClaim: null,
          awaiting: ["bob", "carol"],
          ...(o.pending ?? {}),
        },
    awaitingLossFrom: o.awaitingLossFrom ?? null,
    exchangePlayerId: o.exchangePlayerId ?? null,
    deckCount: 9,
    winnerId: o.winnerId ?? null,
    timerSeconds: null,
    deadline: null,
    log: [],
    playerId: o.me ?? "alice",
    code: "ABCDE",
  };
}

describe("derivePrompt", () => {
  test("offers the legal actions on your own turn", () => {
    const prompt = derivePrompt(view({ me: "alice" }));

    expect(prompt.kind).toBe("choose_action");
    expect(prompt.kind === "choose_action" && prompt.actions.map((a) => a.action)).toEqual([
      "income",
      "foreign_aid",
      "tax",
      "steal",
      "exchange",
    ]);
  });

  test("offers only coup when you are forced to coup", () => {
    const prompt = derivePrompt(view({ me: "alice", coins: { alice: 10 } }));

    expect(prompt.kind === "choose_action" && prompt.actions.map((a) => a.action)).toEqual(["coup"]);
  });

  test("names who you are waiting on when it is not your turn", () => {
    const prompt = derivePrompt(view({ me: "bob" }));

    expect(prompt.kind).toBe("waiting");
    expect(prompt.kind === "waiting" && prompt.message).toContain("Alice");
  });

  test("lets a responder challenge a character claim", () => {
    const prompt = derivePrompt(view({ me: "bob", phase: "awaiting_action_challenge" }));

    expect(prompt.kind).toBe("respond");
    expect(prompt.kind === "respond" && prompt.canChallenge).toBe(true);
    expect(prompt.kind === "respond" && prompt.blocks).toEqual([]);
  });

  test("the actor waits through their own challenge window", () => {
    const prompt = derivePrompt(view({ me: "alice", phase: "awaiting_action_challenge" }));

    expect(prompt.kind).toBe("waiting");
  });

  test("offers the right blocking characters to a steal target", () => {
    const prompt = derivePrompt(
      view({
        me: "bob",
        phase: "awaiting_block",
        pending: { action: "steal", targetId: "bob", claim: "Captain", awaiting: ["bob"] },
      }),
    );

    expect(prompt.kind === "respond" && prompt.blocks).toEqual<Card[]>(["Ambassador", "Captain"]);
    expect(prompt.kind === "respond" && prompt.canChallenge).toBe(false);
  });

  test("offers a Duke block against foreign aid", () => {
    const prompt = derivePrompt(
      view({
        me: "bob",
        phase: "awaiting_block",
        pending: { action: "foreign_aid", claim: null, awaiting: ["bob", "carol"] },
      }),
    );

    expect(prompt.kind === "respond" && prompt.blocks).toEqual<Card[]>(["Duke"]);
  });

  test("lets anyone challenge a block", () => {
    const prompt = derivePrompt(
      view({
        me: "alice",
        phase: "awaiting_block_challenge",
        pending: { blockerId: "bob", blockClaim: "Duke", awaiting: ["alice", "carol"] },
      }),
    );

    expect(prompt.kind === "respond" && prompt.canChallenge).toBe(true);
    expect(prompt.kind === "respond" && prompt.blocks).toEqual([]);
  });

  test("a player already passed is left waiting", () => {
    const prompt = derivePrompt(
      view({ me: "bob", phase: "awaiting_action_challenge", pending: { awaiting: ["carol"] } }),
    );

    expect(prompt.kind).toBe("waiting");
  });

  test("asks you which influence to give up", () => {
    const prompt = derivePrompt(
      view({ me: "bob", phase: "awaiting_influence_loss", awaitingLossFrom: "bob" }),
    );

    expect(prompt.kind).toBe("lose_influence");
  });

  test("names whose card the table is waiting on", () => {
    const prompt = derivePrompt(
      view({ me: "alice", phase: "awaiting_influence_loss", awaitingLossFrom: "bob" }),
    );

    expect(prompt.kind).toBe("waiting");
    expect(prompt.kind === "waiting" && prompt.message).toContain("Bob");
  });

  test("asks the exchanging player to keep the right number of cards", () => {
    const prompt = derivePrompt(
      view({
        me: "alice",
        phase: "awaiting_exchange",
        exchangePlayerId: "alice",
        influence: { alice: 1 },
      }),
    );

    expect(prompt.kind).toBe("exchange");
    expect(prompt.kind === "exchange" && prompt.keepCount).toBe(1);
  });

  test("reports the winner once the game is over", () => {
    const prompt = derivePrompt(view({ me: "bob", phase: "game_over", winnerId: "alice" }));

    expect(prompt.kind).toBe("game_over");
  });

  test("says nothing to do while still in the lobby", () => {
    const prompt = derivePrompt(view({ me: "alice", phase: "lobby" }));

    expect(prompt.kind).toBe("lobby");
  });
});
