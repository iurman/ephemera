import { useEffect, useState } from "react";

export function useNow(tickMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let id: number | null = null;
    let running = true;
    const tick = () => {
      setNow(Date.now());
      // slow down when tab is hidden
      const next = document.hidden ? 2000 : tickMs;
      if (running) id = window.setTimeout(tick, next);
    };
    id = window.setTimeout(tick, tickMs);
    return () => { running = false; if (id) clearTimeout(id); };
  }, [tickMs]);
  return now;
}
