import { schema, t } from "@colyseus/schema";
import type { PublicView } from "@coup/shared";

/**
 * The synchronised room state. It mirrors `PublicView` exactly and holds nothing
 * else — no hands, no court deck. A player's own cards travel to that player alone
 * as a `hand` message, so hidden information cannot leak through state sync even if
 * a client inspects every byte it receives.
 */
export const PlayerSchema = schema({
  id: t.string(),
  name: t.string(),
  coins: t.number(),
  influenceCount: t.number(),
  revealed: t.array("string"),
  eliminated: t.boolean(),
  connected: t.boolean(),
});

export const PendingSchema = schema({
  actorId: t.string(),
  action: t.string(),
  targetId: t.string(),
  claim: t.string(),
  blockerId: t.string(),
  blockClaim: t.string(),
  awaiting: t.array("string"),
});

export const CoupState = schema({
  phase: t.string(),
  hostId: t.string(),
  players: t.array(PlayerSchema),
  turnOrder: t.array("string"),
  currentTurnIndex: t.number(),
  /** Present only while an action is in its response windows. */
  pending: t.ref(PendingSchema).optional(),
  awaitingLossFrom: t.string(),
  exchangePlayerId: t.string(),
  deckCount: t.number(),
  winnerId: t.string(),
  timerSeconds: t.number(),
  deadline: t.number(),
  /**
   * Log entries as JSON, one per event. The entry union is wide and append-only, so
   * carrying it as text keeps a single typed shape (`LogEntry`) across the wire
   * rather than flattening ten variants into one schema of optional fields.
   */
  log: t.array("string"),
});

export type CoupStateInstance = InstanceType<typeof CoupState>;

/** Copies a projected view onto the schema, mutating in place so Colyseus can diff it. */
export function syncState(state: CoupStateInstance, view: PublicView): void {
  state.phase = view.phase;
  state.hostId = view.hostId ?? "";
  state.currentTurnIndex = view.currentTurnIndex;
  state.awaitingLossFrom = view.awaitingLossFrom ?? "";
  state.exchangePlayerId = view.exchangePlayerId ?? "";
  state.deckCount = view.deckCount;
  state.winnerId = view.winnerId ?? "";
  state.timerSeconds = view.timerSeconds ?? 0;
  state.deadline = view.deadline ?? 0;

  syncStrings(state.turnOrder, view.turnOrder);
  syncPlayers(state, view);
  syncPending(state, view);

  // The log only ever grows within a game, and is emptied wholesale on a rematch.
  if (view.log.length < state.log.length) state.log.splice(0);
  for (let i = state.log.length; i < view.log.length; i++) {
    state.log.push(JSON.stringify(view.log[i]));
  }
}

function syncPlayers(state: CoupStateInstance, view: PublicView): void {
  if (state.players.length > view.players.length) {
    state.players.splice(view.players.length);
  }

  view.players.forEach((source, i) => {
    let player = state.players[i];
    if (!player) {
      player = new PlayerSchema();
      state.players.push(player);
    }

    player.id = source.id;
    player.name = source.name;
    player.coins = source.coins;
    player.influenceCount = source.influenceCount;
    player.eliminated = source.eliminated;
    player.connected = source.connected;
    syncStrings(player.revealed, source.revealed);
  });
}

function syncPending(state: CoupStateInstance, view: PublicView): void {
  if (!view.pending) {
    state.pending = undefined;
    return;
  }

  const pending = state.pending ?? new PendingSchema();
  pending.actorId = view.pending.actorId;
  pending.action = view.pending.action;
  pending.targetId = view.pending.targetId ?? "";
  pending.claim = view.pending.claim ?? "";
  pending.blockerId = view.pending.blockerId ?? "";
  pending.blockClaim = view.pending.blockClaim ?? "";
  syncStrings(pending.awaiting, view.pending.awaiting);
  state.pending = pending;
}

function syncStrings(target: { length: number; push: (v: string) => void; splice: (i: number, n?: number) => unknown; [i: number]: string }, source: readonly string[]): void {
  if (target.length > source.length) target.splice(source.length);
  source.forEach((value, i) => {
    if (i >= target.length) target.push(value);
    else if (target[i] !== value) target[i] = value;
  });
}
