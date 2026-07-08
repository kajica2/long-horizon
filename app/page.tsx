import Link from "next/link";

/**
 * Landing page — Stage 0 placeholder.
 *
 * Stage 10 will replace this with a fullscreen Flow Field Meditation
 * installation that the visitor is already inside.
 *
 * For now: slow typography over a soft aurora gradient.
 */
export default function Home() {
  return (
    <main className="relative min-h-screen bg-aurora">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col justify-between px-6 py-10">
        <header className="flex items-center justify-between">
          <span className="text-xs tracking-[0.3em] uppercase text-foreground-muted">
            BeatRender Genesis
          </span>
          <Link
            href="/create"
            className="rounded-full border border-border bg-background-glass px-5 py-2 text-sm text-foreground transition-base hover:border-border-strong hover:bg-background-glass-hover"
          >
            Create
          </Link>
        </header>

        <section className="max-w-3xl">
          <p className="mb-6 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            v0.1 — Stage 0 · skeleton
          </p>
          <h1 className="mb-8 text-5xl font-light leading-[1.05] tracking-tight md:text-7xl">
            Creates
            <br />
            <span className="text-foreground-muted">living artworks.</span>
          </h1>
          <p className="max-w-xl text-base leading-relaxed text-foreground-muted">
            Each piece is a unique, evolving computational system — grown from a
            seed, shaped by the audio that catalyses it, and reproducible from a
            single string.
          </p>
        </section>

        <footer className="flex items-end justify-between text-xs text-foreground-subtle">
          <div className="space-y-1">
            <p className="text-foreground-muted">Next: engine stub</p>
            <p>Particles drift through a seeded curl-noise field.</p>
          </div>
          <Link
            href="/create"
            className="group inline-flex items-center gap-2 text-foreground transition-base hover:text-foreground-muted"
          >
            <span>Step inside</span>
            <span className="transition-base group-hover:translate-x-1">→</span>
          </Link>
        </footer>
      </div>
    </main>
  );
}