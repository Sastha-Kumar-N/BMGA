import type {
  AmrInsightsResponse,
  SurveillanceOverview,
  SurveillanceRecordsResponse,
} from '../surveillance/types';

export type HomeOrganism = {
  id: number;
  scientificName?: string | null;
  displayName?: string | null;
  domain?: string | null;
};

export type HomeStrain = {
  id: number;
  organismId: number;
  strainName?: string | null;
  isolateName?: string | null;
  assemblyAccession?: string | null;
  sourceType?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  genomeSize?: number | null;
  gcContent?: number | string | null;
  surveillanceScope?: 'NATIONAL' | 'GLOBAL' | null;
  evidenceBasis?: string | null;
  referenceKinds?: string[];
  updatedAt?: string | null;
  createdAt?: string | null;
  organism?: HomeOrganism | null;
};

export type HomePortalData = {
  strains: HomeStrain[];
  overview: SurveillanceOverview | null;
  records: SurveillanceRecordsResponse | null;
  amr: AmrInsightsResponse | null;
};

export const EMPTY_HOME_PORTAL_DATA: HomePortalData = {
  strains: [],
  overview: null,
  records: null,
  amr: null,
};
