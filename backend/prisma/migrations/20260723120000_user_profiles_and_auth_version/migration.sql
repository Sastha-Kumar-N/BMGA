ALTER TABLE "User"
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "gender" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT,
    "institutionalAddress" TEXT,
    "country" TEXT,
    "city" TEXT,
    "designation" TEXT,
    "department" TEXT,
    "institution" TEXT,
    "employmentStatus" TEXT,
    "highestDegree" TEXT,
    "specialization" TEXT,
    "researchInterests" TEXT,
    "researchAreas" TEXT,
    "keywords" TEXT,
    "currentProjects" TEXT,
    "orcidId" TEXT,
    "researcherId" TEXT,
    "scopusAuthorId" TEXT,
    "googleScholarUrl" TEXT,
    "linkedInUrl" TEXT,
    "profilePhotoPath" TEXT,
    "profilePhotoName" TEXT,
    "profilePhotoContentType" TEXT,
    "profilePhotoSizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");
CREATE INDEX "UserProfile_country_idx" ON "UserProfile"("country");
CREATE INDEX "UserProfile_institution_idx" ON "UserProfile"("institution");
CREATE INDEX "UserProfile_orcidId_idx" ON "UserProfile"("orcidId");

ALTER TABLE "UserProfile"
ADD CONSTRAINT "UserProfile_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
