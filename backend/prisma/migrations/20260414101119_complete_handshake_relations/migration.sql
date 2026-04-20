/*
  Warnings:

  - You are about to drop the column `notes` on the `AnalysisRun` table. All the data in the column will be lost.
  - You are about to drop the column `runDate` on the `AnalysisRun` table. All the data in the column will be lost.
  - You are about to drop the column `status` on the `AnalysisRun` table. All the data in the column will be lost.
  - You are about to drop the column `summary` on the `AnalysisRun` table. All the data in the column will be lost.
  - You are about to drop the column `toolCategory` on the `AnalysisRun` table. All the data in the column will be lost.
  - You are about to drop the column `toolName` on the `AnalysisRun` table. All the data in the column will be lost.
  - You are about to drop the column `toolVersion` on the `AnalysisRun` table. All the data in the column will be lost.
  - You are about to drop the column `adapterContent` on the `FastqcResult` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `FastqcResult` table. All the data in the column will be lost.
  - You are about to drop the column `perBaseQuality` on the `FastqcResult` table. All the data in the column will be lost.
  - You are about to drop the column `percentGc` on the `FastqcResult` table. All the data in the column will be lost.
  - You are about to drop the column `totalSequences` on the `FastqcResult` table. All the data in the column will be lost.
  - You are about to drop the column `createdAt` on the `ProkkaResult` table. All the data in the column will be lost.
  - You are about to drop the column `rrnaCount` on the `ProkkaResult` table. All the data in the column will be lost.
  - You are about to drop the column `trnaCount` on the `ProkkaResult` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AnalysisRun" DROP COLUMN "notes",
DROP COLUMN "runDate",
DROP COLUMN "status",
DROP COLUMN "summary",
DROP COLUMN "toolCategory",
DROP COLUMN "toolName",
DROP COLUMN "toolVersion",
ADD COLUMN     "sampleName" TEXT;

-- AlterTable
ALTER TABLE "FastqcResult" DROP COLUMN "adapterContent",
DROP COLUMN "createdAt",
DROP COLUMN "perBaseQuality",
DROP COLUMN "percentGc",
DROP COLUMN "totalSequences",
ADD COLUMN     "adapterContentStatus" TEXT,
ADD COLUMN     "duplicationRate" DOUBLE PRECISION,
ADD COLUMN     "gcContent" DOUBLE PRECISION,
ADD COLUMN     "q30Rate" DOUBLE PRECISION,
ADD COLUMN     "sequenceLengthMaxBp" INTEGER,
ADD COLUMN     "sequenceLengthMinBp" INTEGER,
ADD COLUMN     "totalReads" INTEGER;

-- AlterTable
ALTER TABLE "ProkkaResult" DROP COLUMN "createdAt",
DROP COLUMN "rrnaCount",
DROP COLUMN "trnaCount",
ADD COLUMN     "codingDensity" DOUBLE PRECISION,
ADD COLUMN     "hypotheticalProteins" INTEGER,
ADD COLUMN     "pseudogenes" INTEGER,
ADD COLUMN     "rrnaGenes" INTEGER,
ADD COLUMN     "trnaGenes" INTEGER;

-- CreateTable
CREATE TABLE "FastpResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "readsBeforeFiltering" INTEGER,
    "readsAfterFiltering" INTEGER,
    "q20Rate" DOUBLE PRECISION,
    "q30Rate" DOUBLE PRECISION,
    "duplicationRate" DOUBLE PRECISION,
    "insertSizePeakBp" INTEGER,

    CONSTRAINT "FastpResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MultiqcResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "samplesAnalysed" INTEGER,
    "avgSequenceLengthBp" INTEGER,
    "gcContent" DOUBLE PRECISION,
    "duplicatesR1" DOUBLE PRECISION,
    "duplicatesR2" DOUBLE PRECISION,
    "failedModules" INTEGER,

    CONSTRAINT "MultiqcResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpadesResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "totalContigs" INTEGER,
    "largestContigKb" DOUBLE PRECISION,
    "n50Kb" DOUBLE PRECISION,
    "totalLengthMb" DOUBLE PRECISION,
    "coverageX" DOUBLE PRECISION,
    "peakMemoryGb" DOUBLE PRECISION,

    CONSTRAINT "SpadesResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuastResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "n50Kb" DOUBLE PRECISION,
    "l50" INTEGER,
    "genomeFraction" DOUBLE PRECISION,
    "mismatchesPer100Kb" DOUBLE PRECISION,
    "largestContigKb" DOUBLE PRECISION,
    "duplicationRatio" DOUBLE PRECISION,

    CONSTRAINT "QuastResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BuscoResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "completePercent" DOUBLE PRECISION,
    "singleCopyPercent" DOUBLE PRECISION,
    "duplicatedPercent" DOUBLE PRECISION,
    "fragmentedPercent" DOUBLE PRECISION,
    "missingPercent" DOUBLE PRECISION,
    "lineage" TEXT,

    CONSTRAINT "BuscoResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckmResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "completeness" DOUBLE PRECISION,
    "contamination" DOUBLE PRECISION,
    "strainHeterogeneity" DOUBLE PRECISION,
    "qualityScore" DOUBLE PRECISION,
    "markerGenes" INTEGER,
    "lineage" TEXT,

    CONSTRAINT "CheckmResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiamondResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "queriesAligned" INTEGER,
    "percentAligned" DOUBLE PRECISION,
    "databaseName" TEXT,
    "avgIdentity" DOUBLE PRECISION,
    "evalueCutoff" TEXT,
    "unalignedQueries" INTEGER,

    CONSTRAINT "DiamondResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KofamkoalaResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "genesAnnotated" INTEGER,
    "keggPathways" INTEGER,
    "koCoverage" DOUBLE PRECISION,
    "avgHmmScore" DOUBLE PRECISION,
    "dbRelease" TEXT,
    "topPathway" TEXT,

    CONSTRAINT "KofamkoalaResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbricateResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "genesFound" INTEGER,
    "minCoverage" DOUBLE PRECISION,
    "minIdentity" DOUBLE PRECISION,
    "topHit" TEXT,
    "virulenceGenes" INTEGER,
    "plasmidGenes" INTEGER,

    CONSTRAINT "AbricateResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MlstResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "scheme" TEXT,
    "sequenceType" TEXT,
    "allelesMatched" TEXT,
    "confidence" DOUBLE PRECISION,
    "clonalComplex" TEXT,
    "pandemicLineage" BOOLEAN,

    CONSTRAINT "MlstResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IslandPathResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "gisDetected" INTEGER,
    "totalGiLengthKb" DOUBLE PRECISION,
    "avgGiLengthKb" DOUBLE PRECISION,
    "giLinkedGenes" INTEGER,
    "amrIsland" BOOLEAN,
    "amrIslandName" TEXT,
    "amrGene" TEXT,

    CONSTRAINT "IslandPathResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrnascanSeResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "trnasFound" INTEGER,
    "aminoAcidTypes" INTEGER,
    "pseudoTrnas" INTEGER,
    "anticodons" INTEGER,
    "hotspots" INTEGER,
    "modelType" TEXT,

    CONSTRAINT "TrnascanSeResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HmmerResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "domainsFound" INTEGER,
    "pfamHits" INTEGER,
    "tigrfamHits" INTEGER,
    "avgEvalue" TEXT,
    "databases" TEXT,
    "novelDomains" INTEGER,

    CONSTRAINT "HmmerResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MincedResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "crisprArrays" INTEGER,
    "totalSpacers" INTEGER,
    "repeatLengthBp" INTEGER,
    "spacerLengthBp" INTEGER,
    "phageMatches" INTEGER,
    "arraysOnContigs" TEXT,

    CONSTRAINT "MincedResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JellyfishResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "kmerSize" INTEGER,
    "distinctKmersMillion" DOUBLE PRECISION,
    "totalKmersBillion" DOUBLE PRECISION,
    "peakFrequencyX" DOUBLE PRECISION,
    "genomeSizeMb" DOUBLE PRECISION,
    "repeatContent" DOUBLE PRECISION,

    CONSTRAINT "JellyfishResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrfResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "tandemRepeats" INTEGER,
    "totalLengthKb" DOUBLE PRECISION,
    "genomeFraction" DOUBLE PRECISION,
    "avgPeriodSizeBp" INTEGER,
    "maxCopy" DOUBLE PRECISION,
    "phaseVariationLoci" INTEGER,

    CONSTRAINT "TrfResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BarrnapResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "rrna16S" INTEGER,
    "rrna23S" INTEGER,
    "rrna5S" INTEGER,
    "totalRrna" INTEGER,
    "evalueCutoff" TEXT,
    "taxonomy" TEXT,

    CONSTRAINT "BarrnapResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntismashResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "bgcRegions" INTEGER,
    "bgcTypes" TEXT,
    "mibigMatches" INTEGER,
    "novelBgcs" INTEGER,
    "mibigHit" TEXT,
    "databaseName" TEXT,

    CONSTRAINT "AntismashResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AmrGene" (
    "id" SERIAL NOT NULL,
    "strainId" INTEGER NOT NULL,
    "geneSymbol" TEXT NOT NULL,
    "drugClass" TEXT,
    "identity" DOUBLE PRECISION,

    CONSTRAINT "AmrGene_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FastpResult_analysisRunId_key" ON "FastpResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "MultiqcResult_analysisRunId_key" ON "MultiqcResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "SpadesResult_analysisRunId_key" ON "SpadesResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "QuastResult_analysisRunId_key" ON "QuastResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "BuscoResult_analysisRunId_key" ON "BuscoResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckmResult_analysisRunId_key" ON "CheckmResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "DiamondResult_analysisRunId_key" ON "DiamondResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "KofamkoalaResult_analysisRunId_key" ON "KofamkoalaResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AbricateResult_analysisRunId_key" ON "AbricateResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "MlstResult_analysisRunId_key" ON "MlstResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "IslandPathResult_analysisRunId_key" ON "IslandPathResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TrnascanSeResult_analysisRunId_key" ON "TrnascanSeResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "HmmerResult_analysisRunId_key" ON "HmmerResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "MincedResult_analysisRunId_key" ON "MincedResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "JellyfishResult_analysisRunId_key" ON "JellyfishResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "TrfResult_analysisRunId_key" ON "TrfResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "BarrnapResult_analysisRunId_key" ON "BarrnapResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "AntismashResult_analysisRunId_key" ON "AntismashResult"("analysisRunId");

-- CreateIndex
CREATE INDEX "ToolResult_resultType_idx" ON "ToolResult"("resultType");

-- AddForeignKey
ALTER TABLE "FastpResult" ADD CONSTRAINT "FastpResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MultiqcResult" ADD CONSTRAINT "MultiqcResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpadesResult" ADD CONSTRAINT "SpadesResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuastResult" ADD CONSTRAINT "QuastResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BuscoResult" ADD CONSTRAINT "BuscoResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckmResult" ADD CONSTRAINT "CheckmResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiamondResult" ADD CONSTRAINT "DiamondResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KofamkoalaResult" ADD CONSTRAINT "KofamkoalaResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbricateResult" ADD CONSTRAINT "AbricateResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MlstResult" ADD CONSTRAINT "MlstResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IslandPathResult" ADD CONSTRAINT "IslandPathResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrnascanSeResult" ADD CONSTRAINT "TrnascanSeResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HmmerResult" ADD CONSTRAINT "HmmerResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MincedResult" ADD CONSTRAINT "MincedResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JellyfishResult" ADD CONSTRAINT "JellyfishResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrfResult" ADD CONSTRAINT "TrfResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BarrnapResult" ADD CONSTRAINT "BarrnapResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntismashResult" ADD CONSTRAINT "AntismashResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AmrGene" ADD CONSTRAINT "AmrGene_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain"("id") ON DELETE CASCADE ON UPDATE CASCADE;
