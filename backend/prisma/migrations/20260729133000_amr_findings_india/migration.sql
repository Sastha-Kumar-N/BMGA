CREATE TYPE "AmrFindingStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ARCHIVED');
CREATE TYPE "AmrEvidenceLevel" AS ENUM ('LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5');
CREATE TYPE "AmrPublicHealthImportance" AS ENUM ('LOW', 'MODERATE', 'HIGH', 'CRITICAL');
CREATE TYPE "AmrGeographicScope" AS ENUM ('LOCAL', 'DISTRICT', 'STATE', 'MULTI_STATE', 'NATIONAL', 'INDIA_ASSOCIATED_INTERNATIONAL');
CREATE TYPE "AmrResistanceEvidence" AS ENUM ('PHENOTYPIC', 'GENOTYPIC', 'EXPERIMENTAL', 'COMBINED', 'NOT_REPORTED');
CREATE TYPE "AmrClassificationOrigin" AS ENUM ('REPORTED_BY_STUDY', 'CURATOR_INFERRED', 'DATABASE_CALCULATED', 'NOT_REPORTED');

CREATE TABLE "AmrFinding" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "title" TEXT NOT NULL, "keyFinding" TEXT NOT NULL,
  "scientificSummary" TEXT NOT NULL, "curatorInterpretation" TEXT, "publicHealthSignificance" TEXT,
  "limitations" TEXT, "futureDirections" TEXT, "surveillanceAction" TEXT, "sourceReference" TEXT NOT NULL,
  "domainSummary" TEXT, "evidenceLevel" "AmrEvidenceLevel" NOT NULL,
  "publicHealthImportance" "AmrPublicHealthImportance" NOT NULL DEFAULT 'MODERATE',
  "importanceReason" TEXT, "geographicScope" "AmrGeographicScope" NOT NULL DEFAULT 'STATE',
  "resistanceEvidence" "AmrResistanceEvidence" NOT NULL DEFAULT 'NOT_REPORTED',
  "susceptibilityMethod" TEXT, "interpretiveGuideline" TEXT, "guidelineVersion" TEXT,
  "mdrStatus" BOOLEAN, "xdrStatus" BOOLEAN, "pdrStatus" BOOLEAN,
  "classificationOrigin" "AmrClassificationOrigin" NOT NULL DEFAULT 'NOT_REPORTED',
  "studyStartDate" TIMESTAMP(3), "studyEndDate" TIMESTAMP(3), "publicationYear" INTEGER,
  "sampleSize" INTEGER, "resistantSampleCount" INTEGER, "prevalenceNumerator" INTEGER,
  "prevalenceDenominator" INTEGER, "prevalencePercentage" DECIMAL(5,2), "studyDesign" TEXT,
  "sequencingPlatform" TEXT, "analysisMethod" TEXT, "oneHealth" BOOLEAN NOT NULL DEFAULT false,
  "hasGenomicData" BOOLEAN NOT NULL DEFAULT false, "openAccess" BOOLEAN NOT NULL DEFAULT false,
  "curationStatus" "AmrFindingStatus" NOT NULL DEFAULT 'DRAFT', "createdById" TEXT NOT NULL,
  "reviewedById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL, "lastReviewedAt" TIMESTAMP(3), "publishedAt" TIMESTAMP(3),
  CONSTRAINT "AmrFinding_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AmrFinding_slug_key" ON "AmrFinding"("slug");
CREATE INDEX "AmrFinding_curationStatus_updatedAt_idx" ON "AmrFinding"("curationStatus", "updatedAt");
CREATE INDEX "AmrFinding_publicationYear_idx" ON "AmrFinding"("publicationYear");
CREATE INDEX "AmrFinding_publicHealthImportance_idx" ON "AmrFinding"("publicHealthImportance");
CREATE INDEX "AmrFinding_evidenceLevel_idx" ON "AmrFinding"("evidenceLevel");
CREATE INDEX "AmrFinding_createdById_idx" ON "AmrFinding"("createdById");

CREATE TABLE "AmrControlledVocabulary" (
  "id" TEXT NOT NULL, "category" TEXT NOT NULL, "value" TEXT NOT NULL, "label" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmrControlledVocabulary_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AmrControlledVocabulary_category_value_key" ON "AmrControlledVocabulary"("category", "value");
CREATE INDEX "AmrControlledVocabulary_category_active_sortOrder_idx" ON "AmrControlledVocabulary"("category", "active", "sortOrder");

CREATE TABLE "AmrPathogen" ("id" TEXT NOT NULL, "scientificName" TEXT NOT NULL, "organismType" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AmrPathogen_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AmrPathogen_scientificName_key" ON "AmrPathogen"("scientificName");
CREATE TABLE "AmrResistanceGene" ("id" TEXT NOT NULL, "symbol" TEXT NOT NULL, "variant" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AmrResistanceGene_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AmrResistanceGene_symbol_key" ON "AmrResistanceGene"("symbol");
CREATE TABLE "AmrAntimicrobialClass" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AmrAntimicrobialClass_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AmrAntimicrobialClass_name_key" ON "AmrAntimicrobialClass"("name");
CREATE TABLE "AmrAntimicrobial" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "classId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AmrAntimicrobial_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AmrAntimicrobial_name_key" ON "AmrAntimicrobial"("name");
CREATE INDEX "AmrAntimicrobial_classId_idx" ON "AmrAntimicrobial"("classId");
CREATE TABLE "AmrResistanceMechanism" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AmrResistanceMechanism_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AmrResistanceMechanism_name_key" ON "AmrResistanceMechanism"("name");

CREATE TABLE "AmrFindingDomain" ("findingId" TEXT NOT NULL, "termId" TEXT NOT NULL, CONSTRAINT "AmrFindingDomain_pkey" PRIMARY KEY ("findingId", "termId"));
CREATE INDEX "AmrFindingDomain_termId_idx" ON "AmrFindingDomain"("termId");
CREATE TABLE "AmrFindingPathogen" ("findingId" TEXT NOT NULL, "pathogenId" TEXT NOT NULL, "strain" TEXT, "lineage" TEXT, "sequenceType" TEXT, "serotype" TEXT, CONSTRAINT "AmrFindingPathogen_pkey" PRIMARY KEY ("findingId", "pathogenId"));
CREATE INDEX "AmrFindingPathogen_pathogenId_idx" ON "AmrFindingPathogen"("pathogenId");
CREATE TABLE "AmrFindingGene" ("findingId" TEXT NOT NULL, "geneId" TEXT NOT NULL, CONSTRAINT "AmrFindingGene_pkey" PRIMARY KEY ("findingId", "geneId"));
CREATE INDEX "AmrFindingGene_geneId_idx" ON "AmrFindingGene"("geneId");
CREATE TABLE "AmrFindingAntimicrobial" ("findingId" TEXT NOT NULL, "antimicrobialId" TEXT NOT NULL, "phenotype" TEXT, CONSTRAINT "AmrFindingAntimicrobial_pkey" PRIMARY KEY ("findingId", "antimicrobialId"));
CREATE INDEX "AmrFindingAntimicrobial_antimicrobialId_idx" ON "AmrFindingAntimicrobial"("antimicrobialId");
CREATE TABLE "AmrFindingMechanism" ("findingId" TEXT NOT NULL, "mechanismId" TEXT NOT NULL, CONSTRAINT "AmrFindingMechanism_pkey" PRIMARY KEY ("findingId", "mechanismId"));
CREATE INDEX "AmrFindingMechanism_mechanismId_idx" ON "AmrFindingMechanism"("mechanismId");
CREATE TABLE "AmrFindingLocation" ("id" TEXT NOT NULL, "findingId" TEXT NOT NULL, "country" TEXT NOT NULL DEFAULT 'India', "state" TEXT, "district" TEXT, "city" TEXT, "locality" TEXT, "facility" TEXT, "latitude" DOUBLE PRECISION, "longitude" DOUBLE PRECISION, CONSTRAINT "AmrFindingLocation_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AmrFindingLocation_findingId_idx" ON "AmrFindingLocation"("findingId");
CREATE INDEX "AmrFindingLocation_state_idx" ON "AmrFindingLocation"("state");
CREATE INDEX "AmrFindingLocation_district_idx" ON "AmrFindingLocation"("district");
CREATE TABLE "AmrPublication" ("id" TEXT NOT NULL, "title" TEXT NOT NULL, "authors" TEXT, "journal" TEXT, "publicationYear" INTEGER, "doi" TEXT, "pubmedId" TEXT, "externalUrl" TEXT, "citationText" TEXT, "openAccess" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AmrPublication_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AmrPublication_doi_key" ON "AmrPublication"("doi");
CREATE UNIQUE INDEX "AmrPublication_pubmedId_key" ON "AmrPublication"("pubmedId");
CREATE INDEX "AmrPublication_publicationYear_idx" ON "AmrPublication"("publicationYear");
CREATE TABLE "AmrFindingPublication" ("findingId" TEXT NOT NULL, "publicationId" TEXT NOT NULL, CONSTRAINT "AmrFindingPublication_pkey" PRIMARY KEY ("findingId", "publicationId"));
CREATE INDEX "AmrFindingPublication_publicationId_idx" ON "AmrFindingPublication"("publicationId");
CREATE TABLE "AmrFindingInstitution" ("id" TEXT NOT NULL, "findingId" TEXT NOT NULL, "name" TEXT NOT NULL, "role" TEXT, CONSTRAINT "AmrFindingInstitution_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AmrFindingInstitution_findingId_idx" ON "AmrFindingInstitution"("findingId");
CREATE TABLE "AmrFindingAccession" ("id" TEXT NOT NULL, "findingId" TEXT NOT NULL, "database" TEXT NOT NULL, "accession" TEXT NOT NULL, "url" TEXT, CONSTRAINT "AmrFindingAccession_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AmrFindingAccession_findingId_database_accession_key" ON "AmrFindingAccession"("findingId", "database", "accession");
CREATE INDEX "AmrFindingAccession_accession_idx" ON "AmrFindingAccession"("accession");
CREATE TABLE "AmrFindingKeyword" ("id" TEXT NOT NULL, "findingId" TEXT NOT NULL, "value" TEXT NOT NULL, CONSTRAINT "AmrFindingKeyword_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AmrFindingKeyword_findingId_value_key" ON "AmrFindingKeyword"("findingId", "value");
CREATE INDEX "AmrFindingKeyword_value_idx" ON "AmrFindingKeyword"("value");
CREATE TABLE "AmrFindingMobileElement" ("id" TEXT NOT NULL, "findingId" TEXT NOT NULL, "type" TEXT NOT NULL, "name" TEXT NOT NULL, CONSTRAINT "AmrFindingMobileElement_pkey" PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "AmrFindingMobileElement_findingId_type_name_key" ON "AmrFindingMobileElement"("findingId", "type", "name");
CREATE INDEX "AmrFindingMobileElement_type_name_idx" ON "AmrFindingMobileElement"("type", "name");
CREATE TABLE "AmrFindingRevision" ("id" TEXT NOT NULL, "findingId" TEXT NOT NULL, "actorId" TEXT, "action" TEXT NOT NULL, "note" TEXT, "snapshot" JSONB, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AmrFindingRevision_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AmrFindingRevision_findingId_createdAt_idx" ON "AmrFindingRevision"("findingId", "createdAt");
CREATE INDEX "AmrFindingRevision_actorId_idx" ON "AmrFindingRevision"("actorId");

ALTER TABLE "AmrFinding" ADD CONSTRAINT "AmrFinding_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmrFinding" ADD CONSTRAINT "AmrFinding_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrAntimicrobial" ADD CONSTRAINT "AmrAntimicrobial_classId_fkey" FOREIGN KEY ("classId") REFERENCES "AmrAntimicrobialClass"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AmrFindingDomain" ADD CONSTRAINT "AmrFindingDomain_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingDomain" ADD CONSTRAINT "AmrFindingDomain_termId_fkey" FOREIGN KEY ("termId") REFERENCES "AmrControlledVocabulary"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmrFindingPathogen" ADD CONSTRAINT "AmrFindingPathogen_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingPathogen" ADD CONSTRAINT "AmrFindingPathogen_pathogenId_fkey" FOREIGN KEY ("pathogenId") REFERENCES "AmrPathogen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmrFindingGene" ADD CONSTRAINT "AmrFindingGene_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingGene" ADD CONSTRAINT "AmrFindingGene_geneId_fkey" FOREIGN KEY ("geneId") REFERENCES "AmrResistanceGene"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmrFindingAntimicrobial" ADD CONSTRAINT "AmrFindingAntimicrobial_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingAntimicrobial" ADD CONSTRAINT "AmrFindingAntimicrobial_antimicrobialId_fkey" FOREIGN KEY ("antimicrobialId") REFERENCES "AmrAntimicrobial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmrFindingMechanism" ADD CONSTRAINT "AmrFindingMechanism_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingMechanism" ADD CONSTRAINT "AmrFindingMechanism_mechanismId_fkey" FOREIGN KEY ("mechanismId") REFERENCES "AmrResistanceMechanism"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmrFindingLocation" ADD CONSTRAINT "AmrFindingLocation_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingPublication" ADD CONSTRAINT "AmrFindingPublication_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingPublication" ADD CONSTRAINT "AmrFindingPublication_publicationId_fkey" FOREIGN KEY ("publicationId") REFERENCES "AmrPublication"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AmrFindingInstitution" ADD CONSTRAINT "AmrFindingInstitution_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingAccession" ADD CONSTRAINT "AmrFindingAccession_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingKeyword" ADD CONSTRAINT "AmrFindingKeyword_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingMobileElement" ADD CONSTRAINT "AmrFindingMobileElement_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingRevision" ADD CONSTRAINT "AmrFindingRevision_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "AmrFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AmrFindingRevision" ADD CONSTRAINT "AmrFindingRevision_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
