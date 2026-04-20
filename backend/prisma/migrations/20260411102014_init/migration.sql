-- CreateTable
CREATE TABLE "FastQCReport" (
    "id" SERIAL NOT NULL,
    "reportName" TEXT NOT NULL,
    "reportDate" TIMESTAMP(3) NOT NULL,
    "filename" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "encoding" TEXT NOT NULL,
    "totalSequences" INTEGER NOT NULL,
    "totalBases" TEXT NOT NULL,
    "poorQualitySequences" INTEGER NOT NULL,
    "sequenceLength" INTEGER NOT NULL,
    "gcPercent" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FastQCReport_pkey" PRIMARY KEY ("id")
);
