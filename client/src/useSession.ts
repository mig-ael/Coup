import { useCallback, useEffect, useRef, useState } from "react";
import type { Card, ClientMessages } from "@coup/shared";
import { Session, serverEndpoint, type Snapshot } from "./net/session.js";

export type Status = "idle" | "connecting" | "connected";

/** The backend this build was compiled against. */
export const ENDPOINT = serverEndpoint();

export interface SessionState {
  endpoint: string;
  status: Status;
  view: Snapshot | null;
  hand: Card[];
  error: string | null;
  host: (name: string) => Promise<void>;
  join: (code: string, name: string) => Promise<void>;
  send: <K extends keyof ClientMessages>(type: K, payload: ClientMessages[K]) => void;
  leave: () => Promise<void>;
  dismissError: () => void;
}

export function useSession(): SessionState {
  const session = useRef<Session | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [view, setView] = useState<Snapshot | null>(null);
  const [hand, setHand] = useState<Card[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    session.current = null;
    setStatus("idle");
    setView(null);
    setHand([]);
  }, []);

  const connect = useCallback(
    async (open: (s: Session) => Promise<unknown>) => {
      setError(null);
      setStatus("connecting");

      const created = new Session(ENDPOINT, {
        onState: setView,
        onHand: setHand,
        onError: setError,
        onLeave: reset,
      });

      try {
        await open(created);
        session.current = created;
        setStatus("connected");
      } catch (cause) {
        reset();
        setError(describe(cause));
      }
    },
    [reset],
  );

  // Close the socket when the app goes away, so a navigation or hot reload does not
  // leave a connection behind still pushing state into a tree that no longer exists.
  useEffect(() => {
    return () => void session.current?.leave();
  }, []);

  return {
    endpoint: ENDPOINT,
    status,
    view,
    hand,
    error,
    host: useCallback((name) => connect((s) => s.host(name)), [connect]),
    join: useCallback((code, name) => connect((s) => s.join(code, name)), [connect]),
    send: useCallback((type, payload) => session.current?.send(type, payload), []),
    leave: useCallback(async () => {
      await session.current?.leave();
      reset();
    }, [reset]),
    dismissError: useCallback(() => setError(null), []),
  };
}

/** Turns a connection failure into something a player can act on. */
function describe(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);

  if (/not found|no rooms|4212|locked/i.test(message)) return "room_not_found";
  // A free-tier server that has gone to sleep looks exactly like an unreachable one.
  if (/failed to fetch|networkerror|econnrefused|enotfound|timeout|load failed/i.test(message)) {
    return "server_unreachable";
  }
  if (!message) return "could_not_connect";
  return message;
}
