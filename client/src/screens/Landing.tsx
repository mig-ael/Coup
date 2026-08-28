import { useState } from "react";
import { errorText } from "../messages.js";

interface Props {
  busy: boolean;
  error: string | null;
  onHost: (name: string) => void;
  onJoin: (code: string, name: string) => void;
}

export function Landing({ busy, error, onHost, onJoin }: Props) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");

  const named = name.trim().length > 0;

  return (
    <div className="centered">
      <div className="panel">
        <h1>Coup</h1>
        <p className="subtitle">Play a private game with friends.</p>

        <label className="field-label" htmlFor="name">
          Your name
        </label>
        <input
          id="name"
          value={name}
          maxLength={20}
          autoComplete="off"
          placeholder="e.g. Sam"
          onChange={(e) => setName(e.target.value)}
        />

        <div className="stack" style={{ marginTop: 16 }}>
          <button className="primary" disabled={!named || busy} onClick={() => onHost(name)}>
            Host a game
          </button>
        </div>

        <div className="divider" />

        <label className="field-label" htmlFor="code">
          Or join with a code
        </label>
        <div className="row">
          <input
            id="code"
            value={code}
            maxLength={5}
            autoComplete="off"
            placeholder="ABCDE"
            style={{ flex: 1, textTransform: "uppercase", letterSpacing: "0.14em" }}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && named && code.trim()) onJoin(code, name);
            }}
          />
          <button disabled={!named || code.trim().length !== 5 || busy} onClick={() => onJoin(code, name)}>
            Join
          </button>
        </div>

        {error && <p className="error">{errorText(error)}</p>}
      </div>
    </div>
  );
}
