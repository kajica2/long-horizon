"use client";

/**
 * HeartButton — Stage 19 reactions on /a/[id] pages.
 *
 * Anonymous by default: a session id is generated client-side on first visit
 * and persisted in localStorage. The same id is sent with each toggle so the
 * server can enforce one-reaction-per-visitor via the unique index.
 *
 * Optimistic UI: count flips immediately on click, then reconciles with the
 * server response. If the request fails, we revert.
 */

import { useEffect, useRef, useState } from "react";

const SESSION_KEY = "lh.likerId";
const KIND = "heart";

function getOrCreateSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(SESSION_KEY);
  if (!id) {
    // crypto.randomUUID is widely available; fall back if not.
    id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `anon-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    window.localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

interface HeartButtonProps {
  artworkId: string;
  initialTotal: number;
  initialHasReacted: boolean;
}

export function HeartButton({ artworkId, initialTotal, initialHasReacted }: HeartButtonProps) {
  const [sessionId, setSessionId] = useState<string>("");
  const [total, setTotal] = useState<number>(initialTotal);
  const [reacted, setReacted] = useState<boolean>(initialHasReacted);
  const [pending, setPending] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const lastRequestId = useRef(0);

  useEffect(() => {
    // Read the localStorage session id into React state on mount. This
    // can't run during render (localStorage isn't available SSR-side) and
    // is the standard "external state into React" pattern. The linter's
    // "cascading render" warning is a false positive: the effect runs
    // once on mount, setSessionId is a no-op if the value matches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSessionId(getOrCreateSessionId());
  }, []);

  async function onClick() {
    if (pending || !sessionId) return;
    const reqId = ++lastRequestId.current;
    setPending(true);
    setError(null);

    // Optimistic update
    const prevReacted = reacted;
    const prevTotal = total;
    setReacted(!prevReacted);
    setTotal(prevTotal + (prevReacted ? -1 : 1));

    try {
      const res = await fetch("/api/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ artworkId, likerId: sessionId, kind: KIND }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { reacted: boolean; total: number };
      // Discard stale responses (user double-clicked before first returned).
      if (reqId !== lastRequestId.current) return;
      setReacted(json.reacted);
      setTotal(json.total);
    } catch (e) {
      if (reqId !== lastRequestId.current) return;
      // Revert optimistic update
      setReacted(prevReacted);
      setTotal(prevTotal);
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      if (reqId === lastRequestId.current) setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending || !sessionId}
      aria-pressed={reacted}
      aria-label={reacted ? "Remove heart" : "Add heart"}
      title={error ?? (reacted ? "You reacted" : "React with a heart")}
      className={
        "group inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] tracking-[0.2em] uppercase transition-base " +
        (reacted
          ? "border-rose-400/60 bg-rose-400/10 text-rose-300"
          : "border-border text-foreground-subtle hover:border-border-strong hover:text-foreground")
      }
    >
      <span
        aria-hidden
        className={
          "inline-block transition-transform duration-200 " +
          (reacted ? "scale-110 text-rose-300" : "scale-100 text-foreground-subtle group-hover:text-foreground")
        }
      >
        {reacted ? "♥" : "♡"}
      </span>
      <span className="font-mono tabular-nums">{total}</span>
    </button>
  );
}