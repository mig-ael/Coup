import type {
  ActionType,
  Card,
  LogEntry,
  Phase,
  PublicPendingView,
  PublicView,
  TimerSetting,
} from "@coup/shared";

export type Snapshot = PublicView & { playerId: string; code: string };

/**
 * The wire shape. Schema fields cannot hold null, so the server writes sentinels:
 * an empty string for an absent id, zero for "no timer" and "no deadline".
 */
interface RawPlayer {
  id: string;
  name: string;
  coins: number;
  influenceCount: number;
  revealed: string[];
  eliminated: boolean;
  connected: boolean;
}

interface RawPending {
  actorId: string;
  action: string;
  targetId: string;
  claim: string;
  blockerId: string;
  blockClaim: string;
  awaiting: string[];
}

interface RawState {
  phase: string;
  hostId: string;
  players?: RawPlayer[];
  turnOrder?: string[];
  currentTurnIndex: number;
  pending?: RawPending;
  awaitingLossFrom: string;
  exchangePlayerId: string;
  deckCount: number;
  winnerId: string;
  timerSeconds: number;
  deadline: number;
  log?: string[];
}

/**
 * Rebuilds a `PublicView` from what the schema decodes to.
 *
 * Left as-is those sentinels leak into the UI and quietly break comparisons: `null
 * === 0` is false, so the "None" timer option never looks selected. Converting once,
 * here, keeps every consumer working in the shared types rather than against wire
 * artefacts.
 */
export function toSnapshot(raw: unknown, playerId: string, code: string): Snapshot {
  const state = raw as RawState;

  return {
    phase: state.phase as Phase,
    hostId: orNull(state.hostId),
    players: (state.players ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      coins: p.coins,
      influenceCount: p.influenceCount,
      revealed: [...(p.revealed ?? [])] as Card[],
      eliminated: p.eliminated,
      connected: p.connected,
    })),
    turnOrder: [...(state.turnOrder ?? [])],
    currentTurnIndex: state.currentTurnIndex,
    pending: toPending(state.pending),
    awaitingLossFrom: orNull(state.awaitingLossFrom),
    exchangePlayerId: orNull(state.exchangePlayerId),
    deckCount: state.deckCount,
    winnerId: orNull(state.winnerId),
    timerSeconds: (state.timerSeconds || null) as TimerSetting,
    deadline: state.deadline || null,
    log: [...(state.log ?? [])].map((entry) => JSON.parse(entry) as LogEntry),
    playerId,
    code,
  };
}

/** An empty string means "nobody"; anything else is a real id. */
function orNull(value: string | undefined): string | null {
  return value ? value : null;
}

function toPending(raw: RawPending | undefined): PublicPendingView | null {
  if (!raw) return null;

  return {
    actorId: raw.actorId,
    action: raw.action as ActionType,
    targetId: orNull(raw.targetId),
    claim: (raw.claim || null) as Card | null,
    blockerId: orNull(raw.blockerId),
    blockClaim: (raw.blockClaim || null) as Card | null,
    awaiting: [...(raw.awaiting ?? [])],
  };
}
