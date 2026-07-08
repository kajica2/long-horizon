import Link from "next/link";
import type { ReactNode } from "react";

/**
 * PageShell — the consistent frame around every page.
 * Used by landing, create flow, and shareable artwork pages.
 */
export function PageShell({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "full-bleed";
}) {
  return (
    <div className="relative min-h-screen bg-aurora">
      {variant === "full-bleed" ? (
        children
      ) : (
        <div className="relative mx-auto max-w-6xl px-6 py-12">{children}</div>
      )}
    </div>
  );
}

export function TopNav() {
  return (
    <nav className="flex items-center justify-between">
      <Link
        href="/"
        className="text-sm tracking-widest uppercase text-foreground-muted transition-base hover:text-foreground"
      >
        BeatRender Genesis
      </Link>
      <div className="flex items-center gap-6 text-sm">
        <Link
          href="/create"
          className="rounded-full border border-border bg-background-glass px-5 py-2 text-foreground transition-base hover:border-border-strong hover:bg-background-glass-hover"
        >
          Create
        </Link>
      </div>
    </nav>
  );
}