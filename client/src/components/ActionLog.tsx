import { useEffect, useRef } from "react";
import type { LogEntry } from "@coup/shared";
import { logText } from "../messages.js";

interface Props {
  log: LogEntry[];
  nameOf: (id: string | null) => string;
}

export function ActionLog({ log, nameOf }: Props) {
  const end = useRef<HTMLLIElement>(null);

  // Keep the newest line in view, without animating the scroll. Guarded because this
  // is cosmetic: an environment without scrollIntoView must not take down the board.
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "nearest" });
  }, [log.length]);

  return (
    <aside className="log">
      <h2>Log</h2>
      {log.length === 0 ? (
        <p className="faint">Nothing has happened yet.</p>
      ) : (
        <ol>
          {log.map((entry, i) => (
            <li key={i} ref={i === log.length - 1 ? end : undefined}>
              {logText(entry, nameOf)}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
