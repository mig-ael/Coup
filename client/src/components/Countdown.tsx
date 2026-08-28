import { useEffect, useState } from "react";

/** Seconds left on the open window, or nothing when the host chose no timer. */
export function Countdown({ deadline }: { deadline: number | null }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;

  const left = Math.max(0, Math.ceil((deadline - now) / 1000));
  return <span className="deadline">{left}s</span>;
}
