/*
  Warnings:

  - You are about to drop the column `inputFileId` on the `AnalysisRun` table. All the data in the column will be lost.
  - You are about to drop the `ToolResult` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "AnalysisRun" DROP CONSTRAINT "AnalysisRun_inputFileId_fkey";

-- DropForeignKey
ALTER TABLE "ToolResult" DROP CONSTRAINT "ToolResult_analysisRunId_fkey";

-- DropForeignKey
ALTER TABLE "ToolResult" DROP CONSTRAINT "ToolResult_fileAssetId_fkey";

-- AlterTable
ALTER TABLE "AmrGene" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "AnalysisRun" DROP COLUMN "inputFileId";

-- DropTable
DROP TABLE "ToolResult";

-- CreateIndex
CREATE INDEX "AmrGene_strainId_idx" ON "AmrGene"("strainId");

-- CreateIndex
CREATE INDEX "AmrGene_geneSymbol_idx" ON "AmrGene"("geneSymbol");

-- CreateIndex
CREATE INDEX "AnalysisRun_strainId_idx" ON "AnalysisRun"("strainId");

-- CreateIndex
CREATE INDEX "FileAsset_strainId_idx" ON "FileAsset"("strainId");

-- CreateIndex
CREATE INDEX "FileAsset_assemblyId_idx" ON "FileAsset"("assemblyId");

-- CreateIndex
CREATE INDEX "FileAsset_annotationRunId_idx" ON "FileAsset"("annotationRunId");

-- CreateIndex
CREATE INDEX "FileAsset_analysisRunId_idx" ON "FileAsset"("analysisRunId");

-- CreateIndex
CREATE INDEX "FileAsset_bucketName_idx" ON "FileAsset"("bucketName");
