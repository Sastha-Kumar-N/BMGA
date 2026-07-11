# BMGA / Bharat Microbial Genome Atlas

BMGA is a Next.js + Express + Prisma + PostgreSQL platform for microbial genome registry, dashboard analytics, and organism-level bioinformatics results.

## Organism Analysis Results

Each organism now has a dedicated results page:

```text
/organisms/[organismId]/results
```

The page shows a genome summary panel and one tab per supported pipeline tool:

```text
abricate, antismash, barrnap, busco, checkm, diamond, fastp, fastqc,
fastqc_trimmed, hmmer, islandpath, jellyfish, kofam, minced, rnlst,
multiqc, prokka, quast, spades, trf, trnascan
```

The UI reads real API responses and handles missing data with `not_available` states.

## API Endpoints

```text
GET /api/organisms
GET /api/organisms/:id
GET /api/organisms/:id/results
GET /api/organisms/:id/results/:tool
GET /api/organisms/:id/downloads/:tool/:fileId
```

The frontend calls these through its existing proxy:

```text
/api/backend/organisms/:id/results
```

## Accounts, Review Workflow, And Admin Cockpit

The platform now includes user accounts, role-based access, organism submission review, and blog approval.

```text
Public/auth pages:
/register
/login
/blog

Signed-in pages:
/account
/submit-organism
/blog/create

Admin-only pages:
/admin
/admin/cockpit
/admin/users
/admin/uploads
/admin/blogs
```

Key API routes:

```text
POST /api/auth/register
POST /api/auth/login
GET  /api/me
POST /api/organism-uploads
GET  /api/me/uploads
POST /api/blog-posts
GET  /api/me/blog-posts
GET  /api/blog-posts

GET    /api/admin/users
PATCH  /api/admin/users/:id
GET    /api/admin/organism-uploads
PATCH  /api/admin/organism-uploads/:id
POST   /api/admin/organism-uploads/:id/approve
POST   /api/admin/organism-uploads/:id/reject
DELETE /api/admin/organism-uploads/:id
GET    /api/admin/blog-posts
PATCH  /api/admin/blog-posts/:id
POST   /api/admin/blog-posts/:id/approve
POST   /api/admin/blog-posts/:id/reject
DELETE /api/admin/blog-posts/:id
```

User passwords are stored as bcrypt hashes in the existing `User.password` database column, exposed in Prisma as `passwordHash`. New user organism uploads are saved as `PENDING` in `OrganismUpload`. Admin approval publishes the record into the public `Organism` and `Strain` tables, so the existing dashboard and India atlas automatically pick it up. Rejected records remain hidden from the public database. Blog posts follow the same `PENDING`, `APPROVED`, `REJECTED` workflow.

Roles shown in the UI:

```text
Normal User -> UserRole.STUDENT
Contributor -> UserRole.CONTRIBUTOR
Moderator -> UserRole.MODERATOR
Admin -> UserRole.ADMIN
```

Affiliations:

```text
INDUSTRY
ACADEMIC
RESEARCH
```

The first admin account is seeded from:

```text
BMGA_ADMIN_EMAIL
BMGA_ADMIN_PASSWORD
```

The default local Docker seed is:

```text
Email: maya.admin@bmga.local
Password: MAYA@Bmga#2026!Results-47
```

The optional demo researcher account password is controlled by `BMGA_DEMO_PASSWORD`.

Change these values in production before deploying.

## Result Import Folder Structure

The importer expects one folder per organism. The folder name can be an existing numeric organism id or a scientific/display name.

```text
results/
  organism_id_1/
    abricate/
    antismash/
    barrnap/
    busco/
    checkm/
    diamond/
    fastp/
    fastqc/
    fastqc_trimmed/
    hmmer/
    islandpath/
    jellyfish/
    kofam/
    minced/
    rnlst/
    multiqc/
    prokka/
    quast/
    spades/
    trf/
    trnascan/
```

Each tool folder may contain `.tsv`, `.csv`, `.txt`, `.out`, `summary.json`, `metrics.json`, `warnings.log`, `errors.log`, and `version.txt`. Parsed tables and raw file links are saved into generic Prisma models:

```text
ToolRun
ToolResultTable
ToolOutputFile
```

## Import Results

From the backend directory:

```bash
npm run import:results -- --input /path/to/pipeline/results
```

The importer:

- detects organism folders
- detects supported tool folders
- runs the registered parser
- saves normalized results to PostgreSQL
- marks absent tools as `not_available`
- marks parser failures as `failed`
- preserves raw output file paths for download links

## Add A Parser

Parsers live in:

```text
backend/services/resultsParsers/
```

Each parser returns:

```ts
{
  toolName,
  status,
  version,
  summary,
  tables,
  files,
  warnings,
  errors
}
```

To add or customize a parser:

1. Edit the matching `*.parser.ts` file.
2. Keep the normalized return shape.
3. Register new tool keys in `toolDefinitions.ts` and `parserRegistry.ts`.
4. Re-run `npm run import:results -- --input ...`.

## Docker

```bash
docker compose up --build
```

Frontend: http://localhost:3000  
Backend: http://localhost:3001

Apply database migrations after pulling schema changes:

```bash
docker compose --profile migrate run --rm --build migrate
```

## Genome workbench

Approved strain references are available at:

```text
/organisms/:organismId/genome?strain=:strainId
```

The workspace embeds JBrowse 2 and IGV.js and provides authenticated NCBI BLAST+ searches against approved BMGA FASTA references. Submitters can attach plain-text FASTA (`.fa`, `.fna`, `.fasta`) and GFF3 (`.gff`, `.gff3`) files. The API validates and normalizes FASTA, generates the `.fai` index, verifies GFF3 structure and matching reference names, and publishes files only after admin approval.

Local Docker stores reference objects in `backend_uploads`; production uses the configured private S3 bucket. BLAST indexes are generated from approved references into the `blast_data` volume and are rebuilt when reference checksums change.

Key limits are configured through `MAX_GENOME_REFERENCE_BYTES`, `MAX_BLAST_QUERY_BASES`, `BLAST_RATE_LIMIT_MAX`, `BLAST_TIMEOUT_MS`, and `BLAST_MAX_CONCURRENT`.

## FAIR and privacy

- FAIR gateway: `/fair`
- DCAT 3 / Bioschemas JSON-LD: `/api/backend/fair/catalog`
- Per-strain JSON-LD: `/api/backend/fair/strains/:id`
- OpenAPI: `/api/backend/openapi.json`
- Cookie notice: `/cookies`
- Privacy and data-use notice: `/privacy`

Set `DATASET_LICENSE_NAME` and `DATASET_LICENSE_URL` before claiming reusable distribution terms. External FAIRsharing registration requires the organization owner's account; after acceptance, set `FAIRSHARING_RECORD_URL`. See `docs/FAIR_REGISTRATION.md`.
