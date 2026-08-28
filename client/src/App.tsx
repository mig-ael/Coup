import type { ActionType, Card, TimerSetting } from "@coup/shared";
import { Game } from "./screens/Game.js";
import { Landing } from "./screens/Landing.js";
import { Lobby } from "./screens/Lobby.js";
import { useSession } from "./useSession.js";

export function App() {
  const session = useSession();
  const { view, status } = session;

  if (!view) {
    return (
      <Landing
        busy={status === "connecting"}
        error={session.error}
        onHost={(name) => void session.host(name)}
        onJoin={(code, name) => void session.join(code, name)}
      />
    );
  }

  if (view.phase === "lobby") {
    return (
      <Lobby
        view={view}
        error={session.error}
        onSetTimer={(timerSeconds: TimerSetting) => session.send("set_config", { timerSeconds })}
        onStart={() => session.send("start_game", {})}
        onLeave={() => void session.leave()}
      />
    );
  }

  return (
    <Game
      view={view}
      hand={session.hand}
      error={session.error}
      onAction={(action: ActionType, targetId?: string) =>
        session.send("action", targetId === undefined ? { action } : { action, targetId })
      }
      onChallenge={() => session.send("challenge", {})}
      onBlock={(claim: Card) => session.send("block", { claim })}
      onPass={() => session.send("pass", {})}
      onLose={(cardIndex: number) => session.send("lose_influence", { cardIndex })}
      onKeep={(keepIndices: number[]) => session.send("exchange_keep", { keepIndices })}
      onForfeit={(playerId: string) => session.send("forfeit", { playerId })}
      onRestart={() => session.send("restart", {})}
      onLeave={() => void session.leave()}
    />
  );
}
