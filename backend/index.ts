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
import { getOrganismById } from './services/organismService';
import { getOrganismResults, getOrganismToolResult, getToolOutputFile, saveNormalizedToolRun } from './services/resultService';
import { normalizeToolName } from './services/resultsParsers/toolDefinitions';
// --- Database Configuration ---
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to start the API server.');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';
const PORT = Number(process.env.PORT || 3001);
const allowedOrigins = process.env.CORS_ORIGIN
  ?.split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

function parseNumericParam(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseStringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value || "";
}

type AuthenticatedRequest = Request & {
  user?: {
    userId: string;
    role: UserRole;
    email?: string;
    name?: string;
    affiliation?: UserAffiliation;
  };
};

async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
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
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireRole(roles: UserRole[]) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ error: `${roles.join(" or ")} role required` });
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
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : undefined;
}

function sanitizeContactText(value: unknown, maxLength = 500, preserveNewlines = false) {
  const raw = textValue(value, maxLength);
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
    await prisma.adminLog.create({
      data: {
        adminId,
        action,
        targetType,
        targetId,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("Admin log write failed:", error);
  }
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
  const uploadDir = path.resolve(process.cwd(), 'uploads', 'maya-results', String(organismId), safeTool);
  fs.mkdirSync(uploadDir, { recursive: true });
  const outputPath = path.join(uploadDir, `${Date.now()}-${safeFile}`);
  fs.writeFileSync(outputPath, fileContent, 'utf8');
  return outputPath;
}

app.use(cors({
  origin: allowedOrigins?.length ? allowedOrigins : true,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req: Request, res: Response) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ status: 'error', error: 'Database unavailable' });
  }
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

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const email = normalizedEmail(req.body.email);
    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: publicUser(user) });
  } catch (error) {
    console.error("Login Error:", error);
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

app.post('/api/contact-messages', async (req: Request, res: Response) => {
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


app.get('/api/admin/me', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  res.json({ ok: true, user: req.user });
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

app.get('/api/admin/contact-messages/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const messageId = parseStringParam(req.params.id);
    const message = await prisma.contactMessage.findUnique({ where: { id: messageId } });
    if (!message) return res.status(404).json({ error: "Contact message not found" });
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

    const updated = await prisma.organismUpload.update({
      where: { id: uploadId },
      data: {
        ...payload.data,
        reviewNote: textValue(req.body.reviewNote, 2000),
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    await writeAdminLog(req.user?.userId, "ORGANISM_UPLOAD_EDITED", "OrganismUpload", uploadId);
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

    const reviewNote = textValue(req.body.reviewNote, 2000);
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

    res.json({ message: "Organism upload approved and published", ...result });
  } catch (error) {
    console.error("Admin Upload Approval Error:", error);
    res.status(500).json({ error: "Failed to approve organism upload" });
  }
});

app.post('/api/admin/organism-uploads/:id/reject', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const uploadId = parseStringParam(req.params.id);
    const upload = await prisma.organismUpload.update({
      where: { id: uploadId },
      data: {
        status: ApprovalStatus.REJECTED,
        reviewedById: req.user?.userId,
        reviewedAt: new Date(),
        reviewNote: textValue(req.body.reviewNote, 2000) || "Rejected by BMGA admin review.",
      },
      include: {
        submittedBy: { select: { id: true, name: true, email: true, role: true, affiliation: true } },
        reviewedBy: { select: { id: true, name: true, email: true, role: true } },
      },
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
  try {
    const postId = parseStringParam(req.params.id);
    await prisma.blogPost.delete({ where: { id: postId } });
    await writeAdminLog(req.user?.userId, "BLOG_POST_DELETED", "BlogPost", postId);
    res.json({ message: "Blog post deleted" });
  } catch (error) {
    console.error("Admin Blog Delete Error:", error);
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

app.post('/api/admin/maya-results', requireAdmin, async (req: Request, res: Response) => {
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
    const parsedTable = fileContent ? parseDelimitedFile(String(fileContent), rawFileName) : { columns: [] as string[], rows: [] as Record<string, unknown>[] };
    const savedFilePath = fileContent ? saveUploadedResultFile(numericOrganismId, toolName, rawFileName, String(fileContent)) : undefined;

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

    res.status(201).json({ message: "MAYA result ingested", toolRunId: savedRun.id });
  } catch (error) {
    console.error("MAYA Result Ingestion Error:", error);
    res.status(500).json({ error: "Failed to ingest MAYA result" });
  }
});

app.post('/api/organisms', requireAdmin, async (req: Request, res: Response) => {
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

app.post('/api/upload-results', requireAdmin, async (req: Request, res: Response) => {
  const { strainId, toolName, fileContent } = req.body;
  const results: any[] = [];

  if (!fileContent) {
    return res.status(400).json({ error: "No file content provided." });
  }

  // Convert the raw text from the frontend into a readable stream for csv-parser
  Readable.from(fileContent)
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
        res.json({ message: "Analysis run and results recorded", id: run.id });
      } catch (err) {
        console.error("Upload Error:", err);
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
app.post('/api/strains', requireAdmin, async (req: Request, res: Response) => {
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
// ─── START SERVER ────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Bharat Genome Atlas API live on port ${PORT}`);
});
