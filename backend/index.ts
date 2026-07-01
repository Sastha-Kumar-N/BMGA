import 'dotenv/config';
import express, { NextFunction, Request, Response } from 'express';
import { ApprovalStatus, ContactMessageStatus, Prisma, PrismaClient, UserAffiliation, UserRole } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { Readable } from 'stream';
import { AsyncLocalStorage } from 'async_hooks';
import { createHash, randomUUID } from 'crypto';
import { getOrganismById } from './services/organismService';
import { getOrganismResults, getOrganismToolResult, getToolOutputFile, saveNormalizedToolRun } from './services/resultService';
import { normalizeToolName } from './services/resultsParsers/toolDefinitions';
// --- Runtime Configuration --------------------------------------------------
const isProduction = process.env.NODE_ENV === 'production';
const allowInsecureDevSecrets = process.env.ALLOW_INSECURE_DEV_SECRETS === 'true';
const APP_NAME = process.env.APP_NAME || 'bgdb';
const APP_VERSION = process.env.APP_VERSION || process.env.npm_package_version || '0.0.0';
const LOG_LEVEL = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');
const ENABLE_REQUEST_LOGGING = process.env.ENABLE_REQUEST_LOGGING !== 'false';
const PORT = Number(process.env.PORT || 3001);
const REQUEST_BODY_LIMIT = process.env.REQUEST_BODY_LIMIT || '1mb';
const MAX_IMPORT_FILE_BYTES = Number(process.env.MAX_IMPORT_FILE_BYTES || 5 * 1024 * 1024);
const UPLOAD_ROOT = path.resolve(process.env.UPLOAD_ROOT || path.join(process.cwd(), 'uploads'));

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
  const unsafe = UNSAFE_SECRET_MARKERS.includes(trimmed) || /^dev-local-/i.test(trimmed);
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

  const taxonomyId = parseOptionalInt(body.taxonomyId);
  const genomeSize = parseOptionalInt(body.genomeSize);
  const gcContent = parseOptionalFloat(body.gcContent);

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
      country: textValue(body.country, 120) || "India",
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

function buildSubmissionResponse<T extends { metadata: Prisma.JsonValue | null; scientificName: string; strainName: string }>(upload: T) {
  return {
    ...upload,
    submissionType: "Organism Upload",
    title: `${upload.scientificName} / ${upload.strainName}`,
    files: sanitizeSubmissionFiles(upload.metadata),
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

function saveUploadedResultFile(organismId: number, toolName: string, fileName: string, fileContent: string) {
  const safeTool = normalizeToolName(toolName).replace(/[^a-z0-9_]/gi, '_');
  const safeFile = fileName.replace(/[^a-z0-9_.-]/gi, '_');
  const uploadDir = path.resolve(UPLOAD_ROOT, 'maya-results', String(organismId), safeTool);
  const relativeUploadDir = path.relative(UPLOAD_ROOT, uploadDir);
  if (relativeUploadDir.startsWith('..') || path.isAbsolute(relativeUploadDir)) {
    throw new Error("Invalid upload path");
  }
  fs.mkdirSync(uploadDir, { recursive: true });
  const outputPath = path.join(uploadDir, `${Date.now()}-${safeFile}`);
  fs.writeFileSync(outputPath, fileContent, 'utf8');
  return outputPath;
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
app.use(express.json({ limit: REQUEST_BODY_LIMIT }));
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

    const resolvedPath = path.resolve(file.filePath);
    if (!fs.existsSync(resolvedPath)) {
      return res.status(404).json({ error: "File path is not available on this server" });
    }

    res.download(resolvedPath, file.fileName);
  } catch (error) {
    console.error("Download Error:", error);
    res.status(500).json({ error: "Failed to download result file" });
  }
});

app.get('/api/strains', async (req: Request, res: Response) => {
  try {
    const strains = await prisma.strain.findMany({
      include: { organism: true }
    });
    res.json(strains);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch strains" });
  }
});

app.use('/api/admin', adminRateLimiter);

app.get('/api/admin/me', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ ok: true, user: req.user });
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

    await prisma.user.delete({ where: { id: targetUserId } });
    await writeAdminLog(req.user?.userId, "USER_DELETED", "User", targetUserId, {
      targetEmail: targetUser.email,
      targetRole: targetUser.role,
      organismUploads: targetUser._count.organismUploads,
      blogPosts: targetUser._count.blogPosts,
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

      return { upload: approvedUpload, organism, strain };
    });

    await writeAdminLog(req.user?.userId, "ORGANISM_UPLOAD_APPROVED", "OrganismUpload", uploadId, {
      organismId: result.organism.id,
      strainId: result.strain.id,
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

    res.json({ message: "Organism upload approved and published", ...result });
  } catch (error) {
    console.error("Admin Upload Approval Error:", error);
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
    await prisma.organismUpload.delete({ where: { id: uploadId } });
    await writeAdminLog(req.user?.userId, "ORGANISM_UPLOAD_DELETED", "OrganismUpload", uploadId);
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
    const savedFilePath = validatedFile ? saveUploadedResultFile(numericOrganismId, toolName, validatedFile.fileName, validatedFile.fileContent) : undefined;

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

    await writeAdminLog(req.user?.userId, "MAYA_RESULT_IMPORTED", "ToolRun", String(savedRun.id), {
      organismId: numericOrganismId,
      strainId: numericStrainId,
      toolName: normalizeToolName(toolName),
      fileName: validatedFile?.fileName,
    });
    res.status(201).json({ message: "MAYA result ingested", toolRunId: savedRun.id });
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
  const statusCode = error.message === 'CORS origin not allowed' ? 403 : 500;
  logEvent(statusCode >= 500 ? 'error' : 'warn', 'request_error', {
    requestId: currentContext()?.requestId,
    method: req.method,
    path: req.path,
    statusCode,
    error: safeErrorMessage(error, 'Request failed'),
    stack: isProduction ? undefined : error.stack,
  });

  res.status(statusCode).json({
    error: statusCode === 403 ? "Forbidden" : "Request failed",
    requestId: currentContext()?.requestId,
  });
});
// ─── START SERVER ────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  logEvent('info', 'api_started', { port: PORT, environment: process.env.NODE_ENV || 'development' });
});
