import type { PublicPlayerView } from "@coup/shared";

interface Props {
  player: PublicPlayerView;
  isYou: boolean;
  isTurn: boolean;
  isHost: boolean;
  canForfeit: boolean;
  onForfeit: () => void;
}

export function Seat({ player, isYou, isTurn, isHost, canForfeit, onForfeit }: Props) {
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
            <span key={i} className="card-tag dead">
              {card}
            </span>
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
