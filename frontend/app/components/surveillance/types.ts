export type EvidenceBasis = 'GENOTYPIC' | 'PHENOTYPIC' | 'COMBINED' | 'NOT_REPORTED';
export type SurveillanceScope = 'NATIONAL' | 'GLOBAL';

export type SurveillanceFilterState = {
  search: string;
  organismId: string;
  country: string;
  source: string;
  evidenceBasis: string;
  scope: string;
  from: string;
  to: string;
};

export const EMPTY_SURVEILLANCE_FILTERS: SurveillanceFilterState = {
  search: '',
  organismId: '',
  country: '',
  source: '',
  evidenceBasis: '',
  scope: '',
  from: '',
  to: '',
};

export type SurveillanceLocation = {
  id: number;
  organismId: number;
  organismName: string;
  strainName: string;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  sourceType?: string | null;
  latitude: number;
  longitude: number;
  collectionDate?: string | null;
  evidenceBasis: EvidenceBasis;
  updatedAt: string;
  amrDetectionCount: number;
  mayaRunCount: number;
};

export type SurveillanceOverview = {
  generatedAt: string;
  dataThrough?: string | null;
  refreshIntervalSeconds: number;
  metrics: {
    approvedStrains: number;
    organismsTracked: number;
    countriesRepresented: number;
    genotypicAmrDetections: number;
    completedMayaRuns: number;
  };
  quality: {
    collectionDateCoveragePercent: number | null;
    geolocationCoveragePercent: number | null;
    recordsUpdatedIn30Days: number;
    recordsUpdatedIn30DaysPercent: number | null;
  };
  sources: Array<{ label: string; count: number }>;
  evidence: Array<{ basis: EvidenceBasis; count: number }>;
  countries: Array<{ country: string; count: number }>;
  locations: SurveillanceLocation[];
  locationResultLimit: number;
  locationsTruncated: boolean;
  limitations: string[];
};

export type SurveillanceFilterOptions = {
  organisms: Array<{ id: number; scientificName: string; displayName?: string | null }>;
  countries: Array<{ value: string; count: number }>;
  sources: Array<{ value: string; count: number }>;
  evidenceBasis: EvidenceBasis[];
  scopes: SurveillanceScope[];
};

export type SurveillanceRecord = {
  id: number;
  organismId: number;
  strainName: string;
  isolateName?: string | null;
  assemblyAccession?: string | null;
  biosampleAccession?: string | null;
  sourceType?: string | null;
  host?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  collectionDate?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  surveillanceScope: SurveillanceScope;
  evidenceBasis: EvidenceBasis;
  submittingInstitution?: string | null;
  dataSource?: string | null;
  dataUseLimitations?: string | null;
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  organism: { scientificName: string; displayName?: string | null; taxonomyId?: number | null };
  toolRuns: Array<{ id: number; toolName: string; status: string; finishedAt?: string | null; updatedAt: string }>;
  amrDetectionCount: number;
  mayaRunCount: number;
  latestMayaStatus: string;
  latestMayaUpdatedAt?: string | null;
};

export type SurveillanceRecordsResponse = {
  generatedAt: string;
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  records: SurveillanceRecord[];
};

export type AmrInsightsResponse = {
  generatedAt: string;
  totalDetections: number;
  topGenes: Array<{ label: string; count: number }>;
  drugClasses: Array<{ label: string; count: number }>;
  countries: Array<{ label: string; count: number }>;
  trend: Array<{ period: string; count: number }>;
  evidence: Array<{ label: EvidenceBasis; count: number }>;
  interpretation: {
    primaryEvidence: EvidenceBasis;
    statement: string;
    phenotypicAvailability: boolean;
  };
};

export type SurveillanceView = 'overview' | 'amr' | 'records';

export function surveillanceQuery(filters: SurveillanceFilterState, page?: number, pageSize?: number) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value.trim()) params.set(key, value.trim());
  });
  if (page) params.set('page', String(page));
  if (pageSize) params.set('pageSize', String(pageSize));
  const value = params.toString();
  return value ? `?${value}` : '';
}

export function evidenceLabel(value?: string | null) {
  if (!value || value === 'NOT_REPORTED') return 'Not reported';
  return value.charAt(0) + value.slice(1).toLowerCase();
}

export function formatDate(value?: string | null, withTime = false) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-GB', withTime
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { dateStyle: 'medium' }).format(parsed);
}

export function formatCount(value?: number | null) {
  return typeof value === 'number' ? value.toLocaleString('en-IN') : 'N/A';
}
