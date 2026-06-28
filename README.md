# BMGA / Bharat Genome Atlas

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
