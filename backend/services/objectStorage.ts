import type { Response } from 'express';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
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
  if (extension === '.json') return 'application/json';
  if (extension === '.csv') return 'text/csv';
  if (extension === '.tsv') return 'text/tab-separated-values';
  return 'text/plain';
}
