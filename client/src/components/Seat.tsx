import type { Card, PublicPlayerView } from "@coup/shared";
import { CardFace } from "./CardFace.js";

interface Props {
  player: PublicPlayerView;
  isYou: boolean;
  isTurn: boolean;
  isHost: boolean;
  canForfeit: boolean;
  onForfeit: () => void;
  onInspect: (card: Card) => void;
}

export function Seat({ player, isYou, isTurn, isHost, canForfeit, onForfeit, onInspect }: Props) {
  const classes = ["seat", isTurn ? "active" : "", player.eliminated ? "out" : ""].join(" ").trim();

  return (
    <div className={classes}>
      <div className="seat-head">
        <span className="seat-name">
          {player.name}
          {isYou && <span className="faint"> — you</span>}
        </span>
        {isTurn && !player.eliminated && <span className="turn-tag">Their turn</span>}
        {player.eliminated && <span className="faint">out</span>}
      </div>

      <div className="seat-meta">
        <span>{player.coins} coins</span>
        <span>{player.influenceCount} influence</span>
        {isHost && <span className="faint">host</span>}
        {!player.connected && !player.eliminated && <span className="faint">away</span>}
      </div>

      {player.revealed.length > 0 && (
        <div className="revealed">
          {player.revealed.map((card, i) => (
            <CardFace key={i} card={card} size="small" spent onClick={() => onInspect(card)} />
          ))}
        </div>
      )}

      {canForfeit && (
        <div style={{ marginTop: 10 }}>
          <button className="danger" onClick={onForfeit}>
            Remove from game
          </button>
        </div>
      )}
    </div>
  );
}
