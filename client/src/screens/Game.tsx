import type { ActionType, Card } from "@coup/shared";
import { ActionLog } from "../components/ActionLog.js";
import { PromptPanel } from "../components/PromptPanel.js";
import { Seat } from "../components/Seat.js";
import { derivePrompt } from "../game/prompt.js";
import { errorText } from "../messages.js";
import type { Snapshot } from "../net/session.js";

interface Props {
  view: Snapshot;
  hand: Card[];
  error: string | null;
  onAction: (action: ActionType, targetId?: string) => void;
  onChallenge: () => void;
  onBlock: (claim: Card) => void;
  onPass: () => void;
  onLose: (cardIndex: number) => void;
  onKeep: (indices: number[]) => void;
  onForfeit: (playerId: string) => void;
  onRestart: () => void;
  onLeave: () => void;
}

export function Game(props: Props) {
  const { view, hand, error } = props;
  const nameOf = (id: string | null) =>
    view.players.find((p) => p.id === id)?.name ?? "another player";

  const prompt = derivePrompt(view);
  const turnId = view.turnOrder[view.currentTurnIndex] ?? null;
  const isHost = view.hostId === view.playerId;
  const over = view.phase === "game_over";

  return (
    <div className="game">
      <header className="topbar">
        <div>
          <strong>Coup</strong> <span className="code-chip">{view.code}</span>
        </div>
        <div className="muted">
          {over ? `${nameOf(view.winnerId)} wins` : `${nameOf(turnId)}'s turn`}
        </div>
      </header>

      <main className="stack" style={{ gap: 16 }}>
        <section className="seats">
          {view.players.map((player) => (
            <Seat
              key={player.id}
              player={player}
              isYou={player.id === view.playerId}
              isTurn={!over && player.id === turnId}
              isHost={player.id === view.hostId}
              // Only the host, only mid-game, and only for someone actually away.
              canForfeit={isHost && !over && !player.connected && !player.eliminated}
              onForfeit={() => props.onForfeit(player.id)}
            />
          ))}
        </section>

        {over ? (
          <div className="prompt">
            <p className="prompt-title">
              {view.winnerId === view.playerId ? "You win." : `${nameOf(view.winnerId)} wins.`}
            </p>
            <div className="row">
              {isHost && (
                <button className="primary" onClick={props.onRestart}>
                  Play again
                </button>
              )}
              <button onClick={props.onLeave}>Leave</button>
            </div>
            {!isHost && (
              <p className="faint" style={{ marginTop: 10 }}>
                Waiting for the host to start another game.
              </p>
            )}
          </div>
        ) : (
          <PromptPanel
            prompt={prompt}
            view={view}
            hand={hand}
            nameOf={nameOf}
            onAction={props.onAction}
            onChallenge={props.onChallenge}
            onBlock={props.onBlock}
            onPass={props.onPass}
            onLose={props.onLose}
            onKeep={props.onKeep}
          />
        )}

        {prompt.kind !== "lose_influence" && prompt.kind !== "exchange" && (
          <section>
            <p className="section-label">Your influence</p>
            <div className="revealed">
              {hand.length === 0 ? (
                <span className="faint">You have no influence left.</span>
              ) : (
                hand.map((card, i) => (
                  <span key={i} className="card-tag">
                    {card}
                  </span>
                ))
              )}
            </div>
          </section>
        )}

        {error && <p className="error">{errorText(error)}</p>}
      </main>

      <ActionLog log={view.log} nameOf={nameOf} />
    </div>
  );
}
