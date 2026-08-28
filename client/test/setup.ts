import WS from "ws";

/**
 * The jsdom environment exposes `localStorage` as a bare object with no methods, so
 * the Colyseus SDK's auth module throws on load. A real browser always provides a
 * working Storage; this supplies the same thing for tests.
 */
function memoryStorage(): Storage {
  const cache = new Map<string, string>();
  return {
    get length() {
      return cache.size;
    },
    clear: () => cache.clear(),
    getItem: (key: string) => cache.get(key) ?? null,
    key: (i: number) => [...cache.keys()][i] ?? null,
    removeItem: (key: string) => void cache.delete(key),
    setItem: (key: string, value: string) => void cache.set(key, String(value)),
  } as Storage;
}

for (const name of ["localStorage", "sessionStorage"] as const) {
  const existing = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
  if (typeof existing?.getItem === "function") continue;

  const value = memoryStorage();
  for (const target of [globalThis, typeof window === "undefined" ? null : window]) {
    if (target) Object.defineProperty(target, name, { value, configurable: true });
  }
}

/**
 * jsdom's WebSocket cannot carry Colyseus's binary protocol — the socket opens and is
 * dropped before any state arrives. Substitute the Node implementation, which behaves
 * like the one a real browser provides.
 */
Object.defineProperty(globalThis, "WebSocket", { value: WS, configurable: true, writable: true });
