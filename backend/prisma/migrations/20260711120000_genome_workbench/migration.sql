CREATE TYPE "GenomeReferenceKind" AS ENUM ('FASTA', 'FAI', 'GFF3');
CREATE TYPE "GenomeReferenceStatus" AS ENUM ('UPLOADED', 'PUBLISHED', 'FAILED', 'ARCHIVED');

CREATE TABLE "GenomeReferenceFile" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT,
    "strainId" INTEGER,
    "kind" "GenomeReferenceKind" NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "status" "GenomeReferenceStatus" NOT NULL DEFAULT 'UPLOADED',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "validation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "publishedAt" TIMESTAMP(3),
    CONSTRAINT "GenomeReferenceFile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GenomeReferenceFile_submissionId_kind_key" ON "GenomeReferenceFile"("submissionId", "kind");
CREATE UNIQUE INDEX "GenomeReferenceFile_strainId_kind_key" ON "GenomeReferenceFile"("strainId", "kind");
CREATE INDEX "GenomeReferenceFile_submissionId_createdAt_idx" ON "GenomeReferenceFile"("submissionId", "createdAt");
CREATE INDEX "GenomeReferenceFile_strainId_status_idx" ON "GenomeReferenceFile"("strainId", "status");
CREATE INDEX "GenomeReferenceFile_kind_status_isPublic_idx" ON "GenomeReferenceFile"("kind", "status", "isPublic");
CREATE INDEX "GenomeReferenceFile_checksumSha256_idx" ON "GenomeReferenceFile"("checksumSha256");

ALTER TABLE "GenomeReferenceFile" ADD CONSTRAINT "GenomeReferenceFile_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "OrganismUpload"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GenomeReferenceFile" ADD CONSTRAINT "GenomeReferenceFile_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
