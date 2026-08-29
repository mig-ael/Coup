import { useState } from "react";
import type { ActionType, Card } from "@coup/shared";
import { ActionLog } from "../components/ActionLog.js";
import { CardFace } from "../components/CardFace.js";
import { ActionsModal } from "../components/ActionsModal.js";
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
  // The actions reference is reachable at any point: from the header, or by tapping
  // any card on the table.
  const [referenceOpen, setReferenceOpen] = useState(false);
  const openReference = () => setReferenceOpen(true);
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
        <div className="row" style={{ alignItems: "center" }}>
          <span className="muted">
            {over ? `${nameOf(view.winnerId)} wins` : `${nameOf(turnId)}'s turn`}
          </span>
          <button onClick={openReference}>Actions</button>
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
              onInspect={() => openReference()}
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
          <section className="your-hand">
            <p className="section-label">Your influence</p>
            {hand.length === 0 ? (
              <p className="faint">You have no influence left.</p>
            ) : (
              <div className="hand">
                {hand.map((card, i) => (
                  <CardFace key={i} card={card} actionLabel="What it does" onClick={openReference} />
                ))}
              </div>
            )}
          </section>
        )}

        {error && <p className="error">{errorText(error)}</p>}
      </main>

      <ActionLog log={view.log} nameOf={nameOf} />

      {referenceOpen && <ActionsModal onClose={() => setReferenceOpen(false)} />}
    </div>
  );
}
