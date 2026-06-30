ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'CONTRIBUTOR';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'MODERATOR';

DO $$
BEGIN
  CREATE TYPE "UserAffiliation" AS ENUM ('INDUSTRY', 'ACADEMIC', 'RESEARCH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "affiliation" "UserAffiliation" NOT NULL DEFAULT 'RESEARCH',
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "OrganismUpload" (
  "id" TEXT NOT NULL,
  "submittedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "scientificName" TEXT NOT NULL,
  "displayName" TEXT,
  "taxonomyId" INTEGER,
  "domain" TEXT,
  "phylum" TEXT,
  "className" TEXT,
  "orderName" TEXT,
  "family" TEXT,
  "genus" TEXT,
  "species" TEXT,
  "description" TEXT,
  "strainName" TEXT NOT NULL,
  "isolateName" TEXT,
  "strainCode" TEXT,
  "biosampleAccession" TEXT,
  "bioprojectAccession" TEXT,
  "assemblyAccession" TEXT,
  "sourceType" TEXT,
  "host" TEXT,
  "country" TEXT,
  "state" TEXT,
  "city" TEXT,
  "collectionDate" TIMESTAMP(3),
  "locationText" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "genomeStatus" TEXT,
  "genomeSize" INTEGER,
  "gcContent" DECIMAL(5,2),
  "repoLink" TEXT,
  "metadata" JSONB,
  "publishedOrganismId" INTEGER,
  "publishedStrainId" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "OrganismUpload_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "BlogPost" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "reviewedById" TEXT,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "BlogPost_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AdminLog" (
  "id" TEXT NOT NULL,
  "adminId" TEXT,
  "action" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminLog_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  ALTER TABLE "OrganismUpload" ADD CONSTRAINT "OrganismUpload_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "OrganismUpload" ADD CONSTRAINT "OrganismUpload_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "BlogPost" ADD CONSTRAINT "BlogPost_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "AdminLog" ADD CONSTRAINT "AdminLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "OrganismUpload_submittedById_idx" ON "OrganismUpload"("submittedById");
CREATE INDEX IF NOT EXISTS "OrganismUpload_reviewedById_idx" ON "OrganismUpload"("reviewedById");
CREATE INDEX IF NOT EXISTS "OrganismUpload_status_idx" ON "OrganismUpload"("status");
CREATE INDEX IF NOT EXISTS "OrganismUpload_scientificName_idx" ON "OrganismUpload"("scientificName");
CREATE INDEX IF NOT EXISTS "OrganismUpload_strainName_idx" ON "OrganismUpload"("strainName");

CREATE INDEX IF NOT EXISTS "BlogPost_authorId_idx" ON "BlogPost"("authorId");
CREATE INDEX IF NOT EXISTS "BlogPost_reviewedById_idx" ON "BlogPost"("reviewedById");
CREATE INDEX IF NOT EXISTS "BlogPost_status_idx" ON "BlogPost"("status");
CREATE INDEX IF NOT EXISTS "BlogPost_createdAt_idx" ON "BlogPost"("createdAt");

CREATE INDEX IF NOT EXISTS "AdminLog_adminId_idx" ON "AdminLog"("adminId");
CREATE INDEX IF NOT EXISTS "AdminLog_targetType_idx" ON "AdminLog"("targetType");
CREATE INDEX IF NOT EXISTS "AdminLog_createdAt_idx" ON "AdminLog"("createdAt");
