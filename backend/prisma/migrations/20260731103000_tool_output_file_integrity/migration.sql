ALTER TABLE "ToolOutputFile"
  ADD COLUMN "fileSizeBytes" INTEGER,
  ADD COLUMN "checksumSha256" TEXT,
  ADD COLUMN "integrityStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "integrityCheckedAt" TIMESTAMP(3),
  ADD COLUMN "integrityError" TEXT;

CREATE INDEX "ToolOutputFile_integrityStatus_idx" ON "ToolOutputFile"("integrityStatus");
