export type GenomeReferenceKind = 'FASTA' | 'FAI' | 'GFF3';

export type GenomeReferenceFile = {
  id: string;
  kind: GenomeReferenceKind;
  fileName: string;
  contentType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  validation?: Record<string, unknown> | null;
  updatedAt: string;
  publishedAt?: string | null;
  accessUrl: string;
};

export type GenomeReferenceStrain = {
  id: number;
  strainName: string;
  isolateName?: string | null;
  assemblyAccession?: string | null;
  biosampleAccession?: string | null;
  genomeSize?: number | null;
  gcContent?: number | null;
  sourceType?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  evidenceBasis?: string | null;
  dataSource?: string | null;
  dataUseLimitations?: string | null;
  lastVerifiedAt?: string | null;
  updatedAt: string;
  references: GenomeReferenceFile[];
};

export type GenomeReferenceCatalog = {
  organism: {
    id: number;
    scientificName: string;
    displayName?: string | null;
    taxonomyId?: number | null;
    updatedAt: string;
  };
  strains: GenomeReferenceStrain[];
};

export function referenceByKind(strain: GenomeReferenceStrain, kind: GenomeReferenceKind) {
  return strain.references.find((reference) => reference.kind === kind) || null;
}

