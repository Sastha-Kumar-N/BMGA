import 'dotenv/config';
import express, { Request, Response } from 'express';
import { PrismaClient, UserRole } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import csv from 'csv-parser';
import { Readable } from 'stream';
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
  const rawId = req.params.id;
  const strainId = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  if (!Number.isInteger(strainId)) {
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
