CREATE TYPE "EvidenceBasis" AS ENUM ('GENOTYPIC', 'PHENOTYPIC', 'COMBINED', 'NOT_REPORTED');
CREATE TYPE "SurveillanceScope" AS ENUM ('NATIONAL', 'GLOBAL');
CREATE TYPE "SubmissionFileStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'INGESTED', 'FAILED');

ALTER TABLE "Strain"
  ADD COLUMN "surveillanceScope" "SurveillanceScope" NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "evidenceBasis" "EvidenceBasis" NOT NULL DEFAULT 'GENOTYPIC',
  ADD COLUMN "submittingInstitution" TEXT,
  ADD COLUMN "dataSource" TEXT,
  ADD COLUMN "dataUseLimitations" TEXT,
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);

ALTER TABLE "OrganismUpload"
  ADD COLUMN "surveillanceScope" "SurveillanceScope" NOT NULL DEFAULT 'GLOBAL',
  ADD COLUMN "evidenceBasis" "EvidenceBasis" NOT NULL DEFAULT 'GENOTYPIC',
  ADD COLUMN "submittingInstitution" TEXT,
  ADD COLUMN "dataSource" TEXT,
  ADD COLUMN "dataUseLimitations" TEXT,
  ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);

UPDATE "Strain"
SET "surveillanceScope" = 'NATIONAL'
WHERE LOWER(COALESCE("country", '')) = 'india';

UPDATE "OrganismUpload"
SET "surveillanceScope" = 'NATIONAL'
WHERE LOWER(COALESCE("country", '')) = 'india';

ALTER TABLE "AmrGene"
  ADD COLUMN "toolRunId" INTEGER,
  ADD COLUMN "drugName" TEXT,
  ADD COLUMN "resistanceMechanism" TEXT,
  ADD COLUMN "coverage" DOUBLE PRECISION,
  ADD COLUMN "databaseName" TEXT,
  ADD COLUMN "phenotype" TEXT,
  ADD COLUMN "evidenceBasis" "EvidenceBasis" NOT NULL DEFAULT 'GENOTYPIC';

CREATE TABLE "SubmissionFile" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "toolName" TEXT NOT NULL,
  "originalFileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "fileSizeBytes" INTEGER NOT NULL,
  "checksumSha256" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "toolVersion" TEXT,
  "summary" JSONB,
  "warnings" JSONB,
  "errors" JSONB,
  "status" "SubmissionFileStatus" NOT NULL DEFAULT 'UPLOADED',
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "ingestedAt" TIMESTAMP(3),
  CONSTRAINT "SubmissionFile_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SubmissionFile"
  ADD CONSTRAINT "SubmissionFile_submissionId_fkey"
  FOREIGN KEY ("submissionId") REFERENCES "OrganismUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AmrGene"
  ADD CONSTRAINT "AmrGene_toolRunId_fkey"
  FOREIGN KEY ("toolRunId") REFERENCES "ToolRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Strain_country_collectionDate_idx" ON "Strain"("country", "collectionDate");
CREATE INDEX "Strain_organismId_collectionDate_idx" ON "Strain"("organismId", "collectionDate");
CREATE INDEX "Strain_sourceType_idx" ON "Strain"("sourceType");
CREATE INDEX "Strain_surveillanceScope_updatedAt_idx" ON "Strain"("surveillanceScope", "updatedAt");
CREATE INDEX "Strain_evidenceBasis_idx" ON "Strain"("evidenceBasis");
CREATE INDEX "OrganismUpload_surveillanceScope_status_idx" ON "OrganismUpload"("surveillanceScope", "status");
CREATE INDEX "OrganismUpload_country_createdAt_idx" ON "OrganismUpload"("country", "createdAt");
CREATE INDEX "OrganismUpload_evidenceBasis_idx" ON "OrganismUpload"("evidenceBasis");
CREATE INDEX "SubmissionFile_submissionId_createdAt_idx" ON "SubmissionFile"("submissionId", "createdAt");
CREATE INDEX "SubmissionFile_toolName_status_idx" ON "SubmissionFile"("toolName", "status");
CREATE INDEX "SubmissionFile_status_idx" ON "SubmissionFile"("status");
CREATE INDEX "AmrGene_strainId_idx" ON "AmrGene"("strainId");
CREATE INDEX "AmrGene_toolRunId_idx" ON "AmrGene"("toolRunId");
CREATE INDEX "AmrGene_geneSymbol_idx" ON "AmrGene"("geneSymbol");
CREATE INDEX "AmrGene_drugClass_idx" ON "AmrGene"("drugClass");
CREATE INDEX "AmrGene_evidenceBasis_idx" ON "AmrGene"("evidenceBasis");
CREATE INDEX "AmrGene_createdAt_idx" ON "AmrGene"("createdAt");
