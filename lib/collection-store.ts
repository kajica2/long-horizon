/**
 * Collection store — Stage 20 of the Long Horizon roadmap.
 *
 * Curated named sets of artworks. Each Collection has a slug (URL key),
 * title, description, and a curator credit. Items are ordered via `position`.
 *
 * Lightweight admin: addOrUpdateCollection is idempotent on slug. Items are
 * upserted by (collectionId, artworkId); if an item already exists its
 * position is updated. This lets re-running a seed produce stable order.
 */

import { prisma } from "@/lib/db";
import type { Artwork } from "@/lib/types";

const SLUG_MAX = 80;
const TITLE_MAX = 200;
const DESC_MAX = 2000;
const CURATOR_MAX = 80;

export interface CollectionRecord {
  id: string;
  slug: string;
  title: string;
  description: string;
  curator: string;
  createdAt: string;
}

export interface CollectionWithItems extends CollectionRecord {
  items: Array<{ artworkId: string; position: number; artwork: Artwork | null }>;
}

export interface CollectionInput {
  slug: string;
  title: string;
  description: string;
  curator: string;
  artworkIds: string[];
}

function clamp(s: string, n: number): string {
  return s.trim().slice(0, n);
}

function slugOk(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/.test(slug);
}

export async function listCollections(): Promise<CollectionRecord[]> {
  const rows = await prisma.collection.findMany({
    orderBy: { createdAt: "desc" },
  });
  return rows.map(rowToRecord);
}

export async function getCollectionBySlug(slug: string): Promise<CollectionWithItems | null> {
  const row = await prisma.collection.findUnique({
    where: { slug },
    include: {
      items: {
        orderBy: { position: "asc" },
        include: {
          // We serialize the artwork on the consumer side via lib/artwork-store
          // because Prisma's include of Artwork (which stores JSON-in-strings)
          // would return raw strings. We expose the id + position here.
        },
      },
    },
  });
  if (!row) return null;
  return {
    ...rowToRecord(row),
    items: row.items.map((it: { artworkId: string; position: number }) => ({
      artworkId: it.artworkId,
      position: it.position,
      artwork: null,
    })),
  };
}

export async function getArtworkIdsInCollection(slug: string): Promise<string[]> {
  const row = await prisma.collection.findUnique({
    where: { slug },
    include: { items: { orderBy: { position: "asc" } } },
  });
  if (!row) return [];
  return row.items.map((it: { artworkId: string }) => it.artworkId);
}

export async function addOrUpdateCollection(input: CollectionInput): Promise<CollectionRecord> {
  const slug = clamp(input.slug.toLowerCase(), SLUG_MAX);
  if (!slugOk(slug)) {
    throw new Error(`slug must be lowercase kebab, got: ${input.slug}`);
  }
  const title = clamp(input.title, TITLE_MAX);
  const description = clamp(input.description, DESC_MAX);
  const curator = clamp(input.curator, CURATOR_MAX);
  if (!title) throw new Error("title required");
  if (!curator) throw new Error("curator required");

  // Upsert the collection row
  const collection = await prisma.collection.upsert({
    where: { slug },
    create: { slug, title, description, curator },
    update: { title, description, curator },
  });

  // Replace items. Delete-then-insert is the simplest correct strategy;
  // artworkIds list size is small (collection of <100 items).
  await prisma.collectionItem.deleteMany({ where: { collectionId: collection.id } });
  for (let i = 0; i < input.artworkIds.length; i++) {
    const artworkId = input.artworkIds[i];
    if (!artworkId) continue;
    await prisma.collectionItem.create({
      data: {
        collectionId: collection.id,
        artworkId,
        position: i,
      },
    });
  }

  return rowToRecord(collection);
}

export async function deleteCollection(slug: string): Promise<boolean> {
  try {
    await prisma.collection.delete({ where: { slug } });
    return true;
  } catch {
    return false;
  }
}

function rowToRecord(row: {
  id: string;
  slug: string;
  title: string;
  description: string;
  curator: string;
  createdAt: Date;
}): CollectionRecord {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    curator: row.curator,
    createdAt: row.createdAt.toISOString(),
  };
}