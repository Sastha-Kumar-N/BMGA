export type ChartRow = { label: string; value: number };

export type AmrFinding = {
  id: string; slug: string; title: string; keyFinding: string; scientificSummary: string; sourceReference: string;
  publicHealthSignificance?: string | null; limitations?: string | null; futureDirections?: string | null; surveillanceAction?: string | null;
  evidenceLevel: string; publicHealthImportance: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL'; geographicScope: string; resistanceEvidence: string;
  publicationYear?: number | null; sampleSize?: number | null; resistantSampleCount?: number | null; prevalencePercentage?: string | number | null;
  mdrStatus?: boolean | null; xdrStatus?: boolean | null; pdrStatus?: boolean | null; oneHealth: boolean; hasGenomicData: boolean; openAccess: boolean;
  susceptibilityMethod?: string | null; interpretiveGuideline?: string | null; guidelineVersion?: string | null; analysisMethod?: string | null;
  createdAt: string; updatedAt: string; lastReviewedAt?: string | null;
  domains: Array<{ term: { label: string } }>;
  pathogens: Array<{ pathogen: { scientificName: string }; strain?: string | null; lineage?: string | null; sequenceType?: string | null }>;
  genes: Array<{ gene: { symbol: string } }>;
  antimicrobials: Array<{ phenotype?: string | null; antimicrobial: { name: string; drugClass?: { name: string } | null } }>;
  mechanisms: Array<{ mechanism: { name: string } }>;
  locations: Array<{ id: string; country: string; state?: string | null; district?: string | null; city?: string | null; locality?: string | null; facility?: string | null; latitude?: number | null; longitude?: number | null }>;
  publications: Array<{ publication: { title: string; authors?: string | null; journal?: string | null; publicationYear?: number | null; doi?: string | null; pubmedId?: string | null; externalUrl?: string | null; citationText?: string | null; openAccess: boolean } }>;
  institutions: Array<{ name: string; role?: string | null }>;
  accessions: Array<{ database: string; accession: string; url?: string | null }>;
  keywords: Array<{ value: string }>;
  mobileElements: Array<{ type: string; name: string }>;
};

export type AmrDashboard = {
  totals: { findings: number; publications: number; states: number; pathogens: number; genes: number; antimicrobialClasses: number; oneHealth: number; genomic: number; highImportance: number; updatedAt: string | null };
  charts: { years: ChartRow[]; states: ChartRow[]; domains: ChartRow[]; pathogens: ChartRow[]; genes: ChartRow[]; classes: ChartRow[]; mechanisms: ChartRow[]; sampleSources: ChartRow[]; surveillanceMethods: ChartRow[]; mdr: ChartRow[]; evidence: ChartRow[] };
  map: Array<ChartRow & { majorPathogens: string[]; majorClasses: string[] }>;
  records: Array<{ id: string; slug: string; title: string; state?: string | null; latitude: number; longitude: number; pathogens: string[]; importance: string }>;
};

export type AmrFilters = { domains: string[]; states: string[]; pathogens: string[]; genes: string[]; antimicrobialClasses: string[]; mechanisms: string[]; years: string[] };
