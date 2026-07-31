import 'dotenv/config';
import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { readStoredTextFile, verifyStoredTextFileIntegrity } from '../services/objectStorage';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required to verify stored files.');

const maxBytes = Number(process.env.MAX_IMPORT_FILE_BYTES || 10 * 1024 * 1024);
const write = process.argv.includes('--write');
const pool = new Pool({ connectionString });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type Outcome = 'verified' | 'missing' | 'failed';

function outcomeFromReason(reason: string): Outcome {
  return /unavailable|outside the configured upload root|not configured/i.test(reason) ? 'missing' : 'failed';
}

async function verify() {
  const [submissionFiles, references, toolOutputs] = await Promise.all([
    prisma.submissionFile.findMany({ select: { id: true, storagePath: true, fileSizeBytes: true, checksumSha256: true } }),
    prisma.genomeReferenceFile.findMany({ select: { id: true, storagePath: true, fileSizeBytes: true, checksumSha256: true } }),
    prisma.toolOutputFile.findMany({ select: { id: true, filePath: true, fileSizeBytes: true, checksumSha256: true } }),
  ]);
  const totals: Record<Outcome, number> = { verified: 0, missing: 0, failed: 0 };

  for (const file of submissionFiles) {
    const result = await verifyStoredTextFileIntegrity(file.storagePath, { checksumSha256: file.checksumSha256, fileSizeBytes: file.fileSizeBytes, maxBytes });
    totals[result.ok ? 'verified' : outcomeFromReason(result.reason)] += 1;
  }
  for (const file of references) {
    const result = await verifyStoredTextFileIntegrity(file.storagePath, { checksumSha256: file.checksumSha256, fileSizeBytes: file.fileSizeBytes, maxBytes });
    totals[result.ok ? 'verified' : outcomeFromReason(result.reason)] += 1;
  }
  for (const file of toolOutputs) {
    try {
      const content = await readStoredTextFile(file.filePath, maxBytes);
      const fileSizeBytes = Buffer.byteLength(content, 'utf8');
      const checksumSha256 = createHash('sha256').update(content, 'utf8').digest('hex');
      const existingIsValid = !file.checksumSha256 || (file.checksumSha256 === checksumSha256 && file.fileSizeBytes === fileSizeBytes);
      if (!existingIsValid) throw new Error('Stored file checksum or size does not match its database record.');
      totals.verified += 1;
      if (write) await prisma.toolOutputFile.update({ where: { id: file.id }, data: { fileSizeBytes, checksumSha256, integrityStatus: 'VERIFIED', integrityCheckedAt: new Date(), integrityError: null } });
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Stored file could not be read';
      const outcome = outcomeFromReason(reason);
      totals[outcome] += 1;
      if (write) await prisma.toolOutputFile.update({ where: { id: file.id }, data: { integrityStatus: outcome === 'missing' ? 'MISSING' : 'FAILED', integrityCheckedAt: new Date(), integrityError: reason.slice(0, 500) } });
    }
  }

  console.log(JSON.stringify({ write, submissions: submissionFiles.length, references: references.length, toolOutputs: toolOutputs.length, totals }, null, 2));
}

verify()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
