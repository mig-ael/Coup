import { useEffect } from "react";
import { ACTIONS, ACTION_RULES, CARDS, characterAbilities, type ActionType } from "@coup/shared";
import { CARD_CLASS } from "../game/characters.js";
import { label } from "../game/prompt.js";

const EFFECT: Record<ActionType, string> = {
  income: "Take 1 coin",
  foreign_aid: "Take 2 coins",
  coup: "Choose a player to lose influence",
  tax: "Take 3 coins",
  assassinate: "Choose a player to lose influence",
  steal: "Take 2 coins from another player",
  exchange: "Draw 2, keep as many as you started with",
};

/**
 * The reference table from the back of the rule card: every action, what it costs,
 * what it does, and what stops it. Rows are built from the shared rules table, so
 * this cannot drift from what the server enforces.
 */
export function ActionsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Actions" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Actions</h2>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="grid-table">
          <div className="grid-head">Action</div>
          <div className="grid-head">Effect</div>
          <div className="grid-head">Cost</div>
          <div className="grid-head">Blocked by</div>

          {ACTIONS.map((action) => {
            const rule = ACTION_RULES[action];
            return (
              <Row key={action} action={action} claim={rule.claim} effect={EFFECT[action]} cost={rule.cost} blockedBy={rule.blockedBy} />
            );
          })}
        </div>

        <p className="section-label" style={{ marginTop: 20 }}>Counteractions</p>
        <div className="grid-table grid-table-blocks">
          <div className="grid-head">Character</div>
          <div className="grid-head">Blocks</div>

          {CARDS.filter((card) => characterAbilities(card).blocks.length > 0).map((card) => (
            <div key={card} className="grid-row-group">
              <div className={`grid-cell card-${CARD_CLASS[card]}`}>
                <span className="chip-claim">{card}</span>
              </div>
              <div className="grid-cell">
                {characterAbilities(card)
                  .blocks.map((a) => label(a))
                  .join(", ")}
              </div>
            </div>
          ))}
        </div>

        <p className="faint" style={{ marginTop: 16 }}>
          Any claimed character can be challenged. Lose a challenge and you lose an influence.
        </p>
      </div>
    </div>
  );
}

function Row({
  action,
  claim,
  effect,
  cost,
  blockedBy,
}: {
  action: ActionType;
  claim: string | null;
  effect: string;
  cost: number;
  blockedBy: readonly string[];
}) {
  return (
    <div className={`grid-row-group${claim ? ` card-${CARD_CLASS[claim as never]}` : ""}`}>
      <div className="grid-cell">
        <span className="grid-action">{label(action)}</span>
        {claim && <span className="chip-claim">{claim}</span>}
      </div>
      <div className="grid-cell">{effect}</div>
      <div className="grid-cell">{cost > 0 ? `${cost} coins` : "—"}</div>
      <div className="grid-cell">
        {blockedBy.length === 0 ? "—" : blockedBy.join(", ")}
      </div>
    </div>
  );
}
