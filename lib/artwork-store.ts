/**
 * Artwork store — Stage 1.
 *
 * Backed by Prisma + SQLite (dev) / Postgres (prod).
 * Same conceptual interface as the Stage 0 in-memory version, but async.
 *
 * Storage shape: the Artwork record's `soundtrack`, `audioDNA`, `planetaryDNA`,
 * `birthChart`, `birthLocation`, and `shaderGraph` fields are stored as
 * canonical-JSON strings in the DB and (de)serialized through the typed
 * accessors below.
 */

import { prisma } from "./db";
import {
  type Artwork,
  type Soundtrack,
  type AudioDNA,
  type PlanetaryDNA,
  type BirthChart,
  type BirthLocation,
  type ShaderGraph,
} from "./types";
import { canonicalJson } from "./hash";

function rowToArtwork(row: {
  id: string;
  seed: string;
  soundtrack: string;
  audioDNA: string;
  planetaryDNA: string | null;
  birthChart: string | null;
  birthLocation: string | null;
  shaderGraph: string;
  createdAt: Date;
  creator: string;
  title: string | null;
}): Artwork {
  return {
    id: row.id,
    seed: row.seed,
    soundtrack: JSON.parse(row.soundtrack) as Soundtrack,
    audioDNA: JSON.parse(row.audioDNA) as AudioDNA,
    planetaryDNA: row.planetaryDNA
      ? (JSON.parse(row.planetaryDNA) as PlanetaryDNA)
      : undefined,
    birthChart: row.birthChart
      ? (JSON.parse(row.birthChart) as BirthChart)
      : undefined,
    birthLocation: row.birthLocation
      ? (JSON.parse(row.birthLocation) as BirthLocation)
      : undefined,
    shaderGraph: JSON.parse(row.shaderGraph) as ShaderGraph,
    createdAt: row.createdAt.toISOString(),
    creator: row.creator,
    title: row.title ?? undefined,
  };
}

export async function saveArtwork(artwork: Artwork): Promise<void> {
  await prisma.artwork.upsert({
    where: { id: artwork.id },
    create: {
      id: artwork.id,
      seed: artwork.seed,
      soundtrack: canonicalJson(artwork.soundtrack),
      audioDNA: canonicalJson(artwork.audioDNA),
      planetaryDNA: artwork.planetaryDNA
        ? canonicalJson(artwork.planetaryDNA)
        : null,
      birthChart: artwork.birthChart
        ? canonicalJson(artwork.birthChart)
        : null,
      birthLocation: artwork.birthLocation
        ? canonicalJson(artwork.birthLocation)
        : null,
      shaderGraph: canonicalJson(artwork.shaderGraph),
      createdAt: new Date(artwork.createdAt),
      creator: artwork.creator,
      title: artwork.title ?? null,
    },
    update: {
      seed: artwork.seed,
      soundtrack: canonicalJson(artwork.soundtrack),
      audioDNA: canonicalJson(artwork.audioDNA),
      planetaryDNA: artwork.planetaryDNA
        ? canonicalJson(artwork.planetaryDNA)
        : null,
      birthChart: artwork.birthChart
        ? canonicalJson(artwork.birthChart)
        : null,
      birthLocation: artwork.birthLocation
        ? canonicalJson(artwork.birthLocation)
        : null,
      shaderGraph: canonicalJson(artwork.shaderGraph),
      title: artwork.title ?? null,
    },
  });
}

export async function getArtwork(id: string): Promise<Artwork | null> {
  const row = await prisma.artwork.findUnique({ where: { id } });
  return row ? rowToArtwork(row) : null;
}

export async function listArtworks(opts?: {
  limit?: number;
  creator?: string;
}): Promise<Artwork[]> {
  const rows = await prisma.artwork.findMany({
    take: opts?.limit ?? 50,
    where: opts?.creator ? { creator: opts.creator } : undefined,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(rowToArtwork);
}

export async function deleteArtwork(id: string): Promise<boolean> {
  try {
    await prisma.artwork.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function countArtworks(): Promise<number> {
  return prisma.artwork.count();
}