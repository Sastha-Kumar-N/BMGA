import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import {
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
import { normalizeToolName, TOOL_KEYS } from './services/resultsParsers/toolDefinitions';
import {
  configuredStorageDriver,
  deleteStoredFiles,
  readStoredTextFile,
  saveGenomeReferenceFile,
  saveSubmissionResultFile,
  saveUploadedResultFile,
  sendStoredFileDownload,
  sendStoredFileInline,
} from './services/objectStorage';
import { prepareGenomeReference, type UploadableGenomeReferenceKind } from './services/genomeReferenceService';
import { BlastServiceError, runBlastSearch } from './services/blastService';
import {
  getAmrSurveillanceInsights,
  getSurveillanceFilterOptions,
  getSurveillanceOverview,
  getSurveillanceRecords,
  syncAmrGenesFromToolRows,
  type SurveillanceFilters,
} from './services/surveillanceService';
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
const MAX_IMPORT_FILE_BYTES = Number(process.env.MAX_IMPORT_FILE_BYTES || 5 * 1024 * 1024);
const MAX_GENOME_REFERENCE_BYTES = Number(process.env.MAX_GENOME_REFERENCE_BYTES || 25 * 1024 * 1024);
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

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    await writeAdminLog(undefined, "AUTH_REQUIRED", "Auth", undefined, { result: "failure", statusCode: 401, path: req.path });
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId?: string; role?: string };
    if (!payload.userId) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, role: true, affiliation: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Account no longer exists" });
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
    ingestedAt: file.ingestedAt,
    downloadPath: `/submissions/${upload.id}/files/${file.id}/download`,
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
  const allowedExtensions = new Set(['.tsv', '.csv', '.json', '.txt']);
  if (!allowedExtensions.has(extension)) {
    return { error: "Unsupported import file type. Use TSV, CSV, JSON, or TXT." as const };
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

  const delimiter = fileName.toLowerCase().endsWith('.csv') ? ',' : '\t';
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const columns = lines[0]?.split(delimiter).map((value) => value.trim()) || [];
  const rows = lines.slice(1).map((line) => {
    const values = line.split(delimiter).map((value) => value.trim());
    return columns.reduce<Record<string, string>>((row, column, index) => {
      row[column || `column_${index + 1}`] = values[index] || "";
      return row;
    }, {});
  });

  return { columns, rows };
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
        summary: parseJsonObject(file.summary),
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
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
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

    const isOwner = upload.submittedById === req.user?.userId;
    const isAdmin = req.user?.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      await writeAdminLog(req.user?.userId, 'SUBMISSION_FILE_UPLOAD_DENIED', 'OrganismUpload', submissionId, {
        result: 'failure',
        statusCode: 403,
      });
      return res.status(403).json({ error: 'You are not allowed to add files to this submission' });
    }
    if (upload.status !== ApprovalStatus.PENDING && upload.status !== ApprovalStatus.NEEDS_CHANGES) {
      return res.status(409).json({ error: 'MAYA files can only be added while a submission is pending or needs changes' });
    }
    if (upload._count.files >= 30) {
      return res.status(409).json({ error: 'A submission can contain at most 30 MAYA result files' });
    }

    const normalizedTool = normalizeToolName(textValue(req.body?.toolName, 100) || '');
    if (!TOOL_KEYS.includes(normalizedTool as typeof TOOL_KEYS[number])) {
      return res.status(400).json({ error: 'Select a supported MAYA tool for this file' });
    }
    const existingToolFile = await prisma.submissionFile.findFirst({
      where: { submissionId, toolName: normalizedTool },
      select: { id: true },
    });
    if (existingToolFile) {
      return res.status(409).json({ error: 'This submission already has a file for that MAYA tool. Remove it before uploading a replacement.' });
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
        summary: parseJsonObject(req.body?.summary) as Prisma.InputJsonValue,
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
        createdAt: true,
      },
    });

    await writeAdminLog(req.user?.userId, 'SUBMISSION_MAYA_FILE_UPLOADED', 'OrganismUpload', submissionId, {
      fileId: file.id,
      toolName: file.toolName,
      fileName: file.originalFileName,
      fileSizeBytes: file.fileSizeBytes,
      storageDriver: configuredStorageDriver(),
    });
    res.status(201).json({ message: 'MAYA result file attached for admin review', file });
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
    await prisma.contactMessage.update({
      where: { id: messageId },
      data: { archived: true },
    });
    await writeAdminLog(req.user?.userId, "CONTACT_MESSAGE_ARCHIVED", "ContactMessage", messageId);
    res.json({ message: "Contact message archived" });
  } catch (error) {
    console.error("Admin Contact Message Delete Error:", error);
    res.status(500).json({ error: "Failed to archive contact message" });
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
      data: { passwordHash: hashedPassword },
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
    ]);
    if (cleanup.failed > 0) {
      await writeAdminLog(req.user?.userId, 'USER_DELETE_ATTEMPT', 'User', targetUserId, {
        result: 'failure',
        reason: 'storage_cleanup_failed',
        targetEmail: targetUser.email,
        cleanup,
        statusCode: 503,
      });
      return res.status(503).json({ error: 'User submission file cleanup failed; the user record was preserved' });
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

app.patch('/api/admin/organisms/:id/metadata', requireAdmin, async (req: Request, res: Response) => {
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

app.patch('/api/admin/strains/:id/metadata', requireAdmin, async (req: Request, res: Response) => {
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
      summary: parseJsonObject(summary),
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

app.post('/api/organisms', adminRateLimiter, requireAdmin, async (req: Request, res: Response) => {
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
app.post('/api/strains', adminRateLimiter, requireAdmin, async (req: Request, res: Response) => {
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
    
    const newStrain = await prisma.strain.create({
      data: {
        organismId: Number(organismId),
        strainName,
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
    
    res.status(201).json(newStrain);
  } catch (error) {
    console.error("Strain Registration Error:", error);
    res.status(500).json({ error: "Failed to register new strain in the database." });
  }
});

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
