import { Client, type Room } from "@colyseus/sdk";
import { ROOM_NAME, type Card, type ClientMessages } from "@coup/shared";
import { toSnapshot, type Snapshot } from "./snapshot.js";

const RECONNECT_KEY = "coup.reconnection";

/** How long to wait for a clean disconnect before abandoning it. */
const LEAVE_TIMEOUT_MS = 1000;

export type { Snapshot };

export interface SessionHandlers {
  onState: (snapshot: Snapshot) => void;
  onHand: (cards: Card[]) => void;
  onError: (code: string) => void;
  onLeave: (code: number) => void;
}

/**
 * Owns the connection and translates between the wire and plain React-friendly data.
 *
 * The room's synced state is converted to a plain snapshot on every change: the
 * objects Colyseus hands back are mutated in place, so React would not see them as
 * new. Copying is cheap here — six players and a text log.
 */
export class Session {
  private room: Room | null = null;

  constructor(
    private readonly endpoint: string,
    private readonly handlers: SessionHandlers,
  ) {}

  async host(name: string): Promise<string> {
    return this.attach(await this.client().create(ROOM_NAME, { name }));
  }

  async join(code: string, name: string): Promise<string> {
    return this.attach(await this.client().joinById(code.trim().toUpperCase(), { name }));
  }

  /** Rejoins the seat held from a previous connection, if that offer is still open. */
  async resume(): Promise<string | null> {
    const token = readToken();
    if (!token) return null;

    try {
      return this.attach(await this.client().reconnect(token));
    } catch {
      clearToken();
      return null;
    }
  }

  send<K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]): void {
    this.room?.send(type as string, payload);
  }

  async leave(): Promise<void> {
    clearToken();
    const room = this.room;
    this.room = null;
    if (!room) return;

    // A room whose socket has already gone never resolves its leave, which would
    // hang a "back to menu" click forever. Give up rather than block the UI.
    await Promise.race([
      room.leave(true).catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, LEAVE_TIMEOUT_MS)),
    ]);
  }

  private client(): Client {
    return new Client(this.endpoint);
  }

  private attach(room: Room): string {
    this.room = room;
    writeToken(room.reconnectionToken);

    room.onStateChange((state) => {
      this.handlers.onState(toSnapshot(state.toJSON(), room.sessionId, room.roomId));
    });

    room.onMessage("hand", (m: { cards: Card[] }) => this.handlers.onHand(m.cards));
    room.onMessage("error", (m: { code: string }) => this.handlers.onError(m.code));
    room.onLeave((code) => {
      clearToken();
      this.handlers.onLeave(code);
    });

    return room.roomId;
  }
}

/**
 * The token lives in sessionStorage rather than localStorage so a second tab is a
 * second player, and closing the tab forfeits the resume offer rather than leaving a
 * stale seat to reclaim.
 */
function writeToken(token: string): void {
  try {
    sessionStorage.setItem(RECONNECT_KEY, token);
  } catch {
    /* private browsing; resume is a convenience, not a requirement */
  }
}

function readToken(): string | null {
  try {
    return sessionStorage.getItem(RECONNECT_KEY);
  } catch {
    return null;
  }
}

function clearToken(): void {
  try {
    sessionStorage.removeItem(RECONNECT_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function serverEndpoint(): string {
  return import.meta.env["VITE_SERVER_URL"] ?? "ws://localhost:2567";
}
