# AMR Findings of India

## Purpose

This module is a curated, publication- and surveillance-reference-backed registry for antimicrobial-resistance findings associated with India. It is distinct from the existing MAYA/AMR gene pipeline output: a gene call is genomic evidence, while a curated finding describes its study context, evidence, interpretation, and limitations.

## Architecture

- `AmrFinding` is the primary curation record.
- Scientific entities are normalized into reusable pathogen, resistance gene, antimicrobial/class, mechanism, publication, vocabulary, and relationship tables.
- Locations, accessions, institutions, keywords, mobile genetic elements, and revision entries are attached to a finding without comma-separated database fields.
- Public API queries only return `PUBLISHED` records. Drafts, reviewer identities, curator interpretations, and revisions remain curator-only.

## Workflow and roles

`Draft -> Under Review -> Approved -> Published -> Archived`

- Contributors can create and edit their own drafts, then submit them for review.
- Moderators can curate and prepare records for review.
- Administrators approve, publish, archive, and manage all records.
- Every create, edit, and status transition writes both an AMR revision record and an existing admin audit log entry.

## Evidence framework

Evidence levels `LEVEL_1` through `LEVEL_5` are an internal database curation framework, not an international standard:

1. Phenotypic evidence only
2. Genotypic evidence only
3. Phenotypic and genotypic evidence
4. Genomic or experimental confirmation
5. Multi-study or surveillance-level evidence

Public-health importance is `LOW`, `MODERATE`, `HIGH`, or `CRITICAL`. High and Critical records require an importance reason.

## Validation rules

- Title, key finding, scientific summary, and a publication/surveillance source are required.
- Prevalence requires both numerator and denominator and is computed server-side.
- Resistant count cannot exceed sample size.
- Study dates and publication year are checked for plausibility.
- High/Critical records require a written reason.
- DOI values are normalized; outbound URLs are restricted to HTTP(S).
- Text is stripped of markup before storage.

## API

Public:

- `GET /api/amr-findings/dashboard`
- `GET /api/amr-findings/filters`
- `GET /api/amr-findings`
- `GET /api/amr-findings/:slug`

Curator/admin (Bearer token and RBAC required):

- `GET|POST /api/admin/amr-findings`
- `GET|PATCH /api/admin/amr-findings/:id`
- `POST /api/admin/amr-findings/:id/status`
- `GET /api/admin/amr-findings-template.csv`
- `POST /api/admin/amr-findings/import` (administrator-only; sends `csvText` and `filename`, imports valid rows as drafts and reports row-level errors)

## Migration and setup

Apply the additive migration after setting a valid `DATABASE_URL`:

```powershell
cd backend
npx prisma migrate deploy
npx prisma generate
```

The migration adds tables and types only; it does not alter or delete existing organism, MAYA, or AMR-gene data.

## CSV template

Download the template from the admin curation screen. The single row is explicitly fictional sample data and must not be published. Use semicolons to separate multiple domains, pathogens, genes, and classes. The administrator-only import endpoint checks required data, blocks formula-like cells, imports valid rows as drafts, and returns per-row errors. Production imports should be reviewed before publishing.

## Data dictionary

`AmrFinding` stores the curation narrative, status, evidence class, quality-controlled prevalence fields, study dates, and workflow metadata. Related tables model scientific terms and relationships: `AmrFindingPathogen`, `AmrFindingGene`, `AmrFindingAntimicrobial`, `AmrFindingMechanism`, `AmrFindingLocation`, `AmrFindingPublication`, `AmrFindingInstitution`, `AmrFindingAccession`, `AmrFindingKeyword`, `AmrFindingMobileElement`, and `AmrFindingRevision`.

## Deployment

Run the migration once before deploying the backend image. No additional environment variables are required. Existing authentication, request-size limits, rate limiting, and audit logging are reused.
