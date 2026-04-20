/*
  Warnings:

  - You are about to drop the column `latitude` on the `Organism` table. All the data in the column will be lost.
  - You are about to drop the column `longitude` on the `Organism` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Organism` table. All the data in the column will be lost.
  - You are about to drop the column `sampleSource` on the `Organism` table. All the data in the column will be lost.
  - You are about to drop the column `strain` on the `Organism` table. All the data in the column will be lost.
  - You are about to drop the column `data` on the `ToolResult` table. All the data in the column will be lost.
  - You are about to drop the column `organismId` on the `ToolResult` table. All the data in the column will be lost.
  - You are about to drop the column `toolName` on the `ToolResult` table. All the data in the column will be lost.
  - You are about to drop the `Sequence` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[scientificName]` on the table `Organism` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `scientificName` to the `Organism` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `Organism` table without a default value. This is not possible if the table is not empty.
  - Added the required column `analysisRunId` to the `ToolResult` table without a default value. This is not possible if the table is not empty.
  - Added the required column `resultType` to the `ToolResult` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Sequence" DROP CONSTRAINT "Sequence_organismId_fkey";

-- DropForeignKey
ALTER TABLE "ToolResult" DROP CONSTRAINT "ToolResult_organismId_fkey";

-- AlterTable
ALTER TABLE "Organism" DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "name",
DROP COLUMN "sampleSource",
DROP COLUMN "strain",
ADD COLUMN     "className" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "domain" TEXT,
ADD COLUMN     "family" TEXT,
ADD COLUMN     "genus" TEXT,
ADD COLUMN     "orderName" TEXT,
ADD COLUMN     "phylum" TEXT,
ADD COLUMN     "scientificName" TEXT NOT NULL,
ADD COLUMN     "species" TEXT,
ADD COLUMN     "taxonomyId" INTEGER,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "ToolResult" DROP COLUMN "data",
DROP COLUMN "organismId",
DROP COLUMN "toolName",
ADD COLUMN     "analysisRunId" INTEGER NOT NULL,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "fileAssetId" INTEGER,
ADD COLUMN     "format" TEXT,
ADD COLUMN     "jsonData" JSONB,
ADD COLUMN     "resultType" TEXT NOT NULL,
ADD COLUMN     "textData" TEXT,
ADD COLUMN     "title" TEXT;

-- DropTable
DROP TABLE "Sequence";

-- CreateTable
CREATE TABLE "Strain" (
    "id" SERIAL NOT NULL,
    "organismId" INTEGER NOT NULL,
    "strainName" TEXT NOT NULL,
    "isolateName" TEXT,
    "strainCode" TEXT,
    "biosampleAccession" TEXT,
    "bioprojectAccession" TEXT,
    "assemblyAccession" TEXT,
    "sourceType" TEXT,
    "host" TEXT,
    "country" TEXT,
    "state" TEXT,
    "city" TEXT,
    "collectionDate" TIMESTAMP(3),
    "locationText" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "genomeStatus" TEXT,
    "genomeSize" INTEGER,
    "gcContent" DECIMAL(5,2),
    "repoLink" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Strain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assembly" (
    "id" SERIAL NOT NULL,
    "strainId" INTEGER NOT NULL,
    "assemblyName" TEXT,
    "assemblyVersion" TEXT,
    "assembler" TEXT,
    "assemblyLevel" TEXT,
    "contigCount" INTEGER,
    "scaffoldCount" INTEGER,
    "n50" INTEGER,
    "l50" INTEGER,
    "longestContig" INTEGER,
    "totalLength" INTEGER,
    "gapCount" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assembly_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QcReport" (
    "id" SERIAL NOT NULL,
    "strainId" INTEGER NOT NULL,
    "qcTool" TEXT NOT NULL,
    "reportType" TEXT,
    "perBaseQualityStatus" TEXT,
    "perSequenceQualityStatus" TEXT,
    "adapterContentStatus" TEXT,
    "duplicationStatus" TEXT,
    "overrepresentedSequencesStatus" TEXT,
    "percentGc" DECIMAL(5,2),
    "totalSequences" INTEGER,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QcReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnotationRun" (
    "id" SERIAL NOT NULL,
    "strainId" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolVersion" TEXT,
    "cdsCount" INTEGER,
    "trnaCount" INTEGER,
    "rrnaCount" INTEGER,
    "ncrnaCount" INTEGER,
    "pseudogeneCount" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnotationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenomicFeature" (
    "id" SERIAL NOT NULL,
    "strainId" INTEGER NOT NULL,
    "annotationRunId" INTEGER,
    "seqid" TEXT,
    "locusTag" TEXT,
    "geneName" TEXT,
    "featureType" TEXT NOT NULL,
    "startPos" INTEGER NOT NULL,
    "endPos" INTEGER NOT NULL,
    "strand" TEXT,
    "product" TEXT,
    "proteinId" TEXT,
    "geneBiotype" TEXT,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GenomicFeature_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileAsset" (
    "id" SERIAL NOT NULL,
    "strainId" INTEGER,
    "assemblyId" INTEGER,
    "annotationRunId" INTEGER,
    "analysisRunId" INTEGER,
    "fileType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "bucketName" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "contentType" TEXT,
    "fileSizeBytes" INTEGER,
    "checksumSha256" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRun" (
    "id" SERIAL NOT NULL,
    "strainId" INTEGER NOT NULL,
    "toolName" TEXT NOT NULL,
    "toolCategory" TEXT,
    "toolVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'completed',
    "runDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inputFileId" INTEGER,
    "notes" TEXT,
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Strain_organismId_idx" ON "Strain"("organismId");

-- CreateIndex
CREATE INDEX "Strain_strainName_idx" ON "Strain"("strainName");

-- CreateIndex
CREATE INDEX "Strain_assemblyAccession_idx" ON "Strain"("assemblyAccession");

-- CreateIndex
CREATE INDEX "Strain_country_idx" ON "Strain"("country");

-- CreateIndex
CREATE INDEX "Strain_state_idx" ON "Strain"("state");

-- CreateIndex
CREATE INDEX "Strain_city_idx" ON "Strain"("city");

-- CreateIndex
CREATE INDEX "Assembly_strainId_idx" ON "Assembly"("strainId");

-- CreateIndex
CREATE INDEX "QcReport_strainId_idx" ON "QcReport"("strainId");

-- CreateIndex
CREATE INDEX "QcReport_qcTool_idx" ON "QcReport"("qcTool");

-- CreateIndex
CREATE INDEX "AnnotationRun_strainId_idx" ON "AnnotationRun"("strainId");

-- CreateIndex
CREATE INDEX "AnnotationRun_toolName_idx" ON "AnnotationRun"("toolName");

-- CreateIndex
CREATE INDEX "GenomicFeature_strainId_idx" ON "GenomicFeature"("strainId");

-- CreateIndex
CREATE INDEX "GenomicFeature_geneName_idx" ON "GenomicFeature"("geneName");

-- CreateIndex
CREATE INDEX "GenomicFeature_locusTag_idx" ON "GenomicFeature"("locusTag");

-- CreateIndex
CREATE INDEX "GenomicFeature_featureType_idx" ON "GenomicFeature"("featureType");

-- CreateIndex
CREATE INDEX "FileAsset_fileType_idx" ON "FileAsset"("fileType");

-- CreateIndex
CREATE UNIQUE INDEX "Organism_scientificName_key" ON "Organism"("scientificName");

-- CreateIndex
CREATE INDEX "Organism_genus_idx" ON "Organism"("genus");

-- CreateIndex
CREATE INDEX "Organism_species_idx" ON "Organism"("species");

-- CreateIndex
CREATE INDEX "ToolResult_analysisRunId_idx" ON "ToolResult"("analysisRunId");

-- AddForeignKey
ALTER TABLE "Strain" ADD CONSTRAINT "Strain_organismId_fkey" FOREIGN KEY ("organismId") REFERENCES "Organism"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assembly" ADD CONSTRAINT "Assembly_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QcReport" ADD CONSTRAINT "QcReport_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnotationRun" ADD CONSTRAINT "AnnotationRun_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenomicFeature" ADD CONSTRAINT "GenomicFeature_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenomicFeature" ADD CONSTRAINT "GenomicFeature_annotationRunId_fkey" FOREIGN KEY ("annotationRunId") REFERENCES "AnnotationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_assemblyId_fkey" FOREIGN KEY ("assemblyId") REFERENCES "Assembly"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_annotationRunId_fkey" FOREIGN KEY ("annotationRunId") REFERENCES "AnnotationRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileAsset" ADD CONSTRAINT "FileAsset_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_inputFileId_fkey" FOREIGN KEY ("inputFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolResult" ADD CONSTRAINT "ToolResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolResult" ADD CONSTRAINT "ToolResult_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
