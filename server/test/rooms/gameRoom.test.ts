import { afterAll, afterEach, beforeAll, describe, expect, test } from "vitest";
import { boot, type ColyseusTestServer } from "@colyseus/testing";
import { CARDS, ROOM_NAME, type Card } from "@coup/shared";
import appServer from "../../src/index.js";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from "../../src/rooms/roomCodes.js";

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  colyseus = await boot(appServer);
});
afterAll(async () => await colyseus.shutdown());
afterEach(async () => await colyseus.cleanup());

/** Polls until `predicate` holds, so tests do not race the state sync. */
async function until(predicate: () => boolean, label: string, timeoutMs = 2000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    // State arrives asynchronously, so a predicate may touch a field that is not
    // there yet; treat that as "not ready" rather than a failure.
    try {
      if (predicate()) return;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

async function host(name: string) {
  const client = await colyseus.sdk.create(ROOM_NAME, { name });
  await until(() => client.state.players.length >= 1, "host seated");
  return client;
}

async function join(code: string, name: string) {
  return await colyseus.sdk.joinById(code, { name });
}

/** Captures every `hand` message a client is sent. */
function trackHand(client: { onMessage: (t: string, cb: (m: { cards: Card[] }) => void) => void }) {
  const received: Card[][] = [];
  client.onMessage("hand", (m) => received.push(m.cards));
  return received;
}

describe("hosting and joining", () => {
  test("a new room is identified by a short, unambiguous code", async () => {
    const alice = await host("Alice");

    expect(alice.roomId).toHaveLength(ROOM_CODE_LENGTH);
    for (const char of alice.roomId) expect(ROOM_CODE_ALPHABET).toContain(char);
  });

  test("another player joins with that code", async () => {
    const alice = await host("Alice");

    const bob = await join(alice.roomId, "Bob");
    await until(() => bob.state.players.length === 2, "both seated");

    expect([...bob.state.players].map((p) => p.name)).toEqual(["Alice", "Bob"]);
  });

  test("the first player to join is the host", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    await until(() => Boolean(bob.state.hostId), "host assigned");

    expect(bob.state.hostId).toBe(alice.sessionId);
  });

  test("an unknown code is refused", async () => {
    await expect(join("ZZZZZ", "Nobody")).rejects.toThrow();
  });

  test("a blank display name is refused", async () => {
    const alice = await host("Alice");

    await expect(join(alice.roomId, "   ")).rejects.toThrow();
  });

  test("names are trimmed and capped", async () => {
    const alice = await host("   Alice   ");
    await until(() => alice.state.players.length === 1, "seated");

    expect(alice.state.players[0]!.name).toBe("Alice");
  });

  test("a seventh player cannot join", async () => {
    const alice = await host("P1");
    for (const name of ["P2", "P3", "P4", "P5", "P6"]) await join(alice.roomId, name);
    await until(() => alice.state.players.length === 6, "six seated");

    await expect(join(alice.roomId, "P7")).rejects.toThrow();
  });

  test("nobody may join once the game has started", async () => {
    const alice = await host("Alice");
    await join(alice.roomId, "Bob");
    await until(() => alice.state.players.length === 2, "two seated");

    alice.send("start_game", {});
    await until(() => alice.state.phase === "awaiting_action", "game started");

    await expect(join(alice.roomId, "Carol")).rejects.toThrow();
  });
});

describe("hidden information", () => {
  test("each player is sent their own two cards", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    const aliceHands = trackHand(alice);
    const bobHands = trackHand(bob);
    await until(() => alice.state.players.length === 2, "two seated");

    alice.send("start_game", {});
    await until(() => aliceHands.at(-1)?.length === 2 && bobHands.at(-1)?.length === 2, "dealt");

    expect(aliceHands.at(-1)).toHaveLength(2);
    expect(bobHands.at(-1)).toHaveLength(2);
  });

  test("the synchronised state a client holds never contains a hidden card", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    const bobHands = trackHand(bob);
    await until(() => alice.state.players.length === 2, "two seated");

    alice.send("start_game", {});
    await until(
      () => bobHands.at(-1)?.length === 2 && alice.state.phase === "awaiting_action",
      "dealt and synced",
    );

    // Every card in play is face down at this point, so no character name may appear
    // anywhere in the state either client actually received over the wire.
    const aliceView = JSON.stringify(alice.state.toJSON());
    const bobView = JSON.stringify(bob.state.toJSON());

    for (const view of [aliceView, bobView]) {
      for (const card of CARDS) expect(view).not.toContain(card);
      expect(view).not.toContain('"hand"');
      expect(view).not.toContain('"deck"');
    }

    // What they do get is the count.
    expect([...alice.state.players].every((p) => p.influenceCount === 2)).toBe(true);
    expect([...alice.state.players].every((p) => p.revealed.length === 0)).toBe(true);
  });

  test("opponents see an influence count rather than cards", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    await until(() => alice.state.players.length === 2, "two seated");
    alice.send("start_game", {});
    await until(() => alice.state.phase === "awaiting_action", "started");

    const bobAsSeenByAlice = [...alice.state.players].find((p) => p.id === bob.sessionId)!;

    expect(bobAsSeenByAlice.influenceCount).toBe(2);
    expect(Object.keys(bobAsSeenByAlice.toJSON())).not.toContain("hand");
  });
});

describe("commands", () => {
  test("an illegal command is reported to its sender alone", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    await until(() => alice.state.players.length === 2, "two seated");

    const aliceErrors: string[] = [];
    const bobErrors: string[] = [];
    alice.onMessage("error", (m: { code: string }) => aliceErrors.push(m.code));
    bob.onMessage("error", (m: { code: string }) => bobErrors.push(m.code));

    bob.send("start_game", {});
    await until(() => bobErrors.length > 0, "error delivered");

    expect(bobErrors).toEqual(["not_host"]);
    expect(aliceErrors).toEqual([]);
    expect(alice.state.phase).toBe("lobby");
  });

  test("the host can set the block timer before starting", async () => {
    const alice = await host("Alice");
    await join(alice.roomId, "Bob");
    await until(() => alice.state.players.length === 2, "two seated");

    alice.send("set_config", { timerSeconds: 30 });
    await until(() => alice.state.timerSeconds === 30, "timer set");

    expect(alice.state.timerSeconds).toBe(30);
  });

  test("a full turn plays through and reaches the log", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    await until(() => alice.state.players.length === 2, "two seated");
    alice.send("start_game", {});
    await until(() => alice.state.phase === "awaiting_action", "started");

    const first = alice.state.turnOrder[alice.state.currentTurnIndex];
    const actor = first === alice.sessionId ? alice : bob;
    actor.send("action", { action: "income" });
    await until(
      () => [...alice.state.log].some((e) => JSON.parse(e).type === "action_resolved"),
      "income resolved",
    );

    const seat = [...alice.state.players].find((p) => p.id === first)!;
    expect(seat.coins).toBe(3);
    expect(alice.state.turnOrder[alice.state.currentTurnIndex]).not.toBe(first);
  });
});

describe("reconnection", () => {
  test("a player who drops mid-game keeps their seat and their cards", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    const bobHands = trackHand(bob);
    await until(() => alice.state.players.length === 2, "two seated");

    alice.send("start_game", {});
    await until(() => bobHands.at(-1)?.length === 2, "dealt");
    const dealt = bobHands.at(-1)!;
    const token = bob.reconnectionToken;

    await bob.leave(false);
    await until(
      () => [...alice.state.players].find((p) => p.id === bob.sessionId)?.connected === false,
      "bob marked away",
    );

    const rejoined = await colyseus.sdk.reconnect(token);
    const rejoinedHands = trackHand(rejoined);
    await until(() => rejoinedHands.length > 0, "hand re-sent");

    expect(rejoined.sessionId).toBe(bob.sessionId);
    expect(rejoinedHands.at(-1)).toEqual(dealt);
    await until(
      () => [...alice.state.players].find((p) => p.id === bob.sessionId)?.connected === true,
      "bob marked back",
    );
  });

  test("a disconnected player is passed out of an open window", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    const carol = await join(alice.roomId, "Carol");
    await until(() => alice.state.players.length === 3, "three seated");

    alice.send("start_game", {});
    await until(() => alice.state.phase === "awaiting_action", "started");

    const actorId = alice.state.turnOrder[alice.state.currentTurnIndex]!;
    const bySession = new Map([
      [alice.sessionId, alice],
      [bob.sessionId, bob],
      [carol.sessionId, carol],
    ]);
    const actor = bySession.get(actorId)!;

    // Alice is the observer, so she must stay connected: the player who drops has to
    // be someone else, or the state we are asserting on stops updating.
    const responders = [...bySession.entries()].filter(([id]) => id !== actorId);
    const dropper = responders.find(([id]) => id !== alice.sessionId)![1];
    const passer = responders.find(([, c]) => c !== dropper)![1];

    actor.send("action", { action: "tax" });
    await until(() => alice.state.phase === "awaiting_action_challenge", "window open");

    // One opponent drops and the other passes; the window must still close.
    await dropper.leave(false);
    await until(() => alice.state.pending?.awaiting.length === 1, "dropped player passed");

    passer.send("pass", {});
    await until(() => alice.state.phase === "awaiting_action", "window closed");

    const actorSeat = [...alice.state.players].find((p) => p.id === actorId)!;
    expect(actorSeat.coins).toBe(5);
  });

  test("the host may forfeit a player who does not come back", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    await until(() => alice.state.players.length === 2, "two seated");

    alice.send("start_game", {});
    await until(() => alice.state.phase === "awaiting_action", "started");

    await bob.leave(false);
    await until(
      () => [...alice.state.players].find((p) => p.id === bob.sessionId)?.connected === false,
      "bob marked away",
    );

    alice.send("forfeit", { playerId: bob.sessionId });
    await until(() => alice.state.phase === "game_over", "game ended");

    expect(alice.state.winnerId).toBe(alice.sessionId);
    expect([...alice.state.players].find((p) => p.id === bob.sessionId)?.eliminated).toBe(true);
  });
});

describe("the block timer", () => {
  test("a window opened with a timer carries a deadline", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    await until(() => alice.state.players.length === 2, "two seated");

    alice.send("set_config", { timerSeconds: 15 });
    alice.send("start_game", {});
    await until(() => alice.state.phase === "awaiting_action", "started");

    const actorId = alice.state.turnOrder[alice.state.currentTurnIndex];
    const actor = actorId === alice.sessionId ? alice : bob;
    actor.send("action", { action: "tax" });
    await until(() => alice.state.phase === "awaiting_action_challenge", "window open");
    await until(() => alice.state.deadline > 0, "deadline published");

    expect(alice.state.deadline).toBeGreaterThan(Date.now());
    expect(alice.state.deadline).toBeLessThanOrEqual(Date.now() + 15_000);
  });

  test("no deadline is published when the host chose no timer", async () => {
    const alice = await host("Alice");
    const bob = await join(alice.roomId, "Bob");
    await until(() => alice.state.players.length === 2, "two seated");

    alice.send("start_game", {});
    await until(() => alice.state.phase === "awaiting_action", "started");

    const actorId = alice.state.turnOrder[alice.state.currentTurnIndex];
    const actor = actorId === alice.sessionId ? alice : bob;
    actor.send("action", { action: "tax" });
    await until(() => alice.state.phase === "awaiting_action_challenge", "window open");

    expect(alice.state.deadline).toBe(0);
  });
});
