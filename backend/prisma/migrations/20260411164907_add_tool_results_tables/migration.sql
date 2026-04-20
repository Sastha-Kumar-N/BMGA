-- CreateTable
CREATE TABLE "FastqcResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "totalSequences" INTEGER,
    "percentGc" DOUBLE PRECISION,
    "perBaseQuality" TEXT,
    "adapterContent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FastqcResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProkkaResult" (
    "id" SERIAL NOT NULL,
    "analysisRunId" INTEGER NOT NULL,
    "cdsCount" INTEGER,
    "trnaCount" INTEGER,
    "rrnaCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProkkaResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FastqcResult_analysisRunId_key" ON "FastqcResult"("analysisRunId");

-- CreateIndex
CREATE UNIQUE INDEX "ProkkaResult_analysisRunId_key" ON "ProkkaResult"("analysisRunId");

-- AddForeignKey
ALTER TABLE "FastqcResult" ADD CONSTRAINT "FastqcResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProkkaResult" ADD CONSTRAINT "ProkkaResult_analysisRunId_fkey" FOREIGN KEY ("analysisRunId") REFERENCES "AnalysisRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
