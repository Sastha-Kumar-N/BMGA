import 'dotenv/config';
import { Prisma, PrismaClient, ToolRunStatus, UserRole } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the database.');
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedToolRun(toolName: string, organismId: number, strainId: number, summary: Record<string, unknown>, table: { tableName: string; columns: string[]; rows: Record<string, unknown>[] }) {
  const existing = await prisma.toolRun.findFirst({
    where: { organismId, strainId, toolName },
  });

  if (existing) {
    return existing;
  }

  return prisma.toolRun.create({
    data: {
      organismId,
      strainId,
      toolName,
      status: ToolRunStatus.COMPLETED,
      version: 'demo-import',
      finishedAt: new Date(),
      summary: summary as Prisma.InputJsonValue,
      tables: {
        create: {
          tableName: table.tableName,
          columns: table.columns as Prisma.InputJsonValue,
          rows: table.rows as Prisma.InputJsonValue,
        },
      },
      files: {
        create: {
          fileName: `${toolName}.tsv`,
          fileType: 'tsv',
          filePath: `/demo-results/${organismId}/${toolName}/${toolName}.tsv`,
          description: `${toolName} example raw output placeholder`,
        },
      },
    },
  });
}

async function ensureDemoToolRuns(organismId: number, strainId: number) {
  const existingCount = await prisma.toolRun.count({ where: { organismId } });
  if (existingCount > 0) {
    console.log('✅ Generic organism result records already present');
    return;
  }

  await seedToolRun(
    'abricate',
    organismId,
    strainId,
    { total_hits: 3, unique_genes: 3, database_counts: { card: 2, vfdb: 1 } },
    {
      tableName: 'AMR/VF/plasmid hits',
      columns: ['gene', 'database', 'identity', 'coverage', 'contig', 'start', 'end', 'product'],
      rows: [
        { gene: 'blaPAO', database: 'card', identity: 100, coverage: 99.2, contig: 'contig_001', start: 4211, end: 5122, product: 'Beta-lactamase' },
        { gene: 'catB7', database: 'card', identity: 98.5, coverage: 96.1, contig: 'contig_018', start: 8801, end: 9480, product: 'Chloramphenicol acetyltransferase' },
      ],
    }
  );

  await seedToolRun(
    'quast',
    organismId,
    strainId,
    { contigs: 142, total_length: 6260000, largest_contig: 312400, n50: 87400, l50: 18, gc_percent: 66.6 },
    {
      tableName: 'Assembly metrics',
      columns: ['metric', 'value'],
      rows: [
        { metric: 'N50', value: 87400 },
        { metric: 'L50', value: 18 },
        { metric: 'Total length', value: 6260000 },
      ],
    }
  );

  await seedToolRun(
    'checkm',
    organismId,
    strainId,
    { completeness: 99.2, contamination: 0.4, strain_heterogeneity: 0, lineage: 'Pseudomonadaceae' },
    {
      tableName: 'Genome quality',
      columns: ['metric', 'value'],
      rows: [
        { metric: 'Completeness', value: '99.2%' },
        { metric: 'Contamination', value: '0.4%' },
        { metric: 'Lineage', value: 'Pseudomonadaceae' },
      ],
    }
  );

  console.log('✅ Generic organism result records seeded');
}

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Ensure the demo login exists.
  console.log('👤 Ensuring demo user exists...');
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@genomics.com' },
    update: {
      password: hashedPassword,
      name: 'System Admin',
      role: UserRole.RESEARCHER,
    },
    create: {
      email: 'admin@genomics.com',
      password: hashedPassword,
      name: 'System Admin',
      role: UserRole.RESEARCHER,
    },
  });
  console.log(`✅ Demo login ready: ${adminUser.email} | Password: admin123`);

  // 2. Ensure the base organism exists.
  const organism = await prisma.organism.upsert({
    where: { scientificName: 'Pseudomonas aeruginosa' },
    update: {
      domain: 'Bacteria',
      phylum: 'Pseudomonadota',
      className: 'Gammaproteobacteria',
      orderName: 'Pseudomonadales',
      family: 'Pseudomonadaceae',
      genus: 'Pseudomonas',
      species: 'aeruginosa',
      taxonomyId: 287,
      description: 'A Gram-negative, strictly aerobic, encapsulated, uniflagellated bacterium that acts as an opportunistic human pathogen.',
    },
    create: {
      scientificName: 'Pseudomonas aeruginosa',
      domain: 'Bacteria',
      phylum: 'Pseudomonadota',
      className: 'Gammaproteobacteria',
      orderName: 'Pseudomonadales',
      family: 'Pseudomonadaceae',
      genus: 'Pseudomonas',
      species: 'aeruginosa',
      taxonomyId: 287,
      description: 'A Gram-negative, strictly aerobic, encapsulated, uniflagellated bacterium that acts as an opportunistic human pathogen.',
    },
  });
  console.log(`✅ Organism ready: ${organism.scientificName}`);

  // 3. Ensure the specific strain exists.
  const existingStrain = await prisma.strain.findFirst({
    where: {
      organismId: organism.id,
      strainName: 'PAO1',
    },
  });

  const strainData = {
    organismId: organism.id,
    strainName: 'PAO1',
    sourceType: 'Clinical',
    host: 'Homo sapiens',
    country: 'India',
    city: 'Chennai',
    latitude: 13.0827,
    longitude: 80.2707,
    genomeSize: 6264404,
    gcContent: 66.6,
  };

  const strain = existingStrain
    ? await prisma.strain.update({
        where: { id: existingStrain.id },
        data: strainData,
      })
    : await prisma.strain.create({ data: strainData });
  console.log(`✅ Strain ready: ${strain.strainName}`);
  await ensureDemoToolRuns(organism.id, strain.id);

  // 4. Ensure AMR alerts exist without duplicating them on every seed.
  const amrCount = await prisma.amrGene.count({ where: { strainId: strain.id } });
  if (amrCount === 0) {
    await prisma.amrGene.createMany({
      data: [
        { strainId: strain.id, geneSymbol: 'blaPAO', drugClass: 'Beta-lactam', identity: 100.0 },
        { strainId: strain.id, geneSymbol: 'aph(3\')-IIb', drugClass: 'Aminoglycoside', identity: 99.8 },
        { strainId: strain.id, geneSymbol: 'catB7', drugClass: 'Phenicol', identity: 98.5 }
      ]
    });
    console.log(`✅ AMR genes ready`);
  } else {
    console.log(`✅ AMR genes already present`);
  }

  // 5. Generate Analysis Runs for all 20 Tools only when absent.
  const analysisRunCount = await prisma.analysisRun.count({ where: { strainId: strain.id } });
  if (analysisRunCount > 0) {
    console.log(`✅ Pipeline results already present`);
    return;
  }

  console.log('⚙️ Simulating Bioinformatics Pipeline Results...');

  // Quality Control
  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_WGS_Run',
      fastqc: { create: { totalReads: 3793480, gcContent: 66.6, q30Rate: 93.2, duplicationRate: 14.3, adapterContentStatus: 'PASS' } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_WGS_Run',
      fastp: { create: { readsBeforeFiltering: 3793480, readsAfterFiltering: 3691594, q20Rate: 97.4, q30Rate: 93.2, duplicationRate: 4.3, insertSizePeakBp: 271 } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_WGS_Run',
      multiqc: { create: { samplesAnalysed: 2, avgSequenceLengthBp: 151, duplicatesR1: 14.3, failedModules: 0 } }
    }
  });

  // Assembly
  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Assembly',
      spades: { create: { totalContigs: 142, largestContigKb: 312.4, n50Kb: 87.4, totalLengthMb: 6.26, coverageX: 98.2, peakMemoryGb: 4.2 } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Assembly',
      quast: { create: { n50Kb: 87.4, l50: 18, genomeFraction: 98.7, mismatchesPer100Kb: 0.42, largestContigKb: 312.4, duplicationRatio: 1.002 } }
    }
  });

  // Quality Assessment
  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Quality',
      busco: { create: { completePercent: 98.8, singleCopyPercent: 98.2, duplicatedPercent: 0.6, fragmentedPercent: 0.2, missingPercent: 1.0, lineage: 'pseudomonadales_odb10' } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Quality',
      checkm: { create: { completeness: 99.2, contamination: 0.4, strainHeterogeneity: 0.0, qualityScore: 98.8, markerGenes: 1222, lineage: 'Pseudomonadaceae' } }
    }
  });

  // Annotation
  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Annotation',
      prokka: { create: { cdsCount: 5570, rrnaGenes: 4, trnaGenes: 63, hypotheticalProteins: 812, codingDensity: 89.4, pseudogenes: 12 } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Annotation',
      diamond: { create: { queriesAligned: 5570, percentAligned: 99.1, databaseName: 'UniRef90', avgIdentity: 96.2, evalueCutoff: '1e-5', unalignedQueries: 50 } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Annotation',
      kofamkoala: { create: { genesAnnotated: 4890, keggPathways: 210, koCoverage: 87.8, topPathway: 'Metabolic pathways' } }
    }
  });

  // Specialized Analytics
  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_AMR',
      abricate: { create: { genesFound: 3, minCoverage: 95.0, minIdentity: 98.0, topHit: 'blaPAO', virulenceGenes: 24 } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Typing',
      mlst: { create: { scheme: 'paeruginosa', sequenceType: 'ST274', allelesMatched: '7/7', confidence: 100.0, clonalComplex: 'CC274' } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Genomics',
      islandPath: { create: { gisDetected: 14, totalGiLengthKb: 280.5, amrIsland: true, amrGene: 'blaPAO' } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Genomics',
      trnascan: { create: { trnasFound: 63, aminoAcidTypes: 20, pseudoTrnas: 1, anticodons: 40, modelType: 'Bacterial' } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Genomics',
      hmmer: { create: { domainsFound: 6102, pfamHits: 5800, avgEvalue: '1.2e-25', novelDomains: 2 } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_CRISPR',
      minced: { create: { crisprArrays: 2, totalSpacers: 34, repeatLengthBp: 29, phageMatches: 8 } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Kmers',
      jellyfish: { create: { kmerSize: 21, distinctKmersMillion: 6.1, totalKmersBillion: 3.2, peakFrequencyX: 60.5, repeatContent: 8.2 } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Repeats',
      trf: { create: { tandemRepeats: 420, totalLengthKb: 55.2, maxCopy: 32.5, avgPeriodSizeBp: 15 } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_Genomics',
      barrnap: { create: { totalRrna: 4, rrna16S: 1, rrna23S: 1, rrna5S: 2, taxonomy: 'Bacteria' } }
    }
  });

  await prisma.analysisRun.create({
    data: {
      strainId: strain.id, sampleName: 'PAO1_BGC',
      antismash: { create: { bgcRegions: 5, bgcTypes: 'NRPS, phenazine, bacteriocin', novelBgcs: 1, mibigMatches: 2 } }
    }
  });

  console.log('✅ Pipeline Results Seeded Successfully!');
  console.log('🚀 Ready for Dashboard Inspection.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
