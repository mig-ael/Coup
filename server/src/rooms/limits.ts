/**
 * Abuse limits for a server that is open to the internet with no accounts.
 *
 * None of this protects hidden information — that is enforced by the rules engine
 * and the state projection. These caps exist so that one client cannot exhaust the
 * host by creating rooms or opening connections in a loop.
 */

export interface LimitConfig {
  max: number;
  windowMs: number;
}

/** Most a single address may create in the window. Generous for a friend group. */
export const ROOM_CREATES_PER_IP: LimitConfig = { max: 10, windowMs: 60_000 };

/**
 * Connections per address. A household shares one address and reconnects on every
 * refresh, so this is set well above anything real play produces.
 */
export const CONNECTIONS_PER_IP: LimitConfig = { max: 60, windowMs: 60_000 };

/** Rooms held open at once across the whole server. */
export const MAX_CONCURRENT_ROOMS = 100;

/**
 * Counts events per key over a rolling window.
 *
 * Entries are swept whenever a call finds them expired, so the map cannot grow
 * without bound — an unbounded map keyed by remote address would itself be the
 * memory-exhaustion vector this is meant to prevent.
 */
export class SlidingWindow {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly config: LimitConfig) {}

  /** Records an event and reports whether it was within the limit. */
  tryConsume(key: string | undefined, now: number = Date.now()): boolean {
    // No address to attribute this to; a transport that cannot report one must not
    // be turned into a way of locking everyone else out of a shared bucket.
    if (!key) return true;

    this.sweep(now);

    const cutoff = now - this.config.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((at) => at > cutoff);

    if (recent.length >= this.config.max) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }

  /** Keys currently held. Exposed so the sweep can be tested rather than assumed. */
  get size(): number {
    return this.hits.size;
  }

  clear(): void {
    this.hits.clear();
  }

  private sweep(now: number): void {
    const cutoff = now - this.config.windowMs;
    for (const [key, times] of this.hits) {
      if (times.every((at) => at <= cutoff)) this.hits.delete(key);
    }
  }
}

let openRooms = 0;

export function roomOpened(): void {
  openRooms += 1;
}

export function roomClosed(): void {
  openRooms = Math.max(0, openRooms - 1);
}

export function openRoomCount(): number {
  return openRooms;
}

/** Test seam: resets the counter between cases. */
export function resetRoomCount(): void {
  openRooms = 0;
}
