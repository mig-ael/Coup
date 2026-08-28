import type { Card } from "@coup/shared";
import { CARD_CLASS, characterText } from "../game/characters.js";

interface Props {
  card: Card;
  /** Face-down cards you still hold read as live; lost influence is shown spent. */
  spent?: boolean;
  selected?: boolean;
  size?: "large" | "small";
  onClick?: () => void;
  actionLabel?: string;
}

/** A character card. Tapping it explains what it does. */
export function CardFace({ card, spent, selected, size = "large", onClick, actionLabel }: Props) {
  const { action, counteraction } = characterText(card);
  const classes = [
    "card",
    `card-${CARD_CLASS[card]}`,
    size === "small" ? "card-small" : "",
    spent ? "card-spent" : "",
    selected ? "card-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type="button" className={classes} onClick={onClick} aria-label={`${card}. ${actionLabel ?? "Show details"}`}>
      <span className="card-name">{card}</span>
      {size === "large" && (
        <span className="card-rules">
          {action && <span className="card-rule">{action}</span>}
          {counteraction && <span className="card-rule card-rule-block">{counteraction}</span>}
        </span>
      )}
      {actionLabel && <span className="card-cta">{actionLabel}</span>}
    </button>
  );
}
