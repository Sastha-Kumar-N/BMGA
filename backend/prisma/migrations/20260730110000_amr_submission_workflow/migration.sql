-- Additive workflow fields for AMR findings and separately moderated publications.
-- Existing curated findings remain intact and retain their current status.

ALTER TYPE "AmrFindingStatus" ADD VALUE IF NOT EXISTS 'SUBMITTED';
ALTER TYPE "AmrFindingStatus" ADD VALUE IF NOT EXISTS 'CHANGES_REQUESTED';

CREATE TYPE "AmrSubmissionDeclaration" AS ENUM ('AUTHOR', 'ON_BEHALF_OF_AUTHORS', 'RELEVANT_PUBLICATION_SUGGESTION');
CREATE TYPE "AmrImportSource" AS ENUM ('PUBMED', 'EUROPE_PMC', 'JSON_UPLOAD');
CREATE TYPE "AmrImportJobStatus" AS ENUM ('DRAFT', 'PREVIEWED', 'RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "NotificationType" AS ENUM ('AMR_FINDING', 'AMR_PUBLICATION', 'AMR_IMPORT');

ALTER TABLE "AmrFinding"
  ADD COLUMN "submissionDeclaration" "AmrSubmissionDeclaration" NOT NULL DEFAULT 'AUTHOR',
  ADD COLUMN "submissionSource" TEXT NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "assignedReviewerId" TEXT,
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "publishedById" TEXT,
  ADD COLUMN "archivedById" TEXT,
  ADD COLUMN "duplicateOfId" TEXT,
  ADD COLUMN "previousVersionId" TEXT,
  ADD COLUMN "linkedStrainId" INTEGER,
  ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "changesRequestedAt" TIMESTAMP(3),
  ADD COLUMN "changesRequestedMessage" TEXT,
  ADD COLUMN "scheduledPublishAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3);

ALTER TABLE "AmrFindingRevision" ADD COLUMN "visibleToSubmitter" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AmrPublication"
  ADD COLUMN "slug" TEXT,
  ADD COLUMN "userRoleInPublication" TEXT,
  ADD COLUMN "pmcId" TEXT,
  ADD COLUMN "europePmcId" TEXT,
  ADD COLUMN "submissionDeclaration" "AmrSubmissionDeclaration" NOT NULL DEFAULT 'AUTHOR',
  ADD COLUMN "submissionSource" TEXT NOT NULL DEFAULT 'ADMIN',
  ADD COLUMN "curationStatus" "AmrFindingStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "createdById" TEXT,
  ADD COLUMN "reviewedById" TEXT,
  ADD COLUMN "assignedReviewerId" TEXT,
  ADD COLUMN "duplicateOfId" TEXT,
  ADD COLUMN "previousVersionId" TEXT,
  ADD COLUMN "revisionNumber" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "publishedAt" TIMESTAMP(3),
  ADD COLUMN "scheduledPublishAt" TIMESTAMP(3),
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "changesRequestedMessage" TEXT,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "AmrPublication_slug_key" ON "AmrPublication"("slug");
CREATE UNIQUE INDEX "AmrPublication_pmcId_key" ON "AmrPublication"("pmcId");
CREATE UNIQUE INDEX "AmrPublication_europePmcId_key" ON "AmrPublication"("europePmcId");
CREATE INDEX "AmrPublication_curationStatus_updatedAt_idx" ON "AmrPublication"("curationStatus", "updatedAt");
CREATE INDEX "AmrPublication_createdById_idx" ON "AmrPublication"("createdById");
CREATE INDEX "AmrPublication_assignedReviewerId_idx" ON "AmrPublication"("assignedReviewerId");
CREATE INDEX "AmrPublication_duplicateOfId_idx" ON "AmrPublication"("duplicateOfId");

CREATE TABLE "AmrPublicationRevision" (
  "id" TEXT NOT NULL,
  "publicationId" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "note" TEXT,
  "visibleToSubmitter" BOOLEAN NOT NULL DEFAULT false,
  "snapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmrPublicationRevision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AmrPublicationRevision_publicationId_createdAt_idx" ON "AmrPublicationRevision"("publicationId", "createdAt");
CREATE INDEX "AmrPublicationRevision_actorId_idx" ON "AmrPublicationRevision"("actorId");

CREATE TABLE "AmrModerationNote" (
  "id" TEXT NOT NULL,
  "findingId" TEXT,
  "publicationId" TEXT,
  "authorId" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "visibleToSubmitter" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmrModerationNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AmrModerationNote_exactly_one_target" CHECK (
    (CASE WHEN "findingId" IS NULL THEN 0 ELSE 1 END) +
    (CASE WHEN "publicationId" IS NULL THEN 0 ELSE 1 END) = 1
  )
);
CREATE INDEX "AmrModerationNote_findingId_createdAt_idx" ON "AmrModerationNote"("findingId", "createdAt");
CREATE INDEX "AmrModerationNote_publicationId_createdAt_idx" ON "AmrModerationNote"("publicationId", "createdAt");
CREATE INDEX "AmrModerationNote_authorId_idx" ON "AmrModerationNote"("authorId");

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "link" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

CREATE TABLE "AmrImportQuery" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "source" "AmrImportSource" NOT NULL,
  "query" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AmrImportQuery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AmrImportQuery_source_active_idx" ON "AmrImportQuery"("source", "active");
CREATE INDEX "AmrImportQuery_createdById_idx" ON "AmrImportQuery"("createdById");

CREATE TABLE "AmrImportJob" (
  "id" TEXT NOT NULL,
  "queryId" TEXT,
  "source" "AmrImportSource" NOT NULL,
  "request" JSONB NOT NULL,
  "preview" JSONB,
  "result" JSONB,
  "status" "AmrImportJobStatus" NOT NULL DEFAULT 'DRAFT',
  "attempt" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "startedAt" TIMESTAMP(3),
  "finishedAt" TIMESTAMP(3),
  CONSTRAINT "AmrImportJob_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AmrImportJob_source_status_createdAt_idx" ON "AmrImportJob"("source", "status", "createdAt");
CREATE INDEX "AmrImportJob_queryId_idx" ON "AmrImportJob"("queryId");
CREATE INDEX "AmrImportJob_createdById_idx" ON "AmrImportJob"("createdById");

ALTER TABLE "AmrFinding" ADD CONSTRAINT "AmrFinding_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrFinding" ADD CONSTRAINT "AmrFinding_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrFinding" ADD CONSTRAINT "AmrFinding_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrFinding" ADD CONSTRAINT "AmrFinding_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrFinding" ADD CONSTRAINT "AmrFinding_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "AmrFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrFinding" ADD CONSTRAINT "AmrFinding_linkedStrainId_fkey" FOREIGN KEY ("linkedStrainId") REFERENCES "Strain"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "AmrFinding_assignedReviewerId_idx" ON "AmrFinding"("assignedReviewerId");
CREATE INDEX "AmrFinding_duplicateOfId_idx" ON "AmrFinding"("duplicateOfId");
CREATE INDEX "AmrFinding_linkedStrainId_idx" ON "AmrFinding"("linkedStrainId");
CREATE INDEX "AmrFinding_submissionSource_submittedAt_idx" ON "AmrFinding"("submissionSource", "submittedAt");

ALTER TABLE "AmrPublication" ADD CONSTRAINT "AmrPublication_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrPublication" ADD CONSTRAINT "AmrPublication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrPublication" ADD CONSTRAINT "AmrPublication_assignedReviewerId_fkey" FOREIGN KEY ("assignedReviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrPublication" ADD CONSTRAINT "AmrPublication_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "AmrPublication"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrPublicationRevision" ADD CONSTRAINT "AmrPublicationRevision_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "AmrPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrPublicationRevision" ADD CONSTRAINT "AmrPublicationRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrModerationNote" ADD CONSTRAINT "AmrModerationNote_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrModerationNote" ADD CONSTRAINT "AmrModerationNote_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "AmrPublication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrModerationNote" ADD CONSTRAINT "AmrModerationNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrImportQuery" ADD CONSTRAINT "AmrImportQuery_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrImportJob" ADD CONSTRAINT "AmrImportJob_queryId_fkey" FOREIGN KEY ("queryId") REFERENCES "AmrImportQuery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrImportJob" ADD CONSTRAINT "AmrImportJob_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
