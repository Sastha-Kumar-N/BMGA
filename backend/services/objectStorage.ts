import type { Request, Response } from 'express';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { normalizeToolName } from './resultsParsers/toolDefinitions';

type StorageDriver = 'local' | 's3';

const storageDriver = (process.env.STORAGE_DRIVER || 'local').trim().toLowerCase() as StorageDriver;
const allowedStorageDrivers = new Set<StorageDriver>(['local', 's3']);
const localUploadRoot = path.resolve(process.env.UPLOAD_ROOT || path.join(process.cwd(), 'uploads'));
const s3Bucket = process.env.S3_BUCKET?.trim() || '';
const s3Region = process.env.S3_REGION?.trim() || process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || '';
const s3Prefix = trimSlashes(process.env.S3_PREFIX || 'bmga');
const s3KmsKeyId = process.env.S3_KMS_KEY_ID?.trim() || '';

if (!allowedStorageDrivers.has(storageDriver)) {
  throw new Error('STORAGE_DRIVER must be either local or s3.');
}

if (storageDriver === 's3' && (!s3Bucket || !s3Region || isPlaceholderValue(s3Bucket))) {
  throw new Error('S3_BUCKET and S3_REGION or AWS_REGION are required when STORAGE_DRIVER=s3.');
}

const s3Client = storageDriver === 's3'
  ? new S3Client({ region: s3Region })
  : null;

export function configuredStorageDriver() {
  return storageDriver;
}

export async function saveUploadedResultFile(options: {
  organismId: number;
  toolName: string;
  fileName: string;
  fileContent: string;
}) {
  return storageDriver === 's3'
    ? saveUploadedResultFileToS3(options)
    : saveUploadedResultFileToDisk(options);
}

export async function saveSubmissionResultFile(options: {
  submissionId: string;
  toolName: string;
  fileName: string;
  fileContent: string;
}) {
  return storageDriver === 's3'
    ? saveSubmissionResultFileToS3(options)
    : saveSubmissionResultFileToDisk(options);
}

export async function saveGenomeReferenceFile(options: {
  ownerType: 'submission' | 'strain';
  ownerId: string;
  kind: 'FASTA' | 'FAI' | 'GFF3';
  fileName: string;
  fileContent: string;
}) {
  return storageDriver === 's3'
    ? saveGenomeReferenceFileToS3(options)
    : saveGenomeReferenceFileToDisk(options);
}

export async function readStoredTextFile(filePath: string, maxBytes: number) {
  if (isS3Uri(filePath)) {
    if (!s3Client) throw new Error('S3 storage is not configured on this server.');
    const parsed = parseS3Uri(filePath);
    if (!parsed || parsed.bucket !== s3Bucket) throw new Error('Stored file reference is not allowed.');

    const object = await s3Client.send(new GetObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
    if (object.ContentLength !== undefined && object.ContentLength > maxBytes) {
      throw new Error('Stored file is larger than the configured import limit.');
    }
    if (!object.Body) throw new Error('Stored file content is unavailable.');

    const body = await object.Body.transformToString('utf-8');
    if (Buffer.byteLength(body, 'utf8') > maxBytes) {
      throw new Error('Stored file is larger than the configured import limit.');
    }
    return body;
  }

  const resolvedPath = path.resolve(filePath);
  if (!isPathInside(localUploadRoot, resolvedPath)) throw new Error('Stored file path is outside the configured upload root.');
  if (!existsSync(resolvedPath)) throw new Error('Stored file is unavailable.');

  const content = readFileSync(resolvedPath, 'utf8');
  if (Buffer.byteLength(content, 'utf8') > maxBytes) {
    throw new Error('Stored file is larger than the configured import limit.');
  }
  return content;
}

export async function sendStoredFileDownload(res: Response, filePath: string, fileName: string) {
  if (isS3Uri(filePath)) {
    await sendS3ObjectDownload(res, filePath, fileName);
    return;
  }

  const resolvedPath = path.resolve(filePath);
  if (!isPathInside(localUploadRoot, resolvedPath)) {
    res.status(403).json({ error: 'Stored file path is outside the configured upload root' });
    return;
  }
  if (!existsSync(resolvedPath)) {
    res.status(404).json({ error: 'File path is not available on this server' });
    return;
  }

  res.download(resolvedPath, fileName);
}

export async function sendStoredFileInline(req: Request, res: Response, filePath: string, options: {
  fileName: string;
  contentType: string;
  cacheControl?: string;
}) {
  if (isS3Uri(filePath)) {
    await sendS3ObjectInline(req, res, filePath, options);
    return;
  }

  const resolvedPath = path.resolve(filePath);
  if (!isPathInside(localUploadRoot, resolvedPath)) {
    res.status(403).json({ error: 'Stored file path is outside the configured upload root' });
    return;
  }
  if (!existsSync(resolvedPath)) {
    res.status(404).json({ error: 'File is not available on this server' });
    return;
  }

  const size = statSync(resolvedPath).size;
  const range = parseByteRange(req.headers.range, size);
  if (range === 'invalid') {
    res.setHeader('Content-Range', `bytes */${size}`);
    res.status(416).end();
    return;
  }

  setInlineHeaders(res, options, size, range || undefined);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  createReadStream(resolvedPath, range ? { start: range.start, end: range.end } : undefined)
    .on('error', () => {
      if (!res.headersSent) res.status(500).json({ error: 'Stored file stream failed' });
      else res.destroy();
    })
    .pipe(res);
}

export async function deleteStoredFiles(filePaths: string[]) {
  const result = {
    requested: filePaths.length,
    deleted: 0,
    skipped: 0,
    failed: 0,
  };

  for (const filePath of filePaths) {
    if (!filePath) {
      result.skipped += 1;
      continue;
    }

    try {
      if (isS3Uri(filePath)) {
        const parsed = parseS3Uri(filePath);
        if (!parsed || parsed.bucket !== s3Bucket || !s3Client) {
          result.failed += 1;
          continue;
        }

        await s3Client.send(new DeleteObjectCommand({
          Bucket: parsed.bucket,
          Key: parsed.key,
        }));
        result.deleted += 1;
        continue;
      }

      const resolvedPath = path.resolve(filePath);
      if (!isPathInside(localUploadRoot, resolvedPath) || !existsSync(resolvedPath)) {
        result.skipped += 1;
        continue;
      }

      unlinkSync(resolvedPath);
      result.deleted += 1;
    } catch {
      result.failed += 1;
    }
  }

  return result;
}

function saveUploadedResultFileToDisk(options: {
  organismId: number;
  toolName: string;
  fileName: string;
  fileContent: string;
}) {
  const safeTool = safePathPart(normalizeToolName(options.toolName));
  const safeFile = safePathPart(options.fileName);
  const uploadDir = path.resolve(localUploadRoot, 'maya-results', String(options.organismId), safeTool);
  const relativeUploadDir = path.relative(localUploadRoot, uploadDir);

  if (relativeUploadDir.startsWith('..') || path.isAbsolute(relativeUploadDir)) {
    throw new Error('Invalid upload path');
  }

  mkdirSync(uploadDir, { recursive: true });
  const outputPath = path.join(uploadDir, `${Date.now()}-${safeFile}`);
  writeFileSync(outputPath, options.fileContent, 'utf8');
  return outputPath;
}

async function saveUploadedResultFileToS3(options: {
  organismId: number;
  toolName: string;
  fileName: string;
  fileContent: string;
}) {
  if (!s3Client) throw new Error('S3 storage client is not configured.');

  const safeTool = safePathPart(normalizeToolName(options.toolName));
  const safeFile = safePathPart(options.fileName);
  const key = [
    s3Prefix,
    'maya-results',
    String(options.organismId),
    safeTool,
    `${Date.now()}-${randomUUID()}-${safeFile}`,
  ].filter(Boolean).join('/');

  await s3Client.send(new PutObjectCommand({
    Bucket: s3Bucket,
    Key: key,
    Body: Buffer.from(options.fileContent, 'utf8'),
    ContentType: contentTypeForFileName(options.fileName),
    ServerSideEncryption: s3KmsKeyId ? 'aws:kms' : 'AES256',
    SSEKMSKeyId: s3KmsKeyId || undefined,
    Metadata: {
      organismId: String(options.organismId),
      toolName: safeTool,
      originalFileName: safeFile,
    },
  }));

  return `s3://${s3Bucket}/${key}`;
}

function saveSubmissionResultFileToDisk(options: {
  submissionId: string;
  toolName: string;
  fileName: string;
  fileContent: string;
}) {
  const safeSubmission = safePathPart(options.submissionId);
  const safeTool = safePathPart(normalizeToolName(options.toolName));
  const safeFile = safePathPart(options.fileName);
  const uploadDir = path.resolve(localUploadRoot, 'submission-results', safeSubmission, safeTool);
  const relativeUploadDir = path.relative(localUploadRoot, uploadDir);

  if (relativeUploadDir.startsWith('..') || path.isAbsolute(relativeUploadDir)) {
    throw new Error('Invalid upload path');
  }

  mkdirSync(uploadDir, { recursive: true });
  const outputPath = path.join(uploadDir, `${Date.now()}-${randomUUID()}-${safeFile}`);
  writeFileSync(outputPath, options.fileContent, 'utf8');
  return outputPath;
}

async function saveSubmissionResultFileToS3(options: {
  submissionId: string;
  toolName: string;
  fileName: string;
  fileContent: string;
}) {
  if (!s3Client) throw new Error('S3 storage client is not configured.');

  const safeSubmission = safePathPart(options.submissionId);
  const safeTool = safePathPart(normalizeToolName(options.toolName));
  const safeFile = safePathPart(options.fileName);
  const key = [
    s3Prefix,
    'submission-results',
    safeSubmission,
    safeTool,
    `${Date.now()}-${randomUUID()}-${safeFile}`,
  ].filter(Boolean).join('/');

  await s3Client.send(new PutObjectCommand({
    Bucket: s3Bucket,
    Key: key,
    Body: Buffer.from(options.fileContent, 'utf8'),
    ContentType: contentTypeForFileName(options.fileName),
    ServerSideEncryption: s3KmsKeyId ? 'aws:kms' : 'AES256',
    SSEKMSKeyId: s3KmsKeyId || undefined,
    Metadata: {
      submissionId: safeSubmission,
      toolName: safeTool,
      originalFileName: safeFile,
    },
  }));

  return `s3://${s3Bucket}/${key}`;
}

function saveGenomeReferenceFileToDisk(options: {
  ownerType: 'submission' | 'strain';
  ownerId: string;
  kind: 'FASTA' | 'FAI' | 'GFF3';
  fileName: string;
  fileContent: string;
}) {
  const safeOwner = safePathPart(options.ownerId);
  const safeFile = safePathPart(options.fileName);
  const uploadDir = path.resolve(localUploadRoot, 'genome-references', options.ownerType, safeOwner, options.kind.toLowerCase());
  if (!isPathInside(localUploadRoot, uploadDir)) throw new Error('Invalid genome reference upload path');

  mkdirSync(uploadDir, { recursive: true });
  const outputPath = path.join(uploadDir, `${Date.now()}-${randomUUID()}-${safeFile}`);
  writeFileSync(outputPath, options.fileContent, 'utf8');
  return outputPath;
}

async function saveGenomeReferenceFileToS3(options: {
  ownerType: 'submission' | 'strain';
  ownerId: string;
  kind: 'FASTA' | 'FAI' | 'GFF3';
  fileName: string;
  fileContent: string;
}) {
  if (!s3Client) throw new Error('S3 storage client is not configured.');

  const safeOwner = safePathPart(options.ownerId);
  const safeFile = safePathPart(options.fileName);
  const key = [
    s3Prefix,
    'genome-references',
    options.ownerType,
    safeOwner,
    options.kind.toLowerCase(),
    `${Date.now()}-${randomUUID()}-${safeFile}`,
  ].filter(Boolean).join('/');

  await s3Client.send(new PutObjectCommand({
    Bucket: s3Bucket,
    Key: key,
    Body: Buffer.from(options.fileContent, 'utf8'),
    ContentType: contentTypeForFileName(options.fileName),
    ServerSideEncryption: s3KmsKeyId ? 'aws:kms' : 'AES256',
    SSEKMSKeyId: s3KmsKeyId || undefined,
    Metadata: {
      ownerType: options.ownerType,
      ownerId: safeOwner,
      referenceKind: options.kind,
      originalFileName: safeFile,
    },
  }));

  return `s3://${s3Bucket}/${key}`;
}

async function sendS3ObjectDownload(res: Response, filePath: string, fileName: string) {
  if (!s3Client) {
    res.status(503).json({ error: 'S3 storage is not configured on this server' });
    return;
  }

  const parsed = parseS3Uri(filePath);
  if (!parsed) {
    res.status(400).json({ error: 'Invalid stored file reference' });
    return;
  }
  if (parsed.bucket !== s3Bucket) {
    res.status(403).json({ error: 'Stored file bucket is not allowed for this server' });
    return;
  }

  const object = await s3Client.send(new GetObjectCommand({
    Bucket: parsed.bucket,
    Key: parsed.key,
  }));

  res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadFileName(fileName)}"`);
  res.setHeader('Content-Type', object.ContentType || 'application/octet-stream');
  if (object.ContentLength !== undefined) {
    res.setHeader('Content-Length', String(object.ContentLength));
  }

  if (!(object.Body instanceof Readable)) {
    res.status(500).json({ error: 'Stored file stream is not available' });
    return;
  }

  object.Body.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ error: 'Stored file stream failed' });
    } else {
      res.destroy();
    }
  });
  object.Body.pipe(res);
}

async function sendS3ObjectInline(req: Request, res: Response, filePath: string, options: {
  fileName: string;
  contentType: string;
  cacheControl?: string;
}) {
  if (!s3Client) {
    res.status(503).json({ error: 'S3 storage is not configured on this server' });
    return;
  }

  const parsed = parseS3Uri(filePath);
  if (!parsed || parsed.bucket !== s3Bucket) {
    res.status(403).json({ error: 'Stored file reference is not allowed' });
    return;
  }

  const head = await s3Client.send(new HeadObjectCommand({ Bucket: parsed.bucket, Key: parsed.key }));
  const size = head.ContentLength;
  if (size === undefined) {
    res.status(500).json({ error: 'Stored file size is unavailable' });
    return;
  }
  const range = parseByteRange(req.headers.range, size);
  if (range === 'invalid') {
    res.setHeader('Content-Range', `bytes */${size}`);
    res.status(416).end();
    return;
  }

  setInlineHeaders(res, options, size, range || undefined, head.ETag);
  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  const object = await s3Client.send(new GetObjectCommand({
    Bucket: parsed.bucket,
    Key: parsed.key,
    Range: range ? `bytes=${range.start}-${range.end}` : undefined,
  }));
  if (!(object.Body instanceof Readable)) {
    res.status(500).json({ error: 'Stored file stream is not available' });
    return;
  }
  object.Body.on('error', () => {
    if (!res.headersSent) res.status(500).json({ error: 'Stored file stream failed' });
    else res.destroy();
  });
  object.Body.pipe(res);
}

function parseByteRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return 'invalid';

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return 'invalid';
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= size) return 'invalid';
  return { start, end: Math.min(end, size - 1) };
}

function setInlineHeaders(
  res: Response,
  options: { fileName: string; contentType: string; cacheControl?: string },
  fullSize: number,
  range?: { start: number; end: number },
  etag?: string,
) {
  res.status(range ? 206 : 200);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', options.contentType);
  res.setHeader('Content-Disposition', `inline; filename="${safeDownloadFileName(options.fileName)}"`);
  res.setHeader('Cache-Control', options.cacheControl || 'private, no-store');
  res.setHeader('Content-Length', String(range ? range.end - range.start + 1 : fullSize));
  if (range) res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${fullSize}`);
  if (etag) res.setHeader('ETag', etag);
}

function parseS3Uri(value: string) {
  if (!isS3Uri(value)) return null;
  const withoutScheme = value.slice('s3://'.length);
  const slashIndex = withoutScheme.indexOf('/');
  if (slashIndex <= 0 || slashIndex === withoutScheme.length - 1) return null;

  return {
    bucket: withoutScheme.slice(0, slashIndex),
    key: withoutScheme.slice(slashIndex + 1),
  };
}

function isS3Uri(value: string) {
  return value.startsWith('s3://');
}

function safePathPart(value: string) {
  return value.trim().replace(/[^a-z0-9_.-]/gi, '_').slice(0, 180) || 'file';
}

function safeDownloadFileName(value: string) {
  return safePathPart(path.basename(value));
}

function trimSlashes(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

function isPlaceholderValue(value: string) {
  return /^replace[_-]?with/i.test(value) || /^your-/i.test(value);
}

function isPathInside(root: string, candidate: string) {
  const relativePath = path.relative(root, candidate);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

function contentTypeForFileName(fileName: string) {
  const extension = path.extname(fileName).toLowerCase();
  if (['.fa', '.fna', '.fasta', '.fai'].includes(extension)) return 'text/plain; charset=utf-8';
  if (['.gff', '.gff3'].includes(extension)) return 'text/gff3; charset=utf-8';
  if (extension === '.json') return 'application/json';
  if (extension === '.csv') return 'text/csv';
  if (extension === '.tsv') return 'text/tab-separated-values';
  return 'text/plain';
}
