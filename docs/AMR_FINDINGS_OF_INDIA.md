# AMR Findings of India

## Purpose

This module is a curated, publication- and surveillance-reference-backed registry for antimicrobial-resistance findings associated with India. It is distinct from the existing MAYA/AMR gene pipeline output: a gene call is genomic evidence, while a curated finding describes its study context, evidence, interpretation, and limitations.

## Architecture

- `AmrFinding` is the primary curation record.
- Scientific entities are normalized into reusable pathogen, resistance gene, antimicrobial/class, mechanism, publication, vocabulary, and relationship tables.
- Locations, accessions, institutions, keywords, mobile genetic elements, and revision entries are attached to a finding without comma-separated database fields.
- Public API queries only return `PUBLISHED` records. Drafts, reviewer identities, curator interpretations, and revisions remain curator-only.

## Workflow and roles

`Draft -> Submitted -> Under Review -> Changes Requested -> Approved -> Published -> Archived`

- Any authenticated registered user can create and edit their own finding and publication drafts, submit valid JSON finding batches, then submit records for review.
- Administrators create, review, assign, request changes, approve, publish, unpublish, archive, restore, link, and explicitly resolve duplicates.
- `APPROVED` records are not public. The separate `PUBLISHED` status is the only public state.
- Every creation, edit, note, moderation transition, duplicate/link action, import action, and scheduled publication writes both a revision and an existing admin audit log entry.

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
- `GET /api/amr-publications`
- `GET /api/amr-publications/:slug`

Registered user (Bearer token and ownership checks required):

- `GET /api/me/amr-submissions`
- `GET|PATCH /api/me/notifications/:id/read`
- `GET /api/amr-submissions/schema`
- `POST /api/amr-submissions/findings`
- `PATCH /api/amr-submissions/findings/:id`
- `POST /api/amr-submissions/findings/:id/submit`
- `POST /api/amr-submissions/findings/json/validate`
- `POST /api/amr-submissions/findings/json`
- `POST /api/amr-submissions/publications`
- `PATCH /api/amr-submissions/publications/:id`
- `POST /api/amr-submissions/publications/:id/submit`

Curator/admin (Bearer token and RBAC required):

- `GET|POST /api/admin/amr-findings`
- `GET|PATCH /api/admin/amr-findings/:id`
- `POST /api/admin/amr-findings/:id/status`
- `GET /api/admin/amr-findings-template.csv`
- `POST /api/admin/amr-findings/import` (administrator-only; sends `csvText` and `filename`, imports valid rows as drafts and reports row-level errors)
- `POST /api/admin/amr-findings/:id/moderation`
- `POST /api/admin/amr-findings/:id/notes`
- `GET|POST /api/admin/amr-publications`
- `GET|PATCH /api/admin/amr-publications/:id`
- `POST /api/admin/amr-publications/:id/moderation`
- `POST /api/admin/amr-publications/:id/notes`
- `GET|POST|PATCH /api/admin/amr-import-queries`
- `GET /api/admin/amr-import-jobs`
- `POST /api/admin/amr-import-jobs/preview`
- `POST /api/admin/amr-import-jobs/:id/execute`
- `POST /api/admin/amr-import-jobs/:id/retry`

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

`AmrFinding` stores the curation narrative, status, evidence class, quality-controlled prevalence fields, study dates, provenance, reviewer assignment, publication schedule, and duplicate/link metadata. Related tables model scientific terms and relationships: `AmrFindingPathogen`, `AmrFindingGene`, `AmrFindingAntimicrobial`, `AmrFindingMechanism`, `AmrFindingLocation`, `AmrFindingPublication`, `AmrFindingInstitution`, `AmrFindingAccession`, `AmrFindingKeyword`, `AmrFindingMobileElement`, and `AmrFindingRevision`.

`AmrPublication` is now a separate moderated entity with DOI, PMID, PMCID, Europe PMC ID, external source URL, submitter declaration, status, duplicate relationship, reviewer, revision, and publication scheduling fields. `AmrModerationNote` stores a visible-to-submitter flag independently from internal notes. `Notification` is the in-app notification store. `AmrImportQuery` stores a controlled PubMed or Europe PMC search definition, while `AmrImportJob` stores request, preview, result, retry, and failure history.

## Deployment

Run the migration once before deploying the backend image. Existing authentication, request-size limits, rate limiting, and audit logging are reused. External literature fetching is fail-closed: set `AMR_IMPORT_ALLOW_NETWORK=true` only when PubMed/Europe PMC previews are allowed by your governance policy.
