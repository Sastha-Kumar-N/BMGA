import "dotenv/config";
import fs from "fs/promises";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { getParser, supportedToolKeys } from "../services/resultsParsers/parserRegistry";
import { normalizeToolName } from "../services/resultsParsers/toolDefinitions";
import { saveNormalizedToolRun } from "../services/resultService";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to import result files.");
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

function parseArgs(argv: string[]) {
  const inputIndex = argv.findIndex((arg) => arg === "--input" || arg === "-i");
  const input = inputIndex >= 0 ? argv[inputIndex + 1] : undefined;

  if (!input) {
    throw new Error("Usage: npm run import:results -- --input /path/to/pipeline/results");
  }

  return { input: path.resolve(input) };
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function ensureOrganism(folderName: string) {
  const numericId = Number(folderName);
  if (Number.isInteger(numericId)) {
    const byId = await prisma.organism.findUnique({ where: { id: numericId } });
    if (byId) return byId;
  }

  const byName = await prisma.organism.findFirst({
    where: {
      OR: [
        { scientificName: folderName },
        { displayName: folderName },
      ],
    },
  });
  if (byName) return byName;

  return prisma.organism.create({
    data: {
      scientificName: folderName,
      displayName: folderName,
      description: "Created by BMGA result importer",
    },
  });
}

async function primaryStrainIdForOrganism(organismId: number) {
  const strain = await prisma.strain.findFirst({
    where: { organismId },
    orderBy: { createdAt: "desc" },
  });

  return strain?.id || null;
}

async function importTool(organismId: number, strainId: number | null, organismFolder: string, toolName: string) {
  const toolDir = path.join(organismFolder, toolName);
  const parser = getParser(toolName);

  if (!parser || !(await pathExists(toolDir))) {
    await saveNormalizedToolRun(prisma, organismId, strainId, {
      toolName,
      status: "not_available",
      summary: {},
      tables: [],
      files: [],
      warnings: [],
      errors: [],
    });
    return "not_available";
  }

  try {
    const parsed = await parser(toolDir);
    await saveNormalizedToolRun(prisma, organismId, strainId, parsed);
    return parsed.status;
  } catch (error) {
    await saveNormalizedToolRun(prisma, organismId, strainId, {
      toolName: normalizeToolName(toolName),
      status: "failed",
      summary: {},
      tables: [],
      files: [],
      warnings: [],
      errors: [error instanceof Error ? error.message : String(error)],
      finishedAt: new Date(),
    });
    return "failed";
  }
}

async function main() {
  const { input } = parseArgs(process.argv.slice(2));
  const organismEntries = await fs.readdir(input, { withFileTypes: true });
  const organismFolders = organismEntries.filter((entry) => entry.isDirectory());

  console.log(`Importing BMGA results from ${input}`);

  for (const organismEntry of organismFolders) {
    const organismFolder = path.join(input, organismEntry.name);
    const organism = await ensureOrganism(organismEntry.name);
    const strainId = await primaryStrainIdForOrganism(organism.id);

    console.log(`\nOrganism ${organism.id}: ${organism.scientificName}`);

    for (const toolName of supportedToolKeys()) {
      const status = await importTool(organism.id, strainId, organismFolder, toolName);
      console.log(`  ${toolName}: ${status}`);
    }
  }

  console.log("\nImport complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
