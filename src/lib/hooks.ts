"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Current timestamp, ticking at `tickMs`. Pauses while the tab is hidden.
 */
export function useNow(tickMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let intervalId: number | null = null;

    const start = () => {
      if (intervalId === null) {
        intervalId = window.setInterval(() => setNow(Date.now()), tickMs);
      }
    };
    const stop = () => {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        setNow(Date.now()); // catch up immediately on return
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [tickMs]);

  return now;
}

/**
 * Copy text to the clipboard with a transient "copied" flag.
 */
export function useCopyToClipboard(): {
  copied: boolean;
  copy: (text: string) => Promise<void>;
} {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setCopied(false);
        timeoutRef.current = null;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  return { copied, copy };
}
