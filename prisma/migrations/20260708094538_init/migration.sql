-- CreateTable
CREATE TABLE "Artwork" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seed" TEXT NOT NULL,
    "soundtrack" TEXT NOT NULL,
    "audioDNA" TEXT NOT NULL,
    "shaderGraph" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "creator" TEXT NOT NULL,
    "title" TEXT
);

-- CreateIndex
CREATE INDEX "Artwork_creator_idx" ON "Artwork"("creator");

-- CreateIndex
CREATE INDEX "Artwork_createdAt_idx" ON "Artwork"("createdAt");
