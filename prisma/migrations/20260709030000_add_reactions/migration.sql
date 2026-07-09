-- Stage 19: Reactions (lightweight likes/hearts) on shareable /a/[id] pages.
-- Anonymous by default: likerId is either a session cookie id, an
-- authenticated user id (when auth lands later), or "anonymous-<fingerprint>".
-- Uniqueness on (artworkId, likerId) guarantees one reaction per visitor per artwork.
-- A "kind" column leaves room for future reaction types (heart, star, glow)
-- without another migration.

-- CreateTable
CREATE TABLE "Reaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "artworkId" TEXT NOT NULL,
    "likerId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'heart',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Reaction_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "Artwork" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Reaction_artworkId_likerId_kind_key" ON "Reaction"("artworkId", "likerId", "kind");

-- CreateIndex
CREATE INDEX "Reaction_artworkId_idx" ON "Reaction"("artworkId");