import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import {
  AboutTeamSection,
  AmrFindingStatus,
  AmrImportJobStatus,
  AmrImportSource,
  NotificationType,
  ApprovalStatus,
  ContactMessageStatus,
  EvidenceBasis,
  GenomeReferenceKind,
  GenomeReferenceStatus,
  Prisma,
  PrismaClient,
  SubmissionFileStatus,
  SurveillanceScope,
  UserAffiliation,
  UserRole,
} from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { AsyncLocalStorage } from 'async_hooks';
import { createHash, randomUUID } from 'crypto';
import { getOrganismById } from './services/organismService';
import { getOrganismResults, getOrganismToolResult, getToolOutputFile, saveNormalizedToolRun } from './services/resultService';
import { normalizeToolName, TOOL_DEFINITIONS, TOOL_KEYS } from './services/resultsParsers/toolDefinitions';
import {
  configuredStorageDriver,
  deleteStoredFiles,
  contentTypeForFileName,
  readStoredTextFile,
  saveGenomeReferenceFile,
  saveProfilePhotoFile,
  saveSubmissionResultFile,
  saveUploadedResultFile,
  sendStoredFileDownload,
  sendStoredFileInline,
} from './services/objectStorage';
import { prepareGenomeReference, type UploadableGenomeReferenceKind } from './services/genomeReferenceService';
import { BlastServiceError, getBlastDatabaseStatus, rebuildBlastDatabase, runBlastSearch } from './services/blastService';
import {
  getAmrSurveillanceInsights,
  getSurveillanceFilterOptions,
  getSurveillanceOverview,
  getSurveillanceRecords,
  syncAmrGenesFromToolRows,
  type SurveillanceFilters,
} from './services/surveillanceService';
import {
  amrFindingInclude,
  amrDashboard,
  amrFilterOptions,
  createAmrFinding,
  listPublishedAmrFindings,
  publishedAmrFindingBySlug,
  setAmrFindingStatus,
  updateAmrFinding,
  type AmrFindingFilters,
} from './services/amrFindingsService';
import {
  addFindingModerationNote,
  addPublicationModerationNote,
  amrFindingJsonSchema,
  createAdminPublication,
  createImportedPublicationDrafts,
  createNotification,
  createUserFindingDraft,
  createUserPublication,
  getOwnAmrWorkspace,
  importUserJsonFindings,
  listPublishedPublications,
  moderateFinding,
  moderatePublication,
  parseAmrJsonPayload,
  publishedPublicationBySlug,
  submitUserFinding,
  submitUserPublication,
  updateUserFindingDraft,
  updateAdminPublication,
  updateUserPublication,
  type FindingModerationAction,
  type PublicationModerationAction,
} from './services/amrWorkflowService';
import { importSourceIsSupported, previewExternalAmrImport } from './services/amrExternalImportService';
// --- Runtime Configuration --------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production';
const allowInsecureDevSecrets = process.env.ALLOW_INSECURE_DEV_SECRETS === 'true';
const APP_NAME = process.env.APP_NAME || 'bgdb';
const APP_VERSION = process.env.APP_VERSION || process.env.npm_package_version || '0.0.0';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
const ENABLE_REQUEST_LOGGING = process.env.ENABLE_REQUEST_LOGGING !== 'false';
const PORT = Number(process.env.PORT || 3001);
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '6mb';
const GENOME_REFERENCE_BODY_LIMIT = process.env.GENOME_REFERENCE_BODY_LIMIT || '32mb';
const MAX_IMPORT_FILE_BYTES = Number(process.env.MAX_IMPORT_FILE_BYTES || 10 * 1024 * 1024);
const MAX_GENOME_REFERENCE_BYTES = Number(process.env.MAX_GENOME_REFERENCE_BYTES || 10 * 1024 * 1024);
const MAX_PROFILE_PHOTO_BYTES = Number(process.env.MAX_PROFILE_PHOTO_BYTES || 2 * 1024 * 1024);
const MAX_BLAST_QUERY_BASES = numberEnv('MAX_BLAST_QUERY_BASES', 50_000);
const BLAST_TIMEOUT_MS = numberEnv('BLAST_TIMEOUT_MS', 30_000);
const BLAST_MAX_CONCURRENT = numberEnv('BLAST_MAX_CONCURRENT', 2);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.FRONTEND_URL || 'http://localhost:3000').split(',')[0].trim().replace(/\/$/, '');
const DATASET_CONTACT_EMAIL = normalizedEmail(process.env.DATASET_CONTACT_EMAIL || 'admin@bgdb.org');
const DATASET_LICENSE_URL = (process.env.DATASET_LICENSE_URL || '').trim();
const DATASET_LICENSE_NAME = (process.env.DATASET_LICENSE_NAME || '').trim();
const FAIRSHARING_RECORD_URL = (process.env.FAIRSHARING_RECORD_URL || '').trim();
const DATASET_DOI = (process.env.DATASET_DOI || '').trim();

const TRUSTED_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
];

const UNSAFE_SECRET_MARKERS = [
  '',
  'fallback_secret',
  'change-me',
  'change-me-in-production',
  'dev-secret-change-me',
  'secret',
  'password',
];

function isPlaceholderSecret(value: string) {
  return UNSAFE_SECRET_MARKERS.includes(value) || /^dev-local-/i.test(value) || /^replace[_-]?with/i.test(value);
}

function csvEnv(name: string) {
  return (process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function numberEnv(name: string, fallback: number) {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function validateSecret(name: string, value: string | undefined, minimumLength = 32) {
  const trimmed = value?.trim() || '';
  const unsafe = isPlaceholderSecret(trimmed);
  if (isProduction && !allowInsecureDevSecrets && (trimmed.length < minimumLength || unsafe)) {
    throw new Error(`${name} must be set to a strong non-placeholder value in production.`);
  }
  if (!trimmed) {
    throw new Error(`${name} is required to start the API server.`);
  }
  return trimmed;
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the API server.');
}

const JWT_SECRET = validateSecret('JWT_SECRET', process.env.JWT_SECRET, 32);
const configuredOrigins = [...csvEnv('CORS_ORIGIN'), ...csvEnv('FRONTEND_URL')];
if (isProduction && !allowInsecureDevSecrets && configuredOrigins.length === 0) {
  throw new Error('CORS_ORIGIN or FRONTEND_URL must be set in production.');
}
const allowedOrigins = new Set(isProduction ? configuredOrigins : [...configuredOrigins, ...TRUSTED_DEV_ORIGINS]);
const adminAllowedIps = new Set(csvEnv('ADMIN_ALLOWED_IPS'));
const adminEmailDomains = new Set(csvEnv('ADMIN_EMAIL_DOMAINS').map((domain) => domain.toLowerCase()));

const pool = new Pool({
  connectionString,
  max: numberEnv('DB_POOL_MAX', 10),
  idleTimeoutMillis: numberEnv('DB_IDLE_TIMEOUT_MS', 30_000),
  connectionTimeoutMillis: numberEnv('DB_CONNECTION_TIMEOUT_MS', 10_000),
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const app = express();
app.disable('x-powered-by');

function parseNumericParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || "";
}

type AuthenticatedRequest = Request & {
  requestId?: string;
  user?: {
    userId: string;
    role: UserRole;
    email?: string;
    name?: string;
    affiliation?: UserAffiliation;
  };
};

type RequestContext = {
  requestId: string;
  ipAddress: string;
  userAgent?: string;
  userId?: string;
  userEmail?: string;
  userRole?: UserRole;
};

const requestContext = new AsyncLocalStorage<RequestContext>();

function getClientIp(req: Request) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const firstForwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor?.split(',')[0];
  return (firstForwardedIp || req.ip || req.socket.remoteAddress || 'unknown').trim();
}

function currentContext() {
  return requestContext.getStore();
}

function hashIdentifier(value: string) {
  return createHash('sha256').update(value.toLowerCase()).digest('hex').slice(0, 24);
}

function logEvent(level: 'debug' | 'info' | 'warn' | 'error', message: string, fields: Record<string, unknown> = {}) {
  if (level === 'debug' && LOG_LEVEL !== 'debug') return;

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    app: APP_NAME,
    message,
    ...fields,
  };

  if (isProduction) {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](JSON.stringify(payload));
  } else {
    console[level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log'](`[${payload.timestamp}] ${level.toUpperCase()} ${message}`, fields);
  }
}

function safeErrorMessage(error: unknown, fallback: string) {
  if (isProduction) return fallback;
  return error instanceof Error ? error.message : fallback;
}

function securityHeaders(req: Request, res: Response, next: NextFunction) {
  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data: https:",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "form-action 'self'",
  ].join('; ');

  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('X-Request-ID', (req as AuthenticatedRequest).requestId || currentContext()?.requestId || randomUUID());
  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
}

function requestContextMiddleware(req: Request, res: Response, next: NextFunction) {
  const incomingRequestId = Array.isArray(req.headers['x-request-id']) ? req.headers['x-request-id'][0] : req.headers['x-request-id'];
  const requestId = incomingRequestId && /^[A-Za-z0-9_.:-]{8,128}$/.test(incomingRequestId) ? incomingRequestId : randomUUID();
  const context: RequestContext = {
    requestId,
    ipAddress: getClientIp(req),
    userAgent: req.headers['user-agent'],
  };

  (req as AuthenticatedRequest).requestId = requestId;
  requestContext.run(context, () => next());
}

function requestLogger(req: Request, res: Response, next: NextFunction) {
  if (!ENABLE_REQUEST_LOGGING) return next();
  const startedAt = Date.now();

  res.on('finish', () => {
    const context = currentContext();
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logEvent(level, 'http_request', {
      requestId: context?.requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });
  });

  next();
}

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

const rateLimitBuckets = new Map<string, RateLimitBucket>();

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitBuckets.delete(key);
    }
  }
}, 60_000).unref();

function rateLimit(options: {
  name: string;
  windowMs: number;
  max: number;
  key: (req: Request) => string;
}) {
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${options.name}:${options.key(req)}`;
    const bucket = rateLimitBuckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      rateLimitBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      res.setHeader('Retry-After', String(retryAfterSeconds));
      logEvent('warn', 'rate_limit_exceeded', {
        requestId: currentContext()?.requestId,
        limiter: options.name,
        path: req.path,
        ipAddress: currentContext()?.ipAddress,
      });
      return res.status(429).json({ error: 'Too many requests. Please try again later.' });
    }

    next();
  };
}

const defaultRateLimitWindowMs = numberEnv('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000);
const loginRateLimiter = rateLimit({
  name: 'login',
  windowMs: defaultRateLimitWindowMs,
  max: numberEnv('LOGIN_RATE_LIMIT_MAX', 10),
  key: (req) => `${getClientIp(req)}:${hashIdentifier(normalizedEmail(req.body?.email) || 'unknown')}`,
});
const contactRateLimiter = rateLimit({
  name: 'contact',
  windowMs: defaultRateLimitWindowMs,
  max: numberEnv('CONTACT_RATE_LIMIT_MAX', 5),
  key: (req) => `${getClientIp(req)}:${hashIdentifier(normalizedEmail(req.body?.email) || 'unknown')}`,
});
const adminRateLimiter = rateLimit({
  name: 'admin',
  windowMs: defaultRateLimitWindowMs,
  max: numberEnv('ADMIN_RATE_LIMIT_MAX', 300),
  key: (req) => `${getClientIp(req)}:${req.path}`,
});
const importRateLimiter = rateLimit({
  name: 'import',
  windowMs: defaultRateLimitWindowMs,
  max: numberEnv('IMPORT_RATE_LIMIT_MAX', 40),
  key: (req) => `${getClientIp(req)}:${req.path}`,
});
const surveillanceRateLimiter = rateLimit({
  name: 'surveillance',
  windowMs: defaultRateLimitWindowMs,
  max: numberEnv('SURVEILLANCE_RATE_LIMIT_MAX', 600),
  key: (req) => `${getClientIp(req)}:${req.path}`,
});
const blastRateLimiter = rateLimit({
  name: 'blast',
  windowMs: defaultRateLimitWindowMs,
  max: numberEnv('BLAST_RATE_LIMIT_MAX', 20),
  key: (req) => `${getClientIp(req)}:${currentContext()?.userId || 'anonymous'}`,
});
const accountSecurityRateLimiter = rateLimit({
  name: 'account-security',
  windowMs: defaultRateLimitWindowMs,
  max: numberEnv('ACCOUNT_SECURITY_RATE_LIMIT_MAX', 10),
  key: (req) => `${getClientIp(req)}:${currentContext()?.userId || 'anonymous'}`,
});
const amrSubmissionRateLimiter = rateLimit({
  name: 'amr-submission',
  windowMs: defaultRateLimitWindowMs,
  max: numberEnv('AMR_SUBMISSION_RATE_LIMIT_MAX', 40),
  key: (req) => `${getClientIp(req)}:${currentContext()?.userId || 'anonymous'}`,
});

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    await writeAdminLog(undefined, "AUTH_REQUIRED", "Auth", undefined, { result: "failure", statusCode: 401, path: req.path });
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId?: string; role?: string; authVersion?: number };
    if (!payload.userId) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true, affiliation: true, authVersion: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Account no longer exists" });
    }
    if ((payload.authVersion ?? 0) !== user.authVersion) {
      return res.status(401).json({ error: "Session expired. Please sign in again" });
    }

    req.user = {
      userId: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
      affiliation: user.affiliation,
    };
    const context = currentContext();
    if (context) {
      context.userId = user.id;
      context.userEmail = user.email;
      context.userRole = user.role;
    }
    next();
  } catch {
    await writeAdminLog(undefined, "AUTH_INVALID_TOKEN", "Auth", undefined, { result: "failure", statusCode: 401, path: req.path });
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function adminAccessAllowed(req: AuthenticatedRequest) {
  if (!req.user || req.user.role !== UserRole.ADMIN) return true;
  const ipAllowed = adminAllowedIps.size === 0 || adminAllowedIps.has(getClientIp(req));
  const domain = req.user.email?.split('@')[1]?.toLowerCase();
  const domainAllowed = adminEmailDomains.size === 0 || (domain ? adminEmailDomains.has(domain) : false);

  return ipAllowed && domainAllowed;
}

function requireRole(roles: UserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      if (!req.user || !roles.includes(req.user.role)) {
        void writeAdminLog(req.user?.userId, "PERMISSION_DENIED", "Auth", undefined, {
          result: "failure",
          requiredRoles: roles,
          actorRole: req.user?.role,
          path: req.path,
          statusCode: 403,
        });
        return res.status(403).json({ error: `${roles.join(" or ")} role required` });
      }
      if (roles.includes(UserRole.ADMIN) && !adminAccessAllowed(req)) {
        void writeAdminLog(req.user.userId, "ADMIN_ACCESS_POLICY_DENIED", "Auth", undefined, {
          result: "failure",
          path: req.path,
          statusCode: 403,
        });
        return res.status(403).json({ error: "Admin access is not allowed from this context" });
      }
      next();
    });
  };
}

const requireAdmin = requireRole([UserRole.ADMIN]);
const requireAmrAuthor = requireRole([UserRole.ADMIN, UserRole.MODERATOR, UserRole.CONTRIBUTOR]);

function parseJsonObject(value: unknown, fallback: Record<string, unknown> = {}) {
  if (!value) return fallback;
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value !== "string") return fallback;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : fallback;
  } catch {
    return fallback;
  }
}

function parseJsonArray(value: unknown) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ASSIGNABLE_ROLES = new Set<UserRole>([
  UserRole.STUDENT,
  UserRole.CONTRIBUTOR,
  UserRole.MODERATOR,
  UserRole.ADMIN,
]);

function textValue(value: unknown, maxLength = 500) {
  if (typeof value !== "string") return undefined;
  const trimmed = value
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function sanitizeContactText(value: unknown, maxLength = 500, preserveNewlines = false) {
  if (typeof value !== "string") return undefined;
  const raw = value.trim().slice(0, maxLength);
  if (!raw) return undefined;

  const withoutMarkup = raw
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "");
  const controlPattern = preserveNewlines
    ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g
    : /[\u0000-\u001F\u007F]/g;
  const cleaned = withoutMarkup.replace(controlPattern, " ");

  return preserveNewlines
    ? cleaned.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).join("\n").slice(0, maxLength)
    : cleaned.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function buildContactMessagePayload(body: Record<string, unknown>) {
  const name = sanitizeContactText(body.name, 160);
  const email = normalizedEmail(body.email);
  const organization = sanitizeContactText(body.organization, 220);
  const subject = sanitizeContactText(body.subject, 240);
  const message = sanitizeContactText(body.message, 5000, true);

  if (!name || !email || !subject || !message) {
    return { error: "Name, email, subject, and message are required" as const };
  }

  if (!EMAIL_PATTERN.test(email)) {
    return { error: "Please provide a valid email address" as const };
  }

  return {
    data: {
      name,
      email,
      organization,
      subject,
      message,
    },
  };
}

function isAllowedAboutPortrait(value: string) {
  return /^\/[A-Za-z0-9._/-]{1,300}$/.test(value) && !value.includes('..');
}

function buildAboutTeamMemberPayload(body: Record<string, unknown>, requireIdentity: boolean) {
  const has = (field: string) => Object.prototype.hasOwnProperty.call(body, field);
  const data: Record<string, unknown> = {};
  const rawSection = typeof body.section === 'string' ? body.section.toUpperCase() : '';

  if (requireIdentity || has('section')) {
    if (!Object.values(AboutTeamSection).includes(rawSection as AboutTeamSection)) {
      return { error: 'A valid team section is required' as const };
    }
    data.section = rawSection as AboutTeamSection;
  }

  if (requireIdentity || has('name')) {
    const name = sanitizeContactText(body.name, 160);
    if (!name) return { error: 'Member name is required' as const };
    data.name = name;
  }

  const textFields: Array<[string, number, boolean?]> = [
    ['title', 320],
    ['affiliation', 320],
    ['contribution', 3000, true],
    ['course', 220],
  ];
  for (const [field, maxLength, preserveNewlines] of textFields) {
    if (!has(field)) continue;
    data[field] = body[field] === null ? null : sanitizeContactText(body[field], maxLength, preserveNewlines);
  }

  if (has('email')) {
    const email = body.email === null ? null : normalizedEmail(body.email);
    if (email && !EMAIL_PATTERN.test(email)) return { error: 'Please provide a valid member email address' as const };
    data.email = email || null;
  }

  if (has('portraitSrc')) {
    if (body.portraitSrc === null || body.portraitSrc === '') {
      data.portraitSrc = null;
    } else {
      const portraitSrc = sanitizeContactText(body.portraitSrc, 300);
      if (!portraitSrc || !isAllowedAboutPortrait(portraitSrc)) {
        return { error: 'Portrait path must be a safe relative public path beginning with /' as const };
      }
      data.portraitSrc = portraitSrc;
    }
  }

  if (has('displayOrder')) {
    const displayOrder = Number(body.displayOrder);
    if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 10_000) {
      return { error: 'Display order must be a whole number between 0 and 10000' as const };
    }
    data.displayOrder = displayOrder;
  }

  return { data };
}

function buildToolCatalogPayload(body: Record<string, unknown>, requireIdentity: boolean) {
  const has = (field: string) => Object.prototype.hasOwnProperty.call(body, field);
  const data: Record<string, unknown> = {};
  if (requireIdentity || has('key')) {
    const key = normalizeToolName(textValue(body.key, 80) || '');
    if (!/^[a-z][a-z0-9_]{1,79}$/.test(key)) return { error: 'Tool key must use lowercase letters, numbers, and underscores' as const };
    data.key = key;
  }
  for (const [field, limit] of [['label', 120], ['category', 80], ['description', 500]] as const) {
    if (!requireIdentity && !has(field)) continue;
    const value = sanitizeContactText(body[field], limit, field === 'description');
    if (requireIdentity && !value) return { error: `Tool ${field} is required` as const };
    if (value) data[field] = value;
  }
  if (has('active')) {
    if (typeof body.active !== 'boolean') return { error: 'Tool active status must be true or false' as const };
    data.active = body.active;
  }
  return { data };
}

function normalizedEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function destructiveConfirmationMatches(value: unknown, expected: string) {
  if (typeof value !== "string") return false;
  const raw = value.trim();
  const target = expected.trim();
  return raw.toUpperCase() === "DELETE" || raw === target || raw.toLowerCase() === target.toLowerCase();
}

function parseOptionalInt(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseOptionalFloat(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalDate(value: unknown) {
  if (!value || typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : undefined;
}

function parseAffiliation(value: unknown) {
  const normalized = String(value || "").trim().toUpperCase();
  return Object.values(UserAffiliation).includes(normalized as UserAffiliation)
    ? normalized as UserAffiliation
    : UserAffiliation.RESEARCH;
}

function parseEvidenceBasis(value: unknown) {
  const normalized = String(value || '').trim().toUpperCase();
  return Object.values(EvidenceBasis).includes(normalized as EvidenceBasis)
    ? normalized as EvidenceBasis
    : EvidenceBasis.GENOTYPIC;
}

function parseSurveillanceScope(value: unknown, country?: string) {
  const normalized = String(value || '').trim().toUpperCase();
  if (Object.values(SurveillanceScope).includes(normalized as SurveillanceScope)) {
    return normalized as SurveillanceScope;
  }
  return country?.trim().toLowerCase() === 'india'
    ? SurveillanceScope.NATIONAL
    : SurveillanceScope.GLOBAL;
}

function parseSurveillanceFilters(query: Request['query']): SurveillanceFilters {
  const organismId = parseOptionalInt(Array.isArray(query.organismId) ? query.organismId[0] : query.organismId);
  const evidenceValue = textValue(Array.isArray(query.evidenceBasis) ? query.evidenceBasis[0] : query.evidenceBasis, 40)?.toUpperCase();
  const scopeValue = textValue(Array.isArray(query.scope) ? query.scope[0] : query.scope, 40)?.toUpperCase();
  const from = parseOptionalDate(Array.isArray(query.from) ? query.from[0] : query.from);
  const rawTo = parseOptionalDate(Array.isArray(query.to) ? query.to[0] : query.to);
  const to = rawTo ? new Date(rawTo.getTime() + 24 * 60 * 60 * 1_000 - 1) : undefined;

  return {
    search: textValue(Array.isArray(query.search) ? query.search[0] : query.search, 200),
    organismId,
    country: textValue(Array.isArray(query.country) ? query.country[0] : query.country, 120),
    source: textValue(Array.isArray(query.source) ? query.source[0] : query.source, 160),
    evidenceBasis: evidenceValue && Object.values(EvidenceBasis).includes(evidenceValue as EvidenceBasis)
      ? evidenceValue as EvidenceBasis
      : undefined,
    scope: scopeValue && Object.values(SurveillanceScope).includes(scopeValue as SurveillanceScope)
      ? scopeValue as SurveillanceScope
      : undefined,
    from,
    to,
  };
}

function validatePassword(password: unknown) {
  if (typeof password !== "string" || password.length < 10) {
    return "Password must be at least 10 characters long";
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return "Password must include uppercase, lowercase, number, and symbol characters";
  }
  return null;
}

const PROFILE_TITLES = new Set(["Dr.", "Prof.", "Mr.", "Ms."]);
const PROFILE_GENDERS = new Set(["WOMAN", "MAN", "NON_BINARY", "PREFER_NOT_TO_SAY"]);
const PROFILE_PHOTO_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ORCID_PATTERN = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/i;

function optionalSecureUrl(value: unknown, label: string) {
  const normalized = textValue(value, 500);
  if (!normalized) return { value: null as string | null };

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "https:") {
      return { value: null as string | null, error: `${label} must use https://` };
    }
    return { value: parsed.toString() };
  } catch {
    return { value: null as string | null, error: `${label} must be a valid URL` };
  }
}

function buildUserProfileData(body: Record<string, unknown>) {
  const name = textValue(body.name, 160);
  if (!name) return { error: "Full name is required" as const };

  const title = textValue(body.title, 20) || null;
  if (title && !PROFILE_TITLES.has(title)) {
    return { error: "Title must be Dr., Prof., Mr., or Ms." as const };
  }

  const gender = textValue(body.gender, 40)?.toUpperCase() || null;
  if (gender && !PROFILE_GENDERS.has(gender)) {
    return { error: "Unsupported gender selection" as const };
  }

  let dateOfBirth: Date | null = null;
  const rawDateOfBirth = textValue(body.dateOfBirth, 20);
  if (rawDateOfBirth) {
    const parsed = new Date(`${rawDateOfBirth}T00:00:00.000Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDateOfBirth) || !Number.isFinite(parsed.getTime())) {
      return { error: "Date of birth must be a valid date" as const };
    }
    if (parsed.getTime() > Date.now()) {
      return { error: "Date of birth cannot be in the future" as const };
    }
    dateOfBirth = parsed;
  }

  const phone = textValue(body.phone, 40) || null;
  if (phone && !/^[+()\d.\s-]{6,40}$/.test(phone)) {
    return { error: "Phone number contains unsupported characters" as const };
  }

  const rawOrcid = textValue(body.orcidId, 80)
    ?.replace(/^https:\/\/orcid\.org\//i, "")
    .toUpperCase() || null;
  if (rawOrcid && !ORCID_PATTERN.test(rawOrcid)) {
    return { error: "ORCID ID must use the format 0000-0000-0000-0000" as const };
  }

  const googleScholar = optionalSecureUrl(body.googleScholarUrl, "Google Scholar profile");
  if (googleScholar.error) return { error: googleScholar.error };
  const linkedIn = optionalSecureUrl(body.linkedInUrl, "LinkedIn profile");
  if (linkedIn.error) return { error: linkedIn.error };

  return {
    data: {
      name,
      profile: {
        title,
        gender,
        dateOfBirth,
        phone,
        institutionalAddress: sanitizeContactText(body.institutionalAddress, 1000, true) || null,
        country: textValue(body.country, 120) || null,
        city: textValue(body.city, 120) || null,
        designation: textValue(body.designation, 220) || null,
        department: textValue(body.department, 220) || null,
        institution: textValue(body.institution, 260) || null,
        employmentStatus: textValue(body.employmentStatus, 120) || null,
        highestDegree: textValue(body.highestDegree, 180) || null,
        specialization: textValue(body.specialization, 260) || null,
        researchInterests: sanitizeContactText(body.researchInterests, 3000, true) || null,
        researchAreas: sanitizeContactText(body.researchAreas, 3000, true) || null,
        keywords: sanitizeContactText(body.keywords, 1200, true) || null,
        currentProjects: sanitizeContactText(body.currentProjects, 4000, true) || null,
        orcidId: rawOrcid,
        researcherId: textValue(body.researcherId, 160) || null,
        scopusAuthorId: textValue(body.scopusAuthorId, 160) || null,
        googleScholarUrl: googleScholar.value,
        linkedInUrl: linkedIn.value,
      },
    },
  };
}

function decodeProfilePhoto(body: Record<string, unknown>) {
  const fileName = textValue(body.fileName, 180);
  const contentType = textValue(body.contentType, 80)?.toLowerCase();
  const rawContent = typeof body.fileContentBase64 === "string" ? body.fileContentBase64.trim() : "";

  if (!fileName || !contentType || !rawContent) {
    return { error: "Photo file name, content type, and content are required" as const };
  }
  if (!PROFILE_PHOTO_CONTENT_TYPES.has(contentType)) {
    return { error: "Profile photo must be a JPEG, PNG, or WebP image" as const };
  }

  const dataUrlMatch = /^data:([^;]+);base64,(.+)$/s.exec(rawContent);
  if (dataUrlMatch && dataUrlMatch[1].toLowerCase() !== contentType) {
    return { error: "Profile photo content type does not match the uploaded file" as const };
  }
  const base64 = (dataUrlMatch ? dataUrlMatch[2] : rawContent).replace(/\s/g, "");
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return { error: "Profile photo encoding is invalid" as const };
  }

  const fileContent = Buffer.from(base64, "base64");
  if (!fileContent.length || fileContent.length > MAX_PROFILE_PHOTO_BYTES) {
    return { error: `Profile photo must be smaller than ${Math.floor(MAX_PROFILE_PHOTO_BYTES / 1024 / 1024)} MB` as const };
  }

  const isJpeg = fileContent[0] === 0xff && fileContent[1] === 0xd8 && fileContent[2] === 0xff;
  const isPng = fileContent.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isWebp = fileContent.subarray(0, 4).toString("ascii") === "RIFF"
    && fileContent.subarray(8, 12).toString("ascii") === "WEBP";
  const signatureMatches = (contentType === "image/jpeg" && isJpeg)
    || (contentType === "image/png" && isPng)
    || (contentType === "image/webp" && isWebp);
  if (!signatureMatches) {
    return { error: "Profile photo file signature is invalid" as const };
  }

  return { data: { fileName, contentType, fileContent } };
}

type UserWithProfile = Prisma.UserGetPayload<{ include: { profile: true } }>;

function serializeUserProfile(user: UserWithProfile) {
  const profile = user.profile;
  return {
    user: publicUser(user),
    profile: {
      title: profile?.title || "",
      gender: profile?.gender || "",
      dateOfBirth: profile?.dateOfBirth?.toISOString().slice(0, 10) || "",
      phone: profile?.phone || "",
      institutionalAddress: profile?.institutionalAddress || "",
      country: profile?.country || "",
      city: profile?.city || "",
      designation: profile?.designation || "",
      department: profile?.department || "",
      institution: profile?.institution || "",
      employmentStatus: profile?.employmentStatus || "",
      highestDegree: profile?.highestDegree || "",
      specialization: profile?.specialization || "",
      researchInterests: profile?.researchInterests || "",
      researchAreas: profile?.researchAreas || "",
      keywords: profile?.keywords || "",
      currentProjects: profile?.currentProjects || "",
      orcidId: profile?.orcidId || "",
      researcherId: profile?.researcherId || "",
      scopusAuthorId: profile?.scopusAuthorId || "",
      googleScholarUrl: profile?.googleScholarUrl || "",
      linkedInUrl: profile?.linkedInUrl || "",
      hasProfilePhoto: Boolean(profile?.profilePhotoPath),
      profilePhotoUpdatedAt: profile?.updatedAt || null,
    },
  };
}

function publicUser(user: {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  affiliation: UserAffiliation;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    affiliation: user.affiliation,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function roleLabel(role: UserRole) {
  if (role === UserRole.STUDENT) return "Normal User";
  return role.split("_").map((part) => part.charAt(0) + part.slice(1).toLowerCase()).join(" ");
}

function buildOrganismUploadData(body: Record<string, unknown>) {
  const scientificName = textValue(body.scientificName, 240);
  const strainName = textValue(body.strainName, 240);

  if (!scientificName) {
    return { error: "Scientific name is required" as const };
  }
  if (!strainName) {
    return { error: "Strain name is required" as const };
  }

  const latitude = parseOptionalFloat(body.latitude);
  const longitude = parseOptionalFloat(body.longitude);
  if ((body.latitude !== undefined && body.latitude !== "" && latitude === undefined) || (body.longitude !== undefined && body.longitude !== "" && longitude === undefined)) {
    return { error: "Latitude and longitude must be valid decimal numbers" as const };
  }
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) {
    return { error: "Latitude must be between -90 and 90" as const };
  }
  if (longitude !== undefined && (longitude < -180 || longitude > 180)) {
    return { error: "Longitude must be between -180 and 180" as const };
  }

  const taxonomyId = parseOptionalInt(body.taxonomyId);
  const genomeSize = parseOptionalInt(body.genomeSize);
  const gcContent = parseOptionalFloat(body.gcContent);

  const country = textValue(body.country, 120) || "India";

  return {
    data: {
      scientificName,
      displayName: textValue(body.displayName, 240),
      taxonomyId,
      domain: textValue(body.domain, 120) || "Bacteria",
      phylum: textValue(body.phylum, 160),
      className: textValue(body.className, 160),
      orderName: textValue(body.orderName, 160),
      family: textValue(body.family, 160),
      genus: textValue(body.genus, 160),
      species: textValue(body.species, 160),
      description: textValue(body.description, 4000),
      strainName,
      isolateName: textValue(body.isolateName, 240),
      strainCode: textValue(body.strainCode, 160),
      biosampleAccession: textValue(body.biosampleAccession, 120),
      bioprojectAccession: textValue(body.bioprojectAccession, 120),
      assemblyAccession: textValue(body.assemblyAccession, 120),
      sourceType: textValue(body.sourceType, 160),
      host: textValue(body.host, 240),
      country,
      state: textValue(body.state, 160),
      city: textValue(body.city, 160),
      collectionDate: parseOptionalDate(body.collectionDate),
      locationText: textValue(body.locationText, 500),
      latitude,
      longitude,
      genomeStatus: textValue(body.genomeStatus, 160),
      genomeSize,
      gcContent,
      repoLink: textValue(body.repoLink, 500),
      metadata: parseJsonObject(body.metadata) as Prisma.InputJsonValue,
      surveillanceScope: parseSurveillanceScope(body.surveillanceScope, country),
      evidenceBasis: parseEvidenceBasis(body.evidenceBasis),
      submittingInstitution: textValue(body.submittingInstitution, 240),
      dataSource: textValue(body.dataSource, 500),
      dataUseLimitations: textValue(body.dataUseLimitations, 2000),
      lastVerifiedAt: parseOptionalDate(body.lastVerifiedAt),
    },
  };
}

function organismPublicationData(upload: {
  scientificName: string;
  displayName: string | null;
  taxonomyId: number | null;
  domain: string | null;
  phylum: string | null;
  className: string | null;
  orderName: string | null;
  family: string | null;
  genus: string | null;
  species: string | null;
  description: string | null;
}) {
  return {
    scientificName: upload.scientificName,
    displayName: upload.displayName || undefined,
    taxonomyId: upload.taxonomyId || undefined,
    domain: upload.domain || "Bacteria",
    phylum: upload.phylum || undefined,
    className: upload.className || undefined,
    orderName: upload.orderName || undefined,
    family: upload.family || undefined,
    genus: upload.genus || "Unknown",
    species: upload.species || "Unknown",
    description: upload.description || "Submitted through BMGA user review workflow.",
  };
}

function strainPublicationData(upload: {
  strainName: string;
  isolateName: string | null;
  strainCode: string | null;
  biosampleAccession: string | null;
  bioprojectAccession: string | null;
  assemblyAccession: string | null;
  sourceType: string | null;
  host: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  collectionDate: Date | null;
  locationText: string | null;
  latitude: number | null;
  longitude: number | null;
  genomeStatus: string | null;
  genomeSize: number | null;
  gcContent: Prisma.Decimal | null;
  repoLink: string | null;
  metadata: Prisma.JsonValue | null;
  surveillanceScope: SurveillanceScope;
  evidenceBasis: EvidenceBasis;
  submittingInstitution: string | null;
  dataSource: string | null;
  dataUseLimitations: string | null;
  lastVerifiedAt: Date | null;
}) {
  return {
    strainName: upload.strainName,
    isolateName: upload.isolateName || undefined,
    strainCode: upload.strainCode || undefined,
    biosampleAccession: upload.biosampleAccession || undefined,
    bioprojectAccession: upload.bioprojectAccession || undefined,
    assemblyAccession: upload.assemblyAccession || undefined,
    sourceType: upload.sourceType || undefined,
    host: upload.host || undefined,
    country: upload.country || "India",
    state: upload.state || undefined,
    city: upload.city || undefined,
    collectionDate: upload.collectionDate || undefined,
    locationText: upload.locationText || undefined,
    latitude: upload.latitude ?? undefined,
    longitude: upload.longitude ?? undefined,
    genomeStatus: upload.genomeStatus || undefined,
    genomeSize: upload.genomeSize ?? undefined,
    gcContent: upload.gcContent ?? undefined,
    repoLink: upload.repoLink || undefined,
    metadata: (upload.metadata || {}) as Prisma.InputJsonValue,
    surveillanceScope: upload.surveillanceScope,
    evidenceBasis: upload.evidenceBasis,
    submittingInstitution: upload.submittingInstitution || undefined,
    dataSource: upload.dataSource || undefined,
    dataUseLimitations: upload.dataUseLimitations || undefined,
    lastVerifiedAt: upload.lastVerifiedAt || undefined,
  };
}

async function writeAdminLog(adminId: string | undefined, action: string, targetType: string, targetId?: string, metadata: Record<string, unknown> = {}) {
  try {
    const context = currentContext();
    await prisma.adminLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        metadata: {
          result: metadata.result || "success",
          requestId: context?.requestId,
          ipAddress: context?.ipAddress,
          userAgent: context?.userAgent,
          actorEmail: context?.userEmail,
          actorRole: context?.userRole,
          ...metadata,
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    logEvent('error', "admin_log_write_failed", {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, "Admin log write failed"),
    });
  }
}

const ADMIN_LOG_ACTOR_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
} satisfies Prisma.UserSelect;

const SUBMISSION_PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  affiliation: true,
} satisfies Prisma.UserSelect;

function boundedAuditLimit(value: unknown, fallback = 100) {
  const parsed = parseOptionalInt(Array.isArray(value) ? value[0] : value);
  if (!parsed) return fallback;
  return Math.min(Math.max(parsed, 1), 250);
}

function buildAuditLogWhere(query: Request["query"]) {
  const targetType = textValue(query.targetType, 80);
  const targetId = textValue(query.targetId, 160);
  const action = textValue(query.action, 120);
  const adminId = textValue(query.adminId, 160);
  const search = textValue(query.search, 200);

  const where: Prisma.AdminLogWhereInput = {};
  if (targetType) where.targetType = targetType;
  if (targetId) where.targetId = targetId;
  if (action) where.action = action;
  if (adminId) where.adminId = adminId;
  if (search) {
    where.OR = [
      { action: { contains: search, mode: "insensitive" } },
      { targetType: { contains: search, mode: "insensitive" } },
      { targetId: { contains: search, mode: "insensitive" } },
      { admin: { name: { contains: search, mode: "insensitive" } } },
      { admin: { email: { contains: search, mode: "insensitive" } } },
    ];
  }

  return where;
}

function targetAuditLogs(targetType: string, targetId: string, take = 50) {
  return prisma.adminLog.findMany({
    where: { targetType, targetId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      admin: { select: ADMIN_LOG_ACTOR_SELECT },
    },
  });
}

function submissionDetailInclude(includeInternalNotes: boolean) {
  return {
    submittedBy: { select: SUBMISSION_PERSON_SELECT },
    reviewedBy: { select: ADMIN_LOG_ACTOR_SELECT },
    statusHistory: {
      ...(includeInternalNotes ? {} : { where: { visibleToSubmitter: true } }),
      orderBy: { createdAt: "asc" as const },
      include: {
        actor: { select: SUBMISSION_PERSON_SELECT },
      },
    },
    reviewerNotes: {
      ...(includeInternalNotes ? {} : { where: { visibleToSubmitter: true } }),
      orderBy: { createdAt: "asc" as const },
      include: {
        author: { select: SUBMISSION_PERSON_SELECT },
      },
    },
    files: {
      orderBy: { createdAt: "asc" as const },
      select: {
        id: true,
        toolName: true,
        originalFileName: true,
        fileType: true,
        fileSizeBytes: true,
        checksumSha256: true,
        toolVersion: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        checkpointedAt: true,
        ingestedAt: true,
      },
    },
    genomeReferences: {
      orderBy: { createdAt: "asc" as const },
      select: {
        id: true,
        kind: true,
        originalFileName: true,
        contentType: true,
        fileSizeBytes: true,
        checksumSha256: true,
        status: true,
        isPublic: true,
        validation: true,
        createdAt: true,
        updatedAt: true,
        publishedAt: true,
      },
    },
  };
}

function reviewNoteValue(value: unknown) {
  return sanitizeContactText(value, 4000, true);
}

function isSupportedOrCustomTool(toolName: string) {
  return TOOL_KEYS.includes(toolName as typeof TOOL_KEYS[number]) || /^[a-z][a-z0-9_]{1,79}$/.test(toolName);
}

function canEditSubmissionResults(req: AuthenticatedRequest, submittedById: string) {
  return submittedById === req.user?.userId
    || req.user?.role === UserRole.MODERATOR
    || req.user?.role === UserRole.ADMIN;
}

function canAmendApprovedSubmission(req: AuthenticatedRequest, submittedById: string) {
  if (req.user?.role === UserRole.ADMIN || req.user?.role === UserRole.MODERATOR) return true;
  return submittedById === req.user?.userId && req.user?.role === UserRole.CONTRIBUTOR;
}

async function recordSubmissionStatusHistory(options: {
  submissionId: string;
  status: string;
  actorId?: string;
  note?: string;
  visibleToSubmitter?: boolean;
  createdAt?: Date;
}) {
  return prisma.submissionStatusHistory.create({
    data: {
      submissionId: options.submissionId,
      status: options.status,
      actorId: options.actorId,
      note: options.note,
      visibleToSubmitter: options.visibleToSubmitter ?? true,
      createdAt: options.createdAt,
    },
  });
}

async function addSubmissionReviewerNote(options: {
  submissionId: string;
  authorId?: string;
  message: string;
  visibleToSubmitter?: boolean;
}) {
  return prisma.submissionReviewerNote.create({
    data: {
      submissionId: options.submissionId,
      authorId: options.authorId,
      message: options.message,
      visibleToSubmitter: options.visibleToSubmitter ?? true,
    },
    include: {
      author: { select: SUBMISSION_PERSON_SELECT },
    },
  });
}

async function ensureSubmissionStatusHistory(upload: {
  id: string;
  submittedById: string;
  reviewedById: string | null;
  status: ApprovalStatus;
  reviewNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt: Date | null;
}) {
  const existingCount = await prisma.submissionStatusHistory.count({ where: { submissionId: upload.id } });
  if (existingCount > 0) return;

  await recordSubmissionStatusHistory({
    submissionId: upload.id,
    status: "SUBMITTED",
    actorId: upload.submittedById,
    note: "Initial submission received.",
    visibleToSubmitter: true,
    createdAt: upload.createdAt,
  });

  if (upload.status !== ApprovalStatus.PENDING) {
    await recordSubmissionStatusHistory({
      submissionId: upload.id,
      status: upload.status,
      actorId: upload.reviewedById || undefined,
      note: upload.reviewNote || "Current review status backfilled.",
      visibleToSubmitter: true,
      createdAt: upload.reviewedAt || upload.updatedAt,
    });
  }
}

function metadataString(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function metadataNumber(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function sanitizeSubmissionFiles(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return [];
  const source = metadata as Record<string, unknown>;
  const files = Array.isArray(source.files)
    ? source.files
    : Array.isArray(source.uploadedFiles)
      ? source.uploadedFiles
      : [];

  return files
    .filter((file): file is Record<string, unknown> => !!file && typeof file === "object" && !Array.isArray(file))
    .slice(0, 50)
    .map((file, index) => ({
      id: metadataString(file, ["id", "fileId"]) || `metadata-file-${index + 1}`,
      fileName: metadataString(file, ["fileName", "name", "originalName"]) || "Unnamed file",
      fileType: metadataString(file, ["fileType", "type", "mimeType", "contentType"]) || "N/A",
      fileSizeBytes: metadataNumber(file, ["fileSizeBytes", "size", "bytes"]),
      uploadedAt: metadataString(file, ["uploadedAt", "createdAt", "timestamp"]),
      processingStatus: metadataString(file, ["processingStatus", "status"]) || "N/A",
      checksum: metadataString(file, ["checksum", "checksumSha256", "sha256"]),
    }));
}

function buildSubmissionResponse<T extends {
  id: string;
  metadata: Prisma.JsonValue | null;
  scientificName: string;
  strainName: string;
  files?: Array<{
    id: string;
    toolName: string;
    originalFileName: string;
    fileType: string;
    fileSizeBytes: number;
    checksumSha256: string;
    toolVersion: string | null;
    status: SubmissionFileStatus;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
    checkpointedAt: Date;
    ingestedAt: Date | null;
  }>;
  genomeReferences?: Array<{
    id: string;
    kind: GenomeReferenceKind;
    originalFileName: string;
    contentType: string;
    fileSizeBytes: number;
    checksumSha256: string;
    status: GenomeReferenceStatus;
    isPublic: boolean;
    validation: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
    publishedAt: Date | null;
  }>;
}>(upload: T) {
  const storedFiles = upload.files?.map((file) => ({
    id: file.id,
    toolName: file.toolName,
    fileName: file.originalFileName,
    fileType: file.fileType,
    fileSizeBytes: file.fileSizeBytes,
    checksum: file.checksumSha256,
    toolVersion: file.toolVersion,
    processingStatus: file.status,
    errorMessage: file.errorMessage,
    uploadedAt: file.createdAt,
    updatedAt: file.updatedAt,
    checkpointedAt: file.checkpointedAt,
    ingestedAt: file.ingestedAt,
    downloadPath: `/submissions/${upload.id}/files/${file.id}/download`,
    viewPath: `/submissions/${upload.id}/files/${file.id}/view`,
  }));

  return {
    ...upload,
    submissionType: "Organism Upload",
    title: `${upload.scientificName} / ${upload.strainName}`,
    files: storedFiles?.length ? storedFiles : sanitizeSubmissionFiles(upload.metadata),
    genomeReferences: upload.genomeReferences?.map((file) => ({
      id: file.id,
      kind: file.kind,
      fileName: file.originalFileName,
      fileType: file.kind,
      fileSizeBytes: file.fileSizeBytes,
      checksum: file.checksumSha256,
      processingStatus: file.status,
      validation: file.validation,
      uploadedAt: file.createdAt,
      updatedAt: file.updatedAt,
      publishedAt: file.publishedAt,
      isPublic: file.isPublic,
      downloadPath: `/submissions/${upload.id}/genome-references/${file.id}/download`,
    })) || [],
  };
}

function validateImportFile(fileName: unknown, fileContent: unknown) {
  const normalizedFileName = textValue(fileName, 240) || "results.tsv";
  const extension = path.extname(normalizedFileName).toLowerCase();
  const allowedExtensions = new Set(['.tsv', '.csv', '.json', '.txt', '.html', '.htm', '.dat', '.fasta', '.fa', '.fna']);
  if (!allowedExtensions.has(extension)) {
    return { error: "Unsupported import file type. Use TSV, CSV, JSON, TXT, HTML, DAT, or FASTA." as const };
  }
  if (typeof fileContent !== "string" || !fileContent.trim()) {
    return { error: "No file content provided." as const };
  }
  if (Buffer.byteLength(fileContent, 'utf8') > MAX_IMPORT_FILE_BYTES) {
    return { error: "Import file is too large." as const };
  }
  return { fileName: normalizedFileName, fileContent };
}

function parseDelimitedFile(fileContent: string, fileName: string) {
  const trimmed = fileContent.trim();
  if (!trimmed) return { columns: [] as string[], rows: [] as Record<string, unknown>[] };

  if (fileName.toLowerCase().endsWith('.json')) {
    const parsed = JSON.parse(trimmed);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed.rows) ? parsed.rows : [];
    const columns = Array.isArray(parsed.columns) ? parsed.columns.map(String) : Object.keys(rows[0] || {});
    return { columns, rows };
  }

  if (/\.(html?|fasta|fa|fna)$/i.test(fileName)) {
    return { columns: [] as string[], rows: [] as Record<string, unknown>[] };
  }

  const delimiter = fileName.toLowerCase().endsWith('.csv') ? ',' : '\t';
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const splitLine = (line: string) => fileName.toLowerCase().endsWith('.dat')
    ? line.trim().split(/\s+/)
    : line.split(delimiter).map((value) => value.trim());
  const columns = splitLine(lines[0] || '');
  const rows = lines.slice(1).map((line) => {
    const values = splitLine(line);
    return columns.reduce<Record<string, string>>((row, column, index) => {
      row[column || `column_${index + 1}`] = values[index] || "";
      return row;
    }, {});
  });

  return { columns, rows };
}

function parseFlexibleSummary(fileName: string, fileContent: string, existingSummary: Prisma.JsonValue | null | undefined) {
  const summary = parseJsonObject(existingSummary);
  const extension = path.extname(fileName).toLowerCase();
  const content = extension === '.html' || extension === '.htm'
    ? fileContent.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]*>/g, '\n')
    : fileContent;

  const lines = content
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 500);

  const parsed: Record<string, unknown> = { ...summary };
  const interestingKeys = new Set([
    'genome_size',
    'genome size',
    'genome_length',
    'genome length',
    'total_length',
    'total length',
    'gc_percent',
    'gc content',
    'gc_content',
    'n50',
    'l50',
    'contigs',
    'contig_count',
    'total_contigs',
    'completeness',
    'contamination',
    'cds',
    'trna',
    'rrna',
    'amr genes',
    'bgc',
    'domains',
  ]);

  for (const line of lines) {
    const match = /^([A-Za-z0-9 _./%-]{2,80})\s*[:=]\s*(.+)$/.exec(line);
    if (!match) continue;

    const rawKey = match[1].trim().toLowerCase().replace(/[\s./%-]+/g, '_');
    const rawValue = match[2].trim();
    const numeric = Number(rawValue.replace(/[,xX%]/g, ''));
    const normalizedValue = Number.isFinite(numeric) ? numeric : rawValue.slice(0, 240);
    if (interestingKeys.has(rawKey)) {
      parsed[rawKey] = normalizedValue;
      if (['genome_size', 'genome_length', 'total_length'].includes(rawKey)) parsed.genome_size = normalizedValue;
      if (['gc', 'gc_content'].includes(rawKey)) parsed.gc_percent = normalizedValue;
      if (['contigs', 'total_contigs'].includes(rawKey)) parsed.contig_count = normalizedValue;
      if (rawKey === 'cds') parsed.cds_count = normalizedValue;
      if (rawKey === 'trna') parsed.trna_count = normalizedValue;
      if (rawKey === 'rrna') parsed.rrna_count = normalizedValue;
      continue;
    }
    if (Number.isFinite(numeric) && /(size|length|count|coverage|gc|identity|score|total|n50|l50|completeness|contamination|trna|rrna|cds|bgc|domain)/i.test(rawKey)) {
      parsed[rawKey] = numeric;
      continue;
    }
    if (!parsed[rawKey] && rawValue.length <= 240) {
      parsed[rawKey] = rawValue;
    }
  }

  return parsed;
}

async function ingestSubmissionMayaFiles(submissionId: string, organismId: number, strainId: number) {
  const files = await prisma.submissionFile.findMany({
    where: {
      submissionId,
      status: { in: [SubmissionFileStatus.UPLOADED, SubmissionFileStatus.FAILED] },
    },
    orderBy: { createdAt: 'asc' },
  });
  const result = { requested: files.length, ingested: 0, failed: 0, amrDetections: 0 };

  for (const file of files) {
    await prisma.submissionFile.update({
      where: { id: file.id },
      data: { status: SubmissionFileStatus.PROCESSING, errorMessage: null },
    });

    let publishedPath: string | undefined;
    try {
      const fileContent = await readStoredTextFile(file.storagePath, MAX_IMPORT_FILE_BYTES);
      const checksum = createHash('sha256').update(fileContent, 'utf8').digest('hex');
      if (checksum !== file.checksumSha256) throw new Error('Stored file checksum does not match the reviewed upload.');

      const parsedTable = parseDelimitedFile(fileContent, file.originalFileName);
      const errors = parseJsonArray(file.errors);
      const summary = parseFlexibleSummary(file.originalFileName, fileContent, file.summary);
      publishedPath = await saveUploadedResultFile({
        organismId,
        toolName: file.toolName,
        fileName: file.originalFileName,
        fileContent,
      });
      const savedRun = await saveNormalizedToolRun(prisma, organismId, strainId, {
        toolName: file.toolName,
        status: errors.length ? 'warning' : 'completed',
        version: file.toolVersion || undefined,
        finishedAt: new Date(),
        summary,
        tables: parsedTable.columns.length ? [{
          tableName: `${file.toolName} reviewed submission`,
          columns: parsedTable.columns,
          rows: parsedTable.rows,
        }] : [],
        files: [{
          fileName: file.originalFileName,
          fileType: file.fileType,
          filePath: publishedPath,
          description: `${file.toolName} result approved from submission ${submissionId}`,
        }],
        warnings: parseJsonArray(file.warnings),
        errors,
      });
      const amrDetections = await syncAmrGenesFromToolRows(prisma, savedRun.id, strainId, normalizeToolName(file.toolName), parsedTable.rows);

      await prisma.submissionFile.update({
        where: { id: file.id },
        data: {
          status: SubmissionFileStatus.INGESTED,
          errorMessage: null,
          ingestedAt: new Date(),
        },
      });
      result.ingested += 1;
      result.amrDetections += amrDetections;
    } catch (error) {
      if (publishedPath) await deleteStoredFiles([publishedPath]);
      result.failed += 1;
      await prisma.submissionFile.update({
        where: { id: file.id },
        data: {
          status: SubmissionFileStatus.FAILED,
          errorMessage: sanitizeContactText(error instanceof Error ? error.message : 'Ingestion failed', 500),
        },
      });
      logEvent('error', 'submission_maya_ingestion_failed', {
        submissionId,
        fileId: file.id,
        toolName: file.toolName,
        requestId: currentContext()?.requestId,
        error: safeErrorMessage(error, 'Submission MAYA ingestion failed'),
      });
    }
  }

  return result;
}

function referenceNamesFromValidation(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const names = (value as Record<string, unknown>).referenceNames;
  return Array.isArray(names) ? names.filter((name): name is string => typeof name === 'string').slice(0, 500) : [];
}

function referenceSetsOverlap(left: string[], right: string[]) {
  if (!left.length || !right.length) return true;
  const names = new Set(left);
  return right.some((name) => names.has(name));
}

async function savePreparedGenomeReferences(options: {
  submissionId?: string;
  strainId?: number;
  files: Array<{
    kind: 'FASTA' | 'FAI' | 'GFF3';
    fileName: string;
    contentType: string;
    content: string;
    validation: Record<string, unknown>;
  }>;
  publish: boolean;
}) {
  if ((!options.submissionId && !options.strainId) || (options.submissionId && options.strainId)) {
    throw new Error('A genome reference must belong to exactly one submission or strain during upload.');
  }

  const kinds = options.files.map((file) => file.kind as GenomeReferenceKind);
  const ownerWhere: Prisma.GenomeReferenceFileWhereInput = options.submissionId
    ? { submissionId: options.submissionId, kind: { in: kinds } }
    : { strainId: options.strainId, kind: { in: kinds } };
  const previousFiles = await prisma.genomeReferenceFile.findMany({ where: ownerWhere, select: { id: true, storagePath: true } });
  const storedFiles: Array<{ file: typeof options.files[number]; storagePath: string }> = [];

  try {
    for (const file of options.files) {
      const storagePath = await saveGenomeReferenceFile({
        ownerType: options.submissionId ? 'submission' : 'strain',
        ownerId: options.submissionId || String(options.strainId),
        kind: file.kind,
        fileName: file.fileName,
        fileContent: file.content,
      });
      storedFiles.push({ file, storagePath });
    }

    const created = await prisma.$transaction(async (tx) => {
      if (previousFiles.length) await tx.genomeReferenceFile.deleteMany({ where: { id: { in: previousFiles.map((file) => file.id) } } });
      const results = [];
      for (const stored of storedFiles) {
        results.push(await tx.genomeReferenceFile.create({
          data: {
            submissionId: options.submissionId,
            strainId: options.strainId,
            kind: stored.file.kind as GenomeReferenceKind,
            originalFileName: stored.file.fileName,
            contentType: stored.file.contentType,
            fileSizeBytes: Buffer.byteLength(stored.file.content, 'utf8'),
            checksumSha256: createHash('sha256').update(stored.file.content, 'utf8').digest('hex'),
            storagePath: stored.storagePath,
            status: options.publish ? GenomeReferenceStatus.PUBLISHED : GenomeReferenceStatus.UPLOADED,
            isPublic: options.publish,
            validation: stored.file.validation as Prisma.InputJsonValue,
            publishedAt: options.publish ? new Date() : undefined,
          },
          select: {
            id: true,
            kind: true,
            originalFileName: true,
            contentType: true,
            fileSizeBytes: true,
            checksumSha256: true,
            status: true,
            isPublic: true,
            validation: true,
            createdAt: true,
            updatedAt: true,
            publishedAt: true,
          },
        }));
      }
      return results;
    });

    if (previousFiles.length) await deleteStoredFiles(previousFiles.map((file) => file.storagePath));
    return created;
  } catch (error) {
    if (storedFiles.length) await deleteStoredFiles(storedFiles.map((file) => file.storagePath));
    throw error;
  }
}

function publicReferenceFile(file: {
  id: string;
  kind: GenomeReferenceKind;
  originalFileName: string;
  contentType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  validation: Prisma.JsonValue | null;
  updatedAt: Date;
  publishedAt: Date | null;
}, strainId: number) {
  return {
    id: file.id,
    kind: file.kind,
    fileName: file.originalFileName,
    contentType: file.contentType,
    fileSizeBytes: file.fileSizeBytes,
    checksumSha256: file.checksumSha256,
    validation: file.validation,
    updatedAt: file.updatedAt,
    publishedAt: file.publishedAt,
    accessUrl: `/strains/${strainId}/genome-reference/files/${file.kind.toLowerCase()}`,
  };
}

app.set('trust proxy', process.env.TRUST_PROXY || 1);
app.use(requestContextMiddleware);
app.use(securityHeaders);
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    if (origin && allowedOrigins.has(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true,
}));
const standardJsonParser = express.json({ limit: REQUEST_BODY_LIMIT });
const genomeReferenceJsonParser = express.json({ limit: GENOME_REFERENCE_BODY_LIMIT });
app.use((req, res, next) => {
  const isGenomeReferenceUpload = req.method === 'POST' && (
    /^\/api\/organism-uploads\/[^/]+\/genome-references$/.test(req.path)
    || /^\/api\/admin\/strains\/\d+\/genome-references$/.test(req.path)
  );
  return (isGenomeReferenceUpload ? genomeReferenceJsonParser : standardJsonParser)(req, res, next);
});
app.use(requestLogger);

app.get(['/health', '/api/health'], async (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

app.get(['/ready', '/api/ready'], async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch (error) {
    logEvent('error', 'readiness_check_failed', { error: safeErrorMessage(error, 'Database unavailable') });
    res.status(503).json({ status: 'error' });
  }
});

app.get(['/version', '/api/version'], (_req: Request, res: Response) => {
  res.json({
    app: APP_NAME,
    version: APP_VERSION,
    environment: process.env.NODE_ENV || 'development',
  });
});

app.get('/api/fair/status', async (_req: Request, res: Response) => {
  try {
    const [organisms, strains, referenceFiles, latestStrain] = await Promise.all([
      prisma.organism.count(),
      prisma.strain.count(),
      prisma.genomeReferenceFile.count({ where: { status: GenomeReferenceStatus.PUBLISHED, isPublic: true } }),
      prisma.strain.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      title: 'Bharat Microbial Genome Atlas',
      identifier: DATASET_DOI || `${PUBLIC_BASE_URL}/fair`,
      counts: { organisms, strains, publishedReferenceFiles: referenceFiles },
      modifiedAt: latestStrain?.updatedAt || null,
      license: DATASET_LICENSE_URL ? { name: DATASET_LICENSE_NAME || 'Configured dataset license', url: DATASET_LICENSE_URL } : null,
      registry: FAIRSHARING_RECORD_URL ? { name: 'FAIRsharing', url: FAIRSHARING_RECORD_URL, status: 'LINKED' } : { name: 'FAIRsharing', url: null, status: 'OWNER_ACTION_REQUIRED' },
      contactEmail: DATASET_CONTACT_EMAIL,
      machineMetadata: `${PUBLIC_BASE_URL}/api/backend/fair/catalog`,
      openApi: `${PUBLIC_BASE_URL}/api/backend/openapi.json`,
      fairClaim: 'FAIR-enabling metadata is provided. Formal FAIR assessment or registry acceptance is not implied.',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load FAIR status' });
  }
});

app.get('/api/fair/catalog', async (_req: Request, res: Response) => {
  try {
    const [organisms, strains, countries, latestStrain] = await Promise.all([
      prisma.organism.count(),
      prisma.strain.count(),
      prisma.strain.findMany({ where: { country: { not: null } }, distinct: ['country'], select: { country: true } }),
      prisma.strain.findFirst({ orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    ]);
    const dataset: Record<string, unknown> = {
      '@type': ['dcat:Dataset', 'schema:Dataset'],
      '@id': DATASET_DOI || `${PUBLIC_BASE_URL}/fair#dataset`,
      'dcterms:title': 'Bharat Microbial Genome Atlas approved genomic surveillance dataset',
      'dcterms:description': 'Reviewed microbial strain metadata, geographic provenance, MAYA pipeline summaries, AMR genotypic detections, and approved genome reference assets for India and global genomic surveillance.',
      'dcterms:identifier': DATASET_DOI || `${PUBLIC_BASE_URL}/fair`,
      'dcterms:publisher': { '@type': 'schema:Organization', name: 'Bharat Microbial Genome Atlas', url: PUBLIC_BASE_URL },
      'dcterms:modified': latestStrain?.updatedAt?.toISOString() || null,
      'dcterms:spatial': countries.map((entry) => entry.country).filter(Boolean),
      'dcat:landingPage': `${PUBLIC_BASE_URL}/fair`,
      'dcat:keyword': ['microbial genomics', 'genomic surveillance', 'AMR', 'MAYA pipeline', 'India', 'FASTA', 'GFF3'],
      'dcat:theme': ['genomics', 'bioinformatics', 'public health surveillance'],
      'dcterms:accessRights': 'Public metadata and administrator-approved genome reference files; account-controlled submission and compute services.',
      'dcterms:conformsTo': ['https://www.w3.org/TR/vocab-dcat-3/', 'https://bioschemas.org/profiles/Dataset/1.0-RELEASE'],
      'dcat:distribution': [
        { '@type': 'dcat:Distribution', 'dcterms:title': 'Public organism registry API', 'dcat:accessURL': `${PUBLIC_BASE_URL}/api/backend/organisms`, 'dcat:mediaType': 'application/json' },
        { '@type': 'dcat:Distribution', 'dcterms:title': 'Global surveillance records API', 'dcat:accessURL': `${PUBLIC_BASE_URL}/api/backend/surveillance/records`, 'dcat:mediaType': 'application/json' },
        { '@type': 'dcat:DataService', 'dcterms:title': 'BMGA OpenAPI service description', 'dcat:endpointURL': `${PUBLIC_BASE_URL}/api/backend/openapi.json` },
      ],
      'schema:measurementTechnique': ['MAYA pipeline', 'NCBI BLAST+', 'reviewed genomic metadata ingestion'],
      'schema:variableMeasured': ['organisms', 'strains', 'genotypic AMR detections', 'genome assemblies', 'geographic provenance'],
      'schema:includedInDataCatalog': { '@id': `${PUBLIC_BASE_URL}/fair#catalog` },
      'schema:size': `${organisms} organisms; ${strains} strains`,
      'schema:conditionsOfAccess': 'Review data-source declarations, evidence basis, and per-record data-use limitations before reuse.',
    };
    if (DATASET_LICENSE_URL) {
      dataset['dcterms:license'] = { '@id': DATASET_LICENSE_URL, name: DATASET_LICENSE_NAME || undefined };
      dataset['schema:license'] = DATASET_LICENSE_URL;
    }
    if (DATASET_CONTACT_EMAIL) dataset['dcat:contactPoint'] = { '@type': 'vcard:Kind', 'vcard:hasEmail': `mailto:${DATASET_CONTACT_EMAIL}` };

    const catalog = {
      '@context': {
        dcat: 'http://www.w3.org/ns/dcat#',
        dcterms: 'http://purl.org/dc/terms/',
        schema: 'https://schema.org/',
        vcard: 'http://www.w3.org/2006/vcard/ns#',
      },
      '@type': 'dcat:Catalog',
      '@id': `${PUBLIC_BASE_URL}/fair#catalog`,
      'dcterms:title': 'Bharat Microbial Genome Atlas Data Catalog',
      'dcterms:description': 'Machine-readable catalog for the BMGA genomic surveillance portal.',
      'dcterms:publisher': { '@type': 'schema:Organization', name: 'Bharat Microbial Genome Atlas', url: PUBLIC_BASE_URL },
      'dcat:dataset': dataset,
    };
    res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json(catalog);
  } catch (error) {
    res.status(500).json({ error: 'Failed to build FAIR catalog metadata' });
  }
});

app.get('/api/fair/strains/:id', async (req: Request, res: Response) => {
  const strainId = parseNumericParam(req.params.id);
  if (!strainId) return res.status(400).json({ error: 'Invalid strain id' });
  try {
    const strain = await prisma.strain.findUnique({
      where: { id: strainId },
      include: {
        organism: true,
        genomeReferences: { where: { status: GenomeReferenceStatus.PUBLISHED, isPublic: true } },
      },
    });
    if (!strain) return res.status(404).json({ error: 'Strain not found' });
    const record: Record<string, unknown> = {
      '@context': { schema: 'https://schema.org/', dcterms: 'http://purl.org/dc/terms/', dcat: 'http://www.w3.org/ns/dcat#', spdx: 'http://spdx.org/rdf/terms#' },
      '@type': ['schema:Dataset', 'dcat:Dataset'],
      '@id': `${PUBLIC_BASE_URL}/api/backend/fair/strains/${strain.id}`,
      'dcterms:title': `${strain.organism.scientificName} ${strain.strainName} genomic record`,
      'dcterms:identifier': strain.assemblyAccession || strain.biosampleAccession || `BMGA:strain:${strain.id}`,
      'dcterms:modified': strain.updatedAt.toISOString(),
      'dcterms:source': strain.dataSource || strain.repoLink || null,
      'dcterms:spatial': [strain.city, strain.state, strain.country].filter(Boolean).join(', ') || null,
      'schema:taxonomicRange': strain.organism.scientificName,
      'schema:measurementTechnique': strain.evidenceBasis,
      'schema:conditionsOfAccess': strain.dataUseLimitations || 'No additional record-specific limitation reported.',
      'dcat:landingPage': `${PUBLIC_BASE_URL}/organisms/${strain.organismId}/genome?strain=${strain.id}`,
      'dcat:distribution': strain.genomeReferences.map((file) => ({
        '@type': 'dcat:Distribution',
        'dcterms:title': file.originalFileName,
        'dcterms:format': file.kind,
        'dcat:downloadURL': `${PUBLIC_BASE_URL}/api/backend/strains/${strain.id}/genome-reference/files/${file.kind.toLowerCase()}`,
        'dcat:byteSize': file.fileSizeBytes,
        'spdx:checksum': { '@type': 'spdx:Checksum', 'spdx:algorithm': 'spdx:checksumAlgorithm_sha256', 'spdx:checksumValue': file.checksumSha256 },
      })),
    };
    if (DATASET_LICENSE_URL) record['dcterms:license'] = DATASET_LICENSE_URL;
    res.setHeader('Content-Type', 'application/ld+json; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: 'Failed to build FAIR strain metadata' });
  }
});

app.get('/api/openapi.json', (_req: Request, res: Response) => {
  res.json({
    openapi: '3.1.0',
    info: { title: 'Bharat Microbial Genome Atlas Public API', version: APP_VERSION, description: 'Public reviewed metadata and authenticated sequence-compute endpoints. Evidence limitations remain attached to each relevant response.' },
    servers: [{ url: `${PUBLIC_BASE_URL}/api/backend` }],
    paths: {
      '/organisms': { get: { summary: 'List organisms', responses: { '200': { description: 'Approved organism records' } } } },
      '/strains': { get: { summary: 'List strains', responses: { '200': { description: 'Approved strain records' } } } },
      '/surveillance/overview': { get: { summary: 'Global surveillance overview', responses: { '200': { description: 'Live aggregate overview' } } } },
      '/surveillance/records': { get: { summary: 'Filter global surveillance records', responses: { '200': { description: 'Paginated reviewed records' } } } },
      '/organisms/{id}/genome-references': { get: { summary: 'List approved genome references', parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'integer' } }], responses: { '200': { description: 'Per-strain FASTA/GFF3 catalog' } } } },
      '/fair/catalog': { get: { summary: 'DCAT 3 and Bioschemas JSON-LD catalog', responses: { '200': { description: 'Machine-readable dataset catalog' } } } },
      '/blast/search': { post: { summary: 'Authenticated NCBI BLAST+ search against approved BMGA references', security: [{ bearerAuth: [] }], responses: { '200': { description: 'Genotypic sequence similarity results' }, '401': { description: 'Authentication required' }, '429': { description: 'Rate limit exceeded' } } } },
    },
    components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
  });
});

// ─── AUTHENTICATION ROUTES ──────────────────────────────────────────────────

async function registerUser(req: Request, res: Response) {
  try {
    const email = normalizedEmail(req.body.email);
    const name = textValue(req.body.name, 160);
    const password = req.body.password;
    const affiliation = parseAffiliation(req.body.affiliation);

    if (!name || !email || !password || !req.body.affiliation) {
      return res.status(400).json({ error: "Name, email, password, and affiliation are required" });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return res.status(400).json({ error: "Please provide a valid email address" });
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        affiliation,
        role: UserRole.STUDENT,
        passwordHash: hashedPassword,
      },
    });
    res.status(201).json({ message: "User created", user: publicUser(newUser) });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(409).json({ error: "An account with this email already exists" });
    console.error("Registration Error:", error);
    res.status(500).json({ error: "Signup failed" });
  }
}

app.post('/api/auth/register', registerUser);
app.post('/api/auth/signup', registerUser);

app.post('/api/auth/login', loginRateLimiter, async (req: Request, res: Response) => {
  try {
    const email = normalizedEmail(req.body.email);
    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      await writeAdminLog(user?.id, "LOGIN_FAILED", "Auth", email ? hashIdentifier(email) : undefined, {
        result: "failure",
        emailHash: email ? hashIdentifier(email) : undefined,
      });
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = jwt.sign({ userId: user.id, role: user.role, authVersion: user.authVersion }, JWT_SECRET, { expiresIn: '24h' });
    await writeAdminLog(user.role === UserRole.ADMIN ? user.id : undefined, user.role === UserRole.ADMIN ? "ADMIN_LOGIN_SUCCESS" : "LOGIN_SUCCESS", "Auth", user.id, {
      result: "success",
      role: user.role,
      emailHash: hashIdentifier(user.email),
    });
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    logEvent('error', "login_error", { requestId: currentContext()?.requestId, error: safeErrorMessage(error, "Login failed") });
    res.status(500).json({ error: "Login failed" });
  }
});

app.get('/api/me', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Authentication required" });
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { id: true, email: true, name: true, role: true, affiliation: true, createdAt: true, updatedAt: true },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({ user: publicUser(user), roleLabel: roleLabel(user.role) });
});

app.get('/api/me/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      include: { profile: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.setHeader("Cache-Control", "private, no-store");
    res.json(serializeUserProfile(user));
  } catch (error) {
    logEvent("error", "user_profile_fetch_failed", {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, "Profile fetch failed"),
    });
    res.status(500).json({ error: "Failed to load profile" });
  }
});

app.put('/api/me/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = buildUserProfileData(req.body || {});
    if ("error" in payload) {
      return res.status(400).json({ error: payload.error });
    }

    const user = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: req.user?.userId },
        data: { name: payload.data.name },
      });
      await tx.userProfile.upsert({
        where: { userId: req.user?.userId || "" },
        create: {
          userId: req.user?.userId || "",
          ...payload.data.profile,
        },
        update: payload.data.profile,
      });
      return tx.user.findUniqueOrThrow({
        where: { id: req.user?.userId },
        include: { profile: true },
      });
    });

    await writeAdminLog(req.user?.userId, "USER_PROFILE_UPDATED", "User", req.user?.userId, {
      result: "success",
    });
    res.json({ message: "Profile updated", ...serializeUserProfile(user) });
  } catch (error) {
    logEvent("error", "user_profile_update_failed", {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, "Profile update failed"),
    });
    res.status(500).json({ error: "Failed to update profile" });
  }
});

app.post('/api/me/password', requireAuth, accountSecurityRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const currentPassword = req.body.currentPassword;
    const newPassword = req.body.newPassword;
    const confirmPassword = req.body.confirmPassword;
    if (typeof currentPassword !== "string" || !currentPassword) {
      return res.status(400).json({ error: "Current password is required" });
    }
    if (newPassword !== confirmPassword) {
      return res.status(400).json({ error: "New password confirmation does not match" });
    }
    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ error: passwordError });

    const user = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      select: { id: true, passwordHash: true },
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
      await writeAdminLog(req.user?.userId, "USER_PASSWORD_CHANGE_FAILED", "User", user.id, {
        result: "failure",
        reason: "current_password_incorrect",
      });
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    if (await bcrypt.compare(newPassword, user.passwordHash)) {
      return res.status(400).json({ error: "New password must be different from the current password" });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        authVersion: { increment: 1 },
      },
    });
    await writeAdminLog(req.user?.userId, "USER_PASSWORD_CHANGED", "User", user.id, {
      result: "success",
    });
    res.json({
      message: "Password changed. Sign in again with your new password.",
      reauthenticate: true,
    });
  } catch (error) {
    logEvent("error", "user_password_change_failed", {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, "Password change failed"),
    });
    res.status(500).json({ error: "Failed to change password" });
  }
});

app.post('/api/me/profile-photo', requireAuth, accountSecurityRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  let savedPath: string | null = null;
  try {
    const payload = decodeProfilePhoto(req.body || {});
    if ("error" in payload) {
      return res.status(400).json({ error: payload.error });
    }

    const existing = await prisma.userProfile.findUnique({
      where: { userId: req.user?.userId || "" },
      select: { profilePhotoPath: true },
    });
    savedPath = await saveProfilePhotoFile({
      userId: req.user?.userId || "",
      ...payload.data,
    });
    const profile = await prisma.userProfile.upsert({
      where: { userId: req.user?.userId || "" },
      create: {
        userId: req.user?.userId || "",
        profilePhotoPath: savedPath,
        profilePhotoName: payload.data.fileName,
        profilePhotoContentType: payload.data.contentType,
        profilePhotoSizeBytes: payload.data.fileContent.length,
      },
      update: {
        profilePhotoPath: savedPath,
        profilePhotoName: payload.data.fileName,
        profilePhotoContentType: payload.data.contentType,
        profilePhotoSizeBytes: payload.data.fileContent.length,
      },
      select: { updatedAt: true },
    });

    if (existing?.profilePhotoPath && existing.profilePhotoPath !== savedPath) {
      await deleteStoredFiles([existing.profilePhotoPath]);
    }
    await writeAdminLog(req.user?.userId, "USER_PROFILE_PHOTO_UPDATED", "User", req.user?.userId, {
      result: "success",
      contentType: payload.data.contentType,
      fileSizeBytes: payload.data.fileContent.length,
      storageDriver: configuredStorageDriver(),
    });
    res.status(201).json({
      message: "Profile photo updated",
      hasProfilePhoto: true,
      profilePhotoUpdatedAt: profile.updatedAt,
    });
  } catch (error) {
    if (savedPath) await deleteStoredFiles([savedPath]);
    logEvent("error", "user_profile_photo_update_failed", {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, "Profile photo update failed"),
    });
    res.status(500).json({ error: "Failed to update profile photo" });
  }
});

app.get('/api/me/profile-photo', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.user?.userId || "" },
      select: {
        profilePhotoPath: true,
        profilePhotoName: true,
        profilePhotoContentType: true,
      },
    });
    if (!profile?.profilePhotoPath) return res.status(404).json({ error: "Profile photo not found" });
    await sendStoredFileInline(req, res, profile.profilePhotoPath, {
      fileName: profile.profilePhotoName || "profile-photo",
      contentType: profile.profilePhotoContentType || "application/octet-stream",
      cacheControl: "private, no-store",
    });
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: "Failed to load profile photo" });
  }
});

app.delete('/api/me/profile-photo', requireAuth, accountSecurityRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.user?.userId || "" },
      select: { profilePhotoPath: true },
    });
    if (!profile?.profilePhotoPath) return res.status(404).json({ error: "Profile photo not found" });

    const cleanup = await deleteStoredFiles([profile.profilePhotoPath]);
    if (cleanup.failed) {
      return res.status(503).json({ error: "Stored photo cleanup failed; profile data was preserved" });
    }
    await prisma.userProfile.update({
      where: { userId: req.user?.userId || "" },
      data: {
        profilePhotoPath: null,
        profilePhotoName: null,
        profilePhotoContentType: null,
        profilePhotoSizeBytes: null,
      },
    });
    await writeAdminLog(req.user?.userId, "USER_PROFILE_PHOTO_REMOVED", "User", req.user?.userId, {
      result: "success",
    });
    res.json({ message: "Profile photo removed" });
  } catch (error) {
    res.status(500).json({ error: "Failed to remove profile photo" });
  }
});

app.post('/api/contact-messages', contactRateLimiter, async (req: Request, res: Response) => {
  try {
    const payload = buildContactMessagePayload(req.body || {});
    if ("error" in payload) {
      return res.status(400).json({ error: payload.error });
    }

    const contactMessage = await prisma.contactMessage.create({
      data: payload.data,
      select: { createdAt: true },
    });

    res.status(201).json({
      message: "Contact message submitted",
      createdAt: contactMessage.createdAt,
    });
  } catch (error) {
    console.error("Contact Message Submission Error:", error);
    res.status(500).json({ error: "Failed to submit contact message" });
  }
});

app.get('/api/about/team', async (_req: Request, res: Response) => {
  try {
    const members = await prisma.aboutTeamMember.findMany({
      where: { active: true },
      orderBy: [{ section: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
    });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ members });
  } catch (error) {
    console.error('About Team Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch About Us team members' });
  }
});

app.get('/api/tools', async (_req: Request, res: Response) => {
  try {
    const configuredTools = await prisma.toolCatalogEntry.findMany({ where: { active: true }, orderBy: { label: 'asc' } });
    const tools = new Map(TOOL_DEFINITIONS.map((tool) => [tool.key, tool]));
    configuredTools.forEach((tool) => tools.set(tool.key, {
      key: tool.key, label: tool.label, category: tool.category, description: tool.description,
    }));
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({ tools: Array.from(tools.values()) });
  } catch (error) {
    console.error('Tool Catalog Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch tool catalog' });
  }
});

// ─── USER SUBMISSIONS & BLOGS ───────────────────────────────────────────────

app.get('/api/me/uploads', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uploads = await prisma.organismUpload.findMany({
      where: { submittedById: req.user?.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    res.json(uploads);
  } catch (error) {
    console.error("User Upload Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch your organism uploads" });
  }
});

app.get('/api/submissions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const submissionId = parseStringParam(req.params.id);
    const existing = await prisma.organismUpload.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        submittedById: true,
        reviewedById: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,
        reviewedAt: true,
      },
    });

    if (!existing) return res.status(404).json({ error: "Submission not found" });

    const isOwner = existing.submittedById === req.user?.userId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      await writeAdminLog(req.user?.userId, "SUBMISSION_DETAIL_UNAUTHORIZED", "OrganismUpload", submissionId, {
        result: "failure",
        statusCode: 403,
      });
      return res.status(403).json({ error: "You are not allowed to view this submission" });
    }

    await ensureSubmissionStatusHistory(existing);
    const upload = await prisma.organismUpload.findUnique({
      where: { id: submissionId },
      include: submissionDetailInclude(isAdmin),
    });

    if (!upload) return res.status(404).json({ error: "Submission not found" });

    await writeAdminLog(req.user?.userId, isAdmin ? "ADMIN_SUBMISSION_DETAIL_VIEWED" : "USER_SUBMISSION_DETAIL_VIEWED", "OrganismUpload", submissionId, {
      status: upload.status,
      result: "success",
    });

    res.json({ submission: buildSubmissionResponse(upload) });
  } catch (error) {
    console.error("Submission Detail Error:", error);
    res.status(500).json({ error: "Failed to fetch submission detail" });
  }
});

app.patch('/api/submissions/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const submissionId = parseStringParam(req.params.id);
    const existing = await prisma.organismUpload.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        submittedById: true,
        status: true,
      },
    });

    if (!existing) return res.status(404).json({ error: "Submission not found" });

    const isOwner = existing.submittedById === req.user?.userId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      await writeAdminLog(req.user?.userId, "SUBMISSION_EDIT_UNAUTHORIZED", "OrganismUpload", submissionId, {
        result: "failure",
        statusCode: 403,
      });
      return res.status(403).json({ error: "You are not allowed to edit this submission" });
    }

    if (!isAdmin && existing.status !== ApprovalStatus.PENDING && existing.status !== ApprovalStatus.NEEDS_CHANGES) {
      return res.status(409).json({ error: "This submission can only be edited while it is pending or needs changes" });
    }

    const payload = buildOrganismUploadData(req.body || {});
    if ("error" in payload) {
      return res.status(400).json({ error: payload.error });
    }

    const resubmissionNote = reviewNoteValue(req.body.reviewNote || req.body.submitterNote);
    const updated = await prisma.organismUpload.update({
      where: { id: submissionId },
      data: {
        ...payload.data,
        status: ApprovalStatus.PENDING,
        reviewedById: null,
        reviewedAt: null,
      },
      include: submissionDetailInclude(isAdmin),
    });

    await recordSubmissionStatusHistory({
      submissionId,
      status: "RESUBMITTED",
      actorId: req.user?.userId,
      note: resubmissionNote || "Submission updated by submitter and returned to the review queue.",
      visibleToSubmitter: true,
    });

    if (resubmissionNote) {
      await addSubmissionReviewerNote({
        submissionId,
        authorId: req.user?.userId,
        message: resubmissionNote,
        visibleToSubmitter: true,
      });
    }

    await writeAdminLog(req.user?.userId, isAdmin ? "ADMIN_SUBMISSION_EDITED" : "USER_SUBMISSION_EDITED", "OrganismUpload", submissionId, {
      result: "success",
    });

    res.json({ message: "Submission updated", submission: buildSubmissionResponse(updated) });
  } catch (error) {
    console.error("Submission Update Error:", error);
    res.status(500).json({ error: "Failed to update submission" });
  }
});

app.post('/api/organism-uploads', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = buildOrganismUploadData(req.body || {});
    if ("error" in payload) {
      return res.status(400).json({ error: payload.error });
    }

    const upload = await prisma.organismUpload.create({
      data: {
        ...payload.data,
        submittedById: req.user?.userId || "",
        status: ApprovalStatus.PENDING,
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
      },
    });

    await recordSubmissionStatusHistory({
      submissionId: upload.id,
      status: "SUBMITTED",
      actorId: req.user?.userId,
      note: "Initial submission received.",
      visibleToSubmitter: true,
      createdAt: upload.createdAt,
    });

    await writeAdminLog(req.user?.userId, "ORGANISM_UPLOAD_SUBMITTED", "OrganismUpload", upload.id, {
      scientificName: upload.scientificName,
      strainName: upload.strainName,
      submitterEmail: upload.submittedBy.email,
      submitterRole: upload.submittedBy.role,
    });

    res.status(201).json({ message: "Organism upload submitted for admin verification", upload });
  } catch (error) {
    console.error("Organism Upload Submission Error:", error);
    res.status(500).json({ error: "Failed to submit organism upload" });
  }
});

app.post('/api/organism-uploads/:id/maya-files', importRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = parseStringParam(req.params.id);
  let storedPath: string | undefined;

  try {
    const upload = await prisma.organismUpload.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        submittedById: true,
        status: true,
        _count: { select: { files: true } },
      },
    });
    if (!upload) return res.status(404).json({ error: 'Organism upload not found' });

    if (!canEditSubmissionResults(req, upload.submittedById)) {
      await writeAdminLog(req.user?.userId, 'SUBMISSION_FILE_UPLOAD_DENIED', 'OrganismUpload', submissionId, {
        result: 'failure',
        statusCode: 403,
      });
      return res.status(403).json({ error: 'You are not allowed to add files to this submission' });
    }
    const isApprovedAmendment = upload.status === ApprovalStatus.APPROVED;
    if (upload.status !== ApprovalStatus.PENDING && upload.status !== ApprovalStatus.NEEDS_CHANGES && !isApprovedAmendment) {
      return res.status(409).json({ error: 'MAYA files can only be added while a submission is pending, needs changes, or is an approved contributor amendment.' });
    }
    if (isApprovedAmendment && !canAmendApprovedSubmission(req, upload.submittedById)) {
      await writeAdminLog(req.user?.userId, 'SUBMISSION_RESULT_AMENDMENT_DENIED', 'OrganismUpload', submissionId, {
        result: 'failure',
        reason: 'contributor_or_moderator_role_required',
        statusCode: 403,
      });
      return res.status(403).json({ error: 'Approved submissions can be amended only by their Contributor owner, a Moderator, or an Admin.' });
    }
    if (upload._count.files >= 30) {
      return res.status(409).json({ error: 'A submission can contain at most 30 MAYA result files' });
    }

    const normalizedTool = normalizeToolName(textValue(req.body?.toolName, 100) || '');
    if (!isSupportedOrCustomTool(normalizedTool)) {
      return res.status(400).json({ error: 'Provide a valid MAYA tool name using letters, numbers, and underscores.' });
    }
    const existingToolFile = await prisma.submissionFile.findFirst({
      where: { submissionId, toolName: normalizedTool },
      select: { id: true },
    });
    if (existingToolFile) {
      return res.status(409).json({ error: 'This submission already has a checkpoint for that MAYA tool. Use the replacement action to update it.' });
    }
    const validatedFile = validateImportFile(req.body?.fileName, req.body?.fileContent);
    if ('error' in validatedFile) return res.status(400).json({ error: validatedFile.error });

    const checksumSha256 = createHash('sha256').update(validatedFile.fileContent, 'utf8').digest('hex');
    storedPath = await saveSubmissionResultFile({
      submissionId,
      toolName: normalizedTool,
      fileName: validatedFile.fileName,
      fileContent: validatedFile.fileContent,
    });

    const file = await prisma.submissionFile.create({
      data: {
        submissionId,
        toolName: normalizedTool,
        originalFileName: validatedFile.fileName,
        fileType: path.extname(validatedFile.fileName).replace('.', '').toLowerCase() || 'txt',
        fileSizeBytes: Buffer.byteLength(validatedFile.fileContent, 'utf8'),
        checksumSha256,
        storagePath: storedPath,
        toolVersion: textValue(req.body?.toolVersion, 120),
        summary: parseFlexibleSummary(validatedFile.fileName, validatedFile.fileContent, req.body?.summary) as Prisma.InputJsonValue,
        warnings: parseJsonArray(req.body?.warnings) as Prisma.InputJsonValue,
        errors: parseJsonArray(req.body?.errors) as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        toolName: true,
        originalFileName: true,
        fileType: true,
        fileSizeBytes: true,
        checksumSha256: true,
        toolVersion: true,
        status: true,
        checkpointedAt: true,
        createdAt: true,
      },
    });

    if (isApprovedAmendment) {
      await prisma.organismUpload.update({
        where: { id: submissionId },
        data: { status: ApprovalStatus.PENDING, reviewedById: null, reviewedAt: null },
      });
      await recordSubmissionStatusHistory({
        submissionId,
        status: 'RESULT_AMENDMENT_SUBMITTED',
        actorId: req.user?.userId,
        note: `${file.toolName} result checkpoint added. The published record remains unchanged until an administrator approves this amendment.`,
        visibleToSubmitter: true,
      });
    }

    await writeAdminLog(req.user?.userId, 'SUBMISSION_MAYA_FILE_UPLOADED', 'OrganismUpload', submissionId, {
      fileId: file.id,
      toolName: file.toolName,
      fileName: file.originalFileName,
      fileSizeBytes: file.fileSizeBytes,
      storageDriver: configuredStorageDriver(),
    });
    res.status(201).json({
      message: isApprovedAmendment
        ? 'MAYA result checkpoint saved and returned to the admin review queue.'
        : 'MAYA result checkpoint saved for admin review.',
      file,
    });
  } catch (error) {
    if (storedPath) await deleteStoredFiles([storedPath]);
    logEvent('error', 'submission_file_upload_failed', {
      submissionId,
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Submission file upload failed'),
    });
    res.status(500).json({ error: 'Failed to attach MAYA result file' });
  }
});

app.put('/api/organism-uploads/:submissionId/maya-files/:fileId', importRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = parseStringParam(req.params.submissionId);
  const fileId = parseStringParam(req.params.fileId);
  let storedPath: string | undefined;

  try {
    const file = await prisma.submissionFile.findFirst({
      where: { id: fileId, submissionId },
      include: { submission: { select: { submittedById: true, status: true } } },
    });
    if (!file) return res.status(404).json({ error: 'Submission result checkpoint not found' });

    if (!canEditSubmissionResults(req, file.submission.submittedById)) {
      await writeAdminLog(req.user?.userId, 'SUBMISSION_RESULT_CHECKPOINT_EDIT_DENIED', 'OrganismUpload', submissionId, {
        result: 'failure',
        fileId,
        statusCode: 403,
      });
      return res.status(403).json({ error: 'You are not allowed to replace this result checkpoint' });
    }

    const isApprovedAmendment = file.submission.status === ApprovalStatus.APPROVED;
    if (file.submission.status !== ApprovalStatus.PENDING && file.submission.status !== ApprovalStatus.NEEDS_CHANGES && !isApprovedAmendment) {
      return res.status(409).json({ error: 'This result checkpoint cannot be changed in the current review state' });
    }
    if (isApprovedAmendment && !canAmendApprovedSubmission(req, file.submission.submittedById)) {
      return res.status(403).json({ error: 'Approved submissions can be amended only by their Contributor owner, a Moderator, or an Admin.' });
    }

    const requestedTool = normalizeToolName(textValue(req.body?.toolName, 100) || file.toolName);
    if (!isSupportedOrCustomTool(requestedTool)) {
      return res.status(400).json({ error: 'Provide a valid MAYA tool name using letters, numbers, and underscores.' });
    }
    const validatedFile = validateImportFile(req.body?.fileName, req.body?.fileContent);
    if ('error' in validatedFile) return res.status(400).json({ error: validatedFile.error });

    storedPath = await saveSubmissionResultFile({
      submissionId,
      toolName: requestedTool,
      fileName: validatedFile.fileName,
      fileContent: validatedFile.fileContent,
    });
    const replacement = await prisma.submissionFile.update({
      where: { id: fileId },
      data: {
        toolName: requestedTool,
        originalFileName: validatedFile.fileName,
        fileType: path.extname(validatedFile.fileName).replace('.', '').toLowerCase() || 'txt',
        fileSizeBytes: Buffer.byteLength(validatedFile.fileContent, 'utf8'),
        checksumSha256: createHash('sha256').update(validatedFile.fileContent, 'utf8').digest('hex'),
        storagePath: storedPath,
        toolVersion: textValue(req.body?.toolVersion, 120),
        summary: parseFlexibleSummary(validatedFile.fileName, validatedFile.fileContent, req.body?.summary) as Prisma.InputJsonValue,
        warnings: parseJsonArray(req.body?.warnings) as Prisma.InputJsonValue,
        errors: parseJsonArray(req.body?.errors) as Prisma.InputJsonValue,
        status: SubmissionFileStatus.UPLOADED,
        errorMessage: null,
        ingestedAt: null,
        checkpointedAt: new Date(),
      },
      select: { id: true, toolName: true, originalFileName: true, status: true, checkpointedAt: true },
    });

    if (isApprovedAmendment) {
      await prisma.organismUpload.update({
        where: { id: submissionId },
        data: { status: ApprovalStatus.PENDING, reviewedById: null, reviewedAt: null },
      });
      await recordSubmissionStatusHistory({
        submissionId,
        status: 'RESULT_AMENDMENT_SUBMITTED',
        actorId: req.user?.userId,
        note: `${replacement.toolName} result checkpoint replaced. The existing public result stays published until this amendment is approved.`,
        visibleToSubmitter: true,
      });
    }

    if (file.storagePath !== storedPath) await deleteStoredFiles([file.storagePath]);
    await writeAdminLog(req.user?.userId, 'SUBMISSION_RESULT_CHECKPOINT_REPLACED', 'OrganismUpload', submissionId, {
      result: 'success',
      fileId,
      previousToolName: file.toolName,
      toolName: replacement.toolName,
      fileName: replacement.originalFileName,
    });
    res.json({ message: 'MAYA result checkpoint replaced and saved for review.', file: replacement });
  } catch (error) {
    if (storedPath) await deleteStoredFiles([storedPath]);
    logEvent('error', 'submission_result_checkpoint_replace_failed', {
      submissionId,
      fileId,
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Submission result checkpoint replacement failed'),
    });
    res.status(500).json({ error: 'Failed to replace MAYA result checkpoint' });
  }
});

app.get('/api/submissions/:submissionId/files/:fileId/download', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = parseStringParam(req.params.submissionId);
  const fileId = parseStringParam(req.params.fileId);

  try {
    const file = await prisma.submissionFile.findFirst({
      where: { id: fileId, submissionId },
      include: { submission: { select: { submittedById: true } } },
    });
    if (!file) return res.status(404).json({ error: 'Submission file not found' });

    const isOwner = file.submission.submittedById === req.user?.userId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      await writeAdminLog(req.user?.userId, 'SUBMISSION_FILE_DOWNLOAD_DENIED', 'OrganismUpload', submissionId, {
        result: 'failure',
        fileId,
        statusCode: 403,
      });
      return res.status(403).json({ error: 'You are not allowed to download this submission file' });
    }

    await writeAdminLog(req.user?.userId, 'SUBMISSION_FILE_DOWNLOADED', 'OrganismUpload', submissionId, {
      fileId,
      toolName: file.toolName,
      result: 'success',
    });
    await sendStoredFileDownload(res, file.storagePath, file.originalFileName);
  } catch (error) {
    logEvent('error', 'submission_file_download_failed', {
      submissionId,
      fileId,
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Submission file download failed'),
    });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to download submission file' });
  }
});

app.get('/api/submissions/:submissionId/files/:fileId/view', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = parseStringParam(req.params.submissionId);
  const fileId = parseStringParam(req.params.fileId);

  try {
    const file = await prisma.submissionFile.findFirst({
      where: { id: fileId, submissionId },
      include: { submission: { select: { submittedById: true } } },
    });
    if (!file) return res.status(404).json({ error: 'Submission file not found' });

    const isOwner = file.submission.submittedById === req.user?.userId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      await writeAdminLog(req.user?.userId, 'SUBMISSION_FILE_VIEW_DENIED', 'OrganismUpload', submissionId, {
        result: 'failure',
        fileId,
        statusCode: 403,
      });
      return res.status(403).json({ error: 'You are not allowed to view this submission file' });
    }

    await writeAdminLog(req.user?.userId, 'SUBMISSION_FILE_VIEWED', 'OrganismUpload', submissionId, {
      fileId,
      toolName: file.toolName,
      result: 'success',
    });
    await sendStoredFileInline(req, res, file.storagePath, {
      fileName: file.originalFileName,
      contentType: contentTypeForFileName(file.originalFileName),
      cacheControl: 'private, no-store',
    });
  } catch (error) {
    logEvent('error', 'submission_file_view_failed', {
      submissionId,
      fileId,
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Submission file view failed'),
    });
    if (!res.headersSent) res.status(500).json({ error: 'Failed to view submission file' });
  }
});

app.delete('/api/organism-uploads/:submissionId/maya-files/:fileId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = parseStringParam(req.params.submissionId);
  const fileId = parseStringParam(req.params.fileId);

  try {
    const file = await prisma.submissionFile.findFirst({
      where: { id: fileId, submissionId },
      include: { submission: { select: { submittedById: true, status: true } } },
    });
    if (!file) return res.status(404).json({ error: 'Submission file not found' });

    const isOwner = file.submission.submittedById === req.user?.userId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'You are not allowed to remove this submission file' });
    if (file.submission.status !== ApprovalStatus.PENDING && file.submission.status !== ApprovalStatus.NEEDS_CHANGES) {
      return res.status(409).json({ error: 'Files cannot be removed after review is complete' });
    }

    const cleanup = await deleteStoredFiles([file.storagePath]);
    if (cleanup.failed > 0) return res.status(503).json({ error: 'Stored file cleanup failed; the database record was preserved' });
    await prisma.submissionFile.delete({ where: { id: file.id } });
    await writeAdminLog(req.user?.userId, 'SUBMISSION_MAYA_FILE_REMOVED', 'OrganismUpload', submissionId, {
      fileId,
      toolName: file.toolName,
    });
    res.json({ message: 'MAYA result file removed' });
  } catch (error) {
    logEvent('error', 'submission_file_delete_failed', {
      submissionId,
      fileId,
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Submission file delete failed'),
    });
    res.status(500).json({ error: 'Failed to remove submission file' });
  }
});

app.post('/api/organism-uploads/:id/genome-references', importRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = parseStringParam(req.params.id);
  try {
    const upload = await prisma.organismUpload.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        submittedById: true,
        status: true,
        genomeReferences: { select: { kind: true, validation: true } },
      },
    });
    if (!upload) return res.status(404).json({ error: 'Organism upload not found' });
    const isOwner = upload.submittedById === req.user?.userId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'You are not allowed to add genome references to this submission' });
    if (upload.status !== ApprovalStatus.PENDING && upload.status !== ApprovalStatus.NEEDS_CHANGES) {
      return res.status(409).json({ error: 'Genome references can only be changed while a submission is pending or needs changes' });
    }

    const kind = String(req.body?.kind || '').trim().toUpperCase() as UploadableGenomeReferenceKind;
    if (kind !== 'FASTA' && kind !== 'GFF3') return res.status(400).json({ error: 'Reference kind must be FASTA or GFF3' });
    const prepared = prepareGenomeReference({
      kind,
      fileName: req.body?.fileName,
      fileContent: req.body?.fileContent,
      maxBytes: MAX_GENOME_REFERENCE_BYTES,
    });
    if ('error' in prepared) return res.status(400).json({ error: prepared.error });

    const otherKind = kind === 'FASTA' ? GenomeReferenceKind.GFF3 : GenomeReferenceKind.FASTA;
    const other = upload.genomeReferences.find((file) => file.kind === otherKind);
    const incomingNames = referenceNamesFromValidation(prepared.files[0].validation as Prisma.JsonValue);
    if (other && !referenceSetsOverlap(incomingNames, referenceNamesFromValidation(other.validation))) {
      return res.status(409).json({ error: 'FASTA and GFF3 reference names do not overlap. Confirm that both files describe the same assembly.' });
    }

    const files = await savePreparedGenomeReferences({ submissionId, files: prepared.files, publish: false });
    await writeAdminLog(req.user?.userId, 'SUBMISSION_GENOME_REFERENCE_UPLOADED', 'OrganismUpload', submissionId, {
      kinds: files.map((file) => file.kind),
      fileNames: files.map((file) => file.originalFileName),
      storageDriver: configuredStorageDriver(),
    });
    res.status(201).json({ message: `${kind} reference attached for admin review`, files });
  } catch (error) {
    logEvent('error', 'submission_genome_reference_upload_failed', {
      submissionId,
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Genome reference upload failed'),
    });
    res.status(500).json({ error: 'Failed to attach genome reference' });
  }
});

app.get('/api/submissions/:submissionId/genome-references/:fileId/download', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = parseStringParam(req.params.submissionId);
  const fileId = parseStringParam(req.params.fileId);
  try {
    const file = await prisma.genomeReferenceFile.findFirst({
      where: { id: fileId, submissionId },
      include: { submission: { select: { submittedById: true } } },
    });
    if (!file) return res.status(404).json({ error: 'Genome reference file not found' });
    const isOwner = file.submission?.submittedById === req.user?.userId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'You are not allowed to download this genome reference' });
    await writeAdminLog(req.user?.userId, 'SUBMISSION_GENOME_REFERENCE_DOWNLOADED', 'OrganismUpload', submissionId, {
      fileId,
      kind: file.kind,
      result: 'success',
    });
    await sendStoredFileDownload(res, file.storagePath, file.originalFileName);
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: 'Failed to download genome reference' });
  }
});

app.delete('/api/organism-uploads/:submissionId/genome-references/:fileId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const submissionId = parseStringParam(req.params.submissionId);
  const fileId = parseStringParam(req.params.fileId);
  try {
    const file = await prisma.genomeReferenceFile.findFirst({
      where: { id: fileId, submissionId },
      include: { submission: { select: { submittedById: true, status: true } } },
    });
    if (!file) return res.status(404).json({ error: 'Genome reference file not found' });
    const isOwner = file.submission?.submittedById === req.user?.userId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) return res.status(403).json({ error: 'You are not allowed to remove this genome reference' });
    if (file.submission?.status !== ApprovalStatus.PENDING && file.submission?.status !== ApprovalStatus.NEEDS_CHANGES) {
      return res.status(409).json({ error: 'Genome references cannot be removed after review is complete' });
    }
    const kinds = file.kind === GenomeReferenceKind.FASTA
      ? [GenomeReferenceKind.FASTA, GenomeReferenceKind.FAI]
      : [file.kind];
    const files = await prisma.genomeReferenceFile.findMany({ where: { submissionId, kind: { in: kinds } } });
    const cleanup = await deleteStoredFiles(files.map((item) => item.storagePath));
    if (cleanup.failed) return res.status(503).json({ error: 'Stored file cleanup failed; database records were preserved' });
    await prisma.genomeReferenceFile.deleteMany({ where: { id: { in: files.map((item) => item.id) } } });
    await writeAdminLog(req.user?.userId, 'SUBMISSION_GENOME_REFERENCE_REMOVED', 'OrganismUpload', submissionId, { kinds });
    res.json({ message: 'Genome reference removed' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to remove genome reference' });
  }
});

app.get('/api/me/blog-posts', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { authorId: req.user?.userId },
      orderBy: { createdAt: 'desc' },
      include: {
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    res.json(posts);
  } catch (error) {
    console.error("User Blog Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch your blog posts" });
  }
});

app.get('/api/blog-posts', async (_req: Request, res: Response) => {
  try {
    const posts = await prisma.blogPost.findMany({
      where: { status: ApprovalStatus.APPROVED },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, affiliation: true, role: true } },
      },
    });
    res.json(posts);
  } catch (error) {
    console.error("Public Blog Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch blog posts" });
  }
});

app.post('/api/blog-posts', requireRole([UserRole.CONTRIBUTOR, UserRole.MODERATOR, UserRole.ADMIN]), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const title = textValue(req.body.title, 220);
    const content = textValue(req.body.content, 20000);

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    if (content.length < 80) {
      return res.status(400).json({ error: "Blog content must be at least 80 characters" });
    }

    const post = await prisma.blogPost.create({
      data: {
        title,
        content,
        authorId: req.user?.userId || "",
        status: ApprovalStatus.PENDING,
      },
      include: {
        author: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
      },
    });

    await writeAdminLog(req.user?.userId, "BLOG_POST_SUBMITTED", "BlogPost", post.id, {
      title: post.title,
      authorEmail: post.author.email,
      authorRole: post.author.role,
    });

    res.status(201).json({ message: "Blog post submitted for admin review", post });
  } catch (error) {
    console.error("Blog Submission Error:", error);
    res.status(500).json({ error: "Failed to submit blog post" });
  }
});

// ─── DASHBOARD SUMMARY ───────────────────────────────────────────────────────

app.get('/api/dashboard/summary', async (req: Request, res: Response) => {
  try {
    const [recentStrains, recentAmr] = await Promise.all([
      prisma.strain.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { organism: true }
      }),
      prisma.amrGene.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: { strain: true }
      })
    ]);
    res.json({ recentStrains, recentAmr });
  } catch (error) {
    console.error("Dashboard Summary Error:", error);
    res.status(500).json({ error: "Failed to load dashboard summary" });
  }
});

app.use('/api/surveillance', surveillanceRateLimiter);

app.get('/api/surveillance/overview', async (req: Request, res: Response) => {
  try {
    const overview = await getSurveillanceOverview(prisma, parseSurveillanceFilters(req.query));
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
    res.json(overview);
  } catch (error) {
    logEvent('error', 'surveillance_overview_failed', {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Surveillance overview failed'),
    });
    res.status(500).json({ error: 'Failed to load global surveillance overview' });
  }
});

app.get('/api/surveillance/filters', async (_req: Request, res: Response) => {
  try {
    const filters = await getSurveillanceFilterOptions(prisma);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(filters);
  } catch (error) {
    logEvent('error', 'surveillance_filters_failed', {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Surveillance filters failed'),
    });
    res.status(500).json({ error: 'Failed to load surveillance filter options' });
  }
});

app.get('/api/surveillance/records', async (req: Request, res: Response) => {
  try {
    const requestedPage = parseOptionalInt(Array.isArray(req.query.page) ? req.query.page[0] : req.query.page) || 1;
    const requestedPageSize = parseOptionalInt(Array.isArray(req.query.pageSize) ? req.query.pageSize[0] : req.query.pageSize) || 25;
    const page = Math.max(1, requestedPage);
    const pageSize = Math.min(100, Math.max(10, requestedPageSize));
    const records = await getSurveillanceRecords(prisma, parseSurveillanceFilters(req.query), page, pageSize);
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
    res.json(records);
  } catch (error) {
    logEvent('error', 'surveillance_records_failed', {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Surveillance records failed'),
    });
    res.status(500).json({ error: 'Failed to load surveillance records' });
  }
});

app.get('/api/surveillance/amr', async (req: Request, res: Response) => {
  try {
    const insights = await getAmrSurveillanceInsights(prisma, parseSurveillanceFilters(req.query));
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=45');
    res.json(insights);
  } catch (error) {
    logEvent('error', 'surveillance_amr_failed', {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, 'Surveillance AMR insights failed'),
    });
    res.status(500).json({ error: 'Failed to load AMR surveillance insights' });
  }
});

// ─── AMR FINDINGS OF INDIA ─────────────────────────────────────────────────

function parseAmrFindingFilters(query: Request['query']): AmrFindingFilters {
  const read = (key: string) => textValue(Array.isArray(query[key]) ? query[key][0] : query[key], 240);
  const number = (key: string) => parseOptionalInt(Array.isArray(query[key]) ? query[key][0] : query[key]);
  const boolean = (key: string) => {
    const value = read(key);
    return value === 'true' ? true : value === 'false' ? false : undefined;
  };
  const sort = read('sort');
  return {
    q: read('q'), state: read('state'), domain: read('domain'), pathogen: read('pathogen'), gene: read('gene'),
    antimicrobialClass: read('antimicrobialClass'), mechanism: read('mechanism'), year: number('year'),
    evidenceLevel: read('evidenceLevel') as AmrFindingFilters['evidenceLevel'], importance: read('importance') as AmrFindingFilters['importance'],
    resistanceEvidence: read('resistanceEvidence') as AmrFindingFilters['resistanceEvidence'], oneHealth: boolean('oneHealth'),
    hasGenomicData: boolean('hasGenomicData'), openAccess: boolean('openAccess'), page: number('page'), pageSize: number('pageSize'),
    sort: sort === 'oldest' || sort === 'importance' || sort === 'relevance' ? sort : 'newest',
  };
}

app.use('/api/amr-findings', surveillanceRateLimiter);

app.get('/api/amr-findings/dashboard', async (_req: Request, res: Response) => {
  try {
    const dashboard = await amrDashboard(prisma);
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=90');
    res.json(dashboard);
  } catch (error) {
    logEvent('error', 'amr_findings_dashboard_failed', { requestId: currentContext()?.requestId, error: safeErrorMessage(error, 'AMR findings dashboard failed') });
    res.status(500).json({ error: 'Failed to load AMR findings dashboard' });
  }
});

app.get('/api/amr-findings/filters', async (_req: Request, res: Response) => {
  try {
    const filters = await amrFilterOptions(prisma);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json(filters);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load AMR finding filters' });
  }
});

app.get('/api/amr-findings', async (req: Request, res: Response) => {
  try {
    const findings = await listPublishedAmrFindings(prisma, parseAmrFindingFilters(req.query));
    res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=60');
    res.json(findings);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load AMR findings' });
  }
});

app.get('/api/amr-findings/:slug', async (req: Request, res: Response) => {
  try {
    const finding = await publishedAmrFindingBySlug(prisma, parseStringParam(req.params.slug));
    if (!finding) return res.status(404).json({ error: 'AMR finding not found' });
    res.json(finding);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load AMR finding' });
  }
});

function amrWorkflowErrorStatus(error: unknown) {
  const message = safeErrorMessage(error, 'AMR workflow request failed');
  if (/not found|does not exist/i.test(message)) return 404;
  if (/only .*own|not authorized|cannot moderate/i.test(message)) return 403;
  if (/already in review|already in review or closed|only drafts|only approved|future publication|duplicate target|requires review/i.test(message)) return 409;
  return 400;
}

// Public AMR publications are independently curated. A publication becomes visible only after
// the same approved-and-published workflow used by AMR findings.
app.use('/api/amr-publications', surveillanceRateLimiter);

app.get('/api/amr-publications', async (req: Request, res: Response) => {
  try {
    const page = parseOptionalInt(String(req.query.page || '')) || 1;
    const pageSize = parseOptionalInt(String(req.query.pageSize || '')) || 20;
    const year = parseOptionalInt(String(req.query.year || '')) || undefined;
    const publications = await listPublishedPublications(prisma, { q: textValue(req.query.q, 240), year, page, pageSize });
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=90');
    res.json(publications);
  } catch {
    res.status(500).json({ error: 'Failed to load AMR publications' });
  }
});

app.get('/api/amr-publications/:slug', async (req: Request, res: Response) => {
  try {
    const publication = await publishedPublicationBySlug(prisma, parseStringParam(req.params.slug));
    if (!publication) return res.status(404).json({ error: 'AMR publication not found' });
    res.json(publication);
  } catch {
    res.status(500).json({ error: 'Failed to load AMR publication' });
  }
});

// Registered-user AMR workspace. These routes deliberately live outside /admin and apply
// ownership checks in the service layer before any private draft or feedback is returned.
app.get('/api/amr-submissions/schema', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(amrFindingJsonSchema);
});

app.get('/api/me/amr-submissions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workspace = await getOwnAmrWorkspace(prisma, req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_WORKSPACE_OPENED', 'AmrWorkspace', req.user?.userId, { result: 'success' });
    res.json(workspace);
  } catch (error) {
    res.status(500).json({ error: safeErrorMessage(error, 'Unable to load AMR submissions') });
  }
});

app.get('/api/me/notifications', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(100, Math.max(1, parseOptionalInt(String(req.query.limit || '')) || 50));
    const notifications = await prisma.notification.findMany({ where: { userId: req.user!.userId }, orderBy: { createdAt: 'desc' }, take: limit });
    res.json(notifications);
  } catch {
    res.status(500).json({ error: 'Unable to load notifications' });
  }
});

app.patch('/api/me/notifications/:id/read', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const notification = await prisma.notification.findFirst({ where: { id, userId: req.user!.userId } });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    const updated = await prisma.notification.update({ where: { id }, data: { readAt: req.body?.read === false ? null : new Date() } });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Unable to update notification' });
  }
});

app.post('/api/amr-submissions/findings', requireAuth, amrSubmissionRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const finding = await createUserFindingDraft(prisma, parseJsonObject(req.body), req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_FINDING_USER_DRAFT_CREATED', 'AmrFinding', finding.id, { result: 'success', title: finding.title, source: 'USER_MANUAL' });
    res.status(201).json(finding);
  } catch (error) {
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to save AMR finding draft') });
  }
});

app.post('/api/amr-submissions/findings/json/validate', requireAuth, amrSubmissionRateLimiter, (req: AuthenticatedRequest, res: Response) => {
  const result = parseAmrJsonPayload(req.body?.jsonText);
  if ('error' in result) return res.status(400).json(result);
  res.json({ valid: true, records: result.records.length });
});

app.post('/api/amr-submissions/findings/json', requireAuth, amrSubmissionRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const filename = textValue(req.body?.filename, 240) || 'amr-findings.json';
  const contentType = textValue(req.body?.contentType, 100);
  if (contentType && !['application/json', 'text/json'].includes(contentType)) return res.status(415).json({ error: 'Only JSON files are accepted for AMR finding imports.' });
  try {
    const imported = await importUserJsonFindings(prisma, req.body?.jsonText, req.user!.userId, req.body?.submit === true, filename);
    await writeAdminLog(req.user?.userId, 'AMR_FINDINGS_JSON_IMPORTED', 'AmrImportJob', imported.jobId, { result: 'success', filename, records: imported.records.length, submitted: req.body?.submit === true });
    res.status(201).json({ jobId: imported.jobId, records: imported.records });
  } catch (error) {
    await writeAdminLog(req.user?.userId, 'AMR_FINDINGS_JSON_IMPORT_FAILED', 'AmrImportJob', undefined, { result: 'failure', filename });
    const details = error && typeof error === 'object' && 'details' in error ? (error as { details?: unknown }).details : undefined;
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to import AMR finding JSON'), ...(details ? { details } : {}) });
  }
});

app.patch('/api/amr-submissions/findings/:id', requireAuth, amrSubmissionRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const finding = await updateUserFindingDraft(prisma, id, parseJsonObject(req.body), req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_FINDING_USER_DRAFT_UPDATED', 'AmrFinding', id, { result: 'success' });
    res.json(finding);
  } catch (error) {
    const status = amrWorkflowErrorStatus(error);
    if (status === 403) await writeAdminLog(req.user?.userId, 'AMR_FINDING_USER_EDIT_DENIED', 'AmrFinding', id, { result: 'failure' });
    res.status(status).json({ error: safeErrorMessage(error, 'Unable to update AMR finding draft') });
  }
});

app.post('/api/amr-submissions/findings/:id/submit', requireAuth, amrSubmissionRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const finding = await submitUserFinding(prisma, id, req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_FINDING_USER_SUBMITTED', 'AmrFinding', id, { result: 'success', status: finding.curationStatus });
    res.json(finding);
  } catch (error) {
    const status = amrWorkflowErrorStatus(error);
    if (status === 403) await writeAdminLog(req.user?.userId, 'AMR_FINDING_USER_SUBMIT_DENIED', 'AmrFinding', id, { result: 'failure' });
    res.status(status).json({ error: safeErrorMessage(error, 'Unable to submit AMR finding') });
  }
});

app.post('/api/amr-submissions/publications', requireAuth, amrSubmissionRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await createUserPublication(prisma, parseJsonObject(req.body), req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_PUBLICATION_USER_DRAFT_CREATED', 'AmrPublication', result.publication.id, { result: 'success', title: result.publication.title, duplicateCandidates: result.duplicates.length });
    res.status(201).json(result);
  } catch (error) {
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to save AMR publication draft') });
  }
});

app.patch('/api/amr-submissions/publications/:id', requireAuth, amrSubmissionRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const result = await updateUserPublication(prisma, id, parseJsonObject(req.body), req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_PUBLICATION_USER_DRAFT_UPDATED', 'AmrPublication', id, { result: 'success', duplicateCandidates: result.duplicates.length });
    res.json(result);
  } catch (error) {
    const status = amrWorkflowErrorStatus(error);
    if (status === 403) await writeAdminLog(req.user?.userId, 'AMR_PUBLICATION_USER_EDIT_DENIED', 'AmrPublication', id, { result: 'failure' });
    res.status(status).json({ error: safeErrorMessage(error, 'Unable to update AMR publication draft') });
  }
});

app.post('/api/amr-submissions/publications/:id/submit', requireAuth, amrSubmissionRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const publication = await submitUserPublication(prisma, id, req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_PUBLICATION_USER_SUBMITTED', 'AmrPublication', id, { result: 'success', status: publication.curationStatus });
    res.json(publication);
  } catch (error) {
    const status = amrWorkflowErrorStatus(error);
    if (status === 403) await writeAdminLog(req.user?.userId, 'AMR_PUBLICATION_USER_SUBMIT_DENIED', 'AmrPublication', id, { result: 'failure' });
    res.status(status).json({ error: safeErrorMessage(error, 'Unable to submit AMR publication') });
  }
});

const FINDING_MODERATION_ACTIONS: FindingModerationAction[] = ['ASSIGN_REVIEWER', 'START_REVIEW', 'REQUEST_CHANGES', 'APPROVE', 'PUBLISH', 'SCHEDULE', 'UNPUBLISH', 'REJECT', 'ARCHIVE', 'RESTORE', 'MARK_DUPLICATE', 'MERGE_DUPLICATE', 'LINK_STRAIN', 'LINK_PUBLICATION'];
const PUBLICATION_MODERATION_ACTIONS: PublicationModerationAction[] = ['ASSIGN_REVIEWER', 'START_REVIEW', 'REQUEST_CHANGES', 'APPROVE', 'PUBLISH', 'SCHEDULE', 'UNPUBLISH', 'REJECT', 'ARCHIVE', 'RESTORE', 'MARK_DUPLICATE', 'MERGE_DUPLICATE'];

app.get('/api/admin/amr-reviewers', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const reviewers = await prisma.user.findMany({ where: { role: { in: [UserRole.ADMIN, UserRole.MODERATOR] } }, select: { id: true, name: true, email: true, role: true }, orderBy: { name: 'asc' } });
    res.json(reviewers);
  } catch {
    res.status(500).json({ error: 'Unable to load AMR reviewers' });
  }
});

app.get('/api/admin/amr-bmga-strains', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const query = textValue(req.query.q, 240);
    const strains = await prisma.strain.findMany({
      where: query ? {
        OR: [
          { strainName: { contains: query, mode: 'insensitive' } },
          { isolateName: { contains: query, mode: 'insensitive' } },
          { organism: { scientificName: { contains: query, mode: 'insensitive' } } },
        ],
      } : {},
      select: { id: true, strainName: true, isolateName: true, organism: { select: { scientificName: true } } },
      orderBy: [{ organism: { scientificName: 'asc' } }, { strainName: 'asc' }],
      take: 250,
    });
    await writeAdminLog(req.user?.userId, 'AMR_BMGA_STRAINS_LISTED', 'Strain', undefined, { result: 'success', count: strains.length });
    res.json({ items: strains });
  } catch {
    res.status(500).json({ error: 'Unable to load BMGA strain records' });
  }
});

app.get('/api/admin/amr-findings/:id/review', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const finding = await prisma.amrFinding.findUnique({ where: { id: parseStringParam(req.params.id) }, include: amrFindingInclude });
    if (!finding) return res.status(404).json({ error: 'AMR finding not found' });
    await writeAdminLog(req.user?.userId, 'AMR_FINDING_OPENED', 'AmrFinding', finding.id, { result: 'success' });
    res.json(finding);
  } catch {
    res.status(500).json({ error: 'Unable to load AMR finding review details' });
  }
});

app.get('/api/admin/amr-import-queries', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const queries = await prisma.amrImportQuery.findMany({ include: { createdBy: { select: { name: true, email: true } }, _count: { select: { jobs: true } } }, orderBy: { updatedAt: 'desc' } });
    res.json(queries);
  } catch {
    res.status(500).json({ error: 'Unable to load AMR import queries' });
  }
});

app.post('/api/admin/amr-import-queries', requireAdmin, adminRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const source = req.body?.source;
  const name = textValue(req.body?.name, 200);
  const query = textValue(req.body?.query, 500);
  if (!importSourceIsSupported(source)) return res.status(400).json({ error: 'Choose PubMed or Europe PMC as the import source.' });
  if (!name || !query || query.length < 3) return res.status(400).json({ error: 'Import query name and query text are required.' });
  try {
    const importQuery = await prisma.amrImportQuery.create({ data: { name, source, query, active: req.body?.active !== false, createdById: req.user!.userId } });
    await writeAdminLog(req.user?.userId, 'AMR_IMPORT_QUERY_CREATED', 'AmrImportQuery', importQuery.id, { result: 'success', source });
    res.status(201).json(importQuery);
  } catch {
    res.status(500).json({ error: 'Unable to save AMR import query' });
  }
});

app.patch('/api/admin/amr-import-queries/:id', requireAdmin, adminRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  const name = textValue(req.body?.name, 200);
  const query = textValue(req.body?.query, 500);
  const source = req.body?.source;
  if (source !== undefined && !importSourceIsSupported(source)) return res.status(400).json({ error: 'Choose PubMed or Europe PMC as the import source.' });
  try {
    const existing = await prisma.amrImportQuery.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'AMR import query not found' });
    const updated = await prisma.amrImportQuery.update({ where: { id }, data: { ...(name ? { name } : {}), ...(query ? { query } : {}), ...(source ? { source } : {}), ...(typeof req.body?.active === 'boolean' ? { active: req.body.active } : {}) } });
    await writeAdminLog(req.user?.userId, 'AMR_IMPORT_QUERY_UPDATED', 'AmrImportQuery', id, { result: 'success' });
    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Unable to update AMR import query' });
  }
});

app.get('/api/admin/amr-import-jobs', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseOptionalInt(String(req.query.page || '')) || 1);
    const pageSize = Math.min(100, Math.max(10, parseOptionalInt(String(req.query.pageSize || '')) || 25));
    const [total, items] = await Promise.all([
      prisma.amrImportJob.count(),
      prisma.amrImportJob.findMany({ include: { query: { select: { name: true, source: true, query: true } }, createdBy: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch {
    res.status(500).json({ error: 'Unable to load AMR import history' });
  }
});

async function previewAmrImportJob(actorId: string, source: Extract<AmrImportSource, 'PUBMED' | 'EUROPE_PMC'>, query: string, limit: unknown, queryId?: string) {
  const job = await prisma.amrImportJob.create({ data: { source, request: { query, limit: Number(limit) || 20 }, queryId, status: AmrImportJobStatus.RUNNING, attempt: 1, createdById: actorId, startedAt: new Date() } });
  try {
    const preview = await previewExternalAmrImport(source, query, limit);
    return prisma.amrImportJob.update({ where: { id: job.id }, data: { status: AmrImportJobStatus.PREVIEWED, preview: JSON.parse(JSON.stringify(preview.candidates)) as Prisma.InputJsonValue, result: { candidates: preview.candidates.length }, finishedAt: new Date() } });
  } catch (error) {
    await prisma.amrImportJob.update({ where: { id: job.id }, data: { status: AmrImportJobStatus.FAILED, errorMessage: safeErrorMessage(error, 'External AMR import preview failed'), finishedAt: new Date() } });
    throw error;
  }
}

app.post('/api/admin/amr-import-jobs/preview', requireAdmin, importRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  let source = req.body?.source;
  let query = textValue(req.body?.query, 500);
  let queryId = textValue(req.body?.queryId, 120);
  try {
    if (queryId) {
      const savedQuery = await prisma.amrImportQuery.findUnique({ where: { id: queryId } });
      if (!savedQuery) return res.status(404).json({ error: 'AMR import query not found' });
      source = savedQuery.source; query = savedQuery.query;
    }
    if (!importSourceIsSupported(source) || !query) return res.status(400).json({ error: 'Choose an import source and provide a query.' });
    const job = await previewAmrImportJob(req.user!.userId, source, query, req.body?.limit, queryId || undefined);
    await writeAdminLog(req.user?.userId, 'AMR_IMPORT_PREVIEWED', 'AmrImportJob', job.id, { result: 'success', source, candidateCount: Array.isArray(job.preview) ? job.preview.length : 0 });
    res.status(201).json(job);
  } catch (error) {
    await writeAdminLog(req.user?.userId, 'AMR_IMPORT_PREVIEW_FAILED', 'AmrImportJob', undefined, { result: 'failure', source: String(source || '') });
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to preview external AMR import') });
  }
});

app.post('/api/admin/amr-import-jobs/:id/execute', requireAdmin, importRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const job = await prisma.amrImportJob.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ error: 'AMR import job not found' });
    if (!importSourceIsSupported(job.source)) return res.status(400).json({ error: 'Only PubMed and Europe PMC preview jobs can be executed.' });
    if (!Array.isArray(job.preview)) return res.status(409).json({ error: 'Preview this import before executing it.' });
    const candidates = job.preview.flatMap((candidate) => candidate && typeof candidate === 'object' && !Array.isArray(candidate) ? [candidate as Record<string, unknown>] : []);
    const selectedIds = Array.isArray(req.body?.sourceIds) ? new Set(req.body.sourceIds.filter((value: unknown): value is string => typeof value === 'string').slice(0, 50)) : null;
    const selected = selectedIds ? candidates.filter((candidate) => selectedIds.has(String(candidate.sourceId || ''))) : candidates.slice(0, 50);
    if (!selected.length) return res.status(400).json({ error: 'Choose at least one previewed publication to import.' });
    await prisma.amrImportJob.update({ where: { id }, data: { status: AmrImportJobStatus.RUNNING, attempt: { increment: 1 }, errorMessage: null, startedAt: new Date() } });
    const result = await createImportedPublicationDrafts(prisma, job.source, selected, req.user!.userId);
    const completed = await prisma.amrImportJob.update({ where: { id }, data: { status: AmrImportJobStatus.COMPLETED, result: { imported: result.imported, skipped: result.skipped }, finishedAt: new Date() } });
    await writeAdminLog(req.user?.userId, 'AMR_IMPORT_EXECUTED', 'AmrImportJob', id, { result: 'success', imported: result.imported.length, skipped: result.skipped.length, source: job.source });
    res.json({ job: completed, ...result });
  } catch (error) {
    await prisma.amrImportJob.updateMany({ where: { id }, data: { status: AmrImportJobStatus.FAILED, errorMessage: safeErrorMessage(error, 'AMR import execution failed'), finishedAt: new Date() } });
    await writeAdminLog(req.user?.userId, 'AMR_IMPORT_EXECUTION_FAILED', 'AmrImportJob', id, { result: 'failure' });
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to execute AMR import') });
  }
});

app.post('/api/admin/amr-import-jobs/:id/retry', requireAdmin, importRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const previous = await prisma.amrImportJob.findUnique({ where: { id } });
    if (!previous) return res.status(404).json({ error: 'AMR import job not found' });
    if (!importSourceIsSupported(previous.source)) return res.status(400).json({ error: 'Only external-source imports can be retried.' });
    const request = previous.request && typeof previous.request === 'object' && !Array.isArray(previous.request) ? previous.request as Record<string, unknown> : {};
    const query = textValue(request.query, 500);
    if (!query) return res.status(409).json({ error: 'The original import query is unavailable.' });
    const job = await previewAmrImportJob(req.user!.userId, previous.source, query, request.limit, previous.queryId || undefined);
    await writeAdminLog(req.user?.userId, 'AMR_IMPORT_RETRIED', 'AmrImportJob', job.id, { result: 'success', previousJobId: id, source: previous.source });
    res.status(201).json(job);
  } catch (error) {
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to retry AMR import') });
  }
});

app.post('/api/admin/amr-findings/:id/moderation', requireAdmin, adminRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  const action = parseStringParam(req.body?.action) as FindingModerationAction;
  if (!FINDING_MODERATION_ACTIONS.includes(action)) return res.status(400).json({ error: 'Invalid AMR finding moderation action' });
  try {
    const finding = await moderateFinding(prisma, id, req.user!.userId, action, parseJsonObject(req.body));
    await writeAdminLog(req.user?.userId, `AMR_FINDING_${action}`, 'AmrFinding', id, { result: 'success', status: finding.curationStatus, notePresent: Boolean(textValue(req.body?.note, 2_000)), duplicateOfId: finding.duplicateOfId || undefined, linkedStrainId: finding.linkedStrainId || undefined });
    res.json(finding);
  } catch (error) {
    const status = amrWorkflowErrorStatus(error);
    await writeAdminLog(req.user?.userId, `AMR_FINDING_${action}_FAILED`, 'AmrFinding', id, { result: 'failure', statusCode: status });
    res.status(status).json({ error: safeErrorMessage(error, 'Unable to moderate AMR finding') });
  }
});

app.post('/api/admin/amr-findings/:id/notes', requireAdmin, adminRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const note = await addFindingModerationNote(prisma, id, req.user!.userId, req.body?.message, req.body?.visibleToSubmitter === true);
    await writeAdminLog(req.user?.userId, 'AMR_FINDING_NOTE_ADDED', 'AmrFinding', id, { result: 'success', visibleToSubmitter: note.visibleToSubmitter });
    res.status(201).json(note);
  } catch (error) {
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to add AMR finding note') });
  }
});

app.get('/api/admin/amr-publications', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseOptionalInt(String(req.query.page || '')) || 1);
    const pageSize = Math.min(100, Math.max(10, parseOptionalInt(String(req.query.pageSize || '')) || 25));
    const status = parseStringParam(req.query.status as string);
    const q = textValue(req.query.q, 240);
    const where: Prisma.AmrPublicationWhereInput = {
      ...(status && Object.values(AmrFindingStatus).includes(status as AmrFindingStatus) ? { curationStatus: status as AmrFindingStatus } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { authors: { contains: q, mode: 'insensitive' } }, { doi: { contains: q, mode: 'insensitive' } }, { pubmedId: { contains: q, mode: 'insensitive' } }] } : {}),
    };
    const [total, items] = await Promise.all([
      prisma.amrPublication.count({ where }),
      prisma.amrPublication.findMany({ where, include: { createdBy: { select: { id: true, name: true, email: true } }, reviewedBy: { select: { id: true, name: true, email: true } }, assignedReviewer: { select: { id: true, name: true, email: true } }, moderationNotes: { include: { author: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } }, revisions: { include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } }, findings: { include: { finding: { select: { id: true, slug: true, title: true } } } } }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch {
    res.status(500).json({ error: 'Unable to load AMR publications' });
  }
});

app.post('/api/admin/amr-publications', requireAdmin, adminRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await createAdminPublication(prisma, parseJsonObject(req.body), req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_PUBLICATION_CREATED', 'AmrPublication', result.publication.id, { result: 'success', title: result.publication.title, duplicateCandidates: result.duplicates.length });
    res.status(201).json(result);
  } catch (error) {
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to create AMR publication') });
  }
});

app.get('/api/admin/amr-publications/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const publication = await prisma.amrPublication.findUnique({ where: { id: parseStringParam(req.params.id) }, include: { createdBy: { select: { id: true, name: true, email: true } }, reviewedBy: { select: { id: true, name: true, email: true } }, assignedReviewer: { select: { id: true, name: true, email: true } }, moderationNotes: { include: { author: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } }, revisions: { include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } }, findings: { include: { finding: { select: { id: true, slug: true, title: true } } } } } });
    if (!publication) return res.status(404).json({ error: 'AMR publication not found' });
    await writeAdminLog(req.user?.userId, 'AMR_PUBLICATION_OPENED', 'AmrPublication', publication.id, { result: 'success' });
    res.json(publication);
  } catch {
    res.status(500).json({ error: 'Unable to load AMR publication' });
  }
});

app.patch('/api/admin/amr-publications/:id', requireAdmin, adminRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const result = await updateAdminPublication(prisma, id, parseJsonObject(req.body), req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_PUBLICATION_UPDATED', 'AmrPublication', id, { result: 'success', duplicateCandidates: result.duplicates.length });
    res.json(result);
  } catch (error) {
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to update AMR publication') });
  }
});

app.post('/api/admin/amr-publications/:id/moderation', requireAdmin, adminRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  const action = parseStringParam(req.body?.action) as PublicationModerationAction;
  if (!PUBLICATION_MODERATION_ACTIONS.includes(action)) return res.status(400).json({ error: 'Invalid AMR publication moderation action' });
  try {
    const publication = await moderatePublication(prisma, id, req.user!.userId, action, parseJsonObject(req.body));
    await writeAdminLog(req.user?.userId, `AMR_PUBLICATION_${action}`, 'AmrPublication', id, { result: 'success', status: publication.curationStatus, notePresent: Boolean(textValue(req.body?.note, 2_000)), duplicateOfId: publication.duplicateOfId || undefined });
    res.json(publication);
  } catch (error) {
    const status = amrWorkflowErrorStatus(error);
    await writeAdminLog(req.user?.userId, `AMR_PUBLICATION_${action}_FAILED`, 'AmrPublication', id, { result: 'failure', statusCode: status });
    res.status(status).json({ error: safeErrorMessage(error, 'Unable to moderate AMR publication') });
  }
});

app.post('/api/admin/amr-publications/:id/notes', requireAdmin, adminRateLimiter, async (req: AuthenticatedRequest, res: Response) => {
  const id = parseStringParam(req.params.id);
  try {
    const note = await addPublicationModerationNote(prisma, id, req.user!.userId, req.body?.message, req.body?.visibleToSubmitter === true);
    await writeAdminLog(req.user?.userId, 'AMR_PUBLICATION_NOTE_ADDED', 'AmrPublication', id, { result: 'success', visibleToSubmitter: note.visibleToSubmitter });
    res.status(201).json(note);
  } catch (error) {
    res.status(amrWorkflowErrorStatus(error)).json({ error: safeErrorMessage(error, 'Unable to add AMR publication note') });
  }
});

app.get('/api/admin/amr-findings', requireAmrAuthor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = Math.max(1, parseOptionalInt(String(req.query.page || '')) || 1);
    const pageSize = Math.min(100, Math.max(10, parseOptionalInt(String(req.query.pageSize || '')) || 25));
    const status = String(req.query.status || '');
    const where: Prisma.AmrFindingWhereInput = req.user?.role === UserRole.CONTRIBUTOR
      ? { createdById: req.user.userId }
      : status && Object.values(AmrFindingStatus).includes(status as AmrFindingStatus) ? { curationStatus: status as AmrFindingStatus } : {};
    const [total, items] = await Promise.all([
      prisma.amrFinding.count({ where }),
      prisma.amrFinding.findMany({ where, include: { createdBy: { select: { name: true, email: true } }, reviewedBy: { select: { name: true, email: true } }, domains: { include: { term: true } }, pathogens: { include: { pathogen: true } }, locations: true }, orderBy: { updatedAt: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
    ]);
    res.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load AMR curation records' });
  }
});

app.post('/api/admin/amr-findings', requireAmrAuthor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const finding = await createAmrFinding(prisma, req.body || {}, req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_FINDING_CREATED', 'AmrFinding', finding.id, { result: 'success', title: finding.title, status: finding.curationStatus });
    res.status(201).json(finding);
  } catch (error) {
    res.status(400).json({ error: safeErrorMessage(error, 'Unable to create AMR finding') });
  }
});

app.get('/api/admin/amr-findings/:id', requireAmrAuthor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const finding = await prisma.amrFinding.findUnique({ where: { id: parseStringParam(req.params.id) }, include: amrFindingInclude });
    if (!finding) return res.status(404).json({ error: 'AMR finding not found' });
    if (req.user?.role === UserRole.CONTRIBUTOR && finding.createdById !== req.user.userId) return res.status(403).json({ error: 'You can only view your own AMR drafts' });
    res.json(finding);
  } catch (error) {
    res.status(500).json({ error: 'Failed to load AMR finding' });
  }
});

app.patch('/api/admin/amr-findings/:id', requireAmrAuthor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = parseStringParam(req.params.id);
    const existing = await prisma.amrFinding.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'AMR finding not found' });
    if (req.user?.role === UserRole.CONTRIBUTOR && existing.createdById !== req.user.userId) return res.status(403).json({ error: 'You can only edit your own AMR drafts' });
    if (req.user?.role === UserRole.CONTRIBUTOR && existing.curationStatus !== AmrFindingStatus.DRAFT) return res.status(409).json({ error: 'Submitted findings can only be edited by a curator or administrator' });
    const finding = await updateAmrFinding(prisma, id, req.body || {}, req.user!.userId);
    await writeAdminLog(req.user?.userId, 'AMR_FINDING_UPDATED', 'AmrFinding', id, { result: 'success', title: finding.title });
    res.json(finding);
  } catch (error) {
    res.status(400).json({ error: safeErrorMessage(error, 'Unable to update AMR finding') });
  }
});

app.post('/api/admin/amr-findings/:id/status', requireAmrAuthor, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const status = parseStringParam(req.body?.status) as AmrFindingStatus;
    if (!Object.values(AmrFindingStatus).includes(status)) return res.status(400).json({ error: 'Invalid AMR finding status' });
    if (req.user?.role === UserRole.CONTRIBUTOR && status !== AmrFindingStatus.UNDER_REVIEW) return res.status(403).json({ error: 'Contributors can only submit drafts for review' });
    if (req.user?.role === UserRole.MODERATOR && (status === AmrFindingStatus.APPROVED || status === AmrFindingStatus.PUBLISHED || status === AmrFindingStatus.ARCHIVED)) return res.status(403).json({ error: 'Only an administrator can approve, publish, or archive findings' });
    const finding = await setAmrFindingStatus(prisma, parseStringParam(req.params.id), status, req.user!.userId, req.body?.note);
    await writeAdminLog(req.user?.userId, 'AMR_FINDING_STATUS_CHANGED', 'AmrFinding', finding.id, { result: 'success', status, notePresent: Boolean(textValue(req.body?.note, 2_000)) });
    res.json(finding);
  } catch (error) {
    res.status(400).json({ error: safeErrorMessage(error, 'Unable to update AMR finding status') });
  }
});

app.get('/api/admin/amr-findings-template.csv', requireAmrAuthor, async (_req: AuthenticatedRequest, res: Response) => {
  const header = 'title,keyFinding,scientificSummary,sourceReference,domains,pathogens,genes,antimicrobialClasses,publicationYear,state,evidenceLevel,publicHealthImportance,importanceReason\n';
  const sample = 'SAMPLE DATA ONLY - do not publish,Fictional example for import validation,This is fictitious demonstration content and is not a scientific finding.,Sample source only,Environment,Example pathogen,example-gene,Beta-lactams,2026,Example State,LEVEL_2,MODERATE,\n';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8'); res.setHeader('Content-Disposition', 'attachment; filename="amr-findings-india-template.csv"'); res.send(header + sample);
});

app.post('/api/admin/amr-findings/import', importRateLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const csvText = typeof req.body?.csvText === 'string' ? req.body.csvText : '';
  const filename = textValue(req.body?.filename, 240) || 'amr-findings-import.csv';
  if (!csvText || csvText.length > MAX_IMPORT_FILE_BYTES) return res.status(400).json({ error: 'Provide a CSV file under the configured import size limit.' });
  const rows: Record<string, string>[] = [];
  try {
    await new Promise<void>((resolve, reject) => Readable.from(csvText).pipe(csv()).on('data', (row) => rows.push(row as Record<string, string>)).on('end', resolve).on('error', reject));
  } catch {
    return res.status(400).json({ error: 'Unable to parse the CSV file.' });
  }
  if (rows.length === 0) return res.status(400).json({ error: 'The CSV file does not contain any data rows.' });
  if (rows.length > 500) return res.status(400).json({ error: 'Import at most 500 rows at a time.' });
  const results: Array<{ row: number; status: 'imported' | 'error'; id?: string; error?: string }> = [];
  for (const [index, row] of rows.entries()) {
    try {
      if (Object.values(row).some((value) => /^[=+\-@]/.test(String(value).trim()))) throw new Error('Formula-like CSV values are not allowed.');
      const finding = await createAmrFinding(prisma, {
        title: row.title, keyFinding: row.keyFinding, scientificSummary: row.scientificSummary, sourceReference: row.sourceReference,
        domains: row.domains, pathogens: row.pathogens, genes: row.genes, antimicrobialClasses: row.antimicrobialClasses,
        publicationYear: row.publicationYear, locations: row.state ? [{ state: row.state, country: 'India' }] : [],
        evidenceLevel: row.evidenceLevel || 'LEVEL_1', publicHealthImportance: row.publicHealthImportance || 'MODERATE', importanceReason: row.importanceReason,
      }, req.user!.userId);
      results.push({ row: index + 2, status: 'imported', id: finding.id });
    } catch (error) {
      results.push({ row: index + 2, status: 'error', error: safeErrorMessage(error, 'Invalid row') });
    }
  }
  const imported = results.filter((result) => result.status === 'imported').length;
  await writeAdminLog(req.user?.userId, 'AMR_FINDINGS_BULK_IMPORTED', 'AmrFindingImport', undefined, { result: 'success', filename, rows: rows.length, imported, failed: rows.length - imported });
  res.status(201).json({ filename, imported, failed: rows.length - imported, results });
});

// ─── GENOMICS & STRAIN ROUTES ────────────────────────────────────────────────

app.get('/api/organisms', async (req: Request, res: Response) => {
  try {
    const organisms = await prisma.organism.findMany({
      include: { _count: { select: { strains: true } } }
    });
    res.json(organisms);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch organisms" });
  }
});

app.get('/api/organisms/:id', async (req: Request, res: Response) => {
  const organismId = parseNumericParam(req.params.id);
  if (!organismId) {
    return res.status(400).json({ error: "Invalid organism id" });
  }

  try {
    const organism = await getOrganismById(prisma, organismId);
    if (!organism) return res.status(404).json({ error: "Organism not found" });
    res.json(organism);
  } catch (error) {
    console.error("Organism Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch organism" });
  }
});

app.get('/api/organisms/:id/results', async (req: Request, res: Response) => {
  const organismId = parseNumericParam(req.params.id);
  if (!organismId) {
    return res.status(400).json({ error: "Invalid organism id" });
  }

  try {
    const results = await getOrganismResults(prisma, organismId);
    if (!results) return res.status(404).json({ error: "Organism not found" });
    res.json(results);
  } catch (error) {
    console.error("Organism Results Error:", error);
    res.status(500).json({ error: "Failed to fetch organism results" });
  }
});

app.get('/api/organisms/:id/results/:tool', async (req: Request, res: Response) => {
  const organismId = parseNumericParam(req.params.id);
  if (!organismId) {
    return res.status(400).json({ error: "Invalid organism id" });
  }

  try {
    const result = await getOrganismToolResult(prisma, organismId, parseStringParam(req.params.tool));
    if (!result) return res.status(404).json({ error: "Tool result not found" });
    res.json(result);
  } catch (error) {
    console.error("Tool Result Error:", error);
    res.status(500).json({ error: "Failed to fetch tool result" });
  }
});

app.get('/api/organisms/:id/downloads/:tool/:fileId', async (req: Request, res: Response) => {
  const organismId = parseNumericParam(req.params.id);
  const fileId = parseNumericParam(req.params.fileId);
  if (!organismId || !fileId) {
    return res.status(400).json({ error: "Invalid download request" });
  }

  try {
    const file = await getToolOutputFile(prisma, organismId, parseStringParam(req.params.tool), fileId);
    if (!file) return res.status(404).json({ error: "File not found" });

    await sendStoredFileDownload(res, file.filePath, file.fileName);
  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).json({ error: "Failed to download result file" });
  }
});

app.get('/api/strains', async (req: Request, res: Response) => {
  try {
    const strains = await prisma.strain.findMany({
      include: {
        organism: true,
        genomeReferences: {
          where: { status: GenomeReferenceStatus.PUBLISHED, isPublic: true },
          select: { kind: true },
        },
      }
    });
    res.json(strains.map((strain) => ({
      ...strain,
      genomeReferences: undefined,
      referenceKinds: strain.genomeReferences.map((file) => file.kind),
    })));
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch strains" });
  }
});

app.get('/api/organisms/:id/genome-references', async (req: Request, res: Response) => {
  const organismId = parseNumericParam(req.params.id);
  if (!organismId) return res.status(400).json({ error: 'Invalid organism id' });
  try {
    const organism = await prisma.organism.findUnique({
      where: { id: organismId },
      select: {
        id: true,
        scientificName: true,
        displayName: true,
        taxonomyId: true,
        updatedAt: true,
        strains: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            strainName: true,
            isolateName: true,
            assemblyAccession: true,
            biosampleAccession: true,
            genomeSize: true,
            gcContent: true,
            sourceType: true,
            country: true,
            state: true,
            city: true,
            evidenceBasis: true,
            dataSource: true,
            dataUseLimitations: true,
            lastVerifiedAt: true,
            updatedAt: true,
            genomeReferences: {
              where: { status: GenomeReferenceStatus.PUBLISHED, isPublic: true },
              orderBy: { kind: 'asc' },
              select: {
                id: true,
                kind: true,
                originalFileName: true,
                contentType: true,
                fileSizeBytes: true,
                checksumSha256: true,
                validation: true,
                updatedAt: true,
                publishedAt: true,
              },
            },
          },
        },
      },
    });
    if (!organism) return res.status(404).json({ error: 'Organism not found' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      organism: {
        id: organism.id,
        scientificName: organism.scientificName,
        displayName: organism.displayName,
        taxonomyId: organism.taxonomyId,
        updatedAt: organism.updatedAt,
      },
      strains: organism.strains.map((strain) => ({
        ...strain,
        gcContent: strain.gcContent === null ? null : Number(strain.gcContent),
        references: strain.genomeReferences.map((file) => publicReferenceFile(file, strain.id)),
        genomeReferences: undefined,
      })),
    });
  } catch (error) {
    logEvent('error', 'genome_reference_catalog_failed', { organismId, error: safeErrorMessage(error, 'Genome reference catalog failed') });
    res.status(500).json({ error: 'Failed to load genome reference catalog' });
  }
});

app.get('/api/strains/:id/genome-reference', async (req: Request, res: Response) => {
  const strainId = parseNumericParam(req.params.id);
  if (!strainId) return res.status(400).json({ error: 'Invalid strain id' });
  try {
    const strain = await prisma.strain.findUnique({
      where: { id: strainId },
      select: {
        id: true,
        organismId: true,
        strainName: true,
        assemblyAccession: true,
        evidenceBasis: true,
        updatedAt: true,
        organism: { select: { scientificName: true, taxonomyId: true } },
        genomeReferences: {
          where: { status: GenomeReferenceStatus.PUBLISHED, isPublic: true },
          orderBy: { kind: 'asc' },
        },
      },
    });
    if (!strain) return res.status(404).json({ error: 'Strain not found' });
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    res.json({
      strain: { ...strain, genomeReferences: undefined },
      references: strain.genomeReferences.map((file) => publicReferenceFile(file, strain.id)),
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load genome reference' });
  }
});

app.get('/api/strains/:id/genome-reference/files/:kind', async (req: Request, res: Response) => {
  const strainId = parseNumericParam(req.params.id);
  const kind = parseStringParam(req.params.kind).toUpperCase() as GenomeReferenceKind;
  if (!strainId || !Object.values(GenomeReferenceKind).includes(kind)) return res.status(400).json({ error: 'Invalid genome reference request' });
  try {
    const file = await prisma.genomeReferenceFile.findFirst({
      where: { strainId, kind, status: GenomeReferenceStatus.PUBLISHED, isPublic: true },
    });
    if (!file) return res.status(404).json({ error: 'Published genome reference file not found' });
    await sendStoredFileInline(req, res, file.storagePath, {
      fileName: file.originalFileName,
      contentType: file.contentType,
      cacheControl: 'public, max-age=300, stale-while-revalidate=3600',
    });
  } catch (error) {
    if (!res.headersSent) res.status(500).json({ error: 'Failed to stream genome reference file' });
  }
});

app.post('/api/blast/search', blastRateLimiter, requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const requestedStrainId = req.body?.strainId === undefined || req.body?.strainId === null || req.body?.strainId === ''
    ? undefined
    : Number(req.body.strainId);
  if (requestedStrainId !== undefined && (!Number.isInteger(requestedStrainId) || requestedStrainId <= 0)) {
    return res.status(400).json({ error: 'Invalid BLAST strain scope' });
  }
  try {
    const result = await runBlastSearch(prisma, {
      query: req.body?.query,
      strainId: requestedStrainId,
      maxReferenceBytes: MAX_GENOME_REFERENCE_BYTES,
      maxQueryBases: MAX_BLAST_QUERY_BASES,
      maxConcurrentSearches: BLAST_MAX_CONCURRENT,
      timeoutMs: BLAST_TIMEOUT_MS,
    });
    await writeAdminLog(req.user?.userId, 'BLAST_SEARCH_COMPLETED', 'GenomeReference', requestedStrainId ? String(requestedStrainId) : 'all', {
      result: 'success',
      sequenceCount: result.query.sequenceCount,
      totalBases: result.query.totalBases,
      hitCount: result.hits.length,
    });
    res.json(result);
  } catch (error) {
    const statusCode = error instanceof BlastServiceError ? error.statusCode : 500;
    await writeAdminLog(req.user?.userId, 'BLAST_SEARCH_FAILED', 'GenomeReference', requestedStrainId ? String(requestedStrainId) : 'all', {
      result: 'failure',
      statusCode,
      reason: error instanceof BlastServiceError ? error.message : 'Search failed',
    });
    res.status(statusCode).json({ error: error instanceof BlastServiceError ? error.message : 'BLAST search failed' });
  }
});

app.use('/api/admin', adminRateLimiter);

app.get('/api/admin/me', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ ok: true, user: req.user });
});

app.get('/api/admin/cockpit-summary', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const [
      registeredUsers,
      pendingUploads,
      underReviewUploads,
      pendingBlogPosts,
      unreadMessages,
      publishedUploads,
      auditEvents,
      totalOrganisms,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.organismUpload.count({ where: { status: ApprovalStatus.PENDING } }),
      prisma.organismUpload.count({ where: { status: ApprovalStatus.UNDER_REVIEW } }),
      prisma.blogPost.count({ where: { status: ApprovalStatus.PENDING } }),
      prisma.contactMessage.count({ where: { status: ContactMessageStatus.UNREAD, archived: false } }),
      prisma.organismUpload.count({
        where: {
          status: ApprovalStatus.APPROVED,
          publishedOrganismId: { not: null },
          publishedStrainId: { not: null },
        },
      }),
      prisma.adminLog.count(),
      prisma.organism.count(),
    ]);

    res.setHeader("Cache-Control", "private, no-store");
    res.json({
      registeredUsers,
      pendingUploads,
      underReviewUploads,
      pendingBlogPosts,
      unreadMessages,
      publishedUploads,
      auditEvents,
      totalOrganisms,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logEvent("error", "admin_cockpit_summary_failed", {
      requestId: currentContext()?.requestId,
      error: safeErrorMessage(error, "Admin cockpit summary failed"),
    });
    res.status(500).json({ error: "Failed to load admin cockpit summary" });
  }
});

app.get('/api/admin/blast-database', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    res.json(await getBlastDatabaseStatus(prisma));
  } catch (error) {
    logEvent('error', 'admin_blast_status_failed', { error: safeErrorMessage(error, 'BLAST status failed') });
    res.status(500).json({ error: 'Failed to load BLAST database status' });
  }
});

app.post('/api/admin/blast-database/rebuild', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const database = await rebuildBlastDatabase(prisma, MAX_GENOME_REFERENCE_BYTES);
    await writeAdminLog(req.user?.userId, 'BLAST_DATABASE_REBUILT', 'GenomeReference', 'approved-fasta', {
      result: 'success',
      sourceReferenceCount: database.sourceReferenceCount,
      indexedReferenceCount: database.indexedReferenceCount,
      totalBases: database.totalBases,
      builtAt: database.builtAt,
    });
    res.json({ message: 'BLAST database rebuilt from approved FASTA references', database });
  } catch (error) {
    const statusCode = error instanceof BlastServiceError ? error.statusCode : 500;
    await writeAdminLog(req.user?.userId, 'BLAST_DATABASE_REBUILD_FAILED', 'GenomeReference', 'approved-fasta', {
      result: 'failure',
      statusCode,
      reason: error instanceof BlastServiceError ? error.message : 'Build failed',
    });
    res.status(statusCode).json({ error: error instanceof BlastServiceError ? error.message : 'Failed to rebuild BLAST database' });
  }
});

app.get('/api/admin/strains/:id/genome-references', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const strainId = parseNumericParam(req.params.id);
  if (!strainId) return res.status(400).json({ error: 'Invalid strain id' });
  try {
    const strain = await prisma.strain.findUnique({
      where: { id: strainId },
      select: {
        id: true,
        organismId: true,
        strainName: true,
        assemblyAccession: true,
        organism: { select: { scientificName: true } },
        genomeReferences: {
          orderBy: { kind: 'asc' },
          select: {
            id: true,
            kind: true,
            originalFileName: true,
            contentType: true,
            fileSizeBytes: true,
            checksumSha256: true,
            status: true,
            isPublic: true,
            validation: true,
            createdAt: true,
            updatedAt: true,
            publishedAt: true,
          },
        },
      },
    });
    if (!strain) return res.status(404).json({ error: 'Strain not found' });
    res.json({
      strain: { ...strain, genomeReferences: undefined },
      references: strain.genomeReferences,
    });
  } catch (error) {
    logEvent('error', 'admin_genome_reference_inventory_failed', { strainId, error: safeErrorMessage(error, 'Reference inventory failed') });
    res.status(500).json({ error: 'Failed to load genome reference inventory' });
  }
});

app.post('/api/admin/strains/:id/genome-references', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const strainId = parseNumericParam(req.params.id);
  if (!strainId) return res.status(400).json({ error: 'Invalid strain id' });
  try {
    const strain = await prisma.strain.findUnique({
      where: { id: strainId },
      select: { id: true, strainName: true, genomeReferences: { select: { kind: true, validation: true } } },
    });
    if (!strain) return res.status(404).json({ error: 'Strain not found' });
    const kind = String(req.body?.kind || '').trim().toUpperCase() as UploadableGenomeReferenceKind;
    if (kind !== 'FASTA' && kind !== 'GFF3') return res.status(400).json({ error: 'Reference kind must be FASTA or GFF3' });
    const prepared = prepareGenomeReference({ kind, fileName: req.body?.fileName, fileContent: req.body?.fileContent, maxBytes: MAX_GENOME_REFERENCE_BYTES });
    if ('error' in prepared) return res.status(400).json({ error: prepared.error });
    const otherKind = kind === 'FASTA' ? GenomeReferenceKind.GFF3 : GenomeReferenceKind.FASTA;
    const other = strain.genomeReferences.find((file) => file.kind === otherKind);
    if (other && !referenceSetsOverlap(
      referenceNamesFromValidation(prepared.files[0].validation as Prisma.JsonValue),
      referenceNamesFromValidation(other.validation),
    )) {
      return res.status(409).json({ error: 'FASTA and GFF3 reference names do not overlap. Confirm that both files describe the same assembly.' });
    }
    const files = await savePreparedGenomeReferences({ strainId, files: prepared.files, publish: true });
    await writeAdminLog(req.user?.userId, 'ADMIN_GENOME_REFERENCE_PUBLISHED', 'Strain', String(strainId), {
      strainName: strain.strainName,
      kinds: files.map((file) => file.kind),
      fileNames: files.map((file) => file.originalFileName),
    });
    res.status(201).json({ message: `${kind} reference validated and published`, files });
  } catch (error) {
    logEvent('error', 'admin_genome_reference_upload_failed', { strainId, error: safeErrorMessage(error, 'Genome reference upload failed') });
    res.status(500).json({ error: 'Failed to publish genome reference' });
  }
});

app.get('/api/admin/audit-logs', requireAdmin, async (req: Request, res: Response) => {
  try {
    const limit = boundedAuditLimit(req.query.limit);
    const where = buildAuditLogWhere(req.query);

    const [logs, total] = await prisma.$transaction([
      prisma.adminLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          admin: { select: ADMIN_LOG_ACTOR_SELECT },
        },
      }),
      prisma.adminLog.count({ where }),
    ]);

    res.json({ logs, total, limit });
  } catch (error) {
    console.error("Admin Audit Log Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

app.get('/api/admin/contact-messages', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || "").toUpperCase();
    const statusFilter = Object.values(ContactMessageStatus).includes(status as ContactMessageStatus)
      ? status as ContactMessageStatus
      : undefined;
    const includeArchived = String(req.query.archived || "").toLowerCase() === "true";
    const search = sanitizeContactText(req.query.search, 200);

    const where: Prisma.ContactMessageWhereInput = {};
    if (!includeArchived) where.archived = false;
    if (statusFilter) where.status = statusFilter;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { organization: { contains: search, mode: "insensitive" } },
        { subject: { contains: search, mode: "insensitive" } },
        { message: { contains: search, mode: "insensitive" } },
      ];
    }

    const [messages, unreadCount] = await prisma.$transaction([
      prisma.contactMessage.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.contactMessage.count({
        where: { status: ContactMessageStatus.UNREAD, archived: false },
      }),
    ]);

    res.json({ messages, unreadCount });
  } catch (error) {
    console.error("Admin Contact Message Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch contact messages" });
  }
});

app.get('/api/admin/contact-messages/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messageId = parseStringParam(req.params.id);
    const message = await prisma.contactMessage.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ error: "Contact message not found" });
    await writeAdminLog(req.user?.userId, "CONTACT_MESSAGE_DETAIL_READ", "ContactMessage", messageId);
    res.json(message);
  } catch (error) {
    console.error("Admin Contact Message Detail Error:", error);
    res.status(500).json({ error: "Failed to fetch contact message" });
  }
});

app.patch('/api/admin/contact-messages/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messageId = parseStringParam(req.params.id);
    const requestedStatus = String(req.body.status || "").toUpperCase();
    const status = Object.values(ContactMessageStatus).includes(requestedStatus as ContactMessageStatus)
      ? requestedStatus as ContactMessageStatus
      : undefined;
    const adminNotes = req.body.adminNotes === null ? null : sanitizeContactText(req.body.adminNotes, 4000, true);

    const message = await prisma.contactMessage.update({
      where: { id: messageId },
      data: {
        status,
        adminNotes: req.body.adminNotes === undefined ? undefined : adminNotes,
      },
    });

    await writeAdminLog(req.user?.userId, "CONTACT_MESSAGE_UPDATED", "ContactMessage", messageId, {
      status: message.status,
    });

    res.json(message);
  } catch (error) {
    console.error("Admin Contact Message Update Error:", error);
    res.status(500).json({ error: "Failed to update contact message" });
  }
});

app.post('/api/admin/contact-messages/:id/read', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messageId = parseStringParam(req.params.id);
    const message = await prisma.contactMessage.update({
      where: { id: messageId },
      data: { status: ContactMessageStatus.READ },
    });

    await writeAdminLog(req.user?.userId, "CONTACT_MESSAGE_MARKED_READ", "ContactMessage", messageId);
    res.json({ message: "Contact message marked as read", contactMessage: message });
  } catch (error) {
    console.error("Admin Contact Message Read Error:", error);
    res.status(500).json({ error: "Failed to mark contact message as read" });
  }
});

app.post('/api/admin/contact-messages/:id/unread', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messageId = parseStringParam(req.params.id);
    const message = await prisma.contactMessage.update({
      where: { id: messageId },
      data: { status: ContactMessageStatus.UNREAD },
    });

    await writeAdminLog(req.user?.userId, "CONTACT_MESSAGE_MARKED_UNREAD", "ContactMessage", messageId);
    res.json({ message: "Contact message marked as unread", contactMessage: message });
  } catch (error) {
    console.error("Admin Contact Message Unread Error:", error);
    res.status(500).json({ error: "Failed to mark contact message as unread" });
  }
});

app.post('/api/admin/contact-messages/:id/archive', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messageId = parseStringParam(req.params.id);
    const message = await prisma.contactMessage.update({
      where: { id: messageId },
      data: { archived: true },
    });

    await writeAdminLog(req.user?.userId, "CONTACT_MESSAGE_ARCHIVED", "ContactMessage", messageId);
    res.json({ message: "Contact message archived", contactMessage: message });
  } catch (error) {
    console.error("Admin Contact Message Archive Error:", error);
    res.status(500).json({ error: "Failed to archive contact message" });
  }
});

app.delete('/api/admin/contact-messages/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const messageId = parseStringParam(req.params.id);
    const message = await prisma.contactMessage.update({
      where: { id: messageId },
      data: { archived: true },
    });
    await writeAdminLog(req.user?.userId, "CONTACT_MESSAGE_DELETED", "ContactMessage", messageId, {
      result: 'success',
      targetEmail: message.email,
      targetSubject: message.subject,
      deletionMode: 'soft',
    });
    res.json({ message: "Contact message deleted" });
  } catch (error) {
    console.error("Admin Contact Message Delete Error:", error);
    res.status(500).json({ error: "Failed to delete contact message" });
  }
});

app.get('/api/admin/tools', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const tools = await prisma.toolCatalogEntry.findMany({ orderBy: [{ active: 'desc' }, { category: 'asc' }, { label: 'asc' }] });
    res.json({ tools });
  } catch (error) {
    console.error('Admin Tool Catalog Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch tool catalog' });
  }
});

app.post('/api/admin/tools', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = buildToolCatalogPayload(req.body || {}, true);
    if ('error' in payload) return res.status(400).json({ error: payload.error });
    const tool = await prisma.toolCatalogEntry.create({ data: payload.data as Prisma.ToolCatalogEntryUncheckedCreateInput });
    await writeAdminLog(req.user?.userId, 'TOOL_CATALOG_ENTRY_CREATED', 'ToolCatalogEntry', tool.id, { result: 'success', key: tool.key, label: tool.label });
    res.status(201).json(tool);
  } catch (error) {
    console.error('Admin Tool Catalog Create Error:', error);
    res.status(500).json({ error: 'Failed to add tool' });
  }
});

app.patch('/api/admin/tools/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = buildToolCatalogPayload(req.body || {}, false);
    if ('error' in payload) return res.status(400).json({ error: payload.error });
    if (!Object.keys(payload.data).length) return res.status(400).json({ error: 'Provide at least one tool field to update' });
    const tool = await prisma.toolCatalogEntry.update({ where: { id: parseStringParam(req.params.id) }, data: payload.data as Prisma.ToolCatalogEntryUncheckedUpdateInput });
    await writeAdminLog(req.user?.userId, 'TOOL_CATALOG_ENTRY_UPDATED', 'ToolCatalogEntry', tool.id, { result: 'success', key: tool.key, active: tool.active });
    res.json(tool);
  } catch (error) {
    console.error('Admin Tool Catalog Update Error:', error);
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

app.delete('/api/admin/tools/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const tool = await prisma.toolCatalogEntry.update({ where: { id: parseStringParam(req.params.id) }, data: { active: false } });
    await writeAdminLog(req.user?.userId, 'TOOL_CATALOG_ENTRY_RETIRED', 'ToolCatalogEntry', tool.id, { result: 'success', key: tool.key, deletionMode: 'soft' });
    res.json({ message: 'Tool retired from future ingestion choices' });
  } catch (error) {
    console.error('Admin Tool Catalog Delete Error:', error);
    res.status(500).json({ error: 'Failed to retire tool' });
  }
});

app.get('/api/admin/about/team', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const members = await prisma.aboutTeamMember.findMany({
      orderBy: [{ active: 'desc' }, { section: 'asc' }, { displayOrder: 'asc' }, { name: 'asc' }],
    });
    res.json({ members });
  } catch (error) {
    console.error('Admin About Team Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
});

app.post('/api/admin/about/team', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const payload = buildAboutTeamMemberPayload(req.body || {}, true);
    if ('error' in payload) return res.status(400).json({ error: payload.error });
    const member = await prisma.aboutTeamMember.create({
      data: payload.data as Prisma.AboutTeamMemberUncheckedCreateInput,
    });
    await writeAdminLog(req.user?.userId, 'ABOUT_TEAM_MEMBER_CREATED', 'AboutTeamMember', member.id, {
      result: 'success', section: member.section, name: member.name,
    });
    res.status(201).json(member);
  } catch (error) {
    console.error('Admin About Team Create Error:', error);
    res.status(500).json({ error: 'Failed to add team member' });
  }
});

app.patch('/api/admin/about/team/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const memberId = parseStringParam(req.params.id);
    const payload = buildAboutTeamMemberPayload(req.body || {}, false);
    if ('error' in payload) return res.status(400).json({ error: payload.error });
    if (!Object.keys(payload.data).length) return res.status(400).json({ error: 'Provide at least one field to update' });
    const member = await prisma.aboutTeamMember.update({
      where: { id: memberId },
      data: payload.data as Prisma.AboutTeamMemberUncheckedUpdateInput,
    });
    await writeAdminLog(req.user?.userId, 'ABOUT_TEAM_MEMBER_UPDATED', 'AboutTeamMember', member.id, {
      result: 'success', section: member.section, name: member.name,
    });
    res.json(member);
  } catch (error) {
    console.error('Admin About Team Update Error:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
});

app.delete('/api/admin/about/team/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const memberId = parseStringParam(req.params.id);
    const member = await prisma.aboutTeamMember.update({
      where: { id: memberId },
      data: { active: false },
    });
    await writeAdminLog(req.user?.userId, 'ABOUT_TEAM_MEMBER_REMOVED', 'AboutTeamMember', member.id, {
      result: 'success', section: member.section, name: member.name, deletionMode: 'soft',
    });
    res.json({ message: 'Team member removed from the public About Us page' });
  } catch (error) {
    console.error('Admin About Team Delete Error:', error);
    res.status(500).json({ error: 'Failed to remove team member' });
  }
});

app.get('/api/admin/users', requireAdmin, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        affiliation: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            organismUploads: true,
            blogPosts: true,
          },
        },
      },
    });

    res.json(users.map((user) => ({ ...user, roleLabel: roleLabel(user.role) })));
  } catch (error) {
    console.error("Admin User Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch registered users" });
  }
});

app.patch('/api/admin/users/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetUserId = parseStringParam(req.params.id);
    const requestedRole = String(req.body.role || "").trim().toUpperCase() as UserRole;
    const affiliation = req.body.affiliation ? parseAffiliation(req.body.affiliation) : undefined;
    const name = textValue(req.body.name, 160);

    if (!targetUserId) {
      return res.status(400).json({ error: "Invalid user id" });
    }
    if (req.body.role && (!Object.values(UserRole).includes(requestedRole) || !ASSIGNABLE_ROLES.has(requestedRole))) {
      return res.status(400).json({ error: "Unsupported role assignment" });
    }

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    if (targetUser.role === UserRole.ADMIN && requestedRole && requestedRole !== UserRole.ADMIN) {
      const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        return res.status(400).json({ error: "Cannot remove the last admin account" });
      }
    }

    const updated = await prisma.user.update({
      where: { id: targetUserId },
      data: {
        role: req.body.role ? requestedRole : undefined,
        affiliation,
        name,
      },
      select: { id: true, email: true, name: true, affiliation: true, role: true, createdAt: true, updatedAt: true },
    });

    await writeAdminLog(req.user?.userId, "USER_PRIVILEGE_UPDATED", "User", updated.id, {
      role: updated.role,
      affiliation: updated.affiliation,
    });

    res.json({ user: publicUser(updated), roleLabel: roleLabel(updated.role) });
  } catch (error) {
    console.error("Admin User Update Error:", error);
    res.status(500).json({ error: "Failed to update user privileges" });
  }
});

app.post('/api/admin/users/:id/password-reset', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetUserId = parseStringParam(req.params.id);
    const newPassword = req.body.newPassword;

    if (!targetUserId) {
      return res.status(400).json({ error: "Invalid user id" });
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, email: true, role: true },
    });

    if (!targetUser) {
      return res.status(404).json({ error: "User not found" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: targetUserId },
      data: {
        passwordHash: hashedPassword,
        authVersion: { increment: 1 },
      },
    });

    await writeAdminLog(req.user?.userId, "USER_PASSWORD_RESET", "User", targetUserId, {
      targetEmail: targetUser.email,
      targetRole: targetUser.role,
    });

    res.json({ message: "Password reset successfully" });
  } catch (error) {
    console.error("Admin Password Reset Error:", error);
    res.status(500).json({ error: "Failed to reset user password" });
  }
});

app.delete('/api/admin/users/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const targetUserId = parseStringParam(req.params.id);
  try {
    if (!targetUserId) {
      await writeAdminLog(req.user?.userId, "USER_DELETE_ATTEMPT", "User", undefined, {
        result: "failure",
        reason: "invalid_user_id",
        statusCode: 400,
      });
      return res.status(400).json({ error: "Invalid user id" });
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        profile: {
          select: {
            profilePhotoPath: true,
          },
        },
        _count: {
          select: {
            organismUploads: true,
            blogPosts: true,
          },
        },
      },
    });

    if (!targetUser) {
      await writeAdminLog(req.user?.userId, "USER_DELETE_ATTEMPT", "User", targetUserId, {
        result: "failure",
        reason: "not_found",
        statusCode: 404,
      });
      return res.status(404).json({ error: "User not found" });
    }

    if (targetUser.id === req.user?.userId) {
      await writeAdminLog(req.user?.userId, "USER_DELETE_ATTEMPT", "User", targetUserId, {
        result: "failure",
        reason: "self_delete_blocked",
        targetEmail: targetUser.email,
        statusCode: 409,
      });
      return res.status(409).json({ error: "Admins cannot delete their own active account" });
    }

    if (targetUser.role === UserRole.ADMIN) {
      const adminCount = await prisma.user.count({ where: { role: UserRole.ADMIN } });
      if (adminCount <= 1) {
        await writeAdminLog(req.user?.userId, "USER_DELETE_ATTEMPT", "User", targetUserId, {
          result: "failure",
          reason: "last_admin_blocked",
          targetEmail: targetUser.email,
          statusCode: 409,
        });
        return res.status(409).json({ error: "Cannot delete the last admin account" });
      }
    }

    if (!destructiveConfirmationMatches(req.body?.confirmEmail, targetUser.email)) {
      await writeAdminLog(req.user?.userId, "USER_DELETE_ATTEMPT", "User", targetUserId, {
        result: "failure",
        reason: "confirmation_mismatch",
        targetEmail: targetUser.email,
        statusCode: 400,
      });
      return res.status(400).json({ error: "Type the user's email address or DELETE to confirm deletion" });
    }

    const [submissionFiles, pendingGenomeReferences] = await Promise.all([
      prisma.submissionFile.findMany({
        where: { submission: { submittedById: targetUserId } },
        select: { storagePath: true },
      }),
      prisma.genomeReferenceFile.findMany({
        where: { submission: { submittedById: targetUserId }, strainId: null },
        select: { id: true, storagePath: true },
      }),
    ]);
    const cleanup = await deleteStoredFiles([
      ...submissionFiles.map((file) => file.storagePath),
      ...pendingGenomeReferences.map((file) => file.storagePath),
      ...(targetUser.profile?.profilePhotoPath ? [targetUser.profile.profilePhotoPath] : []),
    ]);
    if (cleanup.failed > 0) {
      await writeAdminLog(req.user?.userId, 'USER_DELETE_ATTEMPT', 'User', targetUserId, {
        result: 'failure',
        reason: 'storage_cleanup_failed',
        targetEmail: targetUser.email,
        cleanup,
        statusCode: 503,
      });
      return res.status(503).json({ error: 'User-owned file cleanup failed; the user record was preserved' });
    }

    await prisma.$transaction(async (tx) => {
      if (pendingGenomeReferences.length) {
        await tx.genomeReferenceFile.deleteMany({ where: { id: { in: pendingGenomeReferences.map((file) => file.id) } } });
      }
      await tx.user.delete({ where: { id: targetUserId } });
    });
    await writeAdminLog(req.user?.userId, "USER_DELETED", "User", targetUserId, {
      targetEmail: targetUser.email,
      targetRole: targetUser.role,
      organismUploads: targetUser._count.organismUploads,
      blogPosts: targetUser._count.blogPosts,
      cleanup,
    });

    res.json({ message: "User deleted", deletedUserId: targetUserId });
  } catch (error) {
    console.error("Admin User Delete Error:", error);
    await writeAdminLog(req.user?.userId, "USER_DELETE_ATTEMPT", "User", targetUserId || undefined, {
      result: "failure",
      reason: "server_error",
      statusCode: 500,
    });
    res.status(500).json({ error: "Failed to delete user" });
  }
});

app.get('/api/admin/organism-uploads', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || "").toUpperCase();
    const statusFilter = Object.values(ApprovalStatus).includes(status as ApprovalStatus) ? status as ApprovalStatus : undefined;
    const uploads = await prisma.organismUpload.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        submittedBy: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    res.json(uploads);
  } catch (error) {
    console.error("Admin Upload Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch organism uploads" });
  }
});

app.get('/api/admin/organism-uploads/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uploadId = parseStringParam(req.params.id);
    const existing = await prisma.organismUpload.findUnique({
      where: { id: uploadId },
      select: {
        id: true,
        submittedById: true,
        reviewedById: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,
        reviewedAt: true,
      },
    });

    if (!existing) return res.status(404).json({ error: "Organism upload not found" });
    await ensureSubmissionStatusHistory(existing);

    const upload = await prisma.organismUpload.findUnique({
      where: { id: uploadId },
      include: submissionDetailInclude(true),
    });
    if (!upload) return res.status(404).json({ error: "Organism upload not found" });

    await writeAdminLog(req.user?.userId, "ORGANISM_UPLOAD_DETAIL_VIEWED", "OrganismUpload", uploadId, {
      status: upload.status,
      scientificName: upload.scientificName,
      strainName: upload.strainName,
    });

    const auditLogs = await targetAuditLogs("OrganismUpload", uploadId);
    const submission = buildSubmissionResponse(upload);
    res.json({ upload: submission, submission, auditLogs });
  } catch (error) {
    console.error("Admin Upload Detail Error:", error);
    res.status(500).json({ error: "Failed to fetch organism upload detail" });
  }
});

app.get('/api/admin/submissions/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const submissionId = parseStringParam(req.params.id);
    const existing = await prisma.organismUpload.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        submittedById: true,
        reviewedById: true,
        status: true,
        reviewNote: true,
        createdAt: true,
        updatedAt: true,
        reviewedAt: true,
      },
    });

    if (!existing) return res.status(404).json({ error: "Submission not found" });
    await ensureSubmissionStatusHistory(existing);

    const upload = await prisma.organismUpload.findUnique({
      where: { id: submissionId },
      include: submissionDetailInclude(true),
    });
    if (!upload) return res.status(404).json({ error: "Submission not found" });

    await writeAdminLog(req.user?.userId, "ADMIN_SUBMISSION_DETAIL_VIEWED", "OrganismUpload", submissionId, {
      status: upload.status,
      result: "success",
    });

    const auditLogs = await targetAuditLogs("OrganismUpload", submissionId);
    res.json({ submission: buildSubmissionResponse(upload), auditLogs });
  } catch (error) {
    console.error("Admin Submission Detail Error:", error);
    res.status(500).json({ error: "Failed to fetch submission detail" });
  }
});

app.post('/api/admin/submissions/:id/notes', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const submissionId = parseStringParam(req.params.id);
    const message = reviewNoteValue(req.body.message);
    const visibleToSubmitter = req.body.visibleToSubmitter !== false;

    if (!message) {
      return res.status(400).json({ error: "Reviewer note is required" });
    }

    const upload = await prisma.organismUpload.findUnique({ where: { id: submissionId }, select: { id: true } });
    if (!upload) return res.status(404).json({ error: "Submission not found" });

    const note = await addSubmissionReviewerNote({
      submissionId,
      authorId: req.user?.userId,
      message,
      visibleToSubmitter,
    });

    if (visibleToSubmitter) {
      await prisma.organismUpload.update({
        where: { id: submissionId },
        data: { reviewNote: message },
      });
    }

    await writeAdminLog(req.user?.userId, "SUBMISSION_REVIEWER_NOTE_ADDED", "OrganismUpload", submissionId, {
      visibleToSubmitter,
    });

    res.status(201).json({ message: "Reviewer note added", note });
  } catch (error) {
    console.error("Submission Reviewer Note Error:", error);
    res.status(500).json({ error: "Failed to add reviewer note" });
  }
});

app.post('/api/admin/submissions/:id/status', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const submissionId = parseStringParam(req.params.id);
    const requestedStatus = String(req.body.status || "").trim().toUpperCase() as ApprovalStatus;
    const allowedStatuses = new Set<ApprovalStatus>([
      ApprovalStatus.UNDER_REVIEW,
      ApprovalStatus.NEEDS_CHANGES,
      ApprovalStatus.REJECTED,
      ApprovalStatus.ARCHIVED,
    ]);
    const note = reviewNoteValue(req.body.note ?? req.body.reviewNote);
    const visibleToSubmitter = req.body.visibleToSubmitter !== false;

    if (!Object.values(ApprovalStatus).includes(requestedStatus) || !allowedStatuses.has(requestedStatus)) {
      return res.status(400).json({ error: "Unsupported submission status update" });
    }
    if ((requestedStatus === ApprovalStatus.REJECTED || requestedStatus === ApprovalStatus.NEEDS_CHANGES) && !note) {
      return res.status(400).json({ error: "A reviewer note is required for rejection or requested changes" });
    }

    const existing = await prisma.organismUpload.findUnique({ where: { id: submissionId } });
    if (!existing) return res.status(404).json({ error: "Submission not found" });

    const upload = await prisma.organismUpload.update({
      where: { id: submissionId },
      data: {
        status: requestedStatus,
        reviewedById: req.user?.userId,
        reviewedAt: new Date(),
        reviewNote: note || undefined,
      },
      include: submissionDetailInclude(true),
    });

    await recordSubmissionStatusHistory({
      submissionId,
      status: requestedStatus,
      actorId: req.user?.userId,
      note,
      visibleToSubmitter,
    });

    let reviewerNote = null;
    if (note) {
      reviewerNote = await addSubmissionReviewerNote({
        submissionId,
        authorId: req.user?.userId,
        message: note,
        visibleToSubmitter,
      });
    }

    await writeAdminLog(req.user?.userId, "SUBMISSION_STATUS_CHANGED", "OrganismUpload", submissionId, {
      status: requestedStatus,
      visibleToSubmitter,
    });

    res.json({ message: "Submission status updated", submission: buildSubmissionResponse(upload), note: reviewerNote });
  } catch (error) {
    console.error("Submission Status Update Error:", error);
    res.status(500).json({ error: "Failed to update submission status" });
  }
});

app.patch('/api/admin/organism-uploads/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uploadId = parseStringParam(req.params.id);
    const existing = await prisma.organismUpload.findUnique({ where: { id: uploadId } });
    if (!existing) return res.status(404).json({ error: "Organism upload not found" });
    if (existing.status === ApprovalStatus.APPROVED) {
      return res.status(400).json({ error: "Approved uploads are already published. Edit the public organism or strain record instead." });
    }

    const payload = buildOrganismUploadData(req.body || {});
    if ("error" in payload) {
      return res.status(400).json({ error: payload.error });
    }
    const reviewNote = reviewNoteValue(req.body.reviewNote);

    const updated = await prisma.organismUpload.update({
      where: { id: uploadId },
      data: {
        ...payload.data,
        reviewNote,
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (reviewNote && reviewNote !== existing.reviewNote) {
      await addSubmissionReviewerNote({
        submissionId: uploadId,
        authorId: req.user?.userId,
        message: reviewNote,
        visibleToSubmitter: true,
      });
    }

    await writeAdminLog(req.user?.userId, "ORGANISM_UPLOAD_EDITED", "OrganismUpload", uploadId, {
      reviewerNoteUpdated: Boolean(reviewNote && reviewNote !== existing.reviewNote),
    });
    res.json(updated);
  } catch (error) {
    console.error("Admin Upload Update Error:", error);
    res.status(500).json({ error: "Failed to update organism upload" });
  }
});

app.post('/api/admin/organism-uploads/:id/approve', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uploadId = parseStringParam(req.params.id);
    const upload = await prisma.organismUpload.findUnique({ where: { id: uploadId } });
    if (!upload) return res.status(404).json({ error: "Organism upload not found" });

    const reviewNote = reviewNoteValue(req.body.reviewNote);
    const result = await prisma.$transaction(async (tx) => {
      const organismData = organismPublicationData(upload);
      const organism = await tx.organism.upsert({
        where: { scientificName: upload.scientificName },
        update: organismData,
        create: organismData,
      });

      const strainWhere: Prisma.StrainWhereInput = {
        organismId: organism.id,
        strainName: upload.strainName,
      };
      if (upload.assemblyAccession) {
        strainWhere.assemblyAccession = upload.assemblyAccession;
      }

      const existingStrain = await tx.strain.findFirst({ where: strainWhere });
      const strainData = strainPublicationData(upload);
      const strain = existingStrain
        ? await tx.strain.update({ where: { id: existingStrain.id }, data: strainData })
        : await tx.strain.create({ data: { organismId: organism.id, ...strainData } });

      const submittedReferences = await tx.genomeReferenceFile.findMany({
        where: { submissionId: uploadId },
        select: { id: true, kind: true, validation: true },
      });
      const submittedReferenceKinds = Array.from(new Set(submittedReferences.map((file) => file.kind)));
      const currentStrainReferences = await tx.genomeReferenceFile.findMany({
        where: { strainId: strain.id, kind: { in: [GenomeReferenceKind.FASTA, GenomeReferenceKind.GFF3] } },
        select: { id: true, kind: true, validation: true },
      });
      const effectiveFasta = submittedReferences.find((file) => file.kind === GenomeReferenceKind.FASTA)
        || currentStrainReferences.find((file) => file.kind === GenomeReferenceKind.FASTA);
      const effectiveGff3 = submittedReferences.find((file) => file.kind === GenomeReferenceKind.GFF3)
        || currentStrainReferences.find((file) => file.kind === GenomeReferenceKind.GFF3);
      if (effectiveFasta && effectiveGff3 && !referenceSetsOverlap(
        referenceNamesFromValidation(effectiveFasta.validation),
        referenceNamesFromValidation(effectiveGff3.validation),
      )) {
        throw new Error('GENOME_REFERENCE_MISMATCH');
      }
      const replacedReferences = submittedReferenceKinds.length
        ? await tx.genomeReferenceFile.findMany({
          where: { strainId: strain.id, kind: { in: submittedReferenceKinds }, id: { notIn: submittedReferences.map((file) => file.id) } },
          select: { id: true, storagePath: true },
        })
        : [];
      if (replacedReferences.length) {
        await tx.genomeReferenceFile.deleteMany({ where: { id: { in: replacedReferences.map((file) => file.id) } } });
      }
      if (submittedReferences.length) {
        await tx.genomeReferenceFile.updateMany({
          where: { id: { in: submittedReferences.map((file) => file.id) } },
          data: {
            strainId: strain.id,
            status: GenomeReferenceStatus.PUBLISHED,
            isPublic: true,
            publishedAt: new Date(),
          },
        });
      }

      const approvedUpload = await tx.organismUpload.update({
        where: { id: uploadId },
        data: {
          status: ApprovalStatus.APPROVED,
          reviewedById: req.user?.userId,
          reviewedAt: new Date(),
          reviewNote,
          publishedOrganismId: organism.id,
          publishedStrainId: strain.id,
        },
        include: {
          submittedBy: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
          reviewedBy: { select: { id: true, name: true, email: true, role: true } },
        },
      });

      return {
        upload: approvedUpload,
        organism,
        strain,
        genomeReferencesPublished: submittedReferences.length,
        replacedReferencePaths: replacedReferences.map((file) => file.storagePath),
      };
    });

    if (result.replacedReferencePaths.length) await deleteStoredFiles(result.replacedReferencePaths);
    const mayaIngestion = await ingestSubmissionMayaFiles(uploadId, result.organism.id, result.strain.id);

    await writeAdminLog(req.user?.userId, "ORGANISM_UPLOAD_APPROVED", "OrganismUpload", uploadId, {
      organismId: result.organism.id,
      strainId: result.strain.id,
      genomeReferencesPublished: result.genomeReferencesPublished,
      mayaIngestion,
    });
    await recordSubmissionStatusHistory({
      submissionId: uploadId,
      status: "APPROVED",
      actorId: req.user?.userId,
      note: reviewNote,
      visibleToSubmitter: true,
    });
    await recordSubmissionStatusHistory({
      submissionId: uploadId,
      status: "PUBLISHED",
      actorId: req.user?.userId,
      note: "Approved submission published to the public organism database.",
      visibleToSubmitter: true,
    });
    if (reviewNote) {
      await addSubmissionReviewerNote({
        submissionId: uploadId,
        authorId: req.user?.userId,
        message: reviewNote,
        visibleToSubmitter: true,
      });
    }

    const { replacedReferencePaths: _replacedReferencePaths, ...publicResult } = result;
    res.json({ message: "Organism upload approved and published", ...publicResult, mayaIngestion });
  } catch (error) {
    console.error("Admin Upload Approval Error:", error);
    if (error instanceof Error && error.message === 'GENOME_REFERENCE_MISMATCH') {
      return res.status(409).json({ error: 'Approval blocked because the effective FASTA and GFF3 reference names do not overlap.' });
    }
    res.status(500).json({ error: "Failed to approve organism upload" });
  }
});

app.post('/api/admin/organism-uploads/:id/reject', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uploadId = parseStringParam(req.params.id);
    const reviewNote = reviewNoteValue(req.body.reviewNote);
    if (!reviewNote) {
      return res.status(400).json({ error: "A reviewer note is required to reject a submission" });
    }
    const upload = await prisma.organismUpload.update({
      where: { id: uploadId },
      data: {
        status: ApprovalStatus.REJECTED,
        reviewedById: req.user?.userId,
        reviewedAt: new Date(),
        reviewNote,
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await recordSubmissionStatusHistory({
      submissionId: uploadId,
      status: "REJECTED",
      actorId: req.user?.userId,
      note: reviewNote,
      visibleToSubmitter: true,
    });
    await addSubmissionReviewerNote({
      submissionId: uploadId,
      authorId: req.user?.userId,
      message: reviewNote,
      visibleToSubmitter: true,
    });
    await writeAdminLog(req.user?.userId, "ORGANISM_UPLOAD_REJECTED", "OrganismUpload", uploadId);
    res.json({ message: "Organism upload rejected", upload });
  } catch (error) {
    console.error("Admin Upload Rejection Error:", error);
    res.status(500).json({ error: "Failed to reject organism upload" });
  }
});

app.delete('/api/admin/organism-uploads/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uploadId = parseStringParam(req.params.id);
    const upload = await prisma.organismUpload.findUnique({
      where: { id: uploadId },
      include: {
        files: { select: { storagePath: true } },
        genomeReferences: { where: { strainId: null }, select: { id: true, storagePath: true } },
      },
    });
    if (!upload) return res.status(404).json({ error: 'Organism upload not found' });

    const cleanup = await deleteStoredFiles([
      ...upload.files.map((file) => file.storagePath),
      ...upload.genomeReferences.map((file) => file.storagePath),
    ]);
    if (cleanup.failed > 0) {
      await writeAdminLog(req.user?.userId, 'ORGANISM_UPLOAD_DELETE_FAILED', 'OrganismUpload', uploadId, {
        result: 'failure',
        reason: 'storage_cleanup_failed',
        cleanup,
      });
      return res.status(503).json({ error: 'Submission file cleanup failed; the submission record was preserved' });
    }
    await prisma.$transaction(async (tx) => {
      if (upload.genomeReferences.length) {
        await tx.genomeReferenceFile.deleteMany({ where: { id: { in: upload.genomeReferences.map((file) => file.id) } } });
      }
      await tx.organismUpload.delete({ where: { id: uploadId } });
    });
    await writeAdminLog(req.user?.userId, "ORGANISM_UPLOAD_DELETED", "OrganismUpload", uploadId, { cleanup });
    res.json({ message: "Organism upload deleted" });
  } catch (error) {
    console.error("Admin Upload Delete Error:", error);
    res.status(500).json({ error: "Failed to delete organism upload" });
  }
});

app.get('/api/admin/blog-posts', requireAdmin, async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || "").toUpperCase();
    const statusFilter = Object.values(ApprovalStatus).includes(status as ApprovalStatus) ? status as ApprovalStatus : undefined;
    const posts = await prisma.blogPost.findMany({
      where: statusFilter ? { status: statusFilter } : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    res.json(posts);
  } catch (error) {
    console.error("Admin Blog Fetch Error:", error);
    res.status(500).json({ error: "Failed to fetch blog posts" });
  }
});

app.get('/api/admin/blog-posts/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = parseStringParam(req.params.id);
    const post = await prisma.blogPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (!post) return res.status(404).json({ error: "Blog post not found" });

    await writeAdminLog(req.user?.userId, "BLOG_POST_DETAIL_VIEWED", "BlogPost", postId, {
      status: post.status,
      title: post.title,
    });

    const auditLogs = await targetAuditLogs("BlogPost", postId);
    res.json({ post, auditLogs });
  } catch (error) {
    console.error("Admin Blog Detail Error:", error);
    res.status(500).json({ error: "Failed to fetch blog post detail" });
  }
});

app.patch('/api/admin/blog-posts/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = parseStringParam(req.params.id);
    const title = textValue(req.body.title, 220);
    const content = textValue(req.body.content, 20000);
    const reviewNote = textValue(req.body.reviewNote, 2000);

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const post = await prisma.blogPost.update({
      where: { id: postId },
      data: { title, content, reviewNote },
      include: {
        author: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await writeAdminLog(req.user?.userId, "BLOG_POST_EDITED", "BlogPost", postId);
    res.json(post);
  } catch (error) {
    console.error("Admin Blog Update Error:", error);
    res.status(500).json({ error: "Failed to update blog post" });
  }
});

app.post('/api/admin/blog-posts/:id/approve', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = parseStringParam(req.params.id);
    const post = await prisma.blogPost.update({
      where: { id: postId },
      data: {
        status: ApprovalStatus.APPROVED,
        reviewedById: req.user?.userId,
        reviewedAt: new Date(),
        reviewNote: textValue(req.body.reviewNote, 2000),
      },
      include: {
        author: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await writeAdminLog(req.user?.userId, "BLOG_POST_APPROVED", "BlogPost", postId);
    res.json({ message: "Blog post approved", post });
  } catch (error) {
    console.error("Admin Blog Approval Error:", error);
    res.status(500).json({ error: "Failed to approve blog post" });
  }
});

app.post('/api/admin/blog-posts/:id/reject', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const postId = parseStringParam(req.params.id);
    const post = await prisma.blogPost.update({
      where: { id: postId },
      data: {
        status: ApprovalStatus.REJECTED,
        reviewedById: req.user?.userId,
        reviewedAt: new Date(),
        reviewNote: textValue(req.body.reviewNote, 2000) || "Rejected by BMGA admin review.",
      },
      include: {
        author: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await writeAdminLog(req.user?.userId, "BLOG_POST_REJECTED", "BlogPost", postId);
    res.json({ message: "Blog post rejected", post });
  } catch (error) {
    console.error("Admin Blog Rejection Error:", error);
    res.status(500).json({ error: "Failed to reject blog post" });
  }
});

app.delete('/api/admin/blog-posts/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const postId = parseStringParam(req.params.id);
  try {
    if (!postId) {
      await writeAdminLog(req.user?.userId, "BLOG_POST_DELETE_ATTEMPT", "BlogPost", undefined, {
        result: "failure",
        reason: "invalid_blog_post_id",
        statusCode: 400,
      });
      return res.status(400).json({ error: "Invalid blog post id" });
    }

    const post = await prisma.blogPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, email: true, name: true, role: true } },
      },
    });

    if (!post) {
      await writeAdminLog(req.user?.userId, "BLOG_POST_DELETE_ATTEMPT", "BlogPost", postId, {
        result: "failure",
        reason: "not_found",
        statusCode: 404,
      });
      return res.status(404).json({ error: "Blog post not found" });
    }

    if (!destructiveConfirmationMatches(req.body?.confirmTitle, post.title)) {
      await writeAdminLog(req.user?.userId, "BLOG_POST_DELETE_ATTEMPT", "BlogPost", postId, {
        result: "failure",
        reason: "confirmation_mismatch",
        title: post.title,
        authorEmail: post.author.email,
        statusCode: 400,
      });
      return res.status(400).json({ error: "Type the blog post title or DELETE to confirm deletion" });
    }

    await prisma.blogPost.delete({ where: { id: postId } });
    await writeAdminLog(req.user?.userId, "BLOG_POST_DELETED", "BlogPost", postId, {
      title: post.title,
      authorEmail: post.author.email,
      status: post.status,
    });
    res.json({ message: "Blog post deleted" });
  } catch (error) {
    console.error("Admin Blog Delete Error:", error);
    await writeAdminLog(req.user?.userId, "BLOG_POST_DELETE_ATTEMPT", "BlogPost", postId || undefined, {
      result: "failure",
      reason: "server_error",
      statusCode: 500,
    });
    res.status(500).json({ error: "Failed to delete blog post" });
  }
});

app.patch('/api/admin/organisms/:id/metadata', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const organismId = parseNumericParam(req.params.id);
  if (!organismId) {
    return res.status(400).json({ error: "Invalid organism id" });
  }

  try {
    const {
      scientificName,
      displayName,
      taxonomyId,
      domain,
      phylum,
      className,
      orderName,
      family,
      genus,
      species,
      description,
    } = req.body;

    const updated = await prisma.organism.update({
      where: { id: organismId },
      data: {
        scientificName,
        displayName,
        taxonomyId: taxonomyId ? Number(taxonomyId) : undefined,
        domain,
        phylum,
        className,
        orderName,
        family,
        genus,
        species,
        description,
      },
    });
    const changedFields = ['scientificName', 'displayName', 'taxonomyId', 'domain', 'phylum', 'className', 'orderName', 'family', 'genus', 'species', 'description']
      .filter((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field));
    await writeAdminLog(req.user?.userId, 'PUBLISHED_ORGANISM_METADATA_UPDATED', 'Organism', String(organismId), {
      scientificName: updated.scientificName,
      changedFields,
    });
    res.json(updated);
  } catch (error) {
    console.error("Organism Metadata Update Error:", error);
    res.status(500).json({ error: "Failed to update organism metadata" });
  }
});

app.delete('/api/admin/organisms/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const organismId = parseNumericParam(req.params.id);
  try {
    if (!organismId) {
      await writeAdminLog(req.user?.userId, "ORGANISM_DELETE_ATTEMPT", "Organism", undefined, {
        result: "failure",
        reason: "invalid_organism_id",
        statusCode: 400,
      });
      return res.status(400).json({ error: "Invalid organism id" });
    }

    const organism = await prisma.organism.findUnique({
      where: { id: organismId },
      include: {
        strains: { select: { id: true } },
        _count: {
          select: {
            strains: true,
            toolRuns: true,
          },
        },
      },
    });

    if (!organism) {
      await writeAdminLog(req.user?.userId, "ORGANISM_DELETE_ATTEMPT", "Organism", String(organismId), {
        result: "failure",
        reason: "not_found",
        statusCode: 404,
      });
      return res.status(404).json({ error: "Organism not found" });
    }

    if (!destructiveConfirmationMatches(req.body?.confirmScientificName, organism.scientificName)) {
      await writeAdminLog(req.user?.userId, "ORGANISM_DELETE_ATTEMPT", "Organism", String(organismId), {
        result: "failure",
        reason: "confirmation_mismatch",
        scientificName: organism.scientificName,
        statusCode: 400,
      });
      return res.status(400).json({ error: "Type the organism scientific name or DELETE to confirm full deletion" });
    }

    const strainIds = organism.strains.map((strain) => strain.id);
    const [toolOutputFiles, fileAssets, genomeReferences] = await Promise.all([
      prisma.toolOutputFile.findMany({
        where: { toolRun: { organismId } },
        select: { filePath: true },
      }),
      prisma.fileAsset.findMany({
        where: {
          OR: [
            { strainId: { in: strainIds } },
            { assembly: { strainId: { in: strainIds } } },
            { annotationRun: { strainId: { in: strainIds } } },
            { analysisRun: { strainId: { in: strainIds } } },
          ],
        },
        select: { bucketName: true, objectKey: true },
      }),
      prisma.genomeReferenceFile.findMany({
        where: { strainId: { in: strainIds } },
        select: { storagePath: true },
      }),
    ]);
    const storedFilePaths = [
      ...toolOutputFiles.map((file) => file.filePath),
      ...fileAssets.map((file) => `s3://${file.bucketName}/${file.objectKey}`),
      ...genomeReferences.map((file) => file.storagePath),
    ];
    const storageDeleteResult = await deleteStoredFiles(storedFilePaths);
    if (storageDeleteResult.failed > 0) {
      await writeAdminLog(req.user?.userId, "ORGANISM_DELETE_ATTEMPT", "Organism", String(organismId), {
        result: "failure",
        reason: "stored_file_cleanup_failed",
        scientificName: organism.scientificName,
        fileCleanup: storageDeleteResult,
        statusCode: 500,
      });
      return res.status(500).json({ error: "Failed to delete all stored organism files. Database record was preserved for retry." });
    }

    const publishedSubmissionCount = await prisma.organismUpload.count({ where: { publishedOrganismId: organismId } });
    await prisma.$transaction(async (tx) => {
      await tx.organismUpload.updateMany({
        where: { publishedOrganismId: organismId },
        data: {
          publishedOrganismId: null,
          publishedStrainId: null,
        },
      });
      await tx.organism.delete({ where: { id: organismId } });
    });

    await writeAdminLog(req.user?.userId, "ORGANISM_DELETED", "Organism", String(organismId), {
      scientificName: organism.scientificName,
      strains: organism._count.strains,
      toolRuns: organism._count.toolRuns,
      affectedPublishedSubmissions: publishedSubmissionCount,
      fileCleanup: storageDeleteResult,
    });

    res.json({ message: "Organism and associated genome/result records deleted" });
  } catch (error) {
    console.error("Organism Delete Error:", error);
    await writeAdminLog(req.user?.userId, "ORGANISM_DELETE_ATTEMPT", "Organism", organismId ? String(organismId) : undefined, {
      result: "failure",
      reason: "server_error",
      statusCode: 500,
    });
    res.status(500).json({ error: "Failed to delete organism data" });
  }
});

app.patch('/api/admin/strains/:id/metadata', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const strainId = parseNumericParam(req.params.id);
  if (!strainId) {
    return res.status(400).json({ error: "Invalid strain id" });
  }

  try {
    const {
      strainName,
      isolateName,
      strainCode,
      biosampleAccession,
      bioprojectAccession,
      assemblyAccession,
      sourceType,
      host,
      country,
      state,
      city,
      collectionDate,
      locationText,
      latitude,
      longitude,
      genomeStatus,
      genomeSize,
      gcContent,
      repoLink,
      metadata,
      surveillanceScope,
      evidenceBasis,
      submittingInstitution,
      dataSource,
      dataUseLimitations,
      lastVerifiedAt,
    } = req.body;

    const updated = await prisma.strain.update({
      where: { id: strainId },
      data: {
        strainName,
        isolateName,
        strainCode,
        biosampleAccession,
        bioprojectAccession,
        assemblyAccession,
        sourceType,
        host,
        country,
        state,
        city,
        collectionDate: collectionDate ? new Date(collectionDate) : undefined,
        locationText,
        latitude: latitude !== undefined && latitude !== "" ? Number(latitude) : undefined,
        longitude: longitude !== undefined && longitude !== "" ? Number(longitude) : undefined,
        genomeStatus,
        genomeSize: genomeSize !== undefined && genomeSize !== "" ? Number(genomeSize) : undefined,
        gcContent: gcContent !== undefined && gcContent !== "" ? Number(gcContent) : undefined,
        repoLink,
        metadata: parseJsonObject(metadata) as Prisma.InputJsonValue,
        surveillanceScope: parseSurveillanceScope(surveillanceScope, country),
        evidenceBasis: parseEvidenceBasis(evidenceBasis),
        submittingInstitution: textValue(submittingInstitution, 240),
        dataSource: textValue(dataSource, 500),
        dataUseLimitations: textValue(dataUseLimitations, 2000),
        lastVerifiedAt: parseOptionalDate(lastVerifiedAt),
      },
    });
    const changedFields = [
      'strainName', 'isolateName', 'strainCode', 'biosampleAccession', 'bioprojectAccession', 'assemblyAccession',
      'sourceType', 'host', 'country', 'state', 'city', 'collectionDate', 'locationText', 'latitude', 'longitude',
      'genomeStatus', 'genomeSize', 'gcContent', 'repoLink', 'metadata', 'surveillanceScope', 'evidenceBasis',
      'submittingInstitution', 'dataSource', 'dataUseLimitations', 'lastVerifiedAt',
    ].filter((field) => Object.prototype.hasOwnProperty.call(req.body || {}, field));
    await writeAdminLog(req.user?.userId, 'PUBLISHED_STRAIN_METADATA_UPDATED', 'Strain', String(strainId), {
      strainName: updated.strainName,
      organismId: updated.organismId,
      changedFields,
    });
    res.json(updated);
  } catch (error) {
    console.error("Strain Metadata Update Error:", error);
    res.status(500).json({ error: "Failed to update strain metadata" });
  }
});

app.post('/api/admin/maya-results', importRateLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      organismId,
      strainId,
      toolName,
      status,
      version,
      summary,
      tableName,
      fileName,
      fileContent,
      warnings,
      errors,
    } = req.body;

    const numericOrganismId = Number(organismId);
    const numericStrainId = strainId ? Number(strainId) : null;
    if (!Number.isInteger(numericOrganismId) || !toolName) {
      return res.status(400).json({ error: "organismId and toolName are required" });
    }

    const rawFileName = fileName || `${normalizeToolName(toolName)}.tsv`;
    const validatedFile = fileContent ? validateImportFile(rawFileName, fileContent) : undefined;
    if (validatedFile && "error" in validatedFile) {
      return res.status(400).json({ error: validatedFile.error });
    }
    const parsedTable = validatedFile ? parseDelimitedFile(validatedFile.fileContent, validatedFile.fileName) : { columns: [] as string[], rows: [] as Record<string, unknown>[] };
    const savedFilePath = validatedFile ? await saveUploadedResultFile({
      organismId: numericOrganismId,
      toolName,
      fileName: validatedFile.fileName,
      fileContent: validatedFile.fileContent,
    }) : undefined;

    const savedRun = await saveNormalizedToolRun(prisma, numericOrganismId, numericStrainId, {
      toolName,
      status: status || "completed",
      version,
      finishedAt: new Date(),
      summary: validatedFile
        ? parseFlexibleSummary(validatedFile.fileName, validatedFile.fileContent, summary)
        : parseJsonObject(summary),
      tables: parsedTable.columns.length ? [{
        tableName: tableName || `${toolName} results`,
        columns: parsedTable.columns,
        rows: parsedTable.rows,
      }] : [],
      files: savedFilePath ? [{
        fileName: rawFileName,
        fileType: path.extname(rawFileName).replace('.', '') || 'raw',
        filePath: savedFilePath,
        description: `${toolName} MAYA upload`,
      }] : [],
      warnings: parseJsonArray(warnings),
      errors: parseJsonArray(errors),
    });
    const amrDetections = await syncAmrGenesFromToolRows(
      prisma,
      savedRun.id,
      numericStrainId,
      normalizeToolName(toolName),
      parsedTable.rows,
    );

    await writeAdminLog(req.user?.userId, "MAYA_RESULT_IMPORTED", "ToolRun", String(savedRun.id), {
      organismId: numericOrganismId,
      strainId: numericStrainId,
      toolName: normalizeToolName(toolName),
      fileName: validatedFile?.fileName,
      storageDriver: savedFilePath ? configuredStorageDriver() : undefined,
      amrDetections,
    });
    res.status(201).json({ message: "MAYA result ingested", toolRunId: savedRun.id, amrDetections });
  } catch (error) {
    console.error("MAYA Result Ingestion Error:", error);
    res.status(500).json({ error: "Failed to ingest MAYA result" });
  }
});

app.post('/api/organisms', adminRateLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { scientificName, displayName, taxonomyId, domain, phylum, className, orderName, family, genus, species, description } = req.body;
    if (!scientificName) {
      return res.status(400).json({ error: "Scientific name is required" });
    }
    
    const newOrg = await prisma.organism.create({
      data: {
        scientificName,
        displayName,
        taxonomyId: taxonomyId ? Number(taxonomyId) : undefined,
        domain: domain || 'Bacteria',
        phylum,
        className,
        orderName,
        family,
        genus: genus || 'Unknown',
        species: species || 'Unknown',
        description: description || 'Registered via Admin Panel',
      }
    });
    
    await writeAdminLog(req.user?.userId, 'ORGANISM_CREATED_DIRECTLY', 'Organism', String(newOrg.id), {
      scientificName: newOrg.scientificName,
      taxonomyId: newOrg.taxonomyId,
    });
    res.status(201).json(newOrg);
  } catch (error) {
    console.error("Organism Registration Error:", error);
    res.status(500).json({ error: "Failed to register new organism." });
  }
});

app.get('/api/strains/:id', async (req: Request, res: Response) => {
  const strainId = parseNumericParam(req.params.id);
  if (!strainId) {
    return res.status(400).json({ error: "Invalid strain id" });
  }

  try {
    const strain = await prisma.strain.findUnique({
      where: { id: strainId },
      include: {
        organism: true,
        amrGenes: true,
        analysisRuns: {
          include: {
            fastqc: true,
            fastp: true,
            multiqc: true,
            spades: true,
            quast: true,
            busco: true,
            checkm: true,
            prokka: true,
            diamond: true,
            kofamkoala: true,
            abricate: true,
            mlst: true,
            islandPath: true,
            trnascan: true,
            hmmer: true,
            minced: true,
            jellyfish: true,
            trf: true,
            barrnap: true,
            antismash: true,
            toolResults: true,
          }
        }
      }
    });

    if (!strain) return res.status(404).json({ error: "Strain not found" });
    res.json(strain);
  } catch (error) {
    console.error("Deep Fetch Error:", error);
    res.status(500).json({ error: "Failed to retrieve unified genomic data." });
  }
});

// ─── DATA UPLOAD & PROCESSING ────────────────────────────────────────────────

app.post('/api/upload-results', importRateLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  const { strainId, toolName, fileContent, fileName } = req.body;
  const results: any[] = [];

  const validatedFile = validateImportFile(fileName || `${toolName || 'results'}.tsv`, fileContent);
  if ("error" in validatedFile) {
    return res.status(400).json({ error: validatedFile.error });
  }

  // Convert the raw text from the frontend into a readable stream for csv-parser
  Readable.from(validatedFile.fileContent)
    .pipe(csv({ separator: '\t' }))
    .on('data', (data) => results.push(data))
    .on('end', async () => {
      try {
        const run = await prisma.analysisRun.create({
          data: {
            strainId: Number(strainId),
            sampleName: `Admin Upload - ${toolName}`,
            toolResults: {
              create: {
                resultType: "TSV_PARSED",
                title: `${toolName} Results`,
                jsonData: results
              }
            }
          }
        });
        await writeAdminLog(req.user?.userId, "PIPELINE_RESULT_UPLOADED", "AnalysisRun", String(run.id), {
          strainId,
          toolName,
          fileName: validatedFile.fileName,
        });
        res.json({ message: "Analysis run and results recorded", id: run.id });
      } catch (err) {
        logEvent('error', "upload_error", { requestId: currentContext()?.requestId, error: safeErrorMessage(err, "Database save failed") });
        res.status(500).json({ error: "Database save failed" });
      }
    });
});

// ─── STATISTICS ─────────────────────────────────────────────────────────────

app.get('/api/stats/gc-distribution', async (req: Request, res: Response) => {
  try {
    const strains = await prisma.strain.findMany({ select: { gcContent: true } });
    
    const stats = { Low: 0, Medium: 0, High: 0 };
    strains.forEach(s => {
      const val = Number(s.gcContent) || 0;
      if (val < 40) stats.Low++;
      else if (val <= 60) stats.Medium++;
      else stats.High++;
    });

    res.json([
      { name: 'Low GC (<40%)', value: stats.Low },
      { name: 'Medium GC (40-60%)', value: stats.Medium },
      { name: 'High GC (>60%)', value: stats.High }
    ]);
  } catch (err) {
    res.status(500).json({ error: "Stats retrieval failed" });
  }
});

// ─── REGISTER NEW STRAIN ─────────────────────────────────────────────────────
app.post('/api/strains', adminRateLimiter, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const {
      organismId,
      strainName,
      isolateName,
      strainCode,
      biosampleAccession,
      bioprojectAccession,
      assemblyAccession,
      sourceType,
      host,
      country,
      state,
      city,
      collectionDate,
      locationText,
      latitude,
      longitude,
      genomeStatus,
      genomeSize,
      gcContent,
      repoLink,
      metadata,
      surveillanceScope,
      evidenceBasis,
      submittingInstitution,
      dataSource,
      dataUseLimitations,
      lastVerifiedAt,
    } = req.body;
    
    const numericOrganismId = Number(organismId);
    if (!Number.isInteger(numericOrganismId) || numericOrganismId <= 0 || typeof strainName !== 'string' || !strainName.trim()) {
      return res.status(400).json({ error: 'A valid organismId and strainName are required' });
    }

    const newStrain = await prisma.strain.create({
      data: {
        organismId: numericOrganismId,
        strainName: strainName.trim(),
        isolateName,
        strainCode,
        biosampleAccession,
        bioprojectAccession,
        assemblyAccession,
        sourceType,
        host,
        city,
        country,
        state,
        collectionDate: collectionDate ? new Date(collectionDate) : undefined,
        locationText,
        latitude: latitude !== undefined && latitude !== "" ? parseFloat(latitude) : undefined,
        longitude: longitude !== undefined && longitude !== "" ? parseFloat(longitude) : undefined,
        genomeStatus,
        genomeSize: genomeSize !== undefined && genomeSize !== "" ? Number(genomeSize) : undefined,
        gcContent: gcContent !== undefined && gcContent !== "" ? Number(gcContent) : undefined,
        repoLink,
        metadata: parseJsonObject(metadata) as Prisma.InputJsonValue,
        surveillanceScope: parseSurveillanceScope(surveillanceScope, country),
        evidenceBasis: parseEvidenceBasis(evidenceBasis),
        submittingInstitution: textValue(submittingInstitution, 240),
        dataSource: textValue(dataSource, 500),
        dataUseLimitations: textValue(dataUseLimitations, 2000),
        lastVerifiedAt: parseOptionalDate(lastVerifiedAt),
      }
    });
    
    await writeAdminLog(req.user?.userId, 'STRAIN_CREATED_DIRECTLY', 'Strain', String(newStrain.id), {
      organismId: newStrain.organismId,
      strainName: newStrain.strainName,
      assemblyAccession: newStrain.assemblyAccession,
    });
    res.status(201).json(newStrain);
  } catch (error) {
    console.error("Strain Registration Error:", error);
    res.status(500).json({ error: "Failed to register new strain in the database." });
  }
});

async function publishScheduledAmrContent() {
  const now = new Date();
  try {
    const [findings, publications] = await Promise.all([
      prisma.amrFinding.findMany({ where: { curationStatus: AmrFindingStatus.APPROVED, scheduledPublishAt: { lte: now } }, select: { id: true, title: true, createdById: true } }),
      prisma.amrPublication.findMany({ where: { curationStatus: AmrFindingStatus.APPROVED, scheduledPublishAt: { lte: now } }, select: { id: true, title: true, createdById: true } }),
    ]);
    for (const finding of findings) {
      const published = await prisma.$transaction(async (tx) => {
        const result = await tx.amrFinding.updateMany({ where: { id: finding.id, curationStatus: AmrFindingStatus.APPROVED, scheduledPublishAt: { lte: now } }, data: { curationStatus: AmrFindingStatus.PUBLISHED, publishedAt: now, scheduledPublishAt: null } });
        if (!result.count) return false;
        await tx.amrFindingRevision.create({ data: { findingId: finding.id, action: 'SCHEDULED_PUBLICATION_EXECUTED', visibleToSubmitter: true, snapshot: { status: AmrFindingStatus.PUBLISHED } } });
        await createNotification(tx, { userId: finding.createdById, type: NotificationType.AMR_FINDING, title: 'AMR finding published', body: `“${finding.title}” is now publicly visible.`, link: `/amr-findings-india` });
        return true;
      });
      if (published) await writeAdminLog(undefined, 'AMR_FINDING_SCHEDULED_PUBLISHED', 'AmrFinding', finding.id, { result: 'success', system: true });
    }
    for (const publication of publications) {
      const published = await prisma.$transaction(async (tx) => {
        const result = await tx.amrPublication.updateMany({ where: { id: publication.id, curationStatus: AmrFindingStatus.APPROVED, scheduledPublishAt: { lte: now } }, data: { curationStatus: AmrFindingStatus.PUBLISHED, publishedAt: now, scheduledPublishAt: null } });
        if (!result.count) return false;
        await tx.amrPublicationRevision.create({ data: { publicationId: publication.id, action: 'SCHEDULED_PUBLICATION_EXECUTED', visibleToSubmitter: true, snapshot: { status: AmrFindingStatus.PUBLISHED } } });
        if (publication.createdById) await createNotification(tx, { userId: publication.createdById, type: NotificationType.AMR_PUBLICATION, title: 'AMR publication published', body: `“${publication.title}” is now publicly visible.`, link: '/amr-findings-india/publications' });
        return true;
      });
      if (published) await writeAdminLog(undefined, 'AMR_PUBLICATION_SCHEDULED_PUBLISHED', 'AmrPublication', publication.id, { result: 'success', system: true });
    }
  } catch (error) {
    logEvent('error', 'amr_scheduled_publication_failed', { error: safeErrorMessage(error, 'Scheduled AMR publication failed') });
  }
}

void publishScheduledAmrContent();
setInterval(() => void publishScheduledAmrContent(), 60_000).unref();

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

app.use((error: Error, req: Request, res: Response, _next: NextFunction) => {
  const requestError = error as Error & { status?: number; type?: string };
  const statusCode = error.message === 'CORS origin not allowed'
    ? 403
    : requestError.type === 'entity.too.large' || requestError.status === 413
      ? 413
      : requestError.type === 'entity.parse.failed' || requestError.status === 400
        ? 400
        : 500;
  logEvent(statusCode >= 500 ? 'error' : 'warn', 'request_error', {
    requestId: currentContext()?.requestId,
    method: req.method,
    path: req.path,
    statusCode,
    error: safeErrorMessage(error, 'Request failed'),
    stack: isProduction ? undefined : error.stack,
  });

  res.status(statusCode).json({
    error: statusCode === 403 ? 'Forbidden' : statusCode === 413 ? 'Request body is too large' : statusCode === 400 ? 'Invalid JSON request body' : 'Request failed',
    requestId: currentContext()?.requestId,
  });
});
// ─── START SERVER ────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  logEvent('info', 'api_started', { port: PORT, environment: process.env.NODE_ENV || 'development' });
});
