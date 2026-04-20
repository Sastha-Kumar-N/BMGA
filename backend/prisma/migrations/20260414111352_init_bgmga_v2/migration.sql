/*
  Warnings:

  - You are about to drop the column `createdAt` on the `AmrGene` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "AmrGene_geneSymbol_idx";

-- DropIndex
DROP INDEX "AmrGene_strainId_idx";

-- DropIndex
DROP INDEX "FileAsset_analysisRunId_idx";

-- DropIndex
DROP INDEX "FileAsset_annotationRunId_idx";

-- DropIndex
DROP INDEX "FileAsset_assemblyId_idx";

-- DropIndex
DROP INDEX "FileAsset_bucketName_idx";

-- DropIndex
DROP INDEX "FileAsset_strainId_idx";

-- AlterTable
ALTER TABLE "AmrGene" DROP COLUMN "createdAt";

-- AlterTable
ALTER TABLE "AnalysisRun" ADD COLUMN     "inputFileId" INTEGER;

-- CreateTable
CREATE TABLE "ToolResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "resultType" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "format" TEXT,
    "fileAssetId" INTEGER,
    "jsonData" JSONB,
    "textData" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolResult_analysisRunId_idx" ON "ToolResult"("analysisRunId");

-- CreateIndex
CREATE INDEX "ToolResult_resultType_idx" ON "ToolResult"("resultType");

-- AddForeignKey
ALTER TABLE "AnalysisRun" ADD CONSTRAINT "AnalysisRun_inputFileId_fkey" FOREIGN KEY ("inputFileId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolResult" ADD CONSTRAINT "ToolResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolResult" ADD CONSTRAINT "ToolResult_fileAssetId_fkey" FOREIGN KEY ("fileAssetId") REFERENCES "FileAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
