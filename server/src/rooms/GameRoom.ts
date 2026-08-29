import { Room, ServerError, matchMaker, type AuthContext, type Client } from "colyseus";
import {
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  RECONNECT_GRACE_SECONDS,
  type ClientMessages,
  type JoinOptions,
} from "@coup/shared";
import { apply, createGame } from "../game/engine.js";
import { openWindowKey, privateHand, toPublicView } from "../game/project.js";
import type { Command, GameState } from "../game/types.js";
import { CoupState, syncState } from "../state/schema.js";
import { generateRoomCode } from "./roomCodes.js";
import {
  CONNECTIONS_PER_IP,
  MAX_CONCURRENT_ROOMS,
  ROOM_CREATES_PER_IP,
  SlidingWindow,
  openRoomCount,
  roomClosed,
  roomOpened,
} from "./limits.js";

/** Shared across every room: the limits are per server, not per game. */
const connectionLimit = new SlidingWindow(CONNECTIONS_PER_IP);
const createLimit = new SlidingWindow(ROOM_CREATES_PER_IP);

/**
 * Test seam. The suite opens far more rooms per minute from one address than any
 * real client would, so it clears the counters between cases rather than running
 * against limits loosened to accommodate it.
 */
export function resetAbuseLimits(): void {
  connectionLimit.clear();
  createLimit.clear();
}

/** How many times to redraw a room code before giving up on a collision. */
const CODE_ATTEMPTS = 10;

export class GameRoom extends Room {
  override state = new CoupState();

  /**
   * Full game state, including every hand and the court deck. This never leaves the
   * server: clients receive `this.state`, which is a projection of it.
   */
  private game: GameState = createGame();

  /** What each client was last told its own hand is, so we only resend on change. */
  private handsSent = new Map<string, string>();

  /** Whether this room is included in the open-room count, so disposal decrements once. */
  private counted = false;
  /** The first client through onAuth is the one that created the room. */
  private creatorSeen = false;

  private windowDeadline: number | null = null;
  private windowTimer: ReturnType<typeof setTimeout> | null = null;
  /** Which response window the running countdown belongs to. */
  private windowKey: string | null = null;

  override async onCreate(): Promise<void> {
    // Refuse before doing any work, so a flood cannot force allocation.
    if (openRoomCount() >= MAX_CONCURRENT_ROOMS) throw new ServerError(503, "server_busy");
    roomOpened();
    this.counted = true;

    this.roomId = await this.reserveRoomCode();
    this.maxClients = MAX_PLAYERS;

    // Lobbies are shared by code, never listed publicly.
    await this.setPrivate(true);

    this.handle("set_config", (playerId, m) => ({
      type: "SET_CONFIG",
      playerId,
      timerSeconds: m.timerSeconds,
    }));
    this.handle("start_game", (playerId) => ({
      type: "START_GAME",
      playerId,
      seed: (Math.random() * 0xffffffff) >>> 0,
    }));
    this.handle("action", (playerId, m) => ({
      type: "DECLARE_ACTION",
      playerId,
      action: m.action,
      ...(m.targetId === undefined ? {} : { targetId: m.targetId }),
    }));
    this.handle("block", (playerId, m) => ({ type: "BLOCK", playerId, claim: m.claim }));
    this.handle("challenge", (playerId) => ({ type: "CHALLENGE", playerId }));
    this.handle("pass", (playerId) => ({ type: "PASS", playerId }));
    this.handle("lose_influence", (playerId, m) => ({
      type: "LOSE_INFLUENCE",
      playerId,
      cardIndex: m.cardIndex,
    }));
    this.handle("exchange_keep", (playerId, m) => ({
      type: "EXCHANGE_KEEP",
      playerId,
      keepIndices: m.keepIndices,
    }));
    this.handle("forfeit", (playerId, m) => ({
      type: "FORFEIT",
      playerId: m.playerId,
      byId: playerId,
    }));
    this.handle("restart", (playerId) => ({ type: "RESTART", playerId }));

    this.sync();
  }

  /**
   * Runs before onJoin, with the caller's address resolved from proxy headers. This
   * is the only point where a connection can be turned away before it costs anything.
   */
  override onAuth(_client: Client, _options: JoinOptions, context: AuthContext): boolean {
    const ip = context.ip;

    if (!this.creatorSeen) {
      this.creatorSeen = true;
      if (!createLimit.tryConsume(ip)) throw new ServerError(429, "too_many_rooms");
    }

    if (!connectionLimit.tryConsume(ip)) throw new ServerError(429, "too_many_requests");

    return true;
  }

  override onJoin(client: Client, options: JoinOptions): void {
    // Late joins are rejected rather than seated as spectators.
    if (this.game.phase !== "lobby") throw new ServerError(409, "game_already_started");

    const name = sanitizeName(options?.name ?? "");
    if (!name) throw new ServerError(400, "invalid_name");

    const result = apply(this.game, { type: "ADD_PLAYER", playerId: client.sessionId, name });
    if (!result.ok) throw new ServerError(409, result.error);

    this.game = result.state;
    // A joining client has no cards yet; forget any cached hand so a reconnecting
    // player is always re-sent theirs rather than being told nothing changed.
    this.handsSent.delete(client.sessionId);
    this.sync();
  }

  override async onLeave(client: Client, code: number): Promise<void> {
    const playerId = client.sessionId;

    // In the lobby a departure is a real exit; mid-game the seat and cards are held.
    if (this.game.phase === "lobby") {
      this.run({ type: "REMOVE_PLAYER", playerId });
      this.handsSent.delete(playerId);
      return;
    }

    this.run({ type: "SET_CONNECTED", playerId, connected: false });

    try {
      await this.allowReconnection(client, RECONNECT_GRACE_SECONDS);
      this.handsSent.delete(playerId);
      this.run({ type: "SET_CONNECTED", playerId, connected: true });
    } catch {
      // Grace expired. The seat stays until the host forfeits them, so an eliminated
      // player is never invented by a network blip.
    }
  }

  override onDispose(): void {
    this.clearWindowTimer();
    if (this.counted) {
      roomClosed();
      this.counted = false;
    }
  }

  // ---------------------------------------------------------------- plumbing

  /** Registers a client message and the engine command it translates into. */
  private handle<K extends keyof ClientMessages>(
    type: K,
    toCommand: (playerId: string, message: ClientMessages[K]) => Command,
  ): void {
    this.onMessage(type as string, (client: Client, message: ClientMessages[K]) => {
      this.run(toCommand(client.sessionId, message ?? ({} as ClientMessages[K])), client);
    });
  }

  /** Applies a command, reporting a rejection to its sender rather than throwing. */
  private run(command: Command, client?: Client): void {
    const result = apply(this.game, command);

    if (!result.ok) {
      client?.send("error", { code: result.error });
      return;
    }

    this.game = result.state;
    this.sync();
  }

  /** Projects game state into shared state and delivers each player their own cards. */
  private sync(): void {
    this.refreshWindowTimer();
    syncState(this.state, toPublicView(this.game, { deadline: this.windowDeadline }));

    for (const client of this.clients) {
      const cards = privateHand(this.game, client.sessionId);
      const encoded = cards.join(",");
      if (this.handsSent.get(client.sessionId) === encoded) continue;

      this.handsSent.set(client.sessionId, encoded);
      client.send("hand", { cards });
    }
  }

  /**
   * Runs the optional block/challenge clock. With no timer configured a window stays
   * open until every eligible player has passed, which is the default.
   */
  private refreshWindowTimer(): void {
    const seconds = this.game.config.timerSeconds;
    const key = openWindowKey(this.game);

    if (key === null || seconds === null) {
      this.clearWindowTimer();
      return;
    }

    // Passing keeps the same window, so its clock keeps running. Moving to the next
    // window starts a fresh one rather than inheriting the remainder of the last.
    if (key === this.windowKey) return;

    this.clearWindowTimer();
    this.windowKey = key;
    this.windowDeadline = Date.now() + seconds * 1000;
    this.windowTimer = setTimeout(() => {
      this.windowTimer = null;
      this.windowKey = null;
      this.run({ type: "TIMEOUT" });
    }, seconds * 1000);
  }

  private clearWindowTimer(): void {
    if (this.windowTimer) clearTimeout(this.windowTimer);
    this.windowTimer = null;
    this.windowDeadline = null;
    this.windowKey = null;
  }

  /** Claims a short code as this room's id, redrawing if one is somehow already taken. */
  private async reserveRoomCode(): Promise<string> {
    for (let attempt = 0; attempt < CODE_ATTEMPTS; attempt++) {
      const code = generateRoomCode();
      const taken = await matchMaker.query({ roomId: code });
      if (taken.length === 0) return code;
    }
    throw new ServerError(500, "could_not_allocate_room_code");
  }
}

/** Collapses whitespace and caps length. Two players may share a name; ids keep them apart. */
export function sanitizeName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
}
