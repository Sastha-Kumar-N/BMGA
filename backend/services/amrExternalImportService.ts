import { AmrImportSource } from '@prisma/client';

export type ExternalAmrImportSource = Extract<AmrImportSource, 'PUBMED' | 'EUROPE_PMC'>;

export type AmrExternalPublicationCandidate = {
  source: ExternalAmrImportSource;
  sourceId: string;
  title: string;
  authors?: string;
  journal?: string;
  publicationYear?: number;
  doi?: string;
  pubmedId?: string;
  pmcId?: string;
  europePmcId?: string;
  externalUrl?: string;
  openAccess?: boolean;
};

const MAX_RESULTS = 50;

function sourceQuery(value: unknown) {
  if (typeof value !== 'string') throw new Error('An import query is required.');
  const query = value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (query.length < 3 || query.length > 500) throw new Error('Import queries must contain between 3 and 500 characters.');
  return query;
}

function requestedLimit(value: unknown) {
  const limit = Number(value);
  return Number.isInteger(limit) ? Math.min(MAX_RESULTS, Math.max(1, limit)) : 20;
}

function year(value: unknown) {
  const parsed = Number(String(value || '').slice(0, 4));
  return Number.isInteger(parsed) && parsed >= 1800 && parsed <= new Date().getFullYear() + 1 ? parsed : undefined;
}

function doiFrom(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const normalized = value.replace(/^https?:\/\/(dx\.)?doi\.org\//i, '').trim().toLowerCase();
  return /^10\.\d{4,9}\/[\w.()/:;-]+$/i.test(normalized) ? normalized : undefined;
}

function requireNetwork() {
  if (process.env.AMR_IMPORT_ALLOW_NETWORK !== 'true') {
    throw new Error('External AMR imports are disabled. Set AMR_IMPORT_ALLOW_NETWORK=true after reviewing the data-governance policy.');
  }
}

async function requestJson(url: URL) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'BMGA-AMR-Curation/1.0 (contact: admin@bgdb.org)' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Source request failed with HTTP ${response.status}.`);
  return response.json() as Promise<Record<string, unknown>>;
}

async function previewPubMed(query: string, limit: number): Promise<AmrExternalPublicationCandidate[]> {
  const searchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('term', query);
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('retmax', String(limit));
  const search = await requestJson(searchUrl);
  const ids = (search.esearchresult && typeof search.esearchresult === 'object' ? (search.esearchresult as Record<string, unknown>).idlist : []) as unknown[];
  const pmids = ids.filter((id): id is string => typeof id === 'string' && /^\d+$/.test(id));
  if (!pmids.length) return [];
  const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('id', pmids.join(','));
  summaryUrl.searchParams.set('retmode', 'json');
  const summary = await requestJson(summaryUrl);
  const result = summary.result && typeof summary.result === 'object' ? summary.result as Record<string, unknown> : {};
  return pmids.flatMap((pmid) => {
    const row = result[pmid];
    if (!row || typeof row !== 'object') return [];
    const item = row as Record<string, unknown>;
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title) return [];
    const articleIds = Array.isArray(item.articleids) ? item.articleids as Array<Record<string, unknown>> : [];
    const identifier = (type: string) => articleIds.find((entry) => String(entry.idtype || '').toLowerCase() === type)?.value;
    const authors = Array.isArray(item.authors) ? (item.authors as Array<Record<string, unknown>>).map((author) => String(author.name || '')).filter(Boolean).join(', ') : undefined;
    return [{
      source: 'PUBMED',
      sourceId: pmid,
      title,
      authors,
      journal: typeof item.fulljournalname === 'string' ? item.fulljournalname : typeof item.source === 'string' ? item.source : undefined,
      publicationYear: year(item.pubdate),
      doi: doiFrom(identifier('doi')),
      pubmedId: pmid,
      pmcId: typeof identifier('pmc') === 'string' ? String(identifier('pmc')).toUpperCase() : undefined,
      externalUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    }];
  });
}

async function previewEuropePmc(query: string, limit: number): Promise<AmrExternalPublicationCandidate[]> {
  const url = new URL('https://www.ebi.ac.uk/europepmc/webservices/rest/search');
  url.searchParams.set('query', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('pageSize', String(limit));
  const response = await requestJson(url);
  const resultList = response.resultList && typeof response.resultList === 'object' ? response.resultList as Record<string, unknown> : {};
  const rows = Array.isArray(resultList.result) ? resultList.result as Array<Record<string, unknown>> : [];
  return rows.flatMap((row) => {
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    const id = typeof row.id === 'string' ? row.id : '';
    if (!title || !id) return [];
    const pmid = typeof row.pmid === 'string' && /^\d+$/.test(row.pmid) ? row.pmid : undefined;
    const pmcid = typeof row.pmcid === 'string' && /^PMC\d+$/i.test(row.pmcid) ? row.pmcid.toUpperCase() : undefined;
    const source = typeof row.source === 'string' ? row.source.toUpperCase() : 'MED';
    return [{
      source: 'EUROPE_PMC',
      sourceId: `${source}:${id}`,
      title,
      authors: typeof row.authorString === 'string' ? row.authorString : undefined,
      journal: typeof row.journalTitle === 'string' ? row.journalTitle : undefined,
      publicationYear: year(row.pubYear),
      doi: doiFrom(row.doi),
      pubmedId: pmid,
      pmcId: pmcid,
      europePmcId: id,
      externalUrl: pmid ? `https://europepmc.org/article/MED/${pmid}` : `https://europepmc.org/article/${source}/${id}`,
      openAccess: row.isOpenAccess === 'Y' || row.isOpenAccess === true,
    }];
  });
}

export async function previewExternalAmrImport(source: ExternalAmrImportSource, rawQuery: unknown, rawLimit?: unknown) {
  requireNetwork();
  const query = sourceQuery(rawQuery);
  const limit = requestedLimit(rawLimit);
  if (source === 'PUBMED') return { query, source, candidates: await previewPubMed(query, limit) };
  if (source === 'EUROPE_PMC') return { query, source, candidates: await previewEuropePmc(query, limit) };
  throw new Error('JSON uploads use the registered-user JSON import endpoint.');
}

export function importSourceIsSupported(value: unknown): value is ExternalAmrImportSource {
  return value === 'PUBMED' || value === 'EUROPE_PMC';
}
