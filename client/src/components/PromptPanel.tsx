import { useState } from "react";
import { ACTION_RULES, type ActionType, type Card } from "@coup/shared";
import type { Prompt } from "../game/prompt.js";
import { label } from "../game/prompt.js";
import type { Snapshot } from "../net/session.js";
import { CardFace } from "./CardFace.js";
import { Countdown } from "./Countdown.js";

interface Props {
  prompt: Prompt;
  view: Snapshot;
  hand: Card[];
  nameOf: (id: string | null) => string;
  onAction: (action: ActionType, targetId?: string) => void;
  onChallenge: () => void;
  onBlock: (claim: Card) => void;
  onPass: () => void;
  onLose: (cardIndex: number) => void;
  onKeep: (indices: number[]) => void;
}

export function PromptPanel(props: Props) {
  const { prompt, view, hand, nameOf } = props;

  switch (prompt.kind) {
    case "waiting":
      return (
        <div className="prompt">
          <p className="prompt-title muted">{prompt.message}</p>
        </div>
      );

    case "choose_action":
      return <ChooseAction prompt={prompt} nameOf={nameOf} onAction={props.onAction} />;

    case "respond":
      return (
        <div className="prompt">
          <p className="prompt-title">
            {prompt.message} <Countdown deadline={view.deadline} />
          </p>
          <div className="row">
            {prompt.canChallenge && (
              <button className="primary" onClick={props.onChallenge}>
                Challenge
              </button>
            )}
            {prompt.blocks.map((card) => (
              <button key={card} onClick={() => props.onBlock(card)}>
                Block with {card}
              </button>
            ))}
            <button onClick={props.onPass}>Pass</button>
          </div>
        </div>
      );

    case "lose_influence":
      return (
        <div className="prompt">
          <p className="prompt-title">Choose an influence to lose. It stays face up.</p>
          <div className="hand">
            {hand.map((card, i) => (
              <CardFace key={i} card={card} actionLabel="Reveal" onClick={() => props.onLose(i)} />
            ))}
          </div>
        </div>
      );

    case "exchange":
      return <Exchange keepCount={prompt.keepCount} hand={hand} onKeep={props.onKeep} />;

    default:
      return null;
  }
}

function ChooseAction({
  prompt,
  nameOf,
  onAction,
}: {
  prompt: Extract<Prompt, { kind: "choose_action" }>;
  nameOf: (id: string | null) => string;
  onAction: (action: ActionType, targetId?: string) => void;
}) {
  const [picking, setPicking] = useState<ActionType | null>(null);
  const chosen = prompt.actions.find((a) => a.action === picking);

  if (chosen?.targets) {
    return (
      <div className="prompt">
        <p className="prompt-title">Choose a target for {label(chosen.action)}</p>
        <div className="row">
          {chosen.targets.map((id) => (
            <button key={id} onClick={() => onAction(chosen.action, id)}>
              {nameOf(id)}
            </button>
          ))}
          <button onClick={() => setPicking(null)}>Back</button>
        </div>
      </div>
    );
  }

  return (
    <div className="prompt">
      <p className="prompt-title">Your turn — choose an action</p>
      <div className="row">
        {prompt.actions.map(({ action, targets }) => (
          <button
            key={action}
            className={action === "coup" ? "danger" : ""}
            onClick={() => (targets ? setPicking(action) : onAction(action))}
          >
            {label(action)}
            {ACTION_RULES[action].cost > 0 && (
              <span className="faint"> · {ACTION_RULES[action].cost}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Exchange({
  keepCount,
  hand,
  onKeep,
}: {
  keepCount: number;
  hand: Card[];
  onKeep: (indices: number[]) => void;
}) {
  const [picked, setPicked] = useState<number[]>([]);

  const toggle = (i: number) =>
    setPicked((current) =>
      current.includes(i) ? current.filter((n) => n !== i) : [...current, i].slice(-keepCount - 1),
    );

  return (
    <div className="prompt">
      <p className="prompt-title">
        Choose {keepCount} card{keepCount === 1 ? "" : "s"} to keep. The rest go back to the deck.
      </p>
      <div className="hand">
        {hand.map((card, i) => (
          <CardFace
            key={i}
            card={card}
            selected={picked.includes(i)}
            actionLabel={picked.includes(i) ? "Keeping" : "Keep"}
            onClick={() => toggle(i)}
          />
        ))}
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <button
          className="primary"
          disabled={picked.length !== keepCount}
          onClick={() => onKeep(picked)}
        >
          Keep {picked.length}/{keepCount}
        </button>
      </div>
    </div>
  );
}
