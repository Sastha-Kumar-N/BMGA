import 'dotenv/config';
import express, { Request, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
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
import { getOrganismResults, getOrganismToolResult, getToolOutputFile } from './services/resultService';
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

app.post('/api/auth/signup', async (req: Request, res: Response) => {
  try {
    const { email, password, name, role } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const safeRole = Object.values(UserRole).includes(role) ? role : UserRole.STUDENT;
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email,
        name: name || email.split('@')[0],
        role: safeRole,
        password: hashedPassword,
      },
    });
    res.status(201).json({ message: "User created", userId: newUser.id });
  } catch (error: any) {
    if (error.code === 'P2002') return res.status(400).json({ error: "Email already exists" });
    res.status(500).json({ error: "Signup failed" });
  }
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, user: { id: user.id, name: user.name, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: "Login failed" });
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


app.post('/api/organisms', async (req: Request, res: Response) => {
  try {
    const { scientificName, domain, genus, species, description } = req.body;
    
    const newOrg = await prisma.organism.create({
      data: {
        scientificName,
        domain: domain || 'Bacteria',
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

app.post('/api/upload-results', async (req: Request, res: Response) => {
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
app.post('/api/strains', async (req: Request, res: Response) => {
  try {
    const { organismId, strainName, sourceType, city, country, latitude, longitude } = req.body;
    
    const newStrain = await prisma.strain.create({
      data: {
        organismId: Number(organismId),
        strainName,
        sourceType,
        city,
        country,
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude),
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
