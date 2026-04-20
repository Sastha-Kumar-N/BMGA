-- CreateTable
CREATE TABLE "Sequence" (
    "id" SERIAL NOT NULL,
    "organism" TEXT NOT NULL,
    "sequenceData" TEXT NOT NULL,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sequence_pkey" PRIMARY KEY ("id")
);
