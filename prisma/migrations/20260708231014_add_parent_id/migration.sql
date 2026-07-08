-- AlterTable
ALTER TABLE "Artwork" ADD COLUMN "parentId" TEXT;

-- CreateIndex
CREATE INDEX "Artwork_parentId_idx" ON "Artwork"("parentId");
