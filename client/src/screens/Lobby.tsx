import { useState } from "react";
import { MIN_PLAYERS, TIMER_OPTIONS, type TimerSetting } from "@coup/shared";
import { ActionsModal, type ReferenceTab } from "../components/ActionsModal.js";
import { errorText } from "../messages.js";
import type { Snapshot } from "../net/session.js";

interface Props {
  view: Snapshot;
  error: string | null;
  onSetTimer: (seconds: TimerSetting) => void;
  onStart: () => void;
  onLeave: () => void;
}

export function Lobby({ view, error, onSetTimer, onStart, onLeave }: Props) {
  const [reference, setReference] = useState<ReferenceTab | null>(null);
  const isHost = view.hostId === view.playerId;
  const enough = view.players.length >= MIN_PLAYERS;

  return (
    <div className="centered">
      <div className="panel" style={{ maxWidth: 440 }}>
        <h1>Waiting room</h1>
        <p className="subtitle">Share this code so others can join.</p>

        <div style={{ textAlign: "center", margin: "0 0 22px" }}>
          <span className="code-chip" style={{ fontSize: 30, padding: "10px 18px" }}>
            {view.code}
          </span>
        </div>

        <p className="section-label">Players ({view.players.length}/6)</p>
        <ul className="player-list">
          {view.players.map((player) => (
            <li key={player.id}>
              <span>
                {player.name}
                {player.id === view.playerId && <span className="faint"> — you</span>}
              </span>
              {player.id === view.hostId && <span className="faint">host</span>}
            </li>
          ))}
        </ul>

        <div className="divider" />

        <p className="section-label">Block &amp; challenge timer</p>
        <div className="row">
          {TIMER_OPTIONS.map((option) => (
            <button
              key={String(option)}
              className={view.timerSeconds === option ? "primary" : ""}
              disabled={!isHost}
              onClick={() => onSetTimer(option)}
            >
              {option === null ? "None" : `${option}s`}
            </button>
          ))}
        </div>
        <p className="faint" style={{ marginTop: 8 }}>
          {view.timerSeconds === null
            ? "Windows stay open until everyone responds."
            : `Players have ${view.timerSeconds}s to block or challenge.`}
        </p>

        <div className="divider" />

        <div className="row">
          <button className="primary" disabled={!isHost || !enough} onClick={onStart} style={{ flex: 1 }}>
            {isHost ? "Start game" : "Waiting for host"}
          </button>
          <button onClick={onLeave}>Leave</button>
        </div>

        <div className="row" style={{ marginTop: 10, justifyContent: "center" }}>
          <button onClick={() => setReference("actions")}>Actions</button>
          <button onClick={() => setReference("rules")}>Rules</button>
        </div>

        {isHost && !enough && <p className="faint" style={{ marginTop: 10 }}>Need at least {MIN_PLAYERS} players.</p>}
        {error && <p className="error">{errorText(error)}</p>}
      </div>

      {reference && <ActionsModal tab={reference} onClose={() => setReference(null)} />}
    </div>
  );
}
