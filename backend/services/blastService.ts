import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { GenomeReferenceKind, GenomeReferenceStatus } from '@prisma/client';
import { readStoredTextFile } from './objectStorage';
import { prepareGenomeReference } from './genomeReferenceService';

type BlastManifest = {
  fingerprint: string;
  databasePrefix: string;
  referenceCount: number;
  totalBases: number;
  builtAt: string;
  strainListFiles: Record<string, string>;
};

export class BlastServiceError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

let databaseBuild: Promise<BlastManifest> | null = null;
let activeSearches = 0;

export async function runBlastSearch(prisma: PrismaClient, options: {
  query: unknown;
  strainId?: number;
  maxReferenceBytes: number;
  maxQueryBases: number;
  maxConcurrentSearches: number;
  timeoutMs: number;
}) {
  const query = normalizeQuery(options.query, options.maxQueryBases);
  if ('error' in query) throw new BlastServiceError(400, query.error);
  if (activeSearches >= options.maxConcurrentSearches) {
    throw new BlastServiceError(503, 'The BLAST service is at capacity. Please try again shortly.');
  }

  activeSearches += 1;
  try {
    const manifest = await ensureBlastDatabase(prisma, options.maxReferenceBytes);
    const strainListFile = options.strainId ? manifest.strainListFiles[String(options.strainId)] : undefined;
    if (options.strainId && !strainListFile) throw new BlastServiceError(404, 'This strain has no approved FASTA in the BLAST database.');
    const blastArguments = [
      '-db', manifest.databasePrefix,
      '-query', '-',
      '-task', 'blastn',
      '-evalue', '1e-5',
      '-max_target_seqs', '50',
      '-max_hsps', '3',
      '-num_threads', '2',
      '-dust', 'yes',
      '-soft_masking', 'true',
      '-outfmt', '6 qseqid sseqid pident length mismatch gapopen qstart qend sstart send evalue bitscore stitle',
    ];
    if (strainListFile) blastArguments.push('-seqidlist', strainListFile);
    const output = await runProcess('blastn', blastArguments, query.fasta, options.timeoutMs, 6 * 1024 * 1024);

    const parsedHits = output.stdout.trim()
      ? output.stdout.trim().split(/\r?\n/).slice(0, 250).map(parseHit)
      : [];
    const allowedHits = options.strainId
      ? parsedHits.filter((hit) => hit.strainId === options.strainId)
      : parsedHits;
    const strainIds = Array.from(new Set(allowedHits.map((hit) => hit.strainId).filter((id): id is number => id !== null)));
    const strains = strainIds.length
      ? await prisma.strain.findMany({
        where: { id: { in: strainIds } },
        select: {
          id: true,
          organismId: true,
          strainName: true,
          assemblyAccession: true,
          organism: { select: { scientificName: true } },
        },
      })
      : [];
    const strainMap = new Map(strains.map((strain) => [strain.id, strain]));

    return {
      query: { sequenceCount: query.sequenceCount, totalBases: query.totalBases },
      database: {
        referenceCount: manifest.referenceCount,
        totalBases: manifest.totalBases,
        builtAt: manifest.builtAt,
        software: 'NCBI BLAST+',
      },
      evidenceBasis: 'GENOTYPIC' as const,
      limitations: 'Sequence similarity is computational evidence. It does not establish phenotype, pathogenicity, transmission, or clinical significance.',
      hits: allowedHits.slice(0, 100).map((hit) => {
        const strain = hit.strainId ? strainMap.get(hit.strainId) : undefined;
        return {
          ...hit,
          organismId: strain?.organismId || null,
          organismName: strain?.organism.scientificName || null,
          strainName: strain?.strainName || null,
          assemblyAccession: strain?.assemblyAccession || null,
        };
      }),
    };
  } finally {
    activeSearches -= 1;
  }
}

async function ensureBlastDatabase(prisma: PrismaClient, maxReferenceBytes: number) {
  if (!databaseBuild) {
    databaseBuild = buildBlastDatabase(prisma, maxReferenceBytes).finally(() => {
      databaseBuild = null;
    });
  }
  return databaseBuild;
}

async function buildBlastDatabase(prisma: PrismaClient, maxReferenceBytes: number): Promise<BlastManifest> {
  const references = await prisma.genomeReferenceFile.findMany({
    where: {
      kind: GenomeReferenceKind.FASTA,
      status: GenomeReferenceStatus.PUBLISHED,
      isPublic: true,
      strainId: { not: null },
    },
    orderBy: { id: 'asc' },
    include: {
      strain: { select: { id: true, strainName: true, organism: { select: { scientificName: true } } } },
    },
  });
  if (!references.length) throw new BlastServiceError(503, 'No approved reference FASTA files are available for BLAST yet.');

  const fingerprint = createHash('sha256')
    .update(references.map((reference) => `${reference.id}:${reference.checksumSha256}:${reference.updatedAt.toISOString()}`).join('|'))
    .digest('hex');
  const databaseRoot = path.resolve(process.env.BLAST_DB_DIR || path.join(process.cwd(), 'blastdb'));
  mkdirSync(databaseRoot, { recursive: true });
  const manifestPath = path.join(databaseRoot, 'manifest.json');
  if (existsSync(manifestPath)) {
    try {
      const existing = JSON.parse(readFileSync(manifestPath, 'utf8')) as BlastManifest;
      const databaseExists = ['.njs', '.ndb', '.nhr'].some((extension) => existsSync(`${existing.databasePrefix}${extension}`));
      if (existing.fingerprint === fingerprint && databaseExists && existing.strainListFiles) return existing;
    } catch {
      // A malformed or interrupted manifest is rebuilt from approved references.
    }
  }

  let combinedFasta = '';
  let totalBases = 0;
  const sequenceIdsByStrain = new Map<number, string[]>();
  for (const reference of references) {
    if (!reference.strain) continue;
    const fasta = await readStoredTextFile(reference.storagePath, maxReferenceBytes);
    const transformed = rewriteReferenceHeaders(fasta, reference.strain.id);
    combinedFasta += transformed.fasta;
    totalBases += transformed.totalBases;
    sequenceIdsByStrain.set(reference.strain.id, transformed.sequenceIds);
  }
  if (!combinedFasta) throw new BlastServiceError(503, 'Approved reference FASTA content is unavailable.');

  const databasePrefix = path.join(databaseRoot, `bmga-${fingerprint.slice(0, 16)}`);
  const sourcePath = `${databasePrefix}.fna`;
  writeFileSync(sourcePath, combinedFasta, { encoding: 'utf8', mode: 0o600 });
  await runProcess('makeblastdb', [
    '-in', sourcePath,
    '-dbtype', 'nucl',
    '-parse_seqids',
    '-title', 'BMGA approved nucleotide references',
    '-out', databasePrefix,
  ], undefined, 120_000, 2 * 1024 * 1024);

  const strainListFiles: Record<string, string> = {};
  for (const [strainId, sequenceIds] of sequenceIdsByStrain.entries()) {
    const listPath = `${databasePrefix}-strain-${strainId}.seqids`;
    writeFileSync(listPath, `${sequenceIds.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });
    strainListFiles[String(strainId)] = listPath;
  }

  const manifest: BlastManifest = {
    fingerprint,
    databasePrefix,
    referenceCount: references.length,
    totalBases,
    builtAt: new Date().toISOString(),
    strainListFiles,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 });
  return manifest;
}

function normalizeQuery(value: unknown, maxQueryBases: number) {
  if (typeof value !== 'string' || !value.trim()) return { error: 'Paste a nucleotide sequence in FASTA or plain sequence format.' } as const;
  const source = value.trim().startsWith('>') ? value : `>query\n${value}`;
  const prepared = prepareGenomeReference({ kind: 'FASTA', fileName: 'query.fna', fileContent: source, maxBytes: maxQueryBases * 3 });
  if ('error' in prepared) return prepared;
  const fasta = prepared.files.find((file) => file.kind === 'FASTA');
  const validation = fasta?.validation || {};
  const totalBases = Number(validation.totalBases || 0);
  const sequenceCount = Number(validation.sequenceCount || 0);
  if (!fasta || totalBases > maxQueryBases) return { error: `BLAST queries are limited to ${maxQueryBases.toLocaleString()} nucleotide bases.` } as const;
  if (sequenceCount > 10) return { error: 'BLAST queries can contain at most 10 FASTA records.' } as const;
  return { fasta: fasta.content, totalBases, sequenceCount };
}

function rewriteReferenceHeaders(fasta: string, strainId: number) {
  const lines = fasta.replace(/\r\n?/g, '\n').split('\n');
  let totalBases = 0;
  const sequenceIds: string[] = [];
  const rewritten = lines.map((line) => {
    if (!line.startsWith('>')) {
      totalBases += line.trim().length;
      return line;
    }
    const originalId = line.slice(1).trim().split(/\s+/)[0].replace(/[^A-Za-z0-9_.+-]/g, '_').slice(0, 120) || 'sequence';
    const sequenceId = `BMGA_S${strainId}_${originalId}`;
    sequenceIds.push(sequenceId);
    return `>${sequenceId}`;
  }).join('\n');
  return { fasta: `${rewritten.trim()}\n`, totalBases, sequenceIds };
}

function parseHit(line: string) {
  const [queryId, subjectId, identityRaw, alignmentLengthRaw, mismatchRaw, gapOpenRaw, queryStartRaw, queryEndRaw, subjectStartRaw, subjectEndRaw, evalueRaw, bitScoreRaw, title] = line.split('\t');
  const strainMatch = /^BMGA_S(\d+)_/.exec(subjectId || '');
  return {
    queryId,
    subjectId,
    strainId: strainMatch ? Number(strainMatch[1]) : null,
    identityPercent: Number(identityRaw),
    alignmentLength: Number(alignmentLengthRaw),
    mismatches: Number(mismatchRaw),
    gapOpenings: Number(gapOpenRaw),
    queryStart: Number(queryStartRaw),
    queryEnd: Number(queryEndRaw),
    subjectStart: Number(subjectStartRaw),
    subjectEnd: Number(subjectEndRaw),
    evalue: evalueRaw,
    bitScore: Number(bitScoreRaw),
    title: title || null,
  };
}

function runProcess(command: string, args: string[], stdin: string | undefined, timeoutMs: number, maxOutputBytes: number) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let outputBytes = 0;
    let settled = false;
    const timeout = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new BlastServiceError(504, 'The BLAST search exceeded the server time limit.'));
    }, timeoutMs);

    function finish(error?: Error) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error) reject(error);
      else resolve({ stdout, stderr });
    }

    child.on('error', () => finish(new BlastServiceError(503, 'NCBI BLAST+ is not available on this server.')));
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill('SIGKILL');
        finish(new BlastServiceError(413, 'The BLAST result exceeded the server output limit.'));
        return;
      }
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString('utf8')}`.slice(-16_000);
    });
    child.on('close', (code) => {
      if (settled) return;
      if (code !== 0) finish(new BlastServiceError(422, 'NCBI BLAST+ could not process this query or reference database.'));
      else finish();
    });
    if (stdin) child.stdin.end(stdin);
    else child.stdin.end();
  });
}
