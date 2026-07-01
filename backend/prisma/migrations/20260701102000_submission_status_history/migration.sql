CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';
ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'NEEDS_CHANGES';
ALTER TYPE "ApprovalStatus" ADD VALUE IF NOT EXISTS 'ARCHIVED';

CREATE TABLE IF NOT EXISTS "SubmissionStatusHistory" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "actorId" TEXT,
  "note" TEXT,
  "visibleToSubmitter" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionStatusHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SubmissionReviewerNote" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "authorId" TEXT,
  "message" TEXT NOT NULL,
  "visibleToSubmitter" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SubmissionReviewerNote_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "SubmissionStatusHistory" ADD CONSTRAINT "SubmissionStatusHistory_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "OrganismUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "SubmissionStatusHistory" ADD CONSTRAINT "SubmissionStatusHistory_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "SubmissionReviewerNote" ADD CONSTRAINT "SubmissionReviewerNote_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "OrganismUpload"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "SubmissionReviewerNote" ADD CONSTRAINT "SubmissionReviewerNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "SubmissionStatusHistory_submissionId_idx" ON "SubmissionStatusHistory"("submissionId");
CREATE INDEX IF NOT EXISTS "SubmissionStatusHistory_actorId_idx" ON "SubmissionStatusHistory"("actorId");
CREATE INDEX IF NOT EXISTS "SubmissionStatusHistory_status_idx" ON "SubmissionStatusHistory"("status");
CREATE INDEX IF NOT EXISTS "SubmissionStatusHistory_createdAt_idx" ON "SubmissionStatusHistory"("createdAt");

CREATE INDEX IF NOT EXISTS "SubmissionReviewerNote_submissionId_idx" ON "SubmissionReviewerNote"("submissionId");
CREATE INDEX IF NOT EXISTS "SubmissionReviewerNote_authorId_idx" ON "SubmissionReviewerNote"("authorId");
CREATE INDEX IF NOT EXISTS "SubmissionReviewerNote_visibleToSubmitter_idx" ON "SubmissionReviewerNote"("visibleToSubmitter");
CREATE INDEX IF NOT EXISTS "SubmissionReviewerNote_createdAt_idx" ON "SubmissionReviewerNote"("createdAt");

INSERT INTO "SubmissionStatusHistory" ("id", "submissionId", "status", "actorId", "note", "visibleToSubmitter", "createdAt")
SELECT gen_random_uuid()::text, ou."id", 'SUBMITTED', ou."submittedById", 'Initial submission received.', true, ou."createdAt"
FROM "OrganismUpload" ou
WHERE NOT EXISTS (
  SELECT 1 FROM "SubmissionStatusHistory" sh WHERE sh."submissionId" = ou."id"
);

INSERT INTO "SubmissionStatusHistory" ("id", "submissionId", "status", "actorId", "note", "visibleToSubmitter", "createdAt")
SELECT gen_random_uuid()::text, ou."id", ou."status"::text, ou."reviewedById", COALESCE(ou."reviewNote", 'Current review status backfilled.'), true, COALESCE(ou."reviewedAt", ou."updatedAt")
FROM "OrganismUpload" ou
WHERE ou."status"::text <> 'PENDING'
  AND NOT EXISTS (
    SELECT 1 FROM "SubmissionStatusHistory" sh WHERE sh."submissionId" = ou."id" AND sh."status" = ou."status"::text
  );

INSERT INTO "SubmissionReviewerNote" ("id", "submissionId", "authorId", "message", "visibleToSubmitter", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, ou."id", ou."reviewedById", ou."reviewNote", true, COALESCE(ou."reviewedAt", ou."updatedAt"), COALESCE(ou."reviewedAt", ou."updatedAt")
FROM "OrganismUpload" ou
WHERE ou."reviewNote" IS NOT NULL AND length(trim(ou."reviewNote")) > 0
  AND NOT EXISTS (
    SELECT 1 FROM "SubmissionReviewerNote" rn WHERE rn."submissionId" = ou."id" AND rn."message" = ou."reviewNote"
  );
