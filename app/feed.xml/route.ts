/**
 * /feed.xml — Stage 23 RSS/Atom feed.
 *
 * Atom 1.0 feed exposing the latest artworks. The companion site
 * (Long Horizon public site) can subscribe to this to learn about
 * new pieces as they're seeded.
 *
 * Server-rendered as application/atom+xml. Most-recent-first.
 * Limited to the last 50 artworks to keep the feed a sane size.
 *
 * Content-Type is set explicitly because Next.js defaults to text/html.
 */

import { listArtworks } from "@/lib/artwork-store";
import { artworkHash } from "@/lib/hash";
import type { Artwork } from "@/lib/types";

export const dynamic = "force-dynamic";

const FEED_TITLE = "Long Horizon — Living Art Engine";
const FEED_AUTHOR: { name: string; email: string } = {
  name: "Kai Djuric",
  email: "kai@longhorizon.com",
};
const FEED_LANG = "en";
const FEED_SITE_URL = "https://longhorizon.com";

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function feedUrl(artworkId: string): string {
  return `/a/${artworkId}`;
}

function artworkSummary(a: Artwork): string {
  const sys = a.shaderGraph.system;
  const pal = a.shaderGraph.palette;
  if (a.visualDNA) {
    return `Visual genome: ${a.visualDNA.palette.length}-color palette, edge density ${a.visualDNA.edgeDensity.toFixed(2)}, warmth ${a.visualDNA.warmth.toFixed(2)}. System: ${sys}, palette: ${pal}.`;
  }
  if (a.birthChart) {
    return `Birth chart rendered as a living system. Houses + 5 aspects. System: ${sys}, palette: ${pal}.`;
  }
  if (a.planetaryDNA) {
    const el = a.planetaryDNA.dominantElement ?? "mixed";
    return `Planetary moment captured as living strands. Dominant element: ${el}, ${a.planetaryDNA.aspectCount ?? 0} aspects. System: ${sys}, palette: ${pal}.`;
  }
  if (a.soundtrack?.url) {
    return `${Math.round(a.audioDNA.tempo)} BPM, ${a.audioDNA.key} ${a.audioDNA.mode}. Brightness ${a.audioDNA.brightness.toFixed(2)}, energy ${a.audioDNA.energy.toFixed(2)}. System: ${sys}, palette: ${pal}.`;
  }
  return `Procedural seed. No audio, no image — just the genome of pure geometry. System: ${sys}, palette: ${pal}.`;
}

export async function GET(req: Request): Promise<Response> {
  const h = req.headers;
  const host = h.get("host") ?? new URL(FEED_SITE_URL).host;
  const proto = h.get("x-forwarded-proto") ?? (h.get("host")?.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;
  const feedSelf = `${origin}/feed.xml`;

  let artworks: Artwork[] = [];
  try {
    const all = await listArtworks({ limit: 50 });
    artworks = [...all].sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  } catch {
    artworks = [];
  }

  const now = new Date().toISOString();
  const latest = artworks[0]?.createdAt ?? now;

  const entries = artworks
    .map((a) => {
      const url = `${origin}${feedUrl(a.id)}`;
      const hash = artworkHash(a);
      const summary = artworkSummary(a);
      return `    <entry>
      <title>${xmlEscape(a.title ?? a.id)}</title>
      <id>${xmlEscape(url)}</id>
      <link href="${xmlEscape(url)}" rel="alternate" type="text/html"/>
      <updated>${xmlEscape(new Date(a.createdAt).toISOString())}</updated>
      <published>${xmlEscape(new Date(a.createdAt).toISOString())}</published>
      <author>
        <name>${xmlEscape(a.creator)}</name>
      </author>
      <category term="${xmlEscape(a.shaderGraph.system)}" label="${xmlEscape(a.shaderGraph.system)}"/>
      <category term="palette-${xmlEscape(a.shaderGraph.palette)}" label="${xmlEscape(a.shaderGraph.palette)}"/>
      <summary type="text">${xmlEscape(summary)}</summary>
      <content type="text">${xmlEscape(summary)}</content>
      <lh:hash xmlns:lh="https://longhorizon.com/ns">${xmlEscape(hash)}</lh:hash>
    </entry>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:lh="https://longhorizon.com/ns">
  <title>${xmlEscape(FEED_TITLE)}</title>
  <subtitle>New artworks from the Long Horizon living art engine.</subtitle>
  <id>${xmlEscape(feedSelf)}</id>
  <link href="${xmlEscape(feedSelf)}" rel="self" type="application/atom+xml"/>
  <link href="${xmlEscape(origin)}" rel="alternate" type="text/html"/>
  <updated>${xmlEscape(latest)}</updated>
  <rights>UNLICENSED · private development</rights>
  <language>${xmlEscape(FEED_LANG)}</language>
  <author>
    <name>${xmlEscape(FEED_AUTHOR.name)}</name>
    <email>${xmlEscape(FEED_AUTHOR.email)}</email>
  </author>
  <generator uri="https://longhorizon.com" version="1.0">Long Horizon Atom generator</generator>
${entries}
</feed>
`;

  return new Response(xml, {
    headers: {
      "content-type": "application/atom+xml; charset=utf-8",
      "cache-control": "public, max-age=60, s-maxage=300",
    },
  });
}