-- CreateEnum
CREATE TYPE "ToolRunStatus" AS ENUM ('COMPLETED', 'FAILED', 'PENDING', 'NOT_AVAILABLE', 'WARNING', 'PARTIAL');

-- CreateTable
CREATE TABLE "ToolRun" (
    "id" SERIAL NOT NULL,
    "organismId" INTEGER NOT NULL,
    "strainId" INTEGER,
    "toolName" TEXT NOT NULL,
    "status" "ToolRunStatus" NOT NULL DEFAULT 'PENDING',
    "version" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB,
    "warnings" JSONB,
    "errors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolResultTable" (
    "id" SERIAL NOT NULL,
    "toolRunId" INTEGER NOT NULL,
    "tableName" TEXT NOT NULL,
    "columns" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolResultTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolOutputFile" (
    "id" SERIAL NOT NULL,
    "toolRunId" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT,
    "filePath" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ToolOutputFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ToolRun_organismId_idx" ON "ToolRun"("organismId");

-- CreateIndex
CREATE INDEX "ToolRun_strainId_idx" ON "ToolRun"("strainId");

-- CreateIndex
CREATE INDEX "ToolRun_toolName_idx" ON "ToolRun"("toolName");

-- CreateIndex
CREATE INDEX "ToolRun_status_idx" ON "ToolRun"("status");

-- CreateIndex
CREATE INDEX "ToolResultTable_toolRunId_idx" ON "ToolResultTable"("toolRunId");

-- CreateIndex
CREATE INDEX "ToolOutputFile_toolRunId_idx" ON "ToolOutputFile"("toolRunId");

-- CreateIndex
CREATE INDEX "ToolOutputFile_fileType_idx" ON "ToolOutputFile"("fileType");

-- AddForeignKey
ALTER TABLE "ToolRun" ADD CONSTRAINT "ToolRun_organismId_fkey" FOREIGN KEY ("organismId") REFERENCES "Organism"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolRun" ADD CONSTRAINT "ToolRun_strainId_fkey" FOREIGN KEY ("strainId") REFERENCES "Strain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolResultTable" ADD CONSTRAINT "ToolResultTable_toolRunId_fkey" FOREIGN KEY ("toolRunId") REFERENCES "ToolRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolOutputFile" ADD CONSTRAINT "ToolOutputFile_toolRunId_fkey" FOREIGN KEY ("toolRunId") REFERENCES "ToolRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
