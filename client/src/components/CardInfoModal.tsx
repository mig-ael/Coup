import { useEffect } from "react";
import { CARDS, type Card } from "@coup/shared";
import { CARD_CLASS, characterText } from "../game/characters.js";

/** Every character and what it does. Available at any point in the game. */
export function CardInfoModal({ focus, onClose }: { focus: Card | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Characters" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Characters</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="card-reference">
          {CARDS.map((card) => (
            <CardRow key={card} card={card} highlighted={card === focus} />
          ))}
        </div>
      </div>
    </div>
  );
}

function CardRow({ card, highlighted }: { card: Card; highlighted: boolean }) {
  const { action, counteraction } = characterText(card);

  return (
    <div className={`ref-row card-${CARD_CLASS[card]}${highlighted ? " ref-row-focus" : ""}`}>
      <span className="card-name">{card}</span>
      <span className="card-rules">
        <span className="card-rule">{action ?? "No action of its own."}</span>
        <span className="card-rule card-rule-block">{counteraction ?? "Blocks nothing."}</span>
      </span>
    </div>
  );
}
