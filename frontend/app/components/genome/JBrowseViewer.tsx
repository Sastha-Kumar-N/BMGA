'use client';

import { JBrowseLinearGenomeView, useCreateViewState } from '@jbrowse/react-linear-genome-view2';
import { apiPath } from '../../lib/api-client';
import type { GenomeReferenceStrain } from './types';
import { referenceByKind } from './types';

export default function JBrowseViewer({ strain, organismName }: { strain: GenomeReferenceStrain; organismName: string }) {
  const fasta = referenceByKind(strain, 'FASTA');
  const fai = referenceByKind(strain, 'FAI');
  const gff3 = referenceByKind(strain, 'GFF3');
  if (!fasta || !fai) return null;

  return <ConfiguredJBrowseViewer strain={strain} organismName={organismName} fastaUrl={apiPath(fasta.accessUrl)} faiUrl={apiPath(fai.accessUrl)} gff3Url={gff3 ? apiPath(gff3.accessUrl) : null} primaryReferenceName={typeof fasta.validation?.primaryReferenceName === 'string' ? fasta.validation.primaryReferenceName : undefined} />;
}

function ConfiguredJBrowseViewer({ strain, organismName, fastaUrl, faiUrl, gff3Url, primaryReferenceName }: {
  strain: GenomeReferenceStrain;
  organismName: string;
  fastaUrl: string;
  faiUrl: string;
  gff3Url: string | null;
  primaryReferenceName?: string;
}) {
  const assemblyName = `BMGA_${strain.id}`;
  const trackId = `bmga_annotations_${strain.id}`;
  const tracks = gff3Url ? [{
    type: 'FeatureTrack',
    trackId,
    name: `${strain.strainName} annotations`,
    assemblyNames: [assemblyName],
    category: ['BMGA', 'Approved annotation'],
    adapter: {
      type: 'Gff3Adapter',
      gffLocation: { uri: gff3Url, locationType: 'UriLocation' },
    },
  }] : [];
  const state = useCreateViewState({
    assembly: {
      name: assemblyName,
      displayName: `${organismName} ${strain.strainName}`,
      sequence: {
        type: 'ReferenceSequenceTrack',
        trackId: `bmga_reference_${strain.id}`,
        adapter: {
          type: 'IndexedFastaAdapter',
          fastaLocation: { uri: fastaUrl, locationType: 'UriLocation' },
          faiLocation: { uri: faiUrl, locationType: 'UriLocation' },
        },
      },
    },
    tracks,
    configuration: { disableAnalytics: true },
    location: primaryReferenceName,
    defaultSession: gff3Url ? {
      name: `${strain.strainName} genome session`,
      view: {
        id: `linear_view_${strain.id}`,
        type: 'LinearGenomeView',
        tracks: [{
          id: `annotation_track_${strain.id}`,
          type: 'FeatureTrack',
          configuration: trackId,
          displays: [{
            id: `annotation_display_${strain.id}`,
            type: 'LinearBasicDisplay',
            configuration: `${trackId}-LinearBasicDisplay`,
          }],
        }],
      },
    } : undefined,
    disableAddTracks: true,
  });

  return (
    <div className="min-h-[520px] overflow-hidden border border-slate-200 bg-white" aria-label={`JBrowse 2 viewer for ${organismName} ${strain.strainName}`}>
      <JBrowseLinearGenomeView viewState={state} />
    </div>
  );
}
