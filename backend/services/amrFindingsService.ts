import {
  AmrClassificationOrigin,
  AmrEvidenceLevel,
  AmrFindingStatus,
  AmrGeographicScope,
  AmrPublicHealthImportance,
  AmrResistanceEvidence,
  Prisma,
  PrismaClient,
} from '@prisma/client';

export const AMR_DOMAINS = [
  'Human Clinical', 'Hospital', 'Community', 'Veterinary', 'Livestock', 'Poultry', 'Aquaculture',
  'Food', 'Agriculture', 'Environment', 'Wastewater', 'Wildlife', 'Companion Animal', 'One Health',
  'Policy and Surveillance', 'Computational AMR',
] as const;

const MAX_PAGE_SIZE = 100;
const text = (value: unknown, max = 4_000) => typeof value === 'string'
  ? value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || undefined
  : undefined;
const textList = (value: unknown, max = 100) => Array.isArray(value)
  ? [...new Set(value.map((entry) => text(entry, 240)).filter((entry): entry is string => Boolean(entry)))].slice(0, max)
  : typeof value === 'string' ? [...new Set(value.split(/[;,|\n]/).map((entry) => text(entry, 240)).filter((entry): entry is string => Boolean(entry)))].slice(0, max) : [];
const booleanValue = (value: unknown) => value === true || value === 'true' ? true : value === false || value === 'false' ? false : undefined;
const integerValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
};
const dateValue = (value: unknown) => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};
const enumValue = <T extends Record<string, string>>(values: T, value: unknown): T[keyof T] | undefined =>
  typeof value === 'string' && Object.values(values).includes(value) ? value as T[keyof T] : undefined;
const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);
const normalizeDoi = (value: unknown) => {
  const raw = text(value, 300)?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').toLowerCase();
  return raw && /^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(raw) ? raw : undefined;
};
const safeExternalUrl = (value: unknown) => {
  const raw = text(value, 1_000);
  if (!raw) return undefined;
  try { const url = new URL(raw); return ['https:', 'http:'].includes(url.protocol) ? url.toString() : undefined; } catch { return undefined; }
};

export type AmrFindingInput = Record<string, unknown>;
type NormalizedAmrFindingInput = {
  title: string; keyFinding: string; scientificSummary: string; sourceReference: string;
  evidenceLevel: AmrEvidenceLevel; publicHealthImportance: AmrPublicHealthImportance; importanceReason?: string;
  curatorInterpretation?: string; publicHealthSignificance?: string; limitations?: string; futureDirections?: string; surveillanceAction?: string; domainSummary?: string;
  geographicScope: AmrGeographicScope; resistanceEvidence: AmrResistanceEvidence; susceptibilityMethod?: string; interpretiveGuideline?: string; guidelineVersion?: string;
  mdrStatus?: boolean; xdrStatus?: boolean; pdrStatus?: boolean; classificationOrigin: AmrClassificationOrigin;
  studyStartDate?: Date; studyEndDate?: Date; publicationYear?: number; sampleSize?: number; resistantSampleCount?: number; prevalenceNumerator?: number; prevalenceDenominator?: number; prevalencePercentage?: number;
  studyDesign?: string; sequencingPlatform?: string; analysisMethod?: string; oneHealth: boolean; hasGenomicData: boolean; openAccess: boolean;
  domains: string[]; pathogens: string[]; genes: string[]; antimicrobials: string[]; antimicrobialClasses: string[]; mechanisms: string[]; keywords: string[]; institutions: string[]; mobileElements: string[];
  locations: unknown[]; publication?: Record<string, unknown>; accessions: unknown[];
};
export type AmrFindingFilters = {
  q?: string; state?: string; domain?: string; pathogen?: string; gene?: string; antimicrobialClass?: string;
  mechanism?: string; year?: number; evidenceLevel?: AmrEvidenceLevel; importance?: AmrPublicHealthImportance;
  resistanceEvidence?: AmrResistanceEvidence; oneHealth?: boolean; hasGenomicData?: boolean; openAccess?: boolean;
  page?: number; pageSize?: number; sort?: 'newest' | 'oldest' | 'importance' | 'relevance';
};

const publicInclude = {
  domains: { include: { term: true } }, pathogens: { include: { pathogen: true } }, genes: { include: { gene: true } },
  antimicrobials: { include: { antimicrobial: { include: { drugClass: true } } } }, mechanisms: { include: { mechanism: true } },
  locations: true, publications: { include: { publication: true } }, institutions: true, accessions: true, keywords: true, mobileElements: true,
} satisfies Prisma.AmrFindingInclude;

export const amrFindingInclude = {
  ...publicInclude,
  createdBy: { select: { id: true, name: true, email: true } },
  reviewedBy: { select: { id: true, name: true, email: true } },
  revisions: { include: { actor: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.AmrFindingInclude;

function statusSummary(status: AmrFindingStatus) {
  return status === AmrFindingStatus.PUBLISHED ? 'Published' : status.replace(/_/g, ' ').toLowerCase();
}

export function publicFinding(finding: Prisma.AmrFindingGetPayload<{ include: typeof publicInclude }>) {
  return { ...finding, curationStatus: statusSummary(finding.curationStatus), curatorInterpretation: undefined, revisions: undefined };
}

function parseInput(body: AmrFindingInput, required = true) {
  const title = text(body.title, 300);
  const keyFinding = text(body.keyFinding, 700);
  const scientificSummary = text(body.scientificSummary, 8_000);
  const sourceReference = text(body.sourceReference, 1_200);
  if (required && (!title || !keyFinding || !scientificSummary || !sourceReference)) return { error: 'Title, key finding, scientific summary, and publication or surveillance reference are required.' } as const;

  const evidenceLevel = enumValue(AmrEvidenceLevel, body.evidenceLevel) || AmrEvidenceLevel.LEVEL_1;
  const publicHealthImportance = enumValue(AmrPublicHealthImportance, body.publicHealthImportance) || AmrPublicHealthImportance.MODERATE;
  const importanceReason = text(body.importanceReason, 2_000);
  if ((publicHealthImportance === AmrPublicHealthImportance.HIGH || publicHealthImportance === AmrPublicHealthImportance.CRITICAL) && !importanceReason) return { error: 'High and Critical findings require an importance justification.' } as const;
  const studyStartDate = dateValue(body.studyStartDate); const studyEndDate = dateValue(body.studyEndDate);
  if (studyStartDate && studyEndDate && studyStartDate > studyEndDate) return { error: 'Study start date cannot occur after the end date.' } as const;
  const publicationYear = integerValue(body.publicationYear);
  if (publicationYear && (publicationYear < 1900 || publicationYear > new Date().getFullYear() + 1)) return { error: 'Publication year is not plausible.' } as const;
  const sampleSize = integerValue(body.sampleSize); const resistantSampleCount = integerValue(body.resistantSampleCount);
  if (sampleSize !== undefined && resistantSampleCount !== undefined && resistantSampleCount > sampleSize) return { error: 'Resistant sample count cannot exceed sample size.' } as const;
  const prevalenceNumerator = integerValue(body.prevalenceNumerator); const prevalenceDenominator = integerValue(body.prevalenceDenominator);
  if ((prevalenceNumerator !== undefined) !== (prevalenceDenominator !== undefined)) return { error: 'Prevalence requires both numerator and denominator.' } as const;
  if (prevalenceNumerator !== undefined && (!prevalenceDenominator || prevalenceNumerator > prevalenceDenominator)) return { error: 'Prevalence denominator must be greater than zero and no smaller than numerator.' } as const;
  const prevalencePercentage = prevalenceNumerator !== undefined && prevalenceDenominator !== undefined ? Number(((prevalenceNumerator / prevalenceDenominator) * 100).toFixed(2)) : undefined;

  return { data: {
    title: title!, keyFinding: keyFinding!, scientificSummary: scientificSummary!, sourceReference: sourceReference!, evidenceLevel, publicHealthImportance, importanceReason,
    curatorInterpretation: text(body.curatorInterpretation, 8_000), publicHealthSignificance: text(body.publicHealthSignificance, 4_000),
    limitations: text(body.limitations, 4_000), futureDirections: text(body.futureDirections, 4_000), surveillanceAction: text(body.surveillanceAction, 4_000), domainSummary: text(body.domainSummary, 2_000),
    geographicScope: enumValue(AmrGeographicScope, body.geographicScope) || AmrGeographicScope.STATE,
    resistanceEvidence: enumValue(AmrResistanceEvidence, body.resistanceEvidence) || AmrResistanceEvidence.NOT_REPORTED,
    susceptibilityMethod: text(body.susceptibilityMethod, 500), interpretiveGuideline: text(body.interpretiveGuideline, 300), guidelineVersion: text(body.guidelineVersion, 120),
    mdrStatus: booleanValue(body.mdrStatus), xdrStatus: booleanValue(body.xdrStatus), pdrStatus: booleanValue(body.pdrStatus),
    classificationOrigin: enumValue(AmrClassificationOrigin, body.classificationOrigin) || AmrClassificationOrigin.NOT_REPORTED,
    studyStartDate, studyEndDate, publicationYear, sampleSize, resistantSampleCount, prevalenceNumerator, prevalenceDenominator, prevalencePercentage,
    studyDesign: text(body.studyDesign, 500), sequencingPlatform: text(body.sequencingPlatform, 500), analysisMethod: text(body.analysisMethod, 1_000),
    oneHealth: booleanValue(body.oneHealth) || false, hasGenomicData: booleanValue(body.hasGenomicData) || false, openAccess: booleanValue(body.openAccess) || false,
    domains: textList(body.domains), pathogens: textList(body.pathogens), genes: textList(body.genes), antimicrobials: textList(body.antimicrobials),
    antimicrobialClasses: textList(body.antimicrobialClasses), mechanisms: textList(body.mechanisms), keywords: textList(body.keywords),
    institutions: textList(body.institutions), mobileElements: textList(body.mobileElements),
    locations: Array.isArray(body.locations) ? body.locations.slice(0, 50) : [],
    publication: typeof body.publication === 'object' && body.publication && !Array.isArray(body.publication) ? body.publication as Record<string, unknown> : undefined,
    accessions: Array.isArray(body.accessions) ? body.accessions.slice(0, 100) : [],
  } satisfies NormalizedAmrFindingInput } as const;
}

async function relationData(client: PrismaClient | Prisma.TransactionClient, input: NormalizedAmrFindingInput) {
  const domainTerms = await Promise.all(input.domains.map(async (label, index) => {
    const value = label.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
    return client.amrControlledVocabulary.upsert({ where: { category_value: { category: 'DOMAIN', value } }, update: { label, active: true }, create: { category: 'DOMAIN', value, label, sortOrder: index } });
  }));
  const pathogens = await Promise.all(input.pathogens.map((scientificName) => client.amrPathogen.upsert({ where: { scientificName }, update: {}, create: { scientificName } })));
  const genes = await Promise.all(input.genes.map((symbol) => client.amrResistanceGene.upsert({ where: { symbol }, update: {}, create: { symbol } })));
  const classes = await Promise.all(input.antimicrobialClasses.map((name) => client.amrAntimicrobialClass.upsert({ where: { name }, update: {}, create: { name } })));
  const classByName = new Map(classes.map((entry) => [entry.name.toLowerCase(), entry.id]));
  const antimicrobials = await Promise.all(input.antimicrobials.map((raw) => {
    const [name, className] = raw.split('::').map((item) => item.trim());
    return client.amrAntimicrobial.upsert({ where: { name }, update: className ? { classId: classByName.get(className.toLowerCase()) } : {}, create: { name, classId: className ? classByName.get(className.toLowerCase()) : undefined } });
  }));
  const mechanisms = await Promise.all(input.mechanisms.map((name) => client.amrResistanceMechanism.upsert({ where: { name }, update: {}, create: { name } })));
  return { domainTerms, pathogens, genes, antimicrobials, mechanisms };
}

function locationRows(input: NormalizedAmrFindingInput) {
  return input.locations.flatMap((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const row = entry as Record<string, unknown>; const latitude = Number(row.latitude); const longitude = Number(row.longitude);
    return [{ country: text(row.country, 100) || 'India', state: text(row.state, 120), district: text(row.district, 120), city: text(row.city, 120), locality: text(row.locality, 180), facility: text(row.facility, 300), latitude: Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 ? latitude : undefined, longitude: Number.isFinite(longitude) && longitude >= -180 && longitude <= 180 ? longitude : undefined }];
  });
}

export async function createAmrFinding(prisma: PrismaClient, body: AmrFindingInput, actorId: string) {
  const parsed = parseInput(body); if ('error' in parsed) throw new Error(parsed.error);
  const input = parsed.data; const baseSlug = slugify(input.title || 'amr-finding');
  const slug = `${baseSlug}-${Date.now().toString(36)}`;
  return prisma.$transaction(async (tx) => {
    const relations = await relationData(tx, input);
    const { domains, pathogens, genes, antimicrobials, antimicrobialClasses, mechanisms, keywords, institutions, mobileElements, locations, publication, accessions, ...fields } = input;
    const finding = await tx.amrFinding.create({ data: {
      ...fields,
      slug, createdById: actorId,
      domains: { create: relations.domainTerms.map((term) => ({ termId: term.id })) }, pathogens: { create: relations.pathogens.map((pathogen) => ({ pathogenId: pathogen.id })) }, genes: { create: relations.genes.map((gene) => ({ geneId: gene.id })) }, antimicrobials: { create: relations.antimicrobials.map((antimicrobial) => ({ antimicrobialId: antimicrobial.id })) }, mechanisms: { create: relations.mechanisms.map((mechanism) => ({ mechanismId: mechanism.id })) },
      locations: { create: locationRows(input) }, keywords: { create: input.keywords.map((value) => ({ value })) }, institutions: { create: input.institutions.map((name) => ({ name })) }, mobileElements: { create: input.mobileElements.map((name) => ({ type: 'Not specified', name })) },
      accessions: { create: input.accessions.flatMap((entry) => entry && typeof entry === 'object' && !Array.isArray(entry) ? [{ database: text((entry as Record<string, unknown>).database, 100) || 'Other', accession: text((entry as Record<string, unknown>).accession, 240) || '', url: safeExternalUrl((entry as Record<string, unknown>).url) }] : []).filter((entry) => entry.accession) },
    }, include: amrFindingInclude });
    if (input.publication) {
      const doi = normalizeDoi(input.publication.doi); const pubmedId = text(input.publication.pubmedId, 40);
      const publication = doi ? await tx.amrPublication.upsert({ where: { doi }, update: { title: text(input.publication.title, 1_000) || input.sourceReference || '', authors: text(input.publication.authors, 2_000), journal: text(input.publication.journal, 500), publicationYear: integerValue(input.publication.publicationYear), externalUrl: safeExternalUrl(input.publication.externalUrl), openAccess: booleanValue(input.publication.openAccess) || false }, create: { doi, title: text(input.publication.title, 1_000) || input.sourceReference || '', authors: text(input.publication.authors, 2_000), journal: text(input.publication.journal, 500), publicationYear: integerValue(input.publication.publicationYear), pubmedId, externalUrl: safeExternalUrl(input.publication.externalUrl), openAccess: booleanValue(input.publication.openAccess) || false } }) : await tx.amrPublication.create({ data: { title: text(input.publication.title, 1_000) || input.sourceReference || '', authors: text(input.publication.authors, 2_000), journal: text(input.publication.journal, 500), publicationYear: integerValue(input.publication.publicationYear), pubmedId, externalUrl: safeExternalUrl(input.publication.externalUrl), openAccess: booleanValue(input.publication.openAccess) || false } });
      await tx.amrFindingPublication.create({ data: { findingId: finding.id, publicationId: publication.id } });
    }
    await tx.amrFindingRevision.create({ data: { findingId: finding.id, actorId, action: 'CREATED_DRAFT', snapshot: { title: finding.title, curationStatus: finding.curationStatus } } });
    return tx.amrFinding.findUniqueOrThrow({ where: { id: finding.id }, include: amrFindingInclude });
  });
}

export async function updateAmrFinding(prisma: PrismaClient, id: string, body: AmrFindingInput, actorId: string) {
  const existing = await prisma.amrFinding.findUnique({ where: { id } }); if (!existing) throw new Error('Finding not found.');
  const parsed = parseInput({ ...existing, ...body }, true); if ('error' in parsed) throw new Error(parsed.error);
  const input = parsed.data;
  return prisma.$transaction(async (tx) => {
    const relations = await relationData(tx, input);
    const { domains, pathogens, genes, antimicrobials, antimicrobialClasses, mechanisms, keywords, institutions, mobileElements, locations, publication, accessions, ...fields } = input;
    await tx.amrFinding.update({ where: { id }, data: fields });
    await Promise.all([tx.amrFindingDomain.deleteMany({ where: { findingId: id } }), tx.amrFindingPathogen.deleteMany({ where: { findingId: id } }), tx.amrFindingGene.deleteMany({ where: { findingId: id } }), tx.amrFindingAntimicrobial.deleteMany({ where: { findingId: id } }), tx.amrFindingMechanism.deleteMany({ where: { findingId: id } }), tx.amrFindingLocation.deleteMany({ where: { findingId: id } }), tx.amrFindingKeyword.deleteMany({ where: { findingId: id } }), tx.amrFindingInstitution.deleteMany({ where: { findingId: id } }), tx.amrFindingMobileElement.deleteMany({ where: { findingId: id } }), tx.amrFindingAccession.deleteMany({ where: { findingId: id } })]);
    await tx.amrFinding.update({ where: { id }, data: { domains: { create: relations.domainTerms.map((term) => ({ termId: term.id })) }, pathogens: { create: relations.pathogens.map((pathogen) => ({ pathogenId: pathogen.id })) }, genes: { create: relations.genes.map((gene) => ({ geneId: gene.id })) }, antimicrobials: { create: relations.antimicrobials.map((antimicrobial) => ({ antimicrobialId: antimicrobial.id })) }, mechanisms: { create: relations.mechanisms.map((mechanism) => ({ mechanismId: mechanism.id })) }, locations: { create: locationRows(input) }, keywords: { create: input.keywords.map((value) => ({ value })) }, institutions: { create: input.institutions.map((name) => ({ name })) }, mobileElements: { create: input.mobileElements.map((name) => ({ type: 'Not specified', name })) } } });
    await tx.amrFindingRevision.create({ data: { findingId: id, actorId, action: 'UPDATED', snapshot: { title: input.title, updatedFields: Object.keys(body) } } });
    return tx.amrFinding.findUniqueOrThrow({ where: { id }, include: amrFindingInclude });
  });
}

export async function setAmrFindingStatus(prisma: PrismaClient, id: string, status: AmrFindingStatus, actorId: string, note?: string) {
  const finding = await prisma.amrFinding.findUnique({ where: { id } }); if (!finding) throw new Error('Finding not found.');
  if ((status === AmrFindingStatus.REJECTED || status === AmrFindingStatus.ARCHIVED) && !text(note, 2_000)) throw new Error('A reviewer note is required for rejection or archival.');
  const now = new Date();
  const updated = await prisma.amrFinding.update({ where: { id }, data: { curationStatus: status, reviewedById: actorId, lastReviewedAt: now, publishedAt: status === AmrFindingStatus.PUBLISHED ? now : finding.publishedAt }, include: amrFindingInclude });
  await prisma.amrFindingRevision.create({ data: { findingId: id, actorId, action: `STATUS_${status}`, note: text(note, 2_000), snapshot: { previousStatus: finding.curationStatus, status } } });
  return updated;
}

function buildWhere(filters: AmrFindingFilters): Prisma.AmrFindingWhereInput {
  const where: Prisma.AmrFindingWhereInput = { curationStatus: AmrFindingStatus.PUBLISHED };
  const and: Prisma.AmrFindingWhereInput[] = [];
  if (filters.state) and.push({ locations: { some: { state: { equals: filters.state, mode: 'insensitive' } } } });
  if (filters.domain) and.push({ domains: { some: { term: { label: { equals: filters.domain, mode: 'insensitive' } } } } });
  if (filters.pathogen) and.push({ pathogens: { some: { pathogen: { scientificName: { equals: filters.pathogen, mode: 'insensitive' } } } } });
  if (filters.gene) and.push({ genes: { some: { gene: { symbol: { equals: filters.gene, mode: 'insensitive' } } } } });
  if (filters.antimicrobialClass) and.push({ antimicrobials: { some: { antimicrobial: { drugClass: { name: { equals: filters.antimicrobialClass, mode: 'insensitive' } } } } } });
  if (filters.mechanism) and.push({ mechanisms: { some: { mechanism: { name: { equals: filters.mechanism, mode: 'insensitive' } } } } });
  if (filters.year) and.push({ publicationYear: filters.year }); if (filters.evidenceLevel) and.push({ evidenceLevel: filters.evidenceLevel }); if (filters.importance) and.push({ publicHealthImportance: filters.importance }); if (filters.resistanceEvidence) and.push({ resistanceEvidence: filters.resistanceEvidence }); if (filters.oneHealth !== undefined) and.push({ oneHealth: filters.oneHealth }); if (filters.hasGenomicData !== undefined) and.push({ hasGenomicData: filters.hasGenomicData }); if (filters.openAccess !== undefined) and.push({ openAccess: filters.openAccess });
  if (filters.q) { const contains = { contains: filters.q, mode: 'insensitive' as const }; and.push({ OR: [{ title: contains }, { keyFinding: contains }, { scientificSummary: contains }, { sourceReference: contains }, { keywords: { some: { value: contains } } }, { pathogens: { some: { pathogen: { scientificName: contains } } } }, { genes: { some: { gene: { symbol: contains } } } }, { locations: { some: { OR: [{ state: contains }, { district: contains }, { city: contains }] } } }, { publications: { some: { publication: { OR: [{ title: contains }, { authors: contains }] } } } }] }); }
  if (and.length) where.AND = and; return where;
}

export async function listPublishedAmrFindings(prisma: PrismaClient, filters: AmrFindingFilters) {
  const page = Math.max(1, filters.page || 1); const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(10, filters.pageSize || 20)); const where = buildWhere(filters);
  const orderBy: Prisma.AmrFindingOrderByWithRelationInput = filters.sort === 'oldest' ? { publicationYear: 'asc' } : filters.sort === 'importance' ? { publicHealthImportance: 'desc' } : { updatedAt: 'desc' };
  const [total, items] = await Promise.all([prisma.amrFinding.count({ where }), prisma.amrFinding.findMany({ where, include: publicInclude, orderBy, skip: (page - 1) * pageSize, take: pageSize })]);
  return { items: items.map(publicFinding), page, pageSize, total, totalPages: Math.ceil(total / pageSize) };
}

export async function publishedAmrFindingBySlug(prisma: PrismaClient, slug: string) {
  const finding = await prisma.amrFinding.findFirst({ where: { slug, curationStatus: AmrFindingStatus.PUBLISHED }, include: publicInclude }); return finding ? publicFinding(finding) : null;
}

export async function amrDashboard(prisma: PrismaClient) {
  const findings = await prisma.amrFinding.findMany({ where: { curationStatus: AmrFindingStatus.PUBLISHED }, include: publicInclude, orderBy: { updatedAt: 'desc' } });
  const count = (values: string[]) => Object.entries(values.reduce<Record<string, number>>((acc, value) => { acc[value] = (acc[value] || 0) + 1; return acc; }, {})).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
  const states = count(findings.flatMap((finding) => finding.locations.map((location) => location.state).filter((state): state is string => Boolean(state))));
  const pathogens = count(findings.flatMap((finding) => finding.pathogens.map((row) => row.pathogen.scientificName)));
  const genes = count(findings.flatMap((finding) => finding.genes.map((row) => row.gene.symbol)));
  const classes = count(findings.flatMap((finding) => finding.antimicrobials.map((row) => row.antimicrobial.drugClass?.name).filter((name): name is string => Boolean(name))));
  const domains = count(findings.flatMap((finding) => finding.domains.map((row) => row.term.label)));
  const mechanisms = count(findings.flatMap((finding) => finding.mechanisms.map((row) => row.mechanism.name)));
  const years = count(findings.map((finding) => finding.publicationYear ? String(finding.publicationYear) : 'Not reported'));
  const sources = count(findings.flatMap((finding) => finding.locations.map((location) => location.locality || location.facility).filter((value): value is string => Boolean(value))));
  const mdr = [{ label: 'MDR', value: findings.filter((finding) => finding.mdrStatus).length }, { label: 'XDR', value: findings.filter((finding) => finding.xdrStatus).length }, { label: 'PDR', value: findings.filter((finding) => finding.pdrStatus).length }];
  const evidence = [{ label: 'Clinical / phenotypic', value: findings.filter((finding) => finding.resistanceEvidence === AmrResistanceEvidence.PHENOTYPIC || finding.resistanceEvidence === AmrResistanceEvidence.COMBINED).length }, { label: 'Environmental / animal', value: findings.filter((finding) => finding.domains.some((row) => ['Environment', 'Wastewater', 'Veterinary', 'Livestock', 'Poultry', 'Aquaculture', 'Wildlife', 'Companion Animal'].includes(row.term.label))).length }, { label: 'Genomic', value: findings.filter((finding) => finding.hasGenomicData).length }];
  return { totals: { findings: findings.length, publications: new Set(findings.flatMap((finding) => finding.publications.map((row) => row.publicationId))).size, states: states.length, pathogens: pathogens.length, genes: genes.length, antimicrobialClasses: classes.length, oneHealth: findings.filter((finding) => finding.oneHealth).length, genomic: findings.filter((finding) => finding.hasGenomicData).length, highImportance: findings.filter((finding) => finding.publicHealthImportance === AmrPublicHealthImportance.HIGH || finding.publicHealthImportance === AmrPublicHealthImportance.CRITICAL).length, updatedAt: findings[0]?.updatedAt || null }, charts: { years, states, domains, pathogens, genes, classes, mechanisms, sampleSources: sources, surveillanceMethods: count(findings.map((finding) => finding.analysisMethod || finding.studyDesign || 'Not reported')), mdr, evidence }, map: states.map((row) => ({ ...row, majorPathogens: pathogens.slice(0, 3).map((entry) => entry.label), majorClasses: classes.slice(0, 3).map((entry) => entry.label) })), records: findings.flatMap((finding) => finding.locations.filter((location) => Number.isFinite(location.latitude) && Number.isFinite(location.longitude)).map((location) => ({ id: finding.id, slug: finding.slug, title: finding.title, state: location.state, latitude: location.latitude, longitude: location.longitude, pathogens: finding.pathogens.map((row) => row.pathogen.scientificName), importance: finding.publicHealthImportance }))) };
}

export async function amrFilterOptions(prisma: PrismaClient) {
  const dashboard = await amrDashboard(prisma);
  return { domains: AMR_DOMAINS, states: dashboard.charts.states.map((row) => row.label), pathogens: dashboard.charts.pathogens.map((row) => row.label), genes: dashboard.charts.genes.map((row) => row.label), antimicrobialClasses: dashboard.charts.classes.map((row) => row.label), mechanisms: dashboard.charts.mechanisms.map((row) => row.label), years: dashboard.charts.years.map((row) => row.label).filter((year) => /^\d{4}$/.test(year)) };
}
