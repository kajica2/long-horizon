/**
 * Comment store — action 21 of the Long Horizon roadmap.
 *
 * Comments live on shareable /a/[id] pages. They persist server-side in
 * Prisma (SQLite for dev). No auth — anonymous comments allowed, since
 * the shareable page is meant to be public.
 *
 * The author field is either a user id (when auth lands) or "anonymous"
 * for now. Body is a free-form string up to ~2000 chars.
 *
 * Sanitization: bodies are not rendered as HTML, so there's no XSS risk
 * if we keep using {text} interpolation. If we ever switch to dangerouslySetInnerHTML,
 * run through a sanitizer first.
 */

import { prisma } from "@/lib/db";

const MAX_BODY = 2000;

export interface CommentRecord {
  id: string;
  artworkId: string;
  body: string;
  author: string;
  createdAt: string; // ISO 8601
}

export async function listComments(artworkId: string): Promise<CommentRecord[]> {
  const rows = await prisma.comment.findMany({
    where: { artworkId },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r: { id: string; artworkId: string; body: string; author: string; createdAt: Date }) => ({
    id: r.id,
    artworkId: r.artworkId,
    body: r.body,
    author: r.author,
    createdAt: r.createdAt.toISOString(),
  }));
}

export interface CommentInput {
  artworkId: string;
  body: string;
  author?: string;
}

export async function addComment(input: CommentInput): Promise<CommentRecord> {
  const body = input.body.trim().slice(0, MAX_BODY);
  if (!body) throw new Error("Comment body is empty");
  const author = (input.author?.trim() || "anonymous").slice(0, 60);

  const row = await prisma.comment.create({
    data: {
      artworkId: input.artworkId,
      body,
      author,
    },
  });
  return {
    id: row.id,
    artworkId: row.artworkId,
    body: row.body,
    author: row.author,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function deleteComment(id: string): Promise<boolean> {
  try {
    await prisma.comment.delete({ where: { id } });
    return true;
  } catch {
    return false;
  }
}

export async function countComments(artworkId: string): Promise<number> {
  return prisma.comment.count({ where: { artworkId } });
}