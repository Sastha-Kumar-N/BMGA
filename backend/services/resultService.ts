import { Prisma, PrismaClient, ToolRunStatus } from "@prisma/client";
import { TOOL_DEFINITIONS, TOOL_KEYS, getToolDefinition, normalizeToolName } from "./resultsParsers/toolDefinitions";
import { NormalizedStatus } from "./resultsParsers/parserTypes";

type JsonMap = Record<string, unknown>;

type ResultTable = {
  tableName: string;
  columns: string[];
  rows: JsonMap[];
};

type ResultFile = {
  id?: number;
  fileName: string;
  fileType?: string | null;
  description?: string | null;
  downloadPath?: string;
};

type ToolResult = {
  toolName: string;
  displayName: string;
  category: string;
  description: string;
  status: NormalizedStatus;
  version?: string | null;
  runDate?: Date | null;
  summary: JsonMap;
  tables: ResultTable[];
  files: ResultFile[];
  warnings: unknown[];
  errors: unknown[];
};

const LEGACY_RESULT_FIELDS = [
  "fastqc",
  "fastp",
  "multiqc",
  "spades",
  "quast",
  "busco",
  "checkm",
  "prokka",
  "diamond",
  "kofamkoala",
  "abricate",
  "mlst",
  "islandPath",
  "trnascan",
  "hmmer",
  "minced",
  "jellyfish",
  "trf",
  "barrnap",
  "antismash",
] as const;

function statusToApiStatus(status?: ToolRunStatus | string | null): NormalizedStatus {
  const normalized = String(status || "NOT_AVAILABLE").toLowerCase();
  if (normalized === "not_available") return "not_available";
  if (normalized === "completed") return "completed";
  if (normalized === "failed") return "failed";
  if (normalized === "pending") return "pending";
  if (normalized === "warning") return "warning";
  if (normalized === "partial") return "partial";
  return "not_available";
}

function apiToDbStatus(status: NormalizedStatus): ToolRunStatus {
  const map: Record<NormalizedStatus, ToolRunStatus> = {
    completed: ToolRunStatus.COMPLETED,
    failed: ToolRunStatus.FAILED,
    pending: ToolRunStatus.PENDING,
    not_available: ToolRunStatus.NOT_AVAILABLE,
    warning: ToolRunStatus.WARNING,
    partial: ToolRunStatus.PARTIAL,
  };

  return map[status];
}

function cleanSummary(summary: JsonMap) {
  return Object.fromEntries(
    Object.entries(summary).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
}

function valueOrNA(value: unknown) {
  return value === null || value === undefined || value === "" ? "N/A" : value;
}

function metricRows(summary: JsonMap) {
  return Object.entries(summary).map(([metric, value]) => ({
    metric,
    value: valueOrNA(value),
  }));
}

function metricTable(summary: JsonMap): ResultTable {
  return {
    tableName: "Summary metrics",
    columns: ["metric", "value"],
    rows: metricRows(summary),
  };
}

function emptyTool(toolName: string): ToolResult {
  const definition = getToolDefinition(toolName) || {
    key: toolName,
    label: toolName,
    category: "Pipeline",
    description: "Pipeline result",
  };

  return {
    toolName: definition.key,
    displayName: definition.label,
    category: definition.category,
    description: definition.description,
    status: "not_available",
    summary: {},
    tables: [],
    files: [],
    warnings: [],
    errors: [],
  };
}

function completedTool(toolName: string, summary: JsonMap, runDate?: Date | null, tables?: ResultTable[]): ToolResult {
  const base = emptyTool(toolName);
  const clean = cleanSummary(summary);

  return {
    ...base,
    status: "completed",
    runDate,
    summary: clean,
    tables: tables?.length ? tables : [metricTable(clean)],
  };
}

function qualityStatus(completeness?: number | null, contamination?: number | null): NormalizedStatus {
  if (typeof completeness === "number" && completeness < 90) return "warning";
  if (typeof contamination === "number" && contamination > 5) return "warning";
  return "completed";
}

function tableFromJson(table: any): ResultTable {
  const rows = Array.isArray(table.rows) ? table.rows : [];
  const firstRow = rows[0] || {};
  const columns = Array.isArray(table.columns) && table.columns.length
    ? table.columns.map(String)
    : Object.keys(firstRow);

  return {
    tableName: table.tableName,
    columns,
    rows,
  };
}

function genericToolToApi(run: any): ToolResult {
  const key = normalizeToolName(run.toolName);
  const base = emptyTool(key);

  return {
    ...base,
    status: statusToApiStatus(run.status),
    version: run.version,
    runDate: run.finishedAt || run.updatedAt || run.createdAt,
    summary: (run.summary || {}) as JsonMap,
    warnings: Array.isArray(run.warnings) ? run.warnings : run.warnings ? [run.warnings] : [],
    errors: Array.isArray(run.errors) ? run.errors : run.errors ? [run.errors] : [],
    tables: (run.tables || []).map(tableFromJson),
    files: (run.files || []).map((file: any) => ({
      id: file.id,
      fileName: file.fileName,
      fileType: file.fileType,
      description: file.description,
      downloadPath: `/organisms/${run.organismId}/downloads/${key}/${file.id}`,
    })),
  };
}

function legacyToolFromRun(run: any, field: string): ToolResult | null {
  const result = run[field];
  if (!result) return null;

  const runDate = run.updatedAt || run.createdAt;

  switch (field) {
    case "fastqc":
      return completedTool("fastqc", {
        total_reads: result.totalReads,
        gc_percent: result.gcContent,
        q30_rate: result.q30Rate,
        duplication_rate: result.duplicationRate,
        adapter_content_status: result.adapterContentStatus,
      }, runDate, [{
        tableName: "FastQC modules",
        columns: ["module", "status", "value"],
        rows: [
          { module: "Basic statistics", status: "PASS", value: result.totalReads },
          { module: "Per sequence GC content", status: "PASS", value: result.gcContent },
          { module: "Adapter content", status: result.adapterContentStatus || "N/A", value: result.adapterContentStatus },
        ],
      }]);
    case "fastp":
      return completedTool("fastp", {
        reads_before_filtering: result.readsBeforeFiltering,
        reads_after_filtering: result.readsAfterFiltering,
        q20_rate: result.q20Rate,
        q30_rate: result.q30Rate,
        duplication_rate: result.duplicationRate,
        insert_size_peak_bp: result.insertSizePeakBp,
      }, runDate);
    case "multiqc":
      return completedTool("multiqc", {
        samples_analysed: result.samplesAnalysed,
        average_sequence_length_bp: result.avgSequenceLengthBp,
        gc_percent: result.gcContent,
        duplicates_r1: result.duplicatesR1,
        duplicates_r2: result.duplicatesR2,
        failed_modules: result.failedModules,
      }, runDate);
    case "spades":
      return completedTool("spades", {
        contigs_generated: result.totalContigs,
        largest_contig_kb: result.largestContigKb,
        n50_kb: result.n50Kb,
        total_length_mb: result.totalLengthMb,
        coverage_x: result.coverageX,
        peak_memory_gb: result.peakMemoryGb,
      }, runDate);
    case "quast":
      return completedTool("quast", {
        n50_kb: result.n50Kb,
        l50: result.l50,
        genome_fraction: result.genomeFraction,
        mismatches_per_100kb: result.mismatchesPer100Kb,
        largest_contig_kb: result.largestContigKb,
        duplication_ratio: result.duplicationRatio,
      }, runDate);
    case "busco":
      return completedTool("busco", {
        complete_percent: result.completePercent,
        single_copy_percent: result.singleCopyPercent,
        duplicated_percent: result.duplicatedPercent,
        fragmented_percent: result.fragmentedPercent,
        missing_percent: result.missingPercent,
        lineage: result.lineage,
      }, runDate);
    case "checkm": {
      const tool = completedTool("checkm", {
        completeness: result.completeness,
        contamination: result.contamination,
        strain_heterogeneity: result.strainHeterogeneity,
        quality_score: result.qualityScore,
        marker_genes: result.markerGenes,
        lineage: result.lineage,
      }, runDate);
      return { ...tool, status: qualityStatus(result.completeness, result.contamination) };
    }
    case "prokka":
      return completedTool("prokka", {
        cds_count: result.cdsCount,
        rrna_genes: result.rrnaGenes,
        trna_genes: result.trnaGenes,
        hypothetical_proteins: result.hypotheticalProteins,
        coding_density: result.codingDensity,
        pseudogenes: result.pseudogenes,
      }, runDate);
    case "diamond":
      return completedTool("diamond", {
        queries_aligned: result.queriesAligned,
        percent_aligned: result.percentAligned,
        database_name: result.databaseName,
        average_identity: result.avgIdentity,
        evalue_cutoff: result.evalueCutoff,
        unaligned_queries: result.unalignedQueries,
      }, runDate);
    case "kofamkoala":
      return completedTool("kofam", {
        genes_annotated: result.genesAnnotated,
        kegg_pathways: result.keggPathways,
        ko_coverage: result.koCoverage,
        average_hmm_score: result.avgHmmScore,
        db_release: result.dbRelease,
        top_pathway: result.topPathway,
      }, runDate);
    case "abricate":
      return completedTool("abricate", {
        total_hits: result.genesFound,
        min_coverage: result.minCoverage,
        min_identity: result.minIdentity,
        top_hit: result.topHit,
        virulence_genes: result.virulenceGenes,
        plasmid_genes: result.plasmidGenes,
      }, runDate, [{
        tableName: "AMR/VF/plasmid hits",
        columns: ["gene", "database", "identity", "coverage", "contig", "start", "end", "product"],
        rows: [{
          gene: result.topHit || "N/A",
          database: "legacy-summary",
          identity: result.minIdentity,
          coverage: result.minCoverage,
          contig: "N/A",
          start: "N/A",
          end: "N/A",
          product: "Imported summary hit",
        }],
      }]);
    case "mlst":
      return completedTool("rnlst", {
        scheme: result.scheme,
        assigned_profile: result.sequenceType,
        alleles_matched: result.allelesMatched,
        confidence: result.confidence,
        clonal_complex: result.clonalComplex,
        pandemic_lineage: result.pandemicLineage,
      }, runDate);
    case "islandPath":
      return completedTool("islandpath", {
        islands_detected: result.gisDetected,
        total_island_length_kb: result.totalGiLengthKb,
        average_island_length_kb: result.avgGiLengthKb,
        linked_genes: result.giLinkedGenes,
        amr_island: result.amrIsland,
        amr_gene: result.amrGene,
      }, runDate);
    case "trnascan":
      return completedTool("trnascan", {
        total_trnas: result.trnasFound,
        amino_acid_types: result.aminoAcidTypes,
        pseudo_trnas: result.pseudoTrnas,
        anticodons: result.anticodons,
        hotspots: result.hotspots,
        model_type: result.modelType,
      }, runDate);
    case "hmmer":
      return completedTool("hmmer", {
        total_domain_hits: result.domainsFound,
        pfam_hits: result.pfamHits,
        tigrfam_hits: result.tigrfamHits,
        average_evalue: result.avgEvalue,
        databases: result.databases,
        novel_domains: result.novelDomains,
      }, runDate);
    case "minced":
      return completedTool("minced", {
        crispr_arrays: result.crisprArrays,
        total_spacers: result.totalSpacers,
        repeat_length_bp: result.repeatLengthBp,
        spacer_length_bp: result.spacerLengthBp,
        phage_matches: result.phageMatches,
        arrays_on_contigs: result.arraysOnContigs,
      }, runDate);
    case "jellyfish":
      return completedTool("jellyfish", {
        kmer_size: result.kmerSize,
        distinct_kmers_million: result.distinctKmersMillion,
        total_kmers_billion: result.totalKmersBillion,
        peak_frequency_x: result.peakFrequencyX,
        genome_size_mb: result.genomeSizeMb,
        repeat_content: result.repeatContent,
      }, runDate);
    case "trf":
      return completedTool("trf", {
        tandem_repeats: result.tandemRepeats,
        total_length_kb: result.totalLengthKb,
        genome_fraction: result.genomeFraction,
        average_period_size_bp: result.avgPeriodSizeBp,
        max_copy: result.maxCopy,
        phase_variation_loci: result.phaseVariationLoci,
      }, runDate);
    case "barrnap":
      return completedTool("barrnap", {
        rrna_16s: result.rrna16S,
        rrna_23s: result.rrna23S,
        rrna_5s: result.rrna5S,
        total_rrna: result.totalRrna,
        evalue_cutoff: result.evalueCutoff,
        taxonomy: result.taxonomy,
      }, runDate);
    case "antismash":
      return completedTool("antismash", {
        bgc_regions: result.bgcRegions,
        bgc_types: result.bgcTypes,
        mibig_matches: result.mibigMatches,
        novel_bgcs: result.novelBgcs,
        mibig_hit: result.mibigHit,
        database_name: result.databaseName,
      }, runDate);
    default:
      return null;
  }
}

function choosePrimaryStrain(strains: any[]) {
  return strains[0] || null;
}

function findFirstLegacyResult(strains: any[], field: string) {
  for (const strain of strains) {
    for (const run of strain.analysisRuns || []) {
      if (run[field]) {
        return run[field];
      }
    }
  }
  return null;
}

function getOrganismSummary(organism: any, tools: Record<string, ToolResult>) {
  const primaryStrain = choosePrimaryStrain(organism.strains || []);
  const primaryAssembly = primaryStrain?.assemblies?.[0];
  const quast = tools.quast?.summary || {};
  const spades = tools.spades?.summary || {};
  const checkm = tools.checkm?.summary || {};
  const busco = tools.busco?.summary || {};
  const prokka = tools.prokka?.summary || {};
  const barrnap = tools.barrnap?.summary || {};
  const trnascan = tools.trnascan?.summary || {};
  const minced = tools.minced?.summary || {};
  const antismash = tools.antismash?.summary || {};
  const kofam = tools.kofam?.summary || {};
  const hmmer = tools.hmmer?.summary || {};
  const abricate = tools.abricate?.summary || {};

  return cleanSummary({
    genome_size: primaryStrain?.genomeSize || primaryAssembly?.totalLength || Number(spades.total_length_mb || 0) * 1_000_000 || undefined,
    gc_percent: primaryStrain?.gcContent ? Number(primaryStrain.gcContent) : quast.gc_percent,
    contig_count: primaryAssembly?.contigCount || spades.contigs_generated,
    n50: primaryAssembly?.n50 || (typeof quast.n50_kb === "number" ? quast.n50_kb * 1000 : undefined),
    assembly_level: primaryAssembly?.assemblyLevel || primaryStrain?.genomeStatus,
    completeness: checkm.completeness || busco.complete_percent,
    contamination: checkm.contamination,
    cds_count: prokka.cds_count,
    trna_count: prokka.trna_genes || trnascan.total_trnas,
    rrna_count: prokka.rrna_genes || barrnap.total_rrna,
    amr_gene_count: primaryStrain?._count?.amrGenes || abricate.total_hits,
    crispr_array_count: minced.crispr_arrays,
    biosynthetic_cluster_count: antismash.bgc_regions,
    pathway_hit_count: kofam.kegg_pathways,
    domain_hit_count: hmmer.total_domain_hits,
    virulence_hit_count: abricate.virulence_genes,
  });
}

export async function getOrganismResults(prisma: PrismaClient, organismId: number) {
  const organism = await prisma.organism.findUnique({
    where: { id: organismId },
    include: {
      strains: {
        include: {
          assemblies: { orderBy: { createdAt: "desc" }, take: 1 },
          genomeReferences: {
            where: { status: 'PUBLISHED', isPublic: true },
            select: { kind: true },
          },
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
            },
            orderBy: { createdAt: "desc" },
          },
          _count: { select: { amrGenes: true } },
        },
        orderBy: { createdAt: "desc" },
      },
      toolRuns: {
        include: {
          tables: true,
          files: true,
          strain: true,
        },
        orderBy: [{ finishedAt: "desc" }, { updatedAt: "desc" }],
      },
    },
  });

  if (!organism) {
    return null;
  }

  const tools = TOOL_KEYS.reduce<Record<string, ToolResult>>((acc, toolKey) => {
    acc[toolKey] = emptyTool(toolKey);
    return acc;
  }, {});

  for (const strain of organism.strains) {
    for (const run of strain.analysisRuns || []) {
      for (const field of LEGACY_RESULT_FIELDS) {
        const legacyTool = legacyToolFromRun(run, field);
        if (legacyTool && tools[legacyTool.toolName]?.status === "not_available") {
          tools[legacyTool.toolName] = legacyTool;
        }
      }
    }
  }

  for (const run of organism.toolRuns) {
    const genericTool = genericToolToApi(run);
    tools[genericTool.toolName] = genericTool;
  }

  const primaryStrain = choosePrimaryStrain(organism.strains);

  return {
    organism: {
      id: organism.id,
      name: organism.scientificName,
      displayName: organism.displayName,
      taxonomyId: organism.taxonomyId,
      strain: primaryStrain?.strainName,
      source: primaryStrain?.sourceType,
      assembly_accession: primaryStrain?.assemblyAccession,
      biosample: primaryStrain?.biosampleAccession,
      strains: organism.strains.map((strain: any) => ({
        id: strain.id,
        strainName: strain.strainName,
        assemblyAccession: strain.assemblyAccession,
        biosampleAccession: strain.biosampleAccession,
        sourceType: strain.sourceType,
        city: strain.city,
        country: strain.country,
        referenceKinds: strain.genomeReferences.map((file: { kind: string }) => file.kind),
      })),
    },
    summary: getOrganismSummary(organism, tools),
    tools,
    toolOrder: TOOL_KEYS,
    toolDefinitions: TOOL_DEFINITIONS,
  };
}

export async function getOrganismToolResult(prisma: PrismaClient, organismId: number, toolName: string) {
  const results = await getOrganismResults(prisma, organismId);
  if (!results) return null;

  const normalizedTool = normalizeToolName(toolName);
  return results.tools[normalizedTool] || null;
}

export async function getToolOutputFile(prisma: PrismaClient, organismId: number, toolName: string, fileId: number) {
  const normalizedTool = normalizeToolName(toolName);

  return prisma.toolOutputFile.findFirst({
    where: {
      id: fileId,
      toolRun: {
        organismId,
        toolName: normalizedTool,
      },
    },
  });
}

export async function saveNormalizedToolRun(
  prisma: PrismaClient,
  organismId: number,
  strainId: number | null,
  result: {
    toolName: string;
    status: NormalizedStatus;
    version?: string;
    startedAt?: Date;
    finishedAt?: Date;
    summary: JsonMap;
    tables: { tableName: string; columns: string[]; rows: JsonMap[] }[];
    files: { fileName: string; fileType?: string; filePath: string; description?: string }[];
    warnings: unknown[];
    errors: unknown[];
  }
) {
  const toolName = normalizeToolName(result.toolName);
  const existing = await prisma.toolRun.findFirst({
    where: { organismId, strainId, toolName },
  });

  return prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.toolResultTable.deleteMany({ where: { toolRunId: existing.id } });
      await tx.toolOutputFile.deleteMany({ where: { toolRunId: existing.id } });
    }

    const data = {
      organismId,
      strainId,
      toolName,
      status: apiToDbStatus(result.status),
      version: result.version,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      summary: result.summary as Prisma.InputJsonValue,
      warnings: result.warnings as Prisma.InputJsonValue,
      errors: result.errors as Prisma.InputJsonValue,
      tables: {
        create: result.tables.map((table) => ({
          tableName: table.tableName,
          columns: table.columns as Prisma.InputJsonValue,
          rows: table.rows as Prisma.InputJsonValue,
        })),
      },
      files: {
        create: result.files.map((file) => ({
          fileName: file.fileName,
          fileType: file.fileType,
          filePath: file.filePath,
          description: file.description,
        })),
      },
    };

    return existing
      ? tx.toolRun.update({ where: { id: existing.id }, data })
      : tx.toolRun.create({ data });
  });
}
