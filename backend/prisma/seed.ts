import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Clean existing data to prevent duplicates on re-seeding
  console.log('🧹 Cleaning existing data...');
  await prisma.user.deleteMany({});
  await prisma.analysisRun.deleteMany({});
  await prisma.amrGene.deleteMany({});
  await prisma.strain.deleteMany({});
  await prisma.organism.deleteMany({});

  // 2. Create the Admin User for Login
  console.log('👤 Creating admin user...');
  const hashedPassword = await bcrypt.hash('admin123', 10);
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@genomics.com',
      password: hashedPassword,
      name: 'System Admin',
      // role: 'ADMIN' // Uncomment if your schema has a role field
    }
  });
  console.log(`✅ Created User: ${adminUser.email} | Password: admin123`);

  // 3. Create the Base Organism
  const organism = await prisma.organism.create({
    data: {
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
    }
  });
  console.log(`✅ Created Organism: ${organism.scientificName}`);

  // 4. Create the Specific Strain (PAO1)
  const strain = await prisma.strain.create({
    data: {
      organismId: organism.id,
      strainName: 'PAO1',
      sourceType: 'Clinical',
      host: 'Homo sapiens',
      country: 'India',
      city: 'Chennai',
      latitude: 13.0827,
      longitude: 80.2707,
      genomeSize: 6264404, // ~6.2 Mb
      gcContent: 66.6,
      createdAt: new Date(),
    }
  });
  console.log(`✅ Created Strain: ${strain.strainName}`);

  // 5. Inject AMR Genes (Alerts for the Dashboard)
  await prisma.amrGene.createMany({
    data: [
      { strainId: strain.id, geneSymbol: 'blaPAO', drugClass: 'Beta-lactam', identity: 100.0 },
      { strainId: strain.id, geneSymbol: 'aph(3\')-IIb', drugClass: 'Aminoglycoside', identity: 99.8 },
      { strainId: strain.id, geneSymbol: 'catB7', drugClass: 'Phenicol', identity: 98.5 }
    ]
  });
  console.log(`✅ Injected AMR Genes`);

  // 6. Generate Analysis Runs for all 20 Tools
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