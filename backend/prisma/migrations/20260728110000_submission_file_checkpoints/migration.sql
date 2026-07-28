ALTER TABLE "SubmissionFile"
ADD COLUMN "checkpointedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "SubmissionFile_submissionId_checkpointedAt_idx"
ON "SubmissionFile"("submissionId", "checkpointedAt");
