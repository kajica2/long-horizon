"use client";

/**
 * CommentThread — action 21.
 *
 * Renders the comment list + new-comment composer for a shareable page.
 * Polls every 8s for new comments. No auth — anonymous allowed.
 */

import { useEffect, useState, useTransition } from "react";

interface Comment {
  id: string;
  artworkId: string;
  body: string;
  author: string;
  createdAt: string;
}

export function CommentThread({ artworkId }: { artworkId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function refresh(signal?: AbortSignal) {
    try {
      const r = await fetch(`/api/comments?artworkId=${encodeURIComponent(artworkId)}`, {
        signal,
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { comments: Comment[] };
      setComments(j.comments);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const ac = new AbortController();
    void refresh(ac.signal);
    const id = window.setInterval(() => startTransition(() => void refresh()), 8000);
    return () => {
      ac.abort();
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artworkId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ artworkId, body, author: author || "anonymous" }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({ message: "unknown" }));
        throw new Error(j.message ?? `HTTP ${r.status}`);
      }
      setBody("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string) {
    const ok = window.confirm("Delete this comment?");
    if (!ok) return;
    try {
      const r = await fetch(`/api/comments/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="space-y-3">
        <input
          type="text"
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="Your name (optional)"
          maxLength={60}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-aurora-cyan focus:outline-none"
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Leave a note about this piece…"
          maxLength={2000}
          rows={3}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:border-aurora-cyan focus:outline-none resize-y"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="font-mono text-[10px] text-foreground-subtle">
            {body.length}/2000
          </span>
          <button
            type="submit"
            disabled={submitting || !body.trim()}
            className="rounded-md bg-aurora-cyan/15 px-4 py-2 text-xs font-medium text-aurora-cyan transition-base hover:bg-aurora-cyan/25 disabled:opacity-50"
          >
            {submitting ? "Posting…" : "Post comment"}
          </button>
        </div>
        {error && <p className="text-xs text-aurora-pink">{error}</p>}
      </form>

      <div className="border-t border-border pt-4">
        <p className="mb-3 text-[11px] tracking-[0.3em] uppercase text-foreground-subtle">
          {loading ? "Loading…" : `${comments.length} ${comments.length === 1 ? "comment" : "comments"}`}
        </p>
        <ul className="space-y-3">
          {comments.map((c) => (
            <li
              key={c.id}
              className="rounded-md border border-border bg-background-elevated/60 p-3"
            >
              <div className="mb-1 flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-foreground">
                  {c.author}
                </span>
                <span className="font-mono text-[10px] text-foreground-subtle">
                  {new Date(c.createdAt).toISOString().slice(0, 16).replace("T", " ")}
                </span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground-muted">{c.body}</p>
              <button
                onClick={() => void remove(c.id)}
                className="mt-2 font-mono text-[10px] text-foreground-subtle hover:text-aurora-pink"
              >
                delete
              </button>
            </li>
          ))}
          {!loading && comments.length === 0 && (
            <li className="text-xs text-foreground-subtle">No comments yet — be the first.</li>
          )}
        </ul>
      </div>
    </div>
  );
}