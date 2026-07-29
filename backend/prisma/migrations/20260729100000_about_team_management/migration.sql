CREATE TYPE "AboutTeamSection" AS ENUM ('LEADERSHIP', 'PLATFORM', 'STUDENT');

CREATE TABLE "AboutTeamMember" (
    "id" TEXT NOT NULL,
    "section" "AboutTeamSection" NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "affiliation" TEXT,
    "contribution" TEXT,
    "email" TEXT,
    "course" TEXT,
    "portraitSrc" TEXT,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AboutTeamMember_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AboutTeamMember_section_active_displayOrder_idx" ON "AboutTeamMember"("section", "active", "displayOrder");
CREATE INDEX "AboutTeamMember_active_idx" ON "AboutTeamMember"("active");

INSERT INTO "AboutTeamMember" ("id", "section", "name", "title", "affiliation", "contribution", "email", "course", "portraitSrc", "displayOrder", "updatedAt") VALUES
('a7e9f7df-0179-45b5-9f97-9b5e2dd0a001', 'LEADERSHIP', 'Dr. Sabarinath Subramaniam', 'Director, Sivasakthi Science Foundation (SSF), Adjunct Professor, School of Biotechnology, Amritapuri', 'Sivasakthi Science Foundation', 'Guides BMGA scientific vision, research partnerships, data strategy, and long-term roadmap.', 'shabari@sivasakthifoundation.org', NULL, '/team/sabarinath-subramaniam.png', 10, CURRENT_TIMESTAMP),
('a7e9f7df-0179-45b5-9f97-9b5e2dd0a002', 'LEADERSHIP', 'Dr. Nidheesh M.', 'Principal, School of Physical Sciences, Amritapuri | Associate Professor, School of Biotechnology, Amritapuri', 'Amrita School of Biotechnology', 'Supports research partnerships, resources, infrastructure, and academic collaboration.', 'nidheesh@am.amrita.edu', NULL, '/team/Dr-Nidheesh-M.png', 20, CURRENT_TIMESTAMP),
('a7e9f7df-0179-45b5-9f97-9b5e2dd0a003', 'PLATFORM', 'Sastha Kumar N', 'Research Scholar & Developer', 'Amrita School of Biotechnology & Sivasakthi Science Foundation', 'Builds data platforms, machine learning workflows, user experience, and computational biology tools for BMGA.', 'admin@bgdb.org', NULL, '/team/sastha.png', 30, CURRENT_TIMESTAMP),
('a7e9f7df-0179-45b5-9f97-9b5e2dd0a004', 'STUDENT', 'Aditya', NULL, 'Amrita School of Biotechnology', 'Student contributor supporting bioinformatics research and knowledge organization.', NULL, 'MSc Bioinformatics', NULL, 10, CURRENT_TIMESTAMP),
('a7e9f7df-0179-45b5-9f97-9b5e2dd0a005', 'STUDENT', 'Lekshmi', NULL, 'Amrita School of Biotechnology', 'Student contributor supporting bioinformatics research and knowledge organization.', NULL, 'MSc Bioinformatics', NULL, 20, CURRENT_TIMESTAMP),
('a7e9f7df-0179-45b5-9f97-9b5e2dd0a006', 'STUDENT', 'Sreerag', NULL, 'Amrita School of Biotechnology', 'Student contributor supporting bioinformatics research and knowledge organization.', NULL, 'MSc Bioinformatics', NULL, 30, CURRENT_TIMESTAMP);
