import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "vitest";
import type { Card } from "@coup/shared";
import appServer from "@coup/server/src/index.js";
import { resetAbuseLimits } from "@coup/server/src/rooms/GameRoom.js";
import { Session, type Snapshot } from "../src/net/session.js";

const PORT = 2591;
const ENDPOINT = `ws://localhost:${PORT}`;

beforeAll(async () => await appServer.listen(PORT));
afterAll(async () => await appServer.gracefullyShutdown(false));

// This suite creates rooms far faster than any real client would.
beforeEach(() => resetAbuseLimits());

const open: Session[] = [];
afterEach(async () => {
  await Promise.all(open.splice(0).map((s) => s.leave().catch(() => {})));
});

/** A session plus everything it has been told, so tests can assert on the wire. */
function spy() {
  const snapshots: Snapshot[] = [];
  const hands: Card[][] = [];
  const errors: string[] = [];

  const session = new Session(ENDPOINT, {
    onState: (s) => snapshots.push(s),
    onHand: (cards) => hands.push(cards),
    onError: (code) => errors.push(code),
    onLeave: () => {},
  });
  open.push(session);

  return { session, snapshots, hands, errors, latest: () => snapshots.at(-1) };
}

async function until(predicate: () => boolean, label: string, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (predicate()) return;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`timed out waiting for: ${label}`);
}

describe("connecting", () => {
  test("hosting returns a room code and a first snapshot", async () => {
    const alice = spy();

    const code = await alice.session.host("Alice");
    await until(() => alice.snapshots.length > 0, "first snapshot");

    expect(code).toHaveLength(5);
    expect(alice.latest()!.phase).toBe("lobby");
    expect(alice.latest()!.players.map((p) => p.name)).toEqual(["Alice"]);
    expect(alice.latest()!.code).toBe(code);
  });

  test("a second player joins with that code", async () => {
    const alice = spy();
    const bob = spy();
    const code = await alice.session.host("Alice");

    await bob.session.join(code, "Bob");
    await until(() => (alice.latest()?.players.length ?? 0) === 2, "both seated");

    expect(alice.latest()!.players.map((p) => p.name)).toEqual(["Alice", "Bob"]);
    expect(bob.latest()!.hostId).toBe(alice.latest()!.playerId);
  });

  test("a lowercase code still finds the room", async () => {
    const alice = spy();
    const bob = spy();
    const code = await alice.session.host("Alice");

    await bob.session.join(code.toLowerCase(), "Bob");
    await until(() => (bob.latest()?.players.length ?? 0) === 2, "joined");

    expect(bob.latest()!.players).toHaveLength(2);
  });

  test("a bad code rejects rather than hanging", async () => {
    const bob = spy();

    await expect(bob.session.join("ZZZZZ", "Bob")).rejects.toThrow();
  });

  test("the snapshot knows which player this client is", async () => {
    const alice = spy();
    const bob = spy();
    const code = await alice.session.host("Alice");
    await bob.session.join(code, "Bob");
    await until(() => (bob.latest()?.players.length ?? 0) === 2, "both seated");

    expect(alice.latest()!.playerId).not.toBe(bob.latest()!.playerId);
    expect(alice.latest()!.players.map((p) => p.id)).toContain(alice.latest()!.playerId);
  });
});

describe("playing", () => {
  const seatTwo = async () => {
    const alice = spy();
    const bob = spy();
    const code = await alice.session.host("Alice");
    await bob.session.join(code, "Bob");
    await until(() => (alice.latest()?.players.length ?? 0) === 2, "both seated");
    return { alice, bob };
  };

  test("starting the game deals each client only their own cards", async () => {
    const { alice, bob } = await seatTwo();

    alice.session.send("start_game", {});
    // The private hand message can land before the state sync, so wait for both.
    await until(
      () =>
        alice.hands.at(-1)?.length === 2 &&
        bob.hands.at(-1)?.length === 2 &&
        alice.latest()?.phase === "awaiting_action",
      "both dealt and synced",
    );

    expect(alice.hands.at(-1)).toHaveLength(2);
    expect(alice.latest()!.players.every((p) => p.influenceCount === 2)).toBe(true);
  });

  test("no opponent card appears in the snapshot a client receives", async () => {
    const { alice, bob } = await seatTwo();
    alice.session.send("start_game", {});
    await until(
      () => bob.hands.at(-1)?.length === 2 && alice.latest()?.phase === "awaiting_action",
      "dealt and synced",
    );

    const serialized = JSON.stringify(alice.latest());

    for (const card of bob.hands.at(-1)!) expect(serialized).not.toContain(card);
  });

  test("the log arrives parsed, not as raw strings", async () => {
    const { alice } = await seatTwo();

    alice.session.send("start_game", {});
    await until(() => (alice.latest()?.log.length ?? 0) > 0, "log populated");

    expect(alice.latest()!.log[0]).toMatchObject({ type: "game_started" });
  });

  test("an action taken on turn advances the game", async () => {
    const { alice, bob } = await seatTwo();
    alice.session.send("start_game", {});
    await until(() => alice.latest()?.phase === "awaiting_action", "started");

    const view = alice.latest()!;
    const actorId = view.turnOrder[view.currentTurnIndex];
    const actor = actorId === view.playerId ? alice : bob;
    actor.session.send("action", { action: "income" });
    await until(
      () => (alice.latest()?.log ?? []).some((e) => e.type === "action_resolved"),
      "income resolved",
    );

    expect(alice.latest()!.players.find((p) => p.id === actorId)!.coins).toBe(3);
  });

  test("a rejected command comes back to that client as an error", async () => {
    const { alice, bob } = await seatTwo();

    bob.session.send("start_game", {});
    await until(() => bob.errors.length > 0, "error delivered");

    expect(bob.errors).toEqual(["not_host"]);
    expect(alice.errors).toEqual([]);
  });
});
