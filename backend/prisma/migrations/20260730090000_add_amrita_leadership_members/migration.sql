INSERT INTO "AboutTeamMember" (
  "id", "section", "name", "title", "affiliation", "contribution", "email", "course", "portraitSrc", "displayOrder", "active", "updatedAt"
) VALUES
(
  'a7e9f7df-0179-45b5-9f97-9b5e2dd0a007',
  'LEADERSHIP',
  'Dr. Pradeesh Babu',
  'Assistant Professor, School of Biotechnology, Amritapuri',
  'Amrita School of Biotechnology',
  'Qualification: Ph.D\nResearch interest: Antimicrobial Resistance, Artificial Intelligence and Bioinformatics, Metagenomics, Next Generation Sequencing, Phage Biology\nNature of association: Regular',
  'pradeeshbabu@am.amrita.edu',
  NULL,
  '/team/pradeesh.png',
  30,
  true,
  CURRENT_TIMESTAMP
),
(
  'a7e9f7df-0179-45b5-9f97-9b5e2dd0a008',
  'LEADERSHIP',
  'Dr. Aravind Madhavan',
  'Assistant Professor, School of Biotechnology, Amritapuri',
  'Amrita School of Biotechnology',
  NULL,
  NULL,
  NULL,
  '/team/aravind-madhavan.png',
  40,
  true,
  CURRENT_TIMESTAMP
),
(
  'a7e9f7df-0179-45b5-9f97-9b5e2dd0a009',
  'LEADERSHIP',
  'Dr. Geetha Kumar',
  'Dean & HoS, School of Physical Sciences, Amritapuri | Professor, School of Biotechnology, Amritapuri',
  'Amrita School of Biotechnology',
  NULL,
  NULL,
  NULL,
  '/team/geetha-kumar.png',
  50,
  true,
  CURRENT_TIMESTAMP
),
(
  'a7e9f7df-0179-45b5-9f97-9b5e2dd0a010',
  'LEADERSHIP',
  'Dr. Bipin Nair',
  'Registrar, Amrita Vishwa Vidyapeetham | Dean & HoS, School of Biotechnology, Amritapuri',
  'Amrita Vishwa Vidyapeetham',
  NULL,
  NULL,
  NULL,
  '/team/bipin-nair.png',
  60,
  true,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("id") DO UPDATE SET
  "section" = EXCLUDED."section",
  "name" = EXCLUDED."name",
  "title" = EXCLUDED."title",
  "affiliation" = EXCLUDED."affiliation",
  "contribution" = EXCLUDED."contribution",
  "email" = EXCLUDED."email",
  "portraitSrc" = EXCLUDED."portraitSrc",
  "displayOrder" = EXCLUDED."displayOrder",
  "active" = EXCLUDED."active",
  "updatedAt" = CURRENT_TIMESTAMP;
