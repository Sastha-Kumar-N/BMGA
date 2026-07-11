import {
  EvidenceBasis,
  Prisma,
  PrismaClient,
  SurveillanceScope,
  ToolRunStatus,
} from '@prisma/client';

export type SurveillanceFilters = {
  search?: string;
  organismId?: number;
  country?: string;
  source?: string;
  evidenceBasis?: EvidenceBasis;
  scope?: SurveillanceScope;
  from?: Date;
  to?: Date;
};

type NamedCountRow = {
  label: string;
  count: bigint | number;
};

type TrendCountRow = {
  period: string;
  count: bigint | number;
};

const LOCATION_LIMIT = 2_000;

export function buildSurveillanceStrainWhere(filters: SurveillanceFilters): Prisma.StrainWhereInput {
  const where: Prisma.StrainWhereInput = {};
  const conditions: Prisma.StrainWhereInput[] = [];

  if (filters.organismId) where.organismId = filters.organismId;
  if (filters.country) where.country = { equals: filters.country, mode: 'insensitive' };
  if (filters.source) where.sourceType = { equals: filters.source, mode: 'insensitive' };
  if (filters.evidenceBasis) where.evidenceBasis = filters.evidenceBasis;
  if (filters.scope) where.surveillanceScope = filters.scope;
  if (filters.from || filters.to) {
    where.collectionDate = {
      gte: filters.from,
      lte: filters.to,
    };
  }
  if (filters.search) {
    conditions.push({
      OR: [
        { strainName: { contains: filters.search, mode: 'insensitive' } },
        { isolateName: { contains: filters.search, mode: 'insensitive' } },
        { assemblyAccession: { contains: filters.search, mode: 'insensitive' } },
        { biosampleAccession: { contains: filters.search, mode: 'insensitive' } },
        { country: { contains: filters.search, mode: 'insensitive' } },
        { state: { contains: filters.search, mode: 'insensitive' } },
        { city: { contains: filters.search, mode: 'insensitive' } },
        { organism: { scientificName: { contains: filters.search, mode: 'insensitive' } } },
      ],
    });
  }

  if (conditions.length) where.AND = conditions;
  return where;
}

export async function getSurveillanceOverview(prisma: PrismaClient, filters: SurveillanceFilters) {
  const where = buildSurveillanceStrainWhere(filters);
  const now = new Date();
  const recentThreshold = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000);
  const mappedWhere: Prisma.StrainWhereInput = {
    AND: [where, { latitude: { not: null }, longitude: { not: null } }],
  };
  const datedWhere: Prisma.StrainWhereInput = {
    AND: [where, { collectionDate: { not: null } }],
  };
  const recentWhere: Prisma.StrainWhereInput = {
    AND: [where, { updatedAt: { gte: recentThreshold } }],
  };
  const amrWhere: Prisma.AmrGeneWhereInput = { strain: { is: where } };
  const completedMayaWhere: Prisma.ToolRunWhereInput = {
    status: ToolRunStatus.COMPLETED,
    strain: { is: where },
  };

  const [
    strainCount,
    organismGroups,
    countryGroups,
    mappedCount,
    datedCount,
    recentCount,
    amrCount,
    completedMayaCount,
    sourceGroups,
    evidenceGroups,
    locations,
    latestStrain,
    latestToolRun,
  ] = await Promise.all([
    prisma.strain.count({ where }),
    prisma.strain.groupBy({ by: ['organismId'], where, _count: { _all: true } }),
    prisma.strain.groupBy({
      by: ['country'],
      where: { AND: [where, { country: { not: null } }, { NOT: { country: '' } }] },
      _count: { _all: true },
      orderBy: { _count: { country: 'desc' } },
    }),
    prisma.strain.count({ where: mappedWhere }),
    prisma.strain.count({ where: datedWhere }),
    prisma.strain.count({ where: recentWhere }),
    prisma.amrGene.count({ where: amrWhere }),
    prisma.toolRun.count({ where: completedMayaWhere }),
    prisma.strain.groupBy({
      by: ['sourceType'],
      where,
      _count: { _all: true },
      orderBy: { _count: { sourceType: 'desc' } },
    }),
    prisma.strain.groupBy({
      by: ['evidenceBasis'],
      where,
      _count: { _all: true },
      orderBy: { _count: { evidenceBasis: 'desc' } },
    }),
    prisma.strain.findMany({
      where: mappedWhere,
      orderBy: { updatedAt: 'desc' },
      take: LOCATION_LIMIT,
      select: {
        id: true,
        organismId: true,
        strainName: true,
        country: true,
        state: true,
        city: true,
        sourceType: true,
        latitude: true,
        longitude: true,
        collectionDate: true,
        evidenceBasis: true,
        updatedAt: true,
        organism: { select: { scientificName: true } },
        _count: { select: { amrGenes: true, toolRuns: true } },
      },
    }),
    prisma.strain.findFirst({ where, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } }),
    prisma.toolRun.findFirst({
      where: { strain: { is: where } },
      orderBy: [{ finishedAt: 'desc' }, { updatedAt: 'desc' }],
      select: { finishedAt: true, updatedAt: true },
    }),
  ]);

  const latestToolDate = latestToolRun?.finishedAt || latestToolRun?.updatedAt;
  const dataThrough = [latestStrain?.updatedAt, latestToolDate]
    .filter((value): value is Date => value instanceof Date)
    .sort((left, right) => right.getTime() - left.getTime())[0] || null;

  return {
    generatedAt: now.toISOString(),
    dataThrough: dataThrough?.toISOString() || null,
    refreshIntervalSeconds: 60,
    metrics: {
      approvedStrains: strainCount,
      organismsTracked: organismGroups.length,
      countriesRepresented: countryGroups.length,
      genotypicAmrDetections: amrCount,
      completedMayaRuns: completedMayaCount,
    },
    quality: {
      collectionDateCoveragePercent: percentage(datedCount, strainCount),
      geolocationCoveragePercent: percentage(mappedCount, strainCount),
      recordsUpdatedIn30Days: recentCount,
      recordsUpdatedIn30DaysPercent: percentage(recentCount, strainCount),
    },
    sources: sourceGroups.map((row) => ({
      label: row.sourceType || 'Not reported',
      count: row._count._all,
    })),
    evidence: evidenceGroups.map((row) => ({
      basis: row.evidenceBasis,
      count: row._count._all,
    })),
    countries: countryGroups.map((row) => ({
      country: row.country || 'Not reported',
      count: row._count._all,
    })),
    locations: locations.map((strain) => ({
      id: strain.id,
      organismId: strain.organismId,
      organismName: strain.organism.scientificName,
      strainName: strain.strainName,
      country: strain.country,
      state: strain.state,
      city: strain.city,
      sourceType: strain.sourceType,
      latitude: strain.latitude,
      longitude: strain.longitude,
      collectionDate: strain.collectionDate,
      evidenceBasis: strain.evidenceBasis,
      updatedAt: strain.updatedAt,
      amrDetectionCount: strain._count.amrGenes,
      mayaRunCount: strain._count.toolRuns,
    })),
    locationResultLimit: LOCATION_LIMIT,
    locationsTruncated: mappedCount > locations.length,
    limitations: [
      'Summaries reflect approved records submitted to BMGA and may not represent population prevalence.',
      'MAYA and AMR pipeline detections are genotypic evidence unless a record explicitly includes linked phenotypic evidence.',
      'Individual AMR detection counts include normalized gene-level records; aggregate-only MAYA outputs remain visible as completed runs.',
    ],
  };
}

export async function getSurveillanceFilterOptions(prisma: PrismaClient) {
  const [organisms, countries, sources] = await Promise.all([
    prisma.organism.findMany({
      where: { strains: { some: {} } },
      orderBy: { scientificName: 'asc' },
      select: { id: true, scientificName: true, displayName: true },
    }),
    prisma.strain.groupBy({
      by: ['country'],
      where: { country: { not: null }, NOT: { country: '' } },
      _count: { _all: true },
      orderBy: { country: 'asc' },
    }),
    prisma.strain.groupBy({
      by: ['sourceType'],
      where: { sourceType: { not: null }, NOT: { sourceType: '' } },
      _count: { _all: true },
      orderBy: { sourceType: 'asc' },
    }),
  ]);

  return {
    organisms,
    countries: countries.map((row) => ({ value: row.country || '', count: row._count._all })),
    sources: sources.map((row) => ({ value: row.sourceType || '', count: row._count._all })),
    evidenceBasis: Object.values(EvidenceBasis),
    scopes: Object.values(SurveillanceScope),
  };
}

export async function getSurveillanceRecords(
  prisma: PrismaClient,
  filters: SurveillanceFilters,
  page: number,
  pageSize: number,
) {
  const where = buildSurveillanceStrainWhere(filters);
  const skip = (page - 1) * pageSize;
  const [total, records] = await Promise.all([
    prisma.strain.count({ where }),
    prisma.strain.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        organismId: true,
        strainName: true,
        isolateName: true,
        assemblyAccession: true,
        biosampleAccession: true,
        sourceType: true,
        host: true,
        country: true,
        state: true,
        city: true,
        collectionDate: true,
        latitude: true,
        longitude: true,
        surveillanceScope: true,
        evidenceBasis: true,
        submittingInstitution: true,
        dataSource: true,
        dataUseLimitations: true,
        lastVerifiedAt: true,
        createdAt: true,
        updatedAt: true,
        organism: { select: { scientificName: true, displayName: true, taxonomyId: true } },
        toolRuns: {
          orderBy: [{ finishedAt: 'desc' }, { updatedAt: 'desc' }],
          take: 4,
          select: { id: true, toolName: true, status: true, finishedAt: true, updatedAt: true },
        },
        _count: { select: { amrGenes: true, toolRuns: true } },
      },
    }),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    records: records.map((record) => ({
      ...record,
      amrDetectionCount: record._count.amrGenes,
      mayaRunCount: record._count.toolRuns,
      latestMayaStatus: record.toolRuns[0]?.status || 'NOT_AVAILABLE',
      latestMayaUpdatedAt: record.toolRuns[0]?.finishedAt || record.toolRuns[0]?.updatedAt || null,
      _count: undefined,
    })),
  };
}

export async function getAmrSurveillanceInsights(prisma: PrismaClient, filters: SurveillanceFilters) {
  const sqlWhere = surveillanceSqlWhere(filters);
  const [total, topGenes, drugClasses, countries, trend, evidence] = await Promise.all([
    prisma.amrGene.count({ where: { strain: { is: buildSurveillanceStrainWhere(filters) } } }),
    prisma.$queryRaw<NamedCountRow[]>(Prisma.sql`
      SELECT COALESCE(NULLIF(a."geneSymbol", ''), 'Not reported') AS label, COUNT(*)::int AS count
      FROM "AmrGene" a
      JOIN "Strain" s ON s.id = a."strainId"
      JOIN "Organism" o ON o.id = s."organismId"
      WHERE ${sqlWhere}
      GROUP BY label
      ORDER BY count DESC, label ASC
      LIMIT 12
    `),
    prisma.$queryRaw<NamedCountRow[]>(Prisma.sql`
      SELECT COALESCE(NULLIF(a."drugClass", ''), 'Not reported') AS label, COUNT(*)::int AS count
      FROM "AmrGene" a
      JOIN "Strain" s ON s.id = a."strainId"
      JOIN "Organism" o ON o.id = s."organismId"
      WHERE ${sqlWhere}
      GROUP BY label
      ORDER BY count DESC, label ASC
      LIMIT 12
    `),
    prisma.$queryRaw<NamedCountRow[]>(Prisma.sql`
      SELECT COALESCE(NULLIF(s.country, ''), 'Not reported') AS label, COUNT(*)::int AS count
      FROM "AmrGene" a
      JOIN "Strain" s ON s.id = a."strainId"
      JOIN "Organism" o ON o.id = s."organismId"
      WHERE ${sqlWhere}
      GROUP BY label
      ORDER BY count DESC, label ASC
      LIMIT 12
    `),
    prisma.$queryRaw<TrendCountRow[]>(Prisma.sql`
      SELECT TO_CHAR(DATE_TRUNC('month', a."createdAt"), 'YYYY-MM') AS period, COUNT(*)::int AS count
      FROM "AmrGene" a
      JOIN "Strain" s ON s.id = a."strainId"
      JOIN "Organism" o ON o.id = s."organismId"
      WHERE ${sqlWhere}
      GROUP BY DATE_TRUNC('month', a."createdAt")
      ORDER BY DATE_TRUNC('month', a."createdAt") ASC
    `),
    prisma.$queryRaw<NamedCountRow[]>(Prisma.sql`
      SELECT a."evidenceBasis"::text AS label, COUNT(*)::int AS count
      FROM "AmrGene" a
      JOIN "Strain" s ON s.id = a."strainId"
      JOIN "Organism" o ON o.id = s."organismId"
      WHERE ${sqlWhere}
      GROUP BY a."evidenceBasis"
      ORDER BY count DESC
    `),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    totalDetections: total,
    topGenes: normalizeCountRows(topGenes),
    drugClasses: normalizeCountRows(drugClasses),
    countries: normalizeCountRows(countries),
    trend: trend.map((row) => ({ period: row.period, count: Number(row.count) })),
    evidence: normalizeCountRows(evidence),
    interpretation: {
      primaryEvidence: 'GENOTYPIC',
      statement: 'MAYA pipeline detections indicate genetic determinants associated with resistance. They do not by themselves confirm phenotypic susceptibility or treatment outcome.',
      phenotypicAvailability: evidence.some((row) => row.label === EvidenceBasis.PHENOTYPIC || row.label === EvidenceBasis.COMBINED),
    },
  };
}

export async function syncAmrGenesFromToolRows(
  prisma: PrismaClient,
  toolRunId: number,
  strainId: number | null,
  toolName: string,
  rows: Record<string, unknown>[],
) {
  if (!strainId || toolName.toLowerCase() !== 'abricate') return 0;

  const detections = rows.flatMap((row) => {
    const normalized = normalizeRow(row);
    const geneSymbol = firstText(normalized, ['gene', 'gene_symbol', 'genesymbol', 'resistance_gene', '#gene']);
    if (!geneSymbol) return [];

    return [{
      strainId,
      toolRunId,
      geneSymbol,
      drugClass: firstText(normalized, ['drug_class', 'drugclass', 'class']),
      drugName: firstText(normalized, ['drug', 'antibiotic', 'antimicrobial']),
      resistanceMechanism: firstText(normalized, ['resistance_mechanism', 'mechanism']),
      identity: firstNumber(normalized, ['identity', '%identity', 'percent_identity']),
      coverage: firstNumber(normalized, ['coverage', '%coverage', 'percent_coverage']),
      databaseName: firstText(normalized, ['database', 'db']),
      phenotype: firstText(normalized, ['phenotype']),
      evidenceBasis: EvidenceBasis.GENOTYPIC,
    }];
  });

  await prisma.$transaction(async (tx) => {
    await tx.amrGene.deleteMany({ where: { toolRunId } });
    if (detections.length) await tx.amrGene.createMany({ data: detections });
  });
  return detections.length;
}

function percentage(value: number, total: number) {
  return total ? Number(((value / total) * 100).toFixed(1)) : null;
}

function normalizeCountRows(rows: NamedCountRow[]) {
  return rows.map((row) => ({ label: row.label, count: Number(row.count) }));
}

function surveillanceSqlWhere(filters: SurveillanceFilters) {
  const conditions: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (filters.organismId) conditions.push(Prisma.sql`s."organismId" = ${filters.organismId}`);
  if (filters.country) conditions.push(Prisma.sql`LOWER(s.country) = LOWER(${filters.country})`);
  if (filters.source) conditions.push(Prisma.sql`LOWER(s."sourceType") = LOWER(${filters.source})`);
  if (filters.evidenceBasis) conditions.push(Prisma.sql`s."evidenceBasis" = ${filters.evidenceBasis}::"EvidenceBasis"`);
  if (filters.scope) conditions.push(Prisma.sql`s."surveillanceScope" = ${filters.scope}::"SurveillanceScope"`);
  if (filters.from) conditions.push(Prisma.sql`s."collectionDate" >= ${filters.from}`);
  if (filters.to) conditions.push(Prisma.sql`s."collectionDate" <= ${filters.to}`);
  if (filters.search) {
    const search = `%${filters.search}%`;
    conditions.push(Prisma.sql`(
      s."strainName" ILIKE ${search}
      OR s."isolateName" ILIKE ${search}
      OR s.country ILIKE ${search}
      OR s.city ILIKE ${search}
      OR o."scientificName" ILIKE ${search}
    )`);
  }
  return Prisma.join(conditions, ' AND ');
}

function normalizeRow(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [key.trim().toLowerCase().replace(/[\s-]+/g, '_'), value]));
}

function firstText(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 240);
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function firstNumber(row: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    const parsed = typeof value === 'number' ? value : Number(String(value || '').replace('%', '').trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}
