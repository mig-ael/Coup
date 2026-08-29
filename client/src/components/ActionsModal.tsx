import { useEffect, useState } from "react";
import {
  ACTIONS,
  ACTION_RULES,
  CARDS,
  FORCED_COUP_THRESHOLD,
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_COINS,
  STARTING_INFLUENCE,
  characterAbilities,
  type ActionType,
} from "@coup/shared";
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

export type ReferenceTab = "actions" | "rules";

/**
 * The reference: the action table from the back of the rule card, and a short
 * refresher on how a turn plays out. Both are built from the shared rules table and
 * constants, so neither can drift from what the server enforces.
 */
export function ActionsModal({
  tab: initialTab = "actions",
  onClose,
}: {
  tab?: ReferenceTab;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<ReferenceTab>(initialTab);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Reference" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div className="tabs">
            <button
              className={tab === "actions" ? "tab tab-on" : "tab"}
              onClick={() => setTab("actions")}
            >
              Actions
            </button>
            <button
              className={tab === "rules" ? "tab tab-on" : "tab"}
              onClick={() => setTab("rules")}
            >
              Rules
            </button>
          </div>
          <button className="secondary" onClick={onClose}>
            Close
          </button>
        </div>

        {tab === "rules" ? <Rules /> : <ActionsTable />}
      </div>
    </div>
  );
}

function ActionsTable() {
  return (
    <>
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

          {/* Counteractions continue the same table rather than starting a new one. */}
          <div className="grid-section">Counteractions</div>

          {CARDS.filter((card) => characterAbilities(card).blocks.length > 0).map((card) => (
            <div key={card} className={`grid-row-group card-${CARD_CLASS[card]}`}>
              <div className="grid-cell grid-cell-title">
                <span className="chip-claim">{card}</span>
              </div>
              <div className="grid-cell grid-cell-wide">
                Blocks{" "}
                {characterAbilities(card)
                  .blocks.map((a) => label(a))
                  .join(" and ")}
              </div>
            </div>
          ))}
        </div>

      <p className="faint" style={{ marginTop: 16 }}>
        Any claimed character can be challenged. Lose a challenge and you lose an influence.
      </p>
    </>
  );
}

/** A short refresher, not the full rulebook. Figures come from the shared constants. */
function Rules() {
  return (
    <div className="rules">
      <Rule title="The goal">
        Be the last player with influence. You are out when both your cards are face up.
      </Rule>

      <Rule title="What you have">
        {STARTING_INFLUENCE} hidden character cards — your influence — and {STARTING_COINS} coins.
        Only you can see your cards. Everyone can see how many you still hold.
      </Rule>

      <Rule title="Your turn">
        Take exactly one action. Some cost coins. Holding {FORCED_COUP_THRESHOLD} or more coins,
        Coup is your only legal action.
      </Rule>

      <Rule title="Bluffing">
        You may claim any character, whether or not you hold it. Claiming is the whole game —
        nothing stops you saying you have the Duke when you do not.
      </Rule>

      <Rule title="Challenging a claim">
        Any other player may challenge a claimed character. If the claimer really holds it, the
        challenger loses an influence and the proved card is swapped for a fresh one. If they were
        bluffing, they lose an influence and the action does not happen. Coins already paid are
        not refunded.
      </Rule>

      <Rule title="Blocking">
        Some actions can be stopped by claiming a blocking character. A block is a claim like any
        other, so it can be challenged too.
      </Rule>

      <Rule title="Losing influence">
        You choose which card to give up. It turns face up for everyone to see and is out of the
        game for good.
      </Rule>

      <Rule title="In this version">
        {MIN_PLAYERS}–{MAX_PLAYERS} players. Turn order is randomised at the start. Block and
        challenge windows have no time limit unless the host sets one, and a player who
        disconnects is skipped until they return.
      </Rule>
    </div>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rule">
      <h3>{title}</h3>
      <p>{children}</p>
    </section>
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
      <div className="grid-cell grid-cell-title">
        <span className="grid-action">{label(action)}</span>
        {claim && <span className="chip-claim">{claim}</span>}
      </div>
      {/* Labels are shown only once the columns stack and the headings go away. */}
      <div className="grid-cell" data-label="Effect">
        {effect}
      </div>
      <div className="grid-cell" data-label="Cost">
        {cost > 0 ? `${cost} coins` : "—"}
      </div>
      <div className="grid-cell" data-label="Blocked by">
        {blockedBy.length === 0 ? "—" : blockedBy.join(", ")}
      </div>
    </div>
  );
}
