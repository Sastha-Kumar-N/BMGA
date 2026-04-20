/*
  Warnings:

  - You are about to drop the `FastQCReport` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterTable
ALTER TABLE "Sequence" ADD COLUMN     "sampleId" INTEGER;

-- DropTable
DROP TABLE "FastQCReport";

-- CreateTable
CREATE TABLE "Sample" (
    "id" SERIAL NOT NULL,
    "sourceName" TEXT NOT NULL,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sample_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "Sample"("id") ON DELETE SET NULL ON UPDATE CASCADE;
