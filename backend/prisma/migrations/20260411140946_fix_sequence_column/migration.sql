/*
  Warnings:

  - You are about to drop the column `collectedAt` on the `Sequence` table. All the data in the column will be lost.
  - You are about to drop the column `organism` on the `Sequence` table. All the data in the column will be lost.
  - You are about to drop the column `sampleId` on the `Sequence` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `User` table. All the data in the column will be lost.
  - You are about to drop the `Sample` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Sequence" DROP CONSTRAINT "Sequence_sampleId_fkey";

-- AlterTable
ALTER TABLE "Sequence" DROP COLUMN "collectedAt",
DROP COLUMN "organism",
DROP COLUMN "sampleId",
ADD COLUMN     "organismId" INTEGER,
ADD COLUMN     "organismName" TEXT NOT NULL DEFAULT 'Unknown';

-- AlterTable
ALTER TABLE "ToolResult" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "updatedAt";

-- DropTable
DROP TABLE "Sample";

-- AddForeignKey
ALTER TABLE "Sequence" ADD CONSTRAINT "Sequence_organismId_fkey" FOREIGN KEY ("organismId") REFERENCES "Organism"("id") ON DELETE SET NULL ON UPDATE CASCADE;
