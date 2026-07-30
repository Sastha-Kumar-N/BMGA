import {
  AmrFindingStatus,
  AmrImportJobStatus,
  AmrImportSource,
  AmrSubmissionDeclaration,
  NotificationType,
  Prisma,
  PrismaClient,
  UserRole,
} from '@prisma/client';
import {
  amrFindingInclude,
  createAmrFinding,
  createAmrFindingInTransaction,
  updateAmrFinding,
  type AmrFindingInput,
} from './amrFindingsService';

type DatabaseClient = PrismaClient | Prisma.TransactionClient;

const MAX_JSON_IMPORT_BYTES = 2 * 1024 * 1024;
const MAX_JSON_IMPORT_RECORDS = 100;
const USER_FINDING_FIELDS = new Set([
  'title', 'keyFinding', 'scientificSummary', 'sourceReference', 'domainSummary', 'evidenceLevel',
  'publicHealthImportance', 'importanceReason', 'geographicScope', 'resistanceEvidence',
  'susceptibilityMethod', 'interpretiveGuideline', 'guidelineVersion', 'mdrStatus', 'xdrStatus',
  'pdrStatus', 'classificationOrigin', 'studyStartDate', 'studyEndDate', 'publicationYear', 'sampleSize',
  'resistantSampleCount', 'prevalenceNumerator', 'prevalenceDenominator', 'studyDesign',
  'sequencingPlatform', 'analysisMethod', 'oneHealth', 'hasGenomicData', 'openAccess', 'domains',
  'pathogens', 'genes', 'antimicrobials', 'antimicrobialClasses', 'mechanisms', 'keywords',
  'institutions', 'mobileElements', 'locations', 'publication', 'accessions',
]);

const userFindingDefaults = {
  keyFinding: 'Not provided yet.',
  scientificSummary: 'Not provided yet.',
  sourceReference: 'Reference pending.',
};
const USER_EDITABLE_STATUSES = new Set<AmrFindingStatus>([AmrFindingStatus.DRAFT, AmrFindingStatus.CHANGES_REQUESTED]);

const text = (value: unknown, max = 4_000) => typeof value === 'string'
  ? value.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '').replace(/[<>\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) || undefined
  : undefined;

const optionalDate = (value: unknown) => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const safeUrl = (value: unknown) => {
  const raw = text(value, 1_000);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

const slugify = (value: string) => value.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 90);
const normalizeTitle = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normalizeDoi = (value: unknown) => {
  const raw = text(value, 300)?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').toLowerCase();
  return raw && /^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(raw) ? raw : undefined;
};
const normalizePmid = (value: unknown) => {
  const raw = text(value, 40)?.replace(/^PMID:/i, '').trim();
  return raw && /^\d{1,12}$/.test(raw) ? raw : undefined;
};
const normalizePmcId = (value: unknown) => {
  const raw = text(value, 40)?.toUpperCase();
  return raw && /^PMC\d{1,12}$/.test(raw) ? raw : undefined;
};
const normalizeEuropePmcId = (value: unknown) => {
  const raw = text(value, 100)?.trim();
  return raw && /^[A-Za-z0-9_.:-]{1,100}$/.test(raw) ? raw : undefined;
};

function declaration(value: unknown) {
  return typeof value === 'string' && Object.values(AmrSubmissionDeclaration).includes(value as AmrSubmissionDeclaration)
    ? value as AmrSubmissionDeclaration
    : AmrSubmissionDeclaration.AUTHOR;
}

function statusLabel(status: AmrFindingStatus) {
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function stableSlug(value: string) {
  return `${slugify(value || 'amr-publication') || 'amr-publication'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export type PublicationInput = {
  title: string;
  authors?: string;
  userRoleInPublication?: string;
  journal?: string;
  publicationYear?: number;
  doi?: string;
  pubmedId?: string;
  pmcId?: string;
  europePmcId?: string;
  externalUrl?: string;
  citationText?: string;
  openAccess?: boolean;
  submissionDeclaration: AmrSubmissionDeclaration;
};

export function parsePublicationInput(body: Record<string, unknown>) {
  const title = text(body.title, 1_000);
  if (!title) return { error: 'Publication title is required.' } as const;
  const yearValue = body.publicationYear === undefined || body.publicationYear === '' ? undefined : Number(body.publicationYear);
  if (yearValue !== undefined && (!Number.isInteger(yearValue) || yearValue < 1800 || yearValue > new Date().getFullYear() + 1)) {
    return { error: 'Publication year is not plausible.' } as const;
  }
  const doi = body.doi ? normalizeDoi(body.doi) : undefined;
  if (body.doi && !doi) return { error: 'Provide a valid DOI, for example 10.1000/example.' } as const;
  const pubmedId = body.pubmedId ? normalizePmid(body.pubmedId) : undefined;
  if (body.pubmedId && !pubmedId) return { error: 'PubMed ID must contain digits only.' } as const;
  const pmcId = body.pmcId ? normalizePmcId(body.pmcId) : undefined;
  if (body.pmcId && !pmcId) return { error: 'PMCID must use the form PMC123456.' } as const;
  const europePmcId = body.europePmcId ? normalizeEuropePmcId(body.europePmcId) : undefined;
  if (body.europePmcId && !europePmcId) return { error: 'Europe PMC identifier contains unsupported characters.' } as const;
  const requestedUrl = body.externalUrl ? safeUrl(body.externalUrl) : undefined;
  if (body.externalUrl && !requestedUrl) return { error: 'Publication link must use an http or https URL.' } as const;
  return {
    data: {
      title,
      authors: text(body.authors, 4_000),
      userRoleInPublication: text(body.userRoleInPublication, 500),
      journal: text(body.journal, 500),
      publicationYear: yearValue,
      doi,
      pubmedId,
      pmcId,
      europePmcId,
      externalUrl: requestedUrl || (doi ? `https://doi.org/${doi}` : undefined),
      citationText: text(body.citationText, 6_000),
      openAccess: body.openAccess === true || body.openAccess === 'true',
      submissionDeclaration: declaration(body.submissionDeclaration),
    } satisfies PublicationInput,
  } as const;
}

export async function findPublicationDuplicates(prisma: DatabaseClient, input: PublicationInput) {
  const reasons = new Map<string, string[]>();
  const add = (publication: { id: string }, reason: string) => {
    reasons.set(publication.id, [...(reasons.get(publication.id) || []), reason]);
  };
  const strongChecks: Array<[string, Prisma.AmrPublicationWhereInput]> = [];
  if (input.doi) strongChecks.push(['DOI', { doi: input.doi }]);
  if (input.pubmedId) strongChecks.push(['PubMed ID', { pubmedId: input.pubmedId }]);
  if (input.pmcId) strongChecks.push(['PMCID', { pmcId: input.pmcId }]);
  if (input.europePmcId) strongChecks.push(['Europe PMC ID', { europePmcId: input.europePmcId }]);
  for (const [reason, where] of strongChecks) {
    const publication = await prisma.amrPublication.findFirst({ where, select: { id: true } });
    if (publication) add(publication, reason);
  }
  const titleMatches = await prisma.amrPublication.findMany({
    where: {
      title: { equals: input.title, mode: 'insensitive' },
      ...(input.publicationYear ? { publicationYear: input.publicationYear } : {}),
    },
    select: { id: true },
    take: 10,
  });
  titleMatches.forEach((publication) => add(publication, input.publicationYear ? 'Normalized title and year' : 'Normalized title'));
  const rows = await prisma.amrPublication.findMany({
    where: { id: { in: [...reasons.keys()] } },
    select: { id: true, title: true, publicationYear: true, doi: true, pubmedId: true, pmcId: true, europePmcId: true, curationStatus: true },
  });
  return rows.map((publication) => ({ ...publication, reasons: reasons.get(publication.id) || [] }));
}

export async function createNotification(prisma: DatabaseClient, input: { userId: string; type: NotificationType; title: string; body: string; link?: string }) {
  return prisma.notification.create({ data: { userId: input.userId, type: input.type, title: input.title, body: input.body, link: input.link } });
}

export async function notifyAdmins(prisma: DatabaseClient, input: { type: NotificationType; title: string; body: string; link?: string }) {
  const admins = await prisma.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } });
  if (!admins.length) return;
  await prisma.notification.createMany({ data: admins.map((admin) => ({ userId: admin.id, type: input.type, title: input.title, body: input.body, link: input.link })) });
}

function allowedFindingBody(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).filter(([key]) => USER_FINDING_FIELDS.has(key))) as AmrFindingInput;
}

function prepareDraftFinding(body: Record<string, unknown>) {
  const allowed = allowedFindingBody(body) as Record<string, unknown>;
  const title = text(allowed.title, 300);
  if (!title) throw new Error('A working finding title is required to save a draft.');
  return {
    ...allowed,
    title,
    keyFinding: text(allowed.keyFinding, 700) || userFindingDefaults.keyFinding,
    scientificSummary: text(allowed.scientificSummary, 8_000) || userFindingDefaults.scientificSummary,
    sourceReference: text(allowed.sourceReference, 1_200) || userFindingDefaults.sourceReference,
  } as AmrFindingInput;
}

function existingFindingInput(finding: Prisma.AmrFindingGetPayload<{ include: typeof amrFindingInclude }>): AmrFindingInput {
  return {
    title: finding.title,
    keyFinding: finding.keyFinding,
    scientificSummary: finding.scientificSummary,
    sourceReference: finding.sourceReference,
    domainSummary: finding.domainSummary,
    evidenceLevel: finding.evidenceLevel,
    publicHealthImportance: finding.publicHealthImportance,
    importanceReason: finding.importanceReason,
    geographicScope: finding.geographicScope,
    resistanceEvidence: finding.resistanceEvidence,
    susceptibilityMethod: finding.susceptibilityMethod,
    interpretiveGuideline: finding.interpretiveGuideline,
    guidelineVersion: finding.guidelineVersion,
    mdrStatus: finding.mdrStatus,
    xdrStatus: finding.xdrStatus,
    pdrStatus: finding.pdrStatus,
    classificationOrigin: finding.classificationOrigin,
    studyStartDate: finding.studyStartDate?.toISOString(),
    studyEndDate: finding.studyEndDate?.toISOString(),
    publicationYear: finding.publicationYear,
    sampleSize: finding.sampleSize,
    resistantSampleCount: finding.resistantSampleCount,
    prevalenceNumerator: finding.prevalenceNumerator,
    prevalenceDenominator: finding.prevalenceDenominator,
    studyDesign: finding.studyDesign,
    sequencingPlatform: finding.sequencingPlatform,
    analysisMethod: finding.analysisMethod,
    oneHealth: finding.oneHealth,
    hasGenomicData: finding.hasGenomicData,
    openAccess: finding.openAccess,
    domains: finding.domains.map((entry) => entry.term.label),
    pathogens: finding.pathogens.map((entry) => entry.pathogen.scientificName),
    genes: finding.genes.map((entry) => entry.gene.symbol),
    antimicrobials: finding.antimicrobials.map((entry) => entry.antimicrobial.drugClass?.name ? `${entry.antimicrobial.name}::${entry.antimicrobial.drugClass.name}` : entry.antimicrobial.name),
    antimicrobialClasses: [...new Set(finding.antimicrobials.map((entry) => entry.antimicrobial.drugClass?.name).filter((name): name is string => Boolean(name)))],
    mechanisms: finding.mechanisms.map((entry) => entry.mechanism.name),
    keywords: finding.keywords.map((entry) => entry.value),
    institutions: finding.institutions.map((entry) => entry.name),
    mobileElements: finding.mobileElements.map((entry) => entry.name),
    locations: finding.locations.map((entry) => ({ country: entry.country, state: entry.state, district: entry.district, city: entry.city, locality: entry.locality, facility: entry.facility, latitude: entry.latitude, longitude: entry.longitude })),
    accessions: finding.accessions.map((entry) => ({ database: entry.database, accession: entry.accession, url: entry.url })),
  };
}

function findingIsReady(finding: { title: string; keyFinding: string; scientificSummary: string; sourceReference: string }) {
  return Boolean(
    finding.title.trim().length >= 8
    && finding.keyFinding !== userFindingDefaults.keyFinding
    && finding.scientificSummary !== userFindingDefaults.scientificSummary
    && finding.sourceReference !== userFindingDefaults.sourceReference,
  );
}

export async function createUserFindingDraft(prisma: PrismaClient, body: Record<string, unknown>, actorId: string, source = 'USER_MANUAL') {
  const finding = await createAmrFinding(prisma, prepareDraftFinding(body), actorId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.amrFinding.update({
      where: { id: finding.id },
      data: { submissionSource: source, submissionDeclaration: declaration(body.submissionDeclaration) },
      include: amrFindingInclude,
    });
    await tx.amrFindingRevision.create({ data: { findingId: finding.id, actorId, action: 'USER_DRAFT_CREATED', snapshot: { source } } });
    return updated;
  });
}

export async function updateUserFindingDraft(prisma: PrismaClient, id: string, body: Record<string, unknown>, actorId: string) {
  const finding = await prisma.amrFinding.findUnique({ where: { id }, include: amrFindingInclude });
  if (!finding) throw new Error('AMR finding submission not found.');
  if (finding.createdById !== actorId) throw new Error('You can only edit your own AMR finding submissions.');
  if (!USER_EDITABLE_STATUSES.has(finding.curationStatus)) {
    throw new Error('Only drafts and submissions returned for changes can be edited.');
  }
  await updateAmrFinding(prisma, id, prepareDraftFinding({ ...existingFindingInput(finding), ...allowedFindingBody(body) }), actorId);
  return prisma.amrFinding.update({
    where: { id },
    data: { submissionDeclaration: declaration(body.submissionDeclaration || finding.submissionDeclaration), revisionNumber: { increment: 1 } },
    include: amrFindingInclude,
  });
}

export async function submitUserFinding(prisma: PrismaClient, id: string, actorId: string) {
  const finding = await prisma.amrFinding.findUnique({ where: { id } });
  if (!finding) throw new Error('AMR finding submission not found.');
  if (finding.createdById !== actorId) throw new Error('You can only submit your own AMR finding.');
  if (!USER_EDITABLE_STATUSES.has(finding.curationStatus)) throw new Error('This finding is already in review or closed.');
  if (!findingIsReady(finding)) throw new Error('Complete the title, key finding, scientific summary, and source reference before submitting for review.');
  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const record = await tx.amrFinding.update({ where: { id }, data: { curationStatus: AmrFindingStatus.SUBMITTED, submittedAt: now, changesRequestedMessage: null, changesRequestedAt: null }, include: amrFindingInclude });
    await tx.amrFindingRevision.create({ data: { findingId: id, actorId, action: 'SUBMITTED', visibleToSubmitter: true, snapshot: { previousStatus: finding.curationStatus, status: AmrFindingStatus.SUBMITTED } } });
    await createNotification(tx, { userId: actorId, type: NotificationType.AMR_FINDING, title: 'AMR finding submitted', body: 'Your AMR finding is waiting for scientific review.', link: `/account/amr-submissions?finding=${id}` });
    await notifyAdmins(tx, { type: NotificationType.AMR_FINDING, title: 'New AMR finding submission', body: `${finding.title} requires review.`, link: `/admin/amr-findings?finding=${id}` });
    return record;
  });
  return updated;
}

function ensureAdminNote(action: string, note?: string) {
  if (['REQUEST_CHANGES', 'REJECT', 'ARCHIVE'].includes(action) && !text(note, 2_000)) {
    throw new Error('A reviewer note is required for this moderation action.');
  }
}

export async function addFindingModerationNote(prisma: PrismaClient, findingId: string, actorId: string, message: unknown, visibleToSubmitter = false) {
  const sanitized = text(message, 4_000);
  if (!sanitized) throw new Error('A reviewer note cannot be empty.');
  const finding = await prisma.amrFinding.findUnique({ where: { id: findingId }, select: { createdById: true, title: true } });
  if (!finding) throw new Error('AMR finding not found.');
  const note = await prisma.$transaction(async (tx) => {
    const created = await tx.amrModerationNote.create({ data: { findingId, authorId: actorId, message: sanitized, visibleToSubmitter } });
    await tx.amrFindingRevision.create({ data: { findingId, actorId, action: 'REVIEWER_NOTE_ADDED', note: sanitized, visibleToSubmitter } });
    if (visibleToSubmitter && finding.createdById !== actorId) await createNotification(tx, { userId: finding.createdById, type: NotificationType.AMR_FINDING, title: 'New AMR reviewer feedback', body: `A reviewer added feedback for “${finding.title}”.`, link: `/account/amr-submissions?finding=${findingId}` });
    return created;
  });
  return note;
}

export type FindingModerationAction = 'ASSIGN_REVIEWER' | 'START_REVIEW' | 'REQUEST_CHANGES' | 'APPROVE' | 'PUBLISH' | 'SCHEDULE' | 'UNPUBLISH' | 'REJECT' | 'ARCHIVE' | 'RESTORE' | 'MARK_DUPLICATE' | 'MERGE_DUPLICATE' | 'LINK_STRAIN' | 'LINK_PUBLICATION';

export async function moderateFinding(prisma: PrismaClient, findingId: string, actorId: string, action: FindingModerationAction, payload: Record<string, unknown>) {
  const finding = await prisma.amrFinding.findUnique({ where: { id: findingId }, include: amrFindingInclude });
  if (!finding) throw new Error('AMR finding not found.');
  ensureAdminNote(action, text(payload.note, 2_000));
  const note = text(payload.note, 2_000);
  const now = new Date();
  const update: Prisma.AmrFindingUpdateInput = {};
  let revisionAction: string = action;
  let visibleToSubmitter = false;

  if (action === 'ASSIGN_REVIEWER') {
    const reviewerId = text(payload.reviewerId, 120);
    if (!reviewerId) throw new Error('Select a reviewer.');
    const reviewer = await prisma.user.findFirst({ where: { id: reviewerId, role: { in: [UserRole.ADMIN, UserRole.MODERATOR] } }, select: { id: true } });
    if (!reviewer) throw new Error('The selected reviewer is not authorized to moderate AMR findings.');
    update.assignedReviewer = { connect: { id: reviewer.id } };
  } else if (action === 'LINK_STRAIN') {
    const strainId = Number(payload.strainId);
    if (!Number.isInteger(strainId) || strainId < 1) throw new Error('Select a valid BMGA strain.');
    const strain = await prisma.strain.findUnique({ where: { id: strainId }, select: { id: true } });
    if (!strain) throw new Error('The BMGA strain does not exist.');
    update.linkedStrain = { connect: { id: strain.id } };
  } else if (action === 'LINK_PUBLICATION') {
    const publicationId = text(payload.publicationId, 120);
    if (!publicationId) throw new Error('Select a publication to link.');
    const publication = await prisma.amrPublication.findUnique({ where: { id: publicationId }, select: { id: true } });
    if (!publication) throw new Error('The AMR publication does not exist.');
    await prisma.amrFindingPublication.upsert({ where: { findingId_publicationId: { findingId, publicationId } }, update: {}, create: { findingId, publicationId } });
  } else if (action === 'MARK_DUPLICATE' || action === 'MERGE_DUPLICATE') {
    const duplicateOfId = text(payload.duplicateOfId, 120);
    if (!duplicateOfId || duplicateOfId === findingId) throw new Error('Choose a different AMR finding as the duplicate target.');
    const target = await prisma.amrFinding.findUnique({ where: { id: duplicateOfId }, select: { id: true } });
    if (!target) throw new Error('Duplicate target not found.');
    update.duplicateOf = { connect: { id: target.id } };
    if (action === 'MERGE_DUPLICATE') {
      update.curationStatus = AmrFindingStatus.ARCHIVED;
      update.archivedAt = now;
      update.archivedBy = { connect: { id: actorId } };
      revisionAction = 'MERGED_AS_DUPLICATE';
    }
  } else {
    const statusByAction: Partial<Record<FindingModerationAction, AmrFindingStatus>> = {
      START_REVIEW: AmrFindingStatus.UNDER_REVIEW,
      REQUEST_CHANGES: AmrFindingStatus.CHANGES_REQUESTED,
      APPROVE: AmrFindingStatus.APPROVED,
      PUBLISH: AmrFindingStatus.PUBLISHED,
      UNPUBLISH: AmrFindingStatus.APPROVED,
      REJECT: AmrFindingStatus.REJECTED,
      ARCHIVE: AmrFindingStatus.ARCHIVED,
      RESTORE: AmrFindingStatus.DRAFT,
    };
    const status = statusByAction[action];
    if (action === 'SCHEDULE') {
      const scheduled = optionalDate(payload.scheduledPublishAt);
      if (!scheduled || scheduled <= now) throw new Error('Choose a future publication date and time.');
      if (finding.curationStatus !== AmrFindingStatus.APPROVED) throw new Error('Only approved findings can be scheduled for publication.');
      update.scheduledPublishAt = scheduled;
      revisionAction = 'SCHEDULED_PUBLICATION';
    } else if (status) {
      if (action === 'PUBLISH' && finding.submissionSource !== 'ADMIN' && finding.curationStatus !== AmrFindingStatus.APPROVED) {
        throw new Error('Contributor and imported findings must be approved before publication.');
      }
      update.curationStatus = status;
      update.reviewedBy = { connect: { id: actorId } };
      update.lastReviewedAt = now;
      if (status === AmrFindingStatus.CHANGES_REQUESTED) {
        update.changesRequestedAt = now; update.changesRequestedMessage = note; visibleToSubmitter = true;
      }
      if (status === AmrFindingStatus.APPROVED) { update.approvedAt = now; update.approvedBy = { connect: { id: actorId } }; visibleToSubmitter = true; }
      if (status === AmrFindingStatus.PUBLISHED) { update.publishedAt = now; update.publishedBy = { connect: { id: actorId } }; update.scheduledPublishAt = null; visibleToSubmitter = true; }
      if (status === AmrFindingStatus.REJECTED) { update.rejectedAt = now; update.rejectionReason = note; visibleToSubmitter = true; }
      if (status === AmrFindingStatus.ARCHIVED) { update.archivedAt = now; update.archivedBy = { connect: { id: actorId } }; visibleToSubmitter = true; }
      if (action === 'RESTORE') { update.archivedAt = null; visibleToSubmitter = true; }
    }
  }

  return prisma.$transaction(async (tx) => {
    const updated = Object.keys(update).length ? await tx.amrFinding.update({ where: { id: findingId }, data: update, include: amrFindingInclude }) : finding;
    if (note) await tx.amrModerationNote.create({ data: { findingId, authorId: actorId, message: note, visibleToSubmitter } });
    await tx.amrFindingRevision.create({ data: { findingId, actorId, action: revisionAction, note, visibleToSubmitter, snapshot: { previousStatus: finding.curationStatus, status: updated.curationStatus } } });
    if (visibleToSubmitter && finding.createdById !== actorId) {
      await createNotification(tx, { userId: finding.createdById, type: NotificationType.AMR_FINDING, title: `AMR finding ${statusLabel(updated.curationStatus)}`, body: note || `“${finding.title}” is now ${statusLabel(updated.curationStatus).toLowerCase()}.`, link: `/account/amr-submissions?finding=${findingId}` });
    }
    return updated;
  });
}

export async function createUserPublication(prisma: PrismaClient, body: Record<string, unknown>, actorId: string) {
  const parsed = parsePublicationInput(body);
  if ('error' in parsed) throw new Error(parsed.error);
  const data = parsed.data;
  const duplicates = await findPublicationDuplicates(prisma, data);
  const publication = await prisma.$transaction(async (tx) => {
    const created = await tx.amrPublication.create({ data: { ...data, slug: stableSlug(data.title), submissionSource: 'USER_MANUAL', createdById: actorId }, include: { findings: true } });
    await tx.amrPublicationRevision.create({ data: { publicationId: created.id, actorId, action: 'USER_DRAFT_CREATED', snapshot: { title: created.title } } });
    return created;
  });
  return { publication, duplicates };
}

export async function createAdminPublication(prisma: PrismaClient, body: Record<string, unknown>, actorId: string) {
  const parsed = parsePublicationInput(body);
  if ('error' in parsed) throw new Error(parsed.error);
  const data = parsed.data;
  const duplicates = await findPublicationDuplicates(prisma, data);
  const publication = await prisma.$transaction(async (tx) => {
    const created = await tx.amrPublication.create({ data: { ...data, slug: stableSlug(data.title), submissionSource: 'ADMIN', createdById: actorId }, include: { findings: true } });
    await tx.amrPublicationRevision.create({ data: { publicationId: created.id, actorId, action: 'ADMIN_CREATED_DRAFT', snapshot: { title: created.title } } });
    return created;
  });
  return { publication, duplicates };
}

export async function createImportedPublicationDrafts(prisma: PrismaClient, source: Extract<AmrImportSource, 'PUBMED' | 'EUROPE_PMC'>, candidates: Array<Record<string, unknown>>, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const imported: Array<{ id: string; title: string }> = [];
    const skipped: Array<{ title?: string; reason: string }> = [];
    for (const candidate of candidates.slice(0, 50)) {
      const parsed = parsePublicationInput({ ...candidate, submissionDeclaration: AmrSubmissionDeclaration.RELEVANT_PUBLICATION_SUGGESTION });
      if ('error' in parsed) { skipped.push({ title: text(candidate.title, 1_000), reason: parsed.error }); continue; }
      const duplicates = await findPublicationDuplicates(tx, parsed.data);
      if (duplicates.some((entry) => entry.reasons.some((reason) => ['DOI', 'PubMed ID', 'PMCID', 'Europe PMC ID'].includes(reason)))) {
        skipped.push({ title: parsed.data.title, reason: 'A publication with a matching strong identifier already exists.' });
        continue;
      }
      const publication = await tx.amrPublication.create({
        data: {
          ...parsed.data,
          slug: stableSlug(parsed.data.title),
          submissionSource: `${source}_IMPORT`,
          createdById: actorId,
        },
      });
      await tx.amrPublicationRevision.create({ data: { publicationId: publication.id, actorId, action: 'EXTERNAL_IMPORT_DRAFT_CREATED', snapshot: { source, sourceId: text(candidate.sourceId, 120) } } });
      imported.push({ id: publication.id, title: publication.title });
    }
    return { imported, skipped };
  });
}

export async function updateUserPublication(prisma: PrismaClient, publicationId: string, body: Record<string, unknown>, actorId: string) {
  const existing = await prisma.amrPublication.findUnique({ where: { id: publicationId } });
  if (!existing) throw new Error('AMR publication submission not found.');
  if (existing.createdById !== actorId) throw new Error('You can only edit your own AMR publication submissions.');
  if (!USER_EDITABLE_STATUSES.has(existing.curationStatus)) throw new Error('Only drafts and publications returned for changes can be edited.');
  const parsed = parsePublicationInput({ ...existing, ...body });
  if ('error' in parsed) throw new Error(parsed.error);
  const data = parsed.data;
  const duplicates = await findPublicationDuplicates(prisma, data);
  const publication = await prisma.$transaction(async (tx) => {
    const updated = await tx.amrPublication.update({ where: { id: publicationId }, data: { ...data, revisionNumber: { increment: 1 } } });
    await tx.amrPublicationRevision.create({ data: { publicationId, actorId, action: 'UPDATED', snapshot: { title: updated.title } } });
    return updated;
  });
  return { publication, duplicates };
}

export async function updateAdminPublication(prisma: PrismaClient, publicationId: string, body: Record<string, unknown>, actorId: string) {
  const existing = await prisma.amrPublication.findUnique({ where: { id: publicationId } });
  if (!existing) throw new Error('AMR publication not found.');
  const parsed = parsePublicationInput({ ...existing, ...body });
  if ('error' in parsed) throw new Error(parsed.error);
  const data = parsed.data;
  const duplicates = await findPublicationDuplicates(prisma, data);
  const publication = await prisma.$transaction(async (tx) => {
    const updated = await tx.amrPublication.update({ where: { id: publicationId }, data: { ...data, revisionNumber: { increment: 1 } } });
    await tx.amrPublicationRevision.create({ data: { publicationId, actorId, action: 'ADMIN_UPDATED', snapshot: { title: updated.title } } });
    return updated;
  });
  return { publication, duplicates };
}

export async function submitUserPublication(prisma: PrismaClient, publicationId: string, actorId: string) {
  const publication = await prisma.amrPublication.findUnique({ where: { id: publicationId } });
  if (!publication) throw new Error('AMR publication submission not found.');
  if (publication.createdById !== actorId) throw new Error('You can only submit your own publication.');
  if (!USER_EDITABLE_STATUSES.has(publication.curationStatus)) throw new Error('This publication is already in review or closed.');
  const now = new Date();
  return prisma.$transaction(async (tx) => {
    const updated = await tx.amrPublication.update({ where: { id: publicationId }, data: { curationStatus: AmrFindingStatus.SUBMITTED, submittedAt: now, changesRequestedMessage: null } });
    await tx.amrPublicationRevision.create({ data: { publicationId, actorId, action: 'SUBMITTED', visibleToSubmitter: true, snapshot: { previousStatus: publication.curationStatus, status: AmrFindingStatus.SUBMITTED } } });
    await createNotification(tx, { userId: actorId, type: NotificationType.AMR_PUBLICATION, title: 'AMR publication submitted', body: 'Your publication is waiting for administrative review.', link: `/account/amr-submissions?publication=${publicationId}` });
    await notifyAdmins(tx, { type: NotificationType.AMR_PUBLICATION, title: 'New AMR publication submission', body: `${publication.title} requires review.`, link: `/admin/amr-findings?publication=${publicationId}` });
    return updated;
  });
}

export type PublicationModerationAction = 'ASSIGN_REVIEWER' | 'START_REVIEW' | 'REQUEST_CHANGES' | 'APPROVE' | 'PUBLISH' | 'SCHEDULE' | 'UNPUBLISH' | 'REJECT' | 'ARCHIVE' | 'RESTORE' | 'MARK_DUPLICATE' | 'MERGE_DUPLICATE';

export async function addPublicationModerationNote(prisma: PrismaClient, publicationId: string, actorId: string, message: unknown, visibleToSubmitter = false) {
  const sanitized = text(message, 4_000);
  if (!sanitized) throw new Error('A reviewer note cannot be empty.');
  const publication = await prisma.amrPublication.findUnique({ where: { id: publicationId }, select: { createdById: true, title: true } });
  if (!publication) throw new Error('AMR publication not found.');
  return prisma.$transaction(async (tx) => {
    const note = await tx.amrModerationNote.create({ data: { publicationId, authorId: actorId, message: sanitized, visibleToSubmitter } });
    await tx.amrPublicationRevision.create({ data: { publicationId, actorId, action: 'REVIEWER_NOTE_ADDED', note: sanitized, visibleToSubmitter } });
    if (visibleToSubmitter && publication.createdById && publication.createdById !== actorId) await createNotification(tx, { userId: publication.createdById, type: NotificationType.AMR_PUBLICATION, title: 'New AMR publication feedback', body: `A reviewer added feedback for “${publication.title}”.`, link: `/account/amr-submissions?publication=${publicationId}` });
    return note;
  });
}

export async function moderatePublication(prisma: PrismaClient, publicationId: string, actorId: string, action: PublicationModerationAction, payload: Record<string, unknown>) {
  const publication = await prisma.amrPublication.findUnique({ where: { id: publicationId } });
  if (!publication) throw new Error('AMR publication not found.');
  ensureAdminNote(action, text(payload.note, 2_000));
  const note = text(payload.note, 2_000);
  const now = new Date();
  const update: Prisma.AmrPublicationUpdateInput = {};
  let revisionAction: string = action;
  let visibleToSubmitter = false;

  if (action === 'ASSIGN_REVIEWER') {
    const reviewerId = text(payload.reviewerId, 120);
    const reviewer = reviewerId ? await prisma.user.findFirst({ where: { id: reviewerId, role: { in: [UserRole.ADMIN, UserRole.MODERATOR] } }, select: { id: true } }) : null;
    if (!reviewer) throw new Error('Select an authorized reviewer.');
    update.assignedReviewer = { connect: { id: reviewer.id } };
  } else if (action === 'MARK_DUPLICATE' || action === 'MERGE_DUPLICATE') {
    const duplicateOfId = text(payload.duplicateOfId, 120);
    if (!duplicateOfId || duplicateOfId === publicationId) throw new Error('Choose a different publication as the duplicate target.');
    const target = await prisma.amrPublication.findUnique({ where: { id: duplicateOfId }, select: { id: true } });
    if (!target) throw new Error('Duplicate publication target not found.');
    update.duplicateOf = { connect: { id: target.id } };
    if (action === 'MERGE_DUPLICATE') { update.curationStatus = AmrFindingStatus.ARCHIVED; update.archivedAt = now; revisionAction = 'MERGED_AS_DUPLICATE'; }
  } else {
    const statusByAction: Partial<Record<PublicationModerationAction, AmrFindingStatus>> = {
      START_REVIEW: AmrFindingStatus.UNDER_REVIEW,
      REQUEST_CHANGES: AmrFindingStatus.CHANGES_REQUESTED,
      APPROVE: AmrFindingStatus.APPROVED,
      PUBLISH: AmrFindingStatus.PUBLISHED,
      UNPUBLISH: AmrFindingStatus.APPROVED,
      REJECT: AmrFindingStatus.REJECTED,
      ARCHIVE: AmrFindingStatus.ARCHIVED,
      RESTORE: AmrFindingStatus.DRAFT,
    };
    const status = statusByAction[action];
    if (action === 'SCHEDULE') {
      const scheduled = optionalDate(payload.scheduledPublishAt);
      if (!scheduled || scheduled <= now) throw new Error('Choose a future publication date and time.');
      if (publication.curationStatus !== AmrFindingStatus.APPROVED) throw new Error('Only approved publications can be scheduled.');
      update.scheduledPublishAt = scheduled;
      revisionAction = 'SCHEDULED_PUBLICATION';
    } else if (status) {
      if (action === 'PUBLISH' && publication.submissionSource !== 'ADMIN' && publication.curationStatus !== AmrFindingStatus.APPROVED) {
        throw new Error('Contributor and imported publications must be approved before publication.');
      }
      update.curationStatus = status;
      update.reviewedBy = { connect: { id: actorId } };
      if (status === AmrFindingStatus.CHANGES_REQUESTED) { update.changesRequestedMessage = note; visibleToSubmitter = true; }
      if (status === AmrFindingStatus.APPROVED) { update.approvedAt = now; visibleToSubmitter = true; }
      if (status === AmrFindingStatus.PUBLISHED) { update.publishedAt = now; update.scheduledPublishAt = null; visibleToSubmitter = true; }
      if (status === AmrFindingStatus.REJECTED) { update.rejectionReason = note; visibleToSubmitter = true; }
      if (status === AmrFindingStatus.ARCHIVED || action === 'RESTORE') visibleToSubmitter = true;
    }
  }
  return prisma.$transaction(async (tx) => {
    const updated = Object.keys(update).length ? await tx.amrPublication.update({ where: { id: publicationId }, data: update }) : publication;
    if (note) await tx.amrModerationNote.create({ data: { publicationId, authorId: actorId, message: note, visibleToSubmitter } });
    await tx.amrPublicationRevision.create({ data: { publicationId, actorId, action: revisionAction, note, visibleToSubmitter, snapshot: { previousStatus: publication.curationStatus, status: updated.curationStatus } } });
    if (visibleToSubmitter && publication.createdById && publication.createdById !== actorId) await createNotification(tx, { userId: publication.createdById, type: NotificationType.AMR_PUBLICATION, title: `AMR publication ${statusLabel(updated.curationStatus)}`, body: note || `“${publication.title}” is now ${statusLabel(updated.curationStatus).toLowerCase()}.`, link: `/account/amr-submissions?publication=${publicationId}` });
    return updated;
  });
}

export function parseAmrJsonPayload(raw: unknown) {
  if (typeof raw !== 'string') return { error: 'Upload a JSON document.' } as const;
  if (Buffer.byteLength(raw, 'utf8') > MAX_JSON_IMPORT_BYTES) return { error: 'JSON uploads must be 2 MB or smaller.' } as const;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { error: 'The uploaded file is not valid JSON.' } as const; }
  const records: unknown[] | null = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' && Array.isArray((parsed as Record<string, unknown>).findings) ? (parsed as Record<string, unknown>).findings as unknown[] : null;
  if (!records || records.length === 0) return { error: 'Provide one finding object or a findings array.' } as const;
  if (records.length > MAX_JSON_IMPORT_RECORDS) return { error: `JSON uploads may contain at most ${MAX_JSON_IMPORT_RECORDS} findings.` } as const;
  const errors: Array<{ index: number; error: string }> = [];
  const sanitized: Record<string, unknown>[] = [];
  records.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push({ index, error: 'Each finding must be a JSON object.' }); return; }
    const entry = item as Record<string, unknown>;
    const unsupported = Object.keys(entry).filter((key) => !USER_FINDING_FIELDS.has(key) && key !== 'submissionDeclaration');
    if (unsupported.length) { errors.push({ index, error: `Unsupported field(s): ${unsupported.join(', ')}` }); return; }
    try { sanitized.push(prepareDraftFinding(entry)); } catch (error) { errors.push({ index, error: error instanceof Error ? error.message : 'Invalid finding.' }); }
  });
  return errors.length ? { error: 'JSON validation failed.', errors } as const : { records: sanitized } as const;
}

export async function importUserJsonFindings(prisma: PrismaClient, raw: unknown, actorId: string, submit = false, filename = 'amr-findings.json') {
  const parsed = parseAmrJsonPayload(raw);
  if ('error' in parsed) throw Object.assign(new Error(parsed.error), { details: parsed.errors || [] });
  const imported = await prisma.$transaction(async (tx) => {
    const job = await tx.amrImportJob.create({ data: { source: AmrImportSource.JSON_UPLOAD, request: { filename, records: parsed.records.length }, status: AmrImportJobStatus.RUNNING, attempt: 1, createdById: actorId, startedAt: new Date() } });
    const records = [];
    for (const record of parsed.records) {
      const finding = await createAmrFindingInTransaction(tx, record, actorId);
      const updated = await tx.amrFinding.update({ where: { id: finding.id }, data: { submissionSource: 'USER_JSON', submissionDeclaration: declaration(record.submissionDeclaration), ...(submit ? { curationStatus: AmrFindingStatus.SUBMITTED, submittedAt: new Date() } : {}) }, include: amrFindingInclude });
      await tx.amrFindingRevision.create({ data: { findingId: finding.id, actorId, action: submit ? 'JSON_SUBMITTED' : 'JSON_DRAFT_IMPORTED', visibleToSubmitter: true, snapshot: { source: 'USER_JSON' } } });
      records.push(updated);
    }
    await tx.amrImportJob.update({ where: { id: job.id }, data: { status: AmrImportJobStatus.COMPLETED, result: { imported: records.length, submit }, finishedAt: new Date() } });
    return { jobId: job.id, records };
  });
  if (submit) await notifyAdmins(prisma, { type: NotificationType.AMR_IMPORT, title: 'AMR JSON import submitted', body: `${imported.records.length} AMR finding submission(s) require review.`, link: '/admin/amr-findings' });
  await createNotification(prisma, { userId: actorId, type: NotificationType.AMR_IMPORT, title: 'AMR JSON import complete', body: `${imported.records.length} finding draft(s) were created${submit ? ' and submitted for review' : ''}.`, link: '/account/amr-submissions' });
  return imported;
}

export async function getOwnAmrWorkspace(prisma: PrismaClient, userId: string) {
  const [findings, publications, notifications] = await Promise.all([
    prisma.amrFinding.findMany({
      where: { createdById: userId },
      include: {
        domains: { include: { term: true } }, pathogens: { include: { pathogen: true } }, genes: { include: { gene: true } },
        antimicrobials: { include: { antimicrobial: { include: { drugClass: true } } } }, mechanisms: { include: { mechanism: true } },
        locations: true, institutions: true,
        moderationNotes: { where: { visibleToSubmitter: true }, include: { author: { select: { name: true } } }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.amrPublication.findMany({
      where: { createdById: userId },
      include: { moderationNotes: { where: { visibleToSubmitter: true }, include: { author: { select: { name: true } } }, orderBy: { createdAt: 'desc' } } },
      orderBy: { updatedAt: 'desc' },
    }),
    prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
  ]);
  return { findings, publications, notifications };
}

export async function listPublishedPublications(prisma: PrismaClient, filters: { q?: string; year?: number; page?: number; pageSize?: number }) {
  const page = Math.max(1, filters.page || 1);
  const pageSize = Math.min(100, Math.max(10, filters.pageSize || 20));
  const q = text(filters.q, 240);
  const where: Prisma.AmrPublicationWhereInput = {
    curationStatus: AmrFindingStatus.PUBLISHED,
    ...(filters.year ? { publicationYear: filters.year } : {}),
    ...(q ? { OR: [{ title: { contains: q, mode: 'insensitive' } }, { authors: { contains: q, mode: 'insensitive' } }, { journal: { contains: q, mode: 'insensitive' } }, { doi: { contains: q, mode: 'insensitive' } }, { pubmedId: { contains: q, mode: 'insensitive' } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.amrPublication.count({ where }),
    prisma.amrPublication.findMany({ where, select: { id: true, slug: true, title: true, authors: true, journal: true, publicationYear: true, doi: true, pubmedId: true, pmcId: true, europePmcId: true, externalUrl: true, citationText: true, openAccess: true, publishedAt: true, findings: { select: { finding: { select: { id: true, slug: true, title: true } } } } }, orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize }),
  ]);
  return { items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function publishedPublicationBySlug(prisma: PrismaClient, slug: string) {
  return prisma.amrPublication.findFirst({
    where: { slug, curationStatus: AmrFindingStatus.PUBLISHED },
    select: { id: true, slug: true, title: true, authors: true, journal: true, publicationYear: true, doi: true, pubmedId: true, pmcId: true, europePmcId: true, externalUrl: true, citationText: true, openAccess: true, publishedAt: true, findings: { select: { finding: { select: { id: true, slug: true, title: true, keyFinding: true } } } } },
  });
}

export const amrFindingJsonSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'BMGA AMR finding submission',
  description: 'A private AMR finding draft or a batch of private AMR finding drafts. Records require administrative approval and publication before public display.',
  oneOf: [
    { $ref: '#/$defs/finding' },
    { type: 'object', required: ['findings'], additionalProperties: false, properties: { findings: { type: 'array', minItems: 1, maxItems: MAX_JSON_IMPORT_RECORDS, items: { $ref: '#/$defs/finding' } } } },
  ],
  $defs: {
    finding: {
      type: 'object', additionalProperties: false,
      required: ['title'],
      properties: {
        title: { type: 'string', minLength: 8, maxLength: 300 }, keyFinding: { type: 'string', maxLength: 700 }, scientificSummary: { type: 'string', maxLength: 8000 }, sourceReference: { type: 'string', maxLength: 1200 },
        domains: { oneOf: [{ type: 'string' }, { type: 'array', maxItems: 100, items: { type: 'string' } }] }, pathogens: { oneOf: [{ type: 'string' }, { type: 'array', maxItems: 100, items: { type: 'string' } }] }, genes: { oneOf: [{ type: 'string' }, { type: 'array', maxItems: 100, items: { type: 'string' } }] },
        antimicrobialClasses: { oneOf: [{ type: 'string' }, { type: 'array', maxItems: 100, items: { type: 'string' } }] }, publicationYear: { type: 'integer', minimum: 1900 }, evidenceLevel: { enum: ['LEVEL_1', 'LEVEL_2', 'LEVEL_3', 'LEVEL_4', 'LEVEL_5'] }, publicHealthImportance: { enum: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'] },
        locations: { type: 'array', maxItems: 50, items: { type: 'object', properties: { country: { type: 'string' }, state: { type: 'string' }, district: { type: 'string' }, city: { type: 'string' }, latitude: { type: 'number', minimum: -90, maximum: 90 }, longitude: { type: 'number', minimum: -180, maximum: 180 } } } },
        publication: { type: 'object', properties: { title: { type: 'string' }, authors: { type: 'string' }, doi: { type: 'string' }, pubmedId: { type: 'string' }, externalUrl: { type: 'string' } } },
        submissionDeclaration: { enum: ['AUTHOR', 'ON_BEHALF_OF_AUTHORS', 'RELEVANT_PUBLICATION_SUGGESTION'] },
      },
    },
  },
} as const;
