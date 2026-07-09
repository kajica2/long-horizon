import Link from "next/link";
import { listArtworks } from "@/lib/artwork-store";
import type { Artwork } from "@/lib/types";
import { UploadPanel } from "@/components/create/UploadPanel";
import { WebcamCapture } from "@/components/create/WebcamCapture";

/**
 * /create — entry point into the engine.
 *
 * Lists existing artworks grouped by source:
 *   - audio      (audio → flow field / particles)
 *   - planetary  (real-time planetary positions → cosmic filaments)
 *   - birth chart (personal natal chart → 3D wheel)
 *   - classics   (Sand Traveler, de Jong)
 */
export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ remix?: string }>;
}) {
  // Remix: fork the source artwork into a new draft
  const params = await searchParams;
  if (params.remix) {
    try {
      const { getArtwork } = await import("@/lib/artwork-store");
      const src = await getArtwork(params.remix);
      if (src) {
        const { saveArtwork } = await import("@/lib/artwork-store");
        // The linter flags Date.now() + new Date() as "impure during
        // render" — this is a server component so the page is computed
        // once per request. Side effects (saveArtwork + redirect) are
        // intentional here: remix creates a new artwork, then redirects
        // the user to the new engine URL.
        // eslint-disable-next-line react-hooks/purity
        const remixId = `remix-${src.id}-${Date.now().toString(36).slice(-6)}`;
        await saveArtwork({
          ...src,
          id: remixId,
          createdAt: new Date().toISOString(),
          creator: "anonymous",
          title: `Remix of ${src.title ?? src.id}`,
          // Action 20: remix chain ancestry — set parentId so /a/[id] can walk the chain
          parentId: src.id,
        });
        // Redirect to the new engine
        const { redirect } = await import("next/navigation");
        redirect(`/engine/${remixId}`);
      }
    } catch (e) {
      // fall through to the normal page
    }
  }

  let artworks: Artwork[] = [];
  try {
    artworks = await listArtworks({ limit: 24 });
  } catch {
    // DB not available
  }

  const audio = artworks.filter((a) => !a.planetaryDNA && !a.birthChart && !a.visualDNA);
  const planetary = artworks.filter((a) => a.planetaryDNA && !a.birthChart);
  const visual = artworks.filter((a) => a.visualDNA);
  const birthCharts = artworks.filter((a) => a.birthChart);
  const classics = artworks.filter(
    (a) => a.shaderGraph.system === "sandTraveler" || a.shaderGraph.system === "deJongAttractor",
  );

  return (
    <main className="relative min-h-screen bg-aurora">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <header className="mb-16 flex items-center justify-between">
          <Link
            href="/"
            className="text-xs tracking-[0.3em] uppercase text-foreground-muted transition-base hover:text-foreground"
          >
            ← Back
          </Link>
          <Link
            href="/gallery"
            className="text-xs tracking-[0.3em] uppercase text-foreground-muted transition-base hover:text-foreground"
          >
            Gallery →
          </Link>
        </header>

        <div className="mb-12">
          <p className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            Step 01
          </p>
          <h1 className="mb-3 text-4xl font-light tracking-tight">
            Pick a starting point
          </h1>
          <p className="max-w-xl text-sm text-foreground-muted">
            Each piece below is a seeded living artwork. Open one to step inside.
          </p>
        </div>

        {birthCharts.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
              Birth charts — 3D wheel
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {birthCharts.map((artwork) => (
                <ArtworkCard key={artwork.id} artwork={artwork} badge="birth" />
              ))}
            </div>
          </section>
        )}

        {planetary.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
              From real-time planetary positions
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {planetary.map((artwork) => (
                <ArtworkCard key={artwork.id} artwork={artwork} badge="planetary" />
              ))}
            </div>
          </section>
        )}

        {classics.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
              Generative classics
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {classics.map((artwork) => (
                <ArtworkCard key={artwork.id} artwork={artwork} badge="classic" />
              ))}
            </div>
          </section>
        )}

        {audio.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
              From audio
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {audio.map((artwork) => (
                <ArtworkCard key={artwork.id} artwork={artwork} badge="audio" />
              ))}
            </div>
          </section>
        )}

        {visual.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-xs tracking-[0.3em] uppercase text-foreground-subtle">
              From image — VisualDNA
            </h2>
            <div className="grid gap-6 md:grid-cols-3">
              {visual.map((artwork) => (
                <ArtworkCard key={artwork.id} artwork={artwork} badge="visual" />
              ))}
            </div>
          </section>
        )}

        <div className="mb-12">
          <UploadPanel />
        </div>

        <div className="mb-12">
          <WebcamCapture />
        </div>
      </div>
    </main>
  );
}

function ArtworkCard({
  artwork,
  badge,
}: {
  artwork: Artwork;
  badge: "audio" | "planetary" | "birth" | "classic" | "visual";
}) {
  let subtitle: string;
  let systemLabel: string;
  if (badge === "birth" && artwork.birthChart && artwork.birthLocation) {
    subtitle = artwork.birthLocation.label;
    systemLabel = "wheel";
  } else if (badge === "planetary" && artwork.planetaryDNA) {
    subtitle = `${artwork.planetaryDNA.dominantElement} dominant · ${artwork.planetaryDNA.aspectCount} aspects`;
    systemLabel = "filaments";
  } else if (badge === "visual" && artwork.visualDNA) {
    const dna = artwork.visualDNA;
    subtitle = `${dna.palette[0]} ${dna.palette[1]} ${dna.palette[2]} · warmth ${(dna.warmth * 100).toFixed(0)}%`;
    systemLabel = "particles";
  } else if (badge === "classic") {
    subtitle = "Tarbell 2004";
    systemLabel = artwork.shaderGraph.system === "sandTraveler" ? "sand" : "de Jong";
  } else {
    subtitle = `${Math.round(artwork.audioDNA.tempo)} BPM · ${artwork.audioDNA.key} ${artwork.audioDNA.mode === "minor" ? "m" : ""}`;
    systemLabel = "particles";
  }

  return (
    <Link
      href={`/engine/${artwork.id}`}
      className="group glass block overflow-hidden rounded-2xl transition-base hover:border-border-strong hover:bg-background-glass-hover"
    >
      {artwork.visualDNA ? (
        <div className="aspect-video bg-background-elevated flex">
          {artwork.visualDNA.palette.map((hex, i) => (
            <div key={i} className="flex-1" style={{ background: hex }} />
          ))}
        </div>
      ) : (
        <div className="aspect-video bg-background-elevated" />
      )}
      <div className="p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs tracking-[0.3em] uppercase text-foreground-subtle">
            {badge}
          </p>
          <p className="font-mono text-[10px] text-foreground-subtle">
            {systemLabel}
          </p>
        </div>
        <p className="mb-1 text-lg text-foreground">{artwork.title ?? artwork.id}</p>
        <p className="text-sm text-foreground-muted">{subtitle}</p>
        <p className="mt-4 text-xs text-foreground-subtle transition-base group-hover:text-foreground-muted">
          Open artwork →
        </p>
      </div>
    </Link>
  );
}